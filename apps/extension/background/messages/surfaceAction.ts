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
//       element's computed styles). user-script owner routing is not yet wired.
// See docs/surfaces.md.
import type { SurfaceActionMessage } from "../../shared/types"
import { getCommandSurfaceActionHandler } from "../commands/surfaceActionHandlers"
import { getFeatureById } from "../features"
import { removeSurface } from "../surfaces"
import { createMessageHandler, resolveSenderTabId } from "../utils/messages"

const COMMAND_OWNER_PREFIX = "command:"

const handleSurfaceAction = async (
  message: SurfaceActionMessage,
  sender?: any,
) => {
  if (message.actionId === "dismiss") {
    await removeSurface(message.ownerId, message.surfaceId)
    return { ok: true }
  }

  const senderTabId = resolveSenderTabId(sender)
  const senderUrl: string | undefined = sender?.url ?? sender?.tab?.url
  const actionContext = {
    selection: message.selection,
    ...(senderTabId !== undefined
      ? { tab: { id: senderTabId, url: senderUrl } }
      : {}),
  }

  // Command owners route to a handler the command registered at module load.
  if (message.ownerId.startsWith(COMMAND_OWNER_PREFIX)) {
    const commandId = message.ownerId.slice(COMMAND_OWNER_PREFIX.length)
    const handler = getCommandSurfaceActionHandler(commandId)
    if (handler) {
      await handler(message.actionId, actionContext)
      return { ok: true }
    }
    // Unknown command owner (or user-script owner, still unwired): no-op.
    return { ok: false }
  }

  const feature = getFeatureById(message.ownerId)
  if (feature?.settings?.handleAction) {
    await feature.settings.handleAction(message.actionId, actionContext)
    return { ok: true }
  }

  // Unknown feature owner or action: no-op.
  return { ok: false }
}

export const surfaceAction = createMessageHandler(
  handleSurfaceAction,
  "Failed to handle surface action",
)
