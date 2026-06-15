// Architecture: background message layer. Handlers for every user-script
// message (CRUD from the options builder, palette/manual runs, and the
// content trigger plumbing). Payloads arrive already validated against the
// shared schemas (shared/types/validation.ts -> userScriptValidation.ts) by
// background/utils/validation.ts; these handlers route to the storage
// module, the engine, and the trigger engine, and keep the derived surfaces
// (search index, keybinding registry, dangling CommandSettings) in sync —
// the same housekeeping the snippet handlers perform.
import type {
  AddUserScriptMessage,
  AddUserScriptResponse,
  DeleteUserScriptMessage,
  DeleteUserScriptResponse,
  GetUserScriptsMessage,
  GetUserScriptsResponse,
  GetUserScriptTriggersMessage,
  GetUserScriptTriggersResponse,
  RunUserScriptMessage,
  RunUserScriptResponse,
  UpdateUserScriptMessage,
  UpdateUserScriptResponse,
  UserScriptTriggerFiredMessage,
  UserScriptTriggerFiredResponse,
} from "../../shared/types"
import { userScriptCommandId } from "../../shared/types/userScripts"
import { invalidateSearchIndex } from "../commands/searchIndex"
import { removeCommandSettings } from "../commands/settings"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { runUserScript } from "../userScripts/engine"
import { getAllAutomations } from "../userScripts/registry"
import {
  updateUserScript as changeUserScript,
  addUserScript as createUserScript,
  deleteUserScript as removeUserScript,
} from "../userScripts/storage"
import {
  getPageTriggersForUrl,
  handleTriggerFired,
} from "../userScripts/triggerEngine"
import { createMessageHandler } from "../utils/messages"

const handleGetUserScripts = async (
  _message: GetUserScriptsMessage,
): Promise<GetUserScriptsResponse> => {
  // Includes feature-projected (read-only) automations; the options page tags
  // and partitions them. Mutations still target stored user docs only.
  return { scripts: await getAllAutomations() }
}

const handleAddUserScript = async (
  message: AddUserScriptMessage,
): Promise<AddUserScriptResponse> => {
  const script = await createUserScript(message.script)

  // Scripts surface as deep-search children of the Automations group.
  invalidateSearchIndex()
  await refreshKeybindingRegistry()
  return { script }
}

const handleUpdateUserScript = async (
  message: UpdateUserScriptMessage,
): Promise<UpdateUserScriptResponse> => {
  const script = await changeUserScript(message.id, message.script)

  invalidateSearchIndex()
  await refreshKeybindingRegistry()
  return { script: script ?? null }
}

const handleDeleteUserScript = async (
  message: DeleteUserScriptMessage,
): Promise<DeleteUserScriptResponse> => {
  const deleted = await removeUserScript(message.id)

  if (deleted) {
    // Drop dangling per-command settings (keybinding, hidden, urlRules) and
    // rebuild the keybinding registry — monocle-userscripts changes don't
    // trigger the monocle-settings invalidation path (snippets precedent).
    await removeCommandSettings(userScriptCommandId(message.id))
    await refreshKeybindingRegistry()
  }

  invalidateSearchIndex()
  return { deleted }
}

const handleRunUserScript = async (
  message: RunUserScriptMessage,
): Promise<RunUserScriptResponse> => {
  const result = await runUserScript(message.id, {
    // No context (options-page test run) targets the active tab.
    context: message.context ?? { url: "", title: "", modifierKey: null },
    invocation: { kind: "manual", paramValues: message.paramValues },
  })
  return { result }
}

const handleGetUserScriptTriggers = async (
  message: GetUserScriptTriggersMessage,
): Promise<GetUserScriptTriggersResponse> => {
  return { triggers: await getPageTriggersForUrl(message.url) }
}

const handleUserScriptTriggerFired = async (
  message: UserScriptTriggerFiredMessage,
  sender?: any,
): Promise<UserScriptTriggerFiredResponse> => {
  return await handleTriggerFired({
    scriptId: message.scriptId,
    trigger: message.trigger,
    senderTabId: sender?.tab?.id ?? sender?.validationContext?.senderTab,
    senderUrl: sender?.url ?? sender?.tab?.url,
  })
}

export const getUserScripts = createMessageHandler(
  handleGetUserScripts,
  "Failed to load user scripts",
)

export const addUserScript = createMessageHandler(
  handleAddUserScript,
  "Failed to add user script",
)

export const updateUserScript = createMessageHandler(
  handleUpdateUserScript,
  "Failed to update user script",
)

export const deleteUserScript = createMessageHandler(
  handleDeleteUserScript,
  "Failed to delete user script",
)

export const runUserScriptMessage = createMessageHandler(
  handleRunUserScript,
  "Failed to run user script",
)

export const getUserScriptTriggers = createMessageHandler(
  handleGetUserScriptTriggers,
  "Failed to load user script triggers",
)

export const userScriptTriggerFired = createMessageHandler(
  handleUserScriptTriggerFired,
  "Failed to handle user script trigger",
)
