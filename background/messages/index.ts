// Architecture: background message layer root. The single router for every
// UI/content -> background message: validates with the shared Zod schemas
// (via background/utils/validation.ts) and dispatches by message type with
// ts-pattern to the handler modules in this folder. Adding a message means a
// schema in shared/types/validation.ts, a type in shared/types/messaging.ts,
// a handler module, and a .with() arm here.
import { match } from "ts-pattern"
import { validateIncomingMessage } from "../utils/validation"
import { addSnippet } from "./addSnippet"
import { checkKeybindingConflict } from "./checkKeybindingConflict"
import { deleteSnippet } from "./deleteSnippet"
import { executeCommand } from "./executeCommand"
import { executeKeybinding } from "./executeKeybinding"
import { executeWorkflow } from "./executeWorkflow"
import {
  executeFeatureAction,
  getFeatures,
  updateFeatureConfig,
} from "./features"
import { getChildrenCommands } from "./getChildrenCommands"
import { getCommands } from "./getCommands"
import { getKeybindingState } from "./getKeybindingState"
import { getPermissions } from "./getPermissions"
import { getSettingsCatalog } from "./getSettingsCatalog"
import { getSnippets } from "./getSnippets"
import { getUnsplashBackground } from "./getUnsplashBackground"
import { openPermissionGrantPage } from "./openPermissionGrantPage"
import { requestPermission } from "./requestPermission"
import { requestToast } from "./requestToast"
import { searchCommands } from "./searchCommands"
import { setCommandFavorite } from "./setCommandFavorite"
import { showToast } from "./showToast"
import { siteSdkSync } from "./siteSdkSync"
import { surfaceAction } from "./surfaceAction"
import { getSurfaces } from "./surfaces"
import { updateCommandKeybindings } from "./updateCommandKeybindings"
import { updateCommandSetting } from "./updateCommandSetting"
import { updateSnippet } from "./updateSnippet"
import {
  addUserScript,
  deleteUserScript,
  getUserScripts,
  getUserScriptTriggers,
  runUserScriptMessage,
  updateUserScript,
  userScriptTriggerFired,
} from "./userScripts"

export const handleMessage = async (rawMessage: unknown, sender?: any) => {
  // Validate the incoming message with comprehensi security checks
  const validation = validateIncomingMessage(rawMessage, sender)

  if (!validation.success) {
    // Log security/validation failures for monitoring
    console.error("[MessageHandler] Message validation failed:", {
      error: validation.error,
      issues: validation.issues,
      sender: validation.senderId,
      messageType: (rawMessage as any)?.type || "unknown",
    })

    // Return structured error response
    return {
      error: `Message validation failed: ${validation.error}`,
      validationIssues: validation.issues,
    }
  }

  const message = validation.data

  console.log(
    "Received message",
    message.type === "execute-workflow"
      ? {
          type: message.type,
          tabId: message.tabId,
          workflow: {
            name: message.workflow.name,
            stepCount: message.workflow.steps.length,
          },
        }
      : message,
  )

  // Route validated message to appropriate handler
  return await match(message)
    .with({ type: "get-commands" }, async (msg) => {
      return await getCommands(msg, sender)
    })
    .with({ type: "search-commands" }, async (msg) => {
      return await searchCommands(msg, sender)
    })
    .with({ type: "get-children-commands" }, async (msg) => {
      return await getChildrenCommands(msg, sender)
    })
    .with({ type: "execute-command" }, async (msg) => {
      return await executeCommand(msg, sender)
    })
    .with({ type: "execute-keybinding" }, async (msg) => {
      return await executeKeybinding(msg, sender)
    })
    .with({ type: "get-keybinding-state" }, async (msg) => {
      return await getKeybindingState(msg, sender)
    })
    .with({ type: "show-toast" }, async (msg) => {
      return await showToast(msg)
    })
    .with({ type: "request-toast" }, async (msg) => {
      return await requestToast(msg)
    })
    .with({ type: "update-command-setting" }, async (msg) => {
      return await updateCommandSetting(msg, sender)
    })
    .with({ type: "update-command-keybindings" }, async (msg) => {
      return await updateCommandKeybindings(msg, sender)
    })
    .with({ type: "get-settings-catalog" }, async (msg) => {
      return await getSettingsCatalog(msg, sender)
    })
    .with({ type: "set-command-favorite" }, async (msg) => {
      return await setCommandFavorite(msg, sender)
    })
    .with({ type: "get-snippets" }, async (msg) => {
      return await getSnippets(msg, sender)
    })
    .with({ type: "add-snippet" }, async (msg) => {
      return await addSnippet(msg, sender)
    })
    .with({ type: "update-snippet" }, async (msg) => {
      return await updateSnippet(msg, sender)
    })
    .with({ type: "delete-snippet" }, async (msg) => {
      return await deleteSnippet(msg, sender)
    })
    .with({ type: "check-keybinding-conflict" }, async (msg) => {
      return await checkKeybindingConflict(msg, sender)
    })
    .with({ type: "get-unsplash-background" }, async (msg) => {
      return await getUnsplashBackground(msg)
    })
    .with({ type: "get-permissions" }, async (msg) => {
      return await getPermissions(msg)
    })
    .with({ type: "request-permission" }, async (msg) => {
      return await requestPermission(msg)
    })
    .with({ type: "open-permission-grant-page" }, async (msg) => {
      return await openPermissionGrantPage(msg)
    })
    .with({ type: "execute-workflow" }, async (msg) => {
      return await executeWorkflow(msg, sender)
    })
    .with({ type: "site-sdk-sync" }, async (msg) => {
      return await siteSdkSync(msg, sender)
    })
    .with({ type: "get-user-scripts" }, async (msg) => {
      return await getUserScripts(msg, sender)
    })
    .with({ type: "add-user-script" }, async (msg) => {
      return await addUserScript(msg, sender)
    })
    .with({ type: "update-user-script" }, async (msg) => {
      return await updateUserScript(msg, sender)
    })
    .with({ type: "delete-user-script" }, async (msg) => {
      return await deleteUserScript(msg, sender)
    })
    .with({ type: "run-user-script" }, async (msg) => {
      return await runUserScriptMessage(msg, sender)
    })
    .with({ type: "get-user-script-triggers" }, async (msg) => {
      return await getUserScriptTriggers(msg, sender)
    })
    .with({ type: "user-script-trigger-fired" }, async (msg) => {
      return await userScriptTriggerFired(msg, sender)
    })
    .with({ type: "get-features" }, async (msg) => {
      return await getFeatures(msg)
    })
    .with({ type: "update-feature-config" }, async (msg) => {
      return await updateFeatureConfig(msg)
    })
    .with({ type: "execute-feature-action" }, async (msg) => {
      return await executeFeatureAction(msg)
    })
    .with({ type: "get-surfaces" }, async (msg) => {
      return await getSurfaces(msg)
    })
    .with({ type: "surface-action" }, async (msg) => {
      return await surfaceAction(msg)
    })
    .otherwise(() => {
      throw new Error(`Unknown message type: ${message.type}`)
    })
}
