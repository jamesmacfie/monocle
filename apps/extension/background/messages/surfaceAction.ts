// Architecture: background message layer. Handles a user interaction reported
// by a surface (content/new-tab -> background). The host captures the gesture;
// the background decides what it means.
//
// Two paths:
//   - `dismiss` is universal: any surface can be closed, which removes it from
//     the store (and broadcasts the change so the host re-queries).
//   - any other action is routed to the surface's OWNER:
//     - Feature owners (a bare feature id) are dispatched to the feature's
//       `handleAction` — the same entry point that backs execute-feature-action
//       — so a feature reacts to surface gestures (e.g. a `picker` reporting a
//       clicked element) exactly as it reacts to a settings-page button.
//     - Command owners (`command:<id>`) are dispatched to a handler the command
//       registered via surfaceActionHandlers, the command-side equivalent of a
//       feature's handleAction (e.g. the font inspector reading the picked
//       element's computed styles). automation owner routing is not yet wired.
// See docs/surfaces.md.
import type { SurfaceActionMessage } from "../../shared/types"
import { runAutomationSurfaceAction } from "../automations/engine"
import { getCommandSurfaceActionHandler } from "../commands/surfaceActionHandlers"
import { getFeatureById } from "../features"
import { getSurfacesForUrl, removeSurface } from "../surfaces"
import { createMessageHandler, resolveSenderTabId } from "../utils/messages"

const COMMAND_OWNER_PREFIX = "command:"
const AUTOMATION_OWNER_PREFIX = "automation:"

const handleSurfaceAction = async (
  message: SurfaceActionMessage,
  sender?: any,
) => {
  if (message.actionId === "dismiss") {
    await removeSurface(message.ownerId, message.surfaceId)
    return { success: true }
  }

  const senderTabId = resolveSenderTabId(sender)
  const senderUrl: string | undefined = sender?.tab?.url ?? sender?.url
  const actionContext = {
    selection: message.selection,
    ...(senderTabId !== undefined
      ? { tab: { id: senderTabId, url: senderUrl } }
      : {}),
  }

  if (message.ownerId.startsWith(AUTOMATION_OWNER_PREFIX)) {
    if (
      senderTabId === undefined ||
      !senderUrl ||
      (sender?.frameId !== undefined && sender.frameId !== 0)
    ) {
      return {
        success: false,
        error: "Inline Automation actions require a top-level page",
      }
    }

    const visible = await getSurfacesForUrl(senderUrl, senderTabId)
    const active = visible.find(
      (surface) =>
        surface.ownerId === message.ownerId &&
        surface.id === message.surfaceId &&
        surface.kind === "inline" &&
        surface.actions?.some((action) => action.id === message.actionId),
    )
    if (!active) {
      return {
        success: false,
        error: "This inline Automation action is stale or unavailable",
      }
    }

    const automationId = message.ownerId.slice(AUTOMATION_OWNER_PREFIX.length)
    const result = await runAutomationSurfaceAction(automationId, {
      surfaceId: message.surfaceId,
      actionId: message.actionId,
      tabId: senderTabId,
      context: {
        url: senderUrl,
        title: sender?.tab?.title ?? "",
        modifierKey: null,
      },
    })
    return { success: result.success, error: result.error, result }
  }

  // Command owners route to a handler the command registered at module load.
  if (message.ownerId.startsWith(COMMAND_OWNER_PREFIX)) {
    const commandId = message.ownerId.slice(COMMAND_OWNER_PREFIX.length)
    const handler = getCommandSurfaceActionHandler(commandId)
    if (handler) {
      await handler(message.actionId, actionContext)
      return { success: true }
    }
    // Unknown command owner (or automation owner, still unwired): no-op.
    return { success: false }
  }

  const feature = getFeatureById(message.ownerId)
  if (feature?.settings?.handleAction) {
    await feature.settings.handleAction(message.actionId, actionContext)
    return { success: true }
  }

  // Unknown feature owner or action: no-op.
  return { success: false }
}

export const surfaceAction = createMessageHandler(
  handleSurfaceAction,
  "Failed to handle surface action",
)
