// Architecture: background message layer. Handles a user interaction reported
// by a surface (content/new-tab -> background). The host captures the gesture;
// the background decides what it means.
//
// Two paths:
//   - `dismiss` is universal: any surface can be closed, which removes it from
//     the store (and broadcasts the change so the host re-queries).
//   - any other action is routed to the surface's OWNER. Feature owners (a bare
//     feature id; session owners are namespaced `command:`/`userscript:`) are
//     dispatched to the feature's `handleAction` — the same entry point that
//     backs execute-feature-action — so a feature reacts to surface gestures
//     (e.g. a `picker` reporting a clicked element) exactly as it reacts to a
//     settings-page button. user-script/command owner routing is not yet wired.
// See docs/surfaces.md.
import type { SurfaceActionMessage } from "../../shared/types"
import { getFeatureById } from "../features"
import { removeSurface } from "../surfaces"
import { createMessageHandler } from "../utils/messages"

const isSessionOwner = (ownerId: string): boolean =>
  ownerId.startsWith("command:") || ownerId.startsWith("userscript:")

const handleSurfaceAction = async (
  message: SurfaceActionMessage,
  sender?: any,
) => {
  if (message.actionId === "dismiss") {
    await removeSurface(message.ownerId, message.surfaceId)
    return { ok: true }
  }

  // Session owners can render/dismiss surfaces today, but owner-specific
  // command/user-script action routing is not wired yet.
  if (isSessionOwner(message.ownerId)) {
    return { ok: false }
  }

  const feature = getFeatureById(message.ownerId)
  if (feature?.settings?.handleAction) {
    const senderTabId: number | undefined =
      sender?.tab?.id ?? sender?.validationContext?.senderTab
    const senderUrl: string | undefined = sender?.url ?? sender?.tab?.url
    await feature.settings.handleAction(message.actionId, {
      selection: message.selection,
      ...(senderTabId !== undefined
        ? { tab: { id: senderTabId, url: senderUrl } }
        : {}),
    })
    return { ok: true }
  }

  // Unknown feature owner or action: no-op.
  return { ok: false }
}

export const surfaceAction = createMessageHandler(
  handleSurfaceAction,
  "Failed to handle surface action",
)
