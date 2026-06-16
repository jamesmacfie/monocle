// Architecture: background message layer. Handlers for every automation
// message (CRUD from the options builder, palette/manual runs, and the
// content trigger plumbing). Payloads arrive already validated against the
// shared schemas (shared/types/validation.ts -> automationValidation.ts) by
// background/utils/validation.ts; these handlers route to the storage
// module, the engine, and the trigger engine, and keep the derived surfaces
// (search index, keybinding registry, dangling CommandSettings) in sync —
// the same housekeeping the snippet handlers perform.
import type {
  AddAutomationMessage,
  AddAutomationResponse,
  AutomationTriggerFiredMessage,
  AutomationTriggerFiredResponse,
  DeleteAutomationMessage,
  DeleteAutomationResponse,
  GetAutomationsMessage,
  GetAutomationsResponse,
  GetAutomationTriggersMessage,
  GetAutomationTriggersResponse,
  RunAutomationMessage,
  RunAutomationResponse,
  UpdateAutomationMessage,
  UpdateAutomationResponse,
} from "../../shared/types"
import { automationCommandId } from "../../shared/types/automations"
import { runAutomation } from "../automations/engine"
import { getAllAutomations } from "../automations/registry"
import {
  updateAutomation as changeAutomation,
  addAutomation as createAutomation,
  deleteAutomation as removeAutomation,
} from "../automations/storage"
import {
  getPageTriggersForUrl,
  handleTriggerFired,
} from "../automations/triggerEngine"
import { invalidateSearchIndex } from "../commands/searchIndex"
import { removeCommandSettings } from "../commands/settings"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { createMessageHandler, resolveSenderTabId } from "../utils/messages"

const handleGetAutomations = async (
  _message: GetAutomationsMessage,
): Promise<GetAutomationsResponse> => {
  // Includes feature-projected (read-only) automations; the options page tags
  // and partitions them. Mutations still target stored user docs only.
  return { automations: await getAllAutomations() }
}

const handleAddAutomation = async (
  message: AddAutomationMessage,
): Promise<AddAutomationResponse> => {
  const script = await createAutomation(message.automation)

  // Automations surface as deep-search children of the Automations group.
  invalidateSearchIndex()
  await refreshKeybindingRegistry()
  return { automation: script }
}

const handleUpdateAutomation = async (
  message: UpdateAutomationMessage,
): Promise<UpdateAutomationResponse> => {
  const script = await changeAutomation(message.id, message.automation)

  invalidateSearchIndex()
  await refreshKeybindingRegistry()
  return { automation: script ?? null }
}

const handleDeleteAutomation = async (
  message: DeleteAutomationMessage,
): Promise<DeleteAutomationResponse> => {
  const deleted = await removeAutomation(message.id)

  if (deleted) {
    // Drop dangling per-command settings (keybinding, hidden, urlRules) and
    // rebuild the keybinding registry — monocle-automations changes don't
    // trigger the monocle-settings invalidation path (snippets precedent).
    await removeCommandSettings(automationCommandId(message.id))
    await refreshKeybindingRegistry()
  }

  invalidateSearchIndex()
  return { deleted }
}

const handleRunAutomation = async (
  message: RunAutomationMessage,
): Promise<RunAutomationResponse> => {
  const result = await runAutomation(message.id, {
    // No context (options-page test run) targets the active tab.
    context: message.context ?? { url: "", title: "", modifierKey: null },
    invocation: { kind: "manual", paramValues: message.paramValues },
  })
  return { result }
}

const handleGetAutomationTriggers = async (
  message: GetAutomationTriggersMessage,
): Promise<GetAutomationTriggersResponse> => {
  return { triggers: await getPageTriggersForUrl(message.url) }
}

const handleAutomationTriggerFired = async (
  message: AutomationTriggerFiredMessage,
  sender?: any,
): Promise<AutomationTriggerFiredResponse> => {
  return await handleTriggerFired({
    automationId: message.automationId,
    trigger: message.trigger,
    senderTabId: resolveSenderTabId(sender),
    senderUrl: sender?.url ?? sender?.tab?.url,
  })
}

export const getAutomations = createMessageHandler(
  handleGetAutomations,
  "Failed to load automations",
)

export const addAutomation = createMessageHandler(
  handleAddAutomation,
  "Failed to add automation",
)

export const updateAutomation = createMessageHandler(
  handleUpdateAutomation,
  "Failed to update automation",
)

export const deleteAutomation = createMessageHandler(
  handleDeleteAutomation,
  "Failed to delete automation",
)

export const runAutomationMessage = createMessageHandler(
  handleRunAutomation,
  "Failed to run automation",
)

export const getAutomationTriggers = createMessageHandler(
  handleGetAutomationTriggers,
  "Failed to load automation triggers",
)

export const automationTriggerFired = createMessageHandler(
  handleAutomationTriggerFired,
  "Failed to handle automation trigger",
)
