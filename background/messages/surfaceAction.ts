// Architecture: background message layer. Handles a user interaction reported
// by a surface (content/new-tab -> background). The host captures the gesture;
// the background decides what it means.
//
// v1 implements only the universal `dismiss` action: any surface can be closed,
// which simply removes it from the store (and broadcasts the change so the host
// re-queries). Owner-specific routing — dispatching to a feature's handleAction
// or a user-script handler, mirroring execute-feature-action — is the natural
// next step but is deliberately out of scope here. See
// docs/v_next/03-surfaces-and-persistent-ui.md §3.
import type { SurfaceActionMessage } from "../../shared/types"
import { removeSurface } from "../surfaces"
import { createMessageHandler } from "../utils/messages"

const handleSurfaceAction = async (message: SurfaceActionMessage) => {
  if (message.actionId === "dismiss") {
    await removeSurface(message.ownerId, message.surfaceId)
    return { ok: true }
  }
  // Unknown action ids are no-ops for now (no owner routing yet).
  return { ok: false }
}

export const surfaceAction = createMessageHandler(
  handleSurfaceAction,
  "Failed to handle surface action",
)
