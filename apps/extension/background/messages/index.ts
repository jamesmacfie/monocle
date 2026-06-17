// Architecture: background message layer root. The single router for every
// UI/content -> background message: validates with the shared Zod schemas
// (via background/utils/validation.ts) and dispatches by message type with
// ts-pattern to the handler modules in this folder. Adding a message means a
// schema in shared/types/validation.ts, a type in shared/types/messaging.ts,
// a handler module, and a .with() arm here.
import { match } from "ts-pattern"
import { validateIncomingMessage } from "../utils/validation"
import { addSnippet } from "./addSnippet"
import {
  addAutomation,
  automationTriggerFired,
  deleteAutomation,
  getAutomations,
  getAutomationTriggers,
  runAutomationMessage,
  updateAutomation,
} from "./automations"
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
import { ensureHostPermissionMessage } from "./hostPermissions"
import { openPermissionGrantPage } from "./openPermissionGrantPage"
import { requestPermission } from "./requestPermission"
import { searchCommands } from "./searchCommands"
import { setCommandFavorite } from "./setCommandFavorite"
import { showToast } from "./showToast"
import { siteSdkSync } from "./siteSdkSync"
import { surfaceAction } from "./surfaceAction"
import { getSurfaces } from "./surfaces"
import { updateCommandKeybindings } from "./updateCommandKeybindings"
import { updateCommandSetting } from "./updateCommandSetting"
import { updateSnippet } from "./updateSnippet"

export const handleMessage = async (rawMessage: unknown, sender?: any) => {
  // Validate the incoming message with comprehensive security checks.
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
    message.type === "monocle-workflow-execute"
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
    .with({ type: "monocle-commands-get" }, async (msg) => {
      return await getCommands(msg, sender)
    })
    .with({ type: "monocle-commands-search" }, async (msg) => {
      return await searchCommands(msg, sender)
    })
    .with({ type: "monocle-command-children-get" }, async (msg) => {
      return await getChildrenCommands(msg, sender)
    })
    .with({ type: "monocle-command-execute" }, async (msg) => {
      return await executeCommand(msg, sender)
    })
    .with({ type: "monocle-keybinding-execute" }, async (msg) => {
      return await executeKeybinding(msg, sender)
    })
    .with({ type: "monocle-keybinding-state-get" }, async (msg) => {
      return await getKeybindingState(msg, sender)
    })
    .with({ type: "monocle-toast-show" }, async (msg) => {
      return await showToast(msg)
    })
    .with({ type: "monocle-command-setting-update" }, async (msg) => {
      return await updateCommandSetting(msg, sender)
    })
    .with({ type: "monocle-command-keybindings-update" }, async (msg) => {
      return await updateCommandKeybindings(msg, sender)
    })
    .with({ type: "monocle-settings-catalog-get" }, async (msg) => {
      return await getSettingsCatalog(msg, sender)
    })
    .with({ type: "monocle-command-favorite-set" }, async (msg) => {
      return await setCommandFavorite(msg, sender)
    })
    .with({ type: "monocle-snippets-get" }, async (msg) => {
      return await getSnippets(msg, sender)
    })
    .with({ type: "monocle-snippet-add" }, async (msg) => {
      return await addSnippet(msg, sender)
    })
    .with({ type: "monocle-snippet-update" }, async (msg) => {
      return await updateSnippet(msg, sender)
    })
    .with({ type: "monocle-snippet-delete" }, async (msg) => {
      return await deleteSnippet(msg, sender)
    })
    .with({ type: "monocle-keybinding-conflict-check" }, async (msg) => {
      return await checkKeybindingConflict(msg, sender)
    })
    .with({ type: "monocle-unsplash-background-get" }, async (msg) => {
      return await getUnsplashBackground(msg)
    })
    .with({ type: "monocle-permissions-get" }, async (msg) => {
      return await getPermissions(msg)
    })
    .with({ type: "monocle-permission-request" }, async (msg) => {
      return await requestPermission(msg)
    })
    .with({ type: "monocle-permission-grant-page-open" }, async (msg) => {
      return await openPermissionGrantPage(msg)
    })
    .with({ type: "monocle-host-permission-ensure" }, async (msg) => {
      return await ensureHostPermissionMessage(msg)
    })
    .with({ type: "monocle-workflow-execute" }, async (msg) => {
      return await executeWorkflow(msg, sender)
    })
    .with({ type: "monocle-site-sdk-sync" }, async (msg) => {
      return await siteSdkSync(msg, sender)
    })
    .with({ type: "monocle-automations-get" }, async (msg) => {
      return await getAutomations(msg, sender)
    })
    .with({ type: "monocle-automation-add" }, async (msg) => {
      return await addAutomation(msg, sender)
    })
    .with({ type: "monocle-automation-update" }, async (msg) => {
      return await updateAutomation(msg, sender)
    })
    .with({ type: "monocle-automation-delete" }, async (msg) => {
      return await deleteAutomation(msg, sender)
    })
    .with({ type: "monocle-automation-run" }, async (msg) => {
      return await runAutomationMessage(msg, sender)
    })
    .with({ type: "monocle-automation-triggers-get" }, async (msg) => {
      return await getAutomationTriggers(msg, sender)
    })
    .with({ type: "monocle-automation-trigger-fired" }, async (msg) => {
      return await automationTriggerFired(msg, sender)
    })
    .with({ type: "monocle-features-get" }, async (msg) => {
      return await getFeatures(msg)
    })
    .with({ type: "monocle-feature-config-update" }, async (msg) => {
      return await updateFeatureConfig(msg)
    })
    .with({ type: "monocle-feature-action-execute" }, async (msg) => {
      return await executeFeatureAction(msg)
    })
    .with({ type: "monocle-surfaces-get" }, async (msg) => {
      return await getSurfaces(msg, sender)
    })
    .with({ type: "monocle-surface-action" }, async (msg) => {
      return await surfaceAction(msg, sender)
    })
    .otherwise(() => {
      throw new Error(`Unknown message type: ${message.type}`)
    })
}
