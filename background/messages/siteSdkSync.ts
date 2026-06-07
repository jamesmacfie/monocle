import type { SiteSdkSyncMessage } from "../../shared/types"
import { invalidateSearchIndex } from "../commands/searchIndex"
import {
  createSiteSdkScopeFromSender,
  syncSiteSdkRegistrations,
} from "../commands/siteSdk"
import { createMessageHandler } from "../utils/messages"

// Sync is accepted only from a top-frame content-script sender. The message
// carries declarations, but the sender-derived scope decides ownership.
const handleSiteSdkSync = async (message: SiteSdkSyncMessage, sender?: any) => {
  const scope = createSiteSdkScopeFromSender(sender, message.context)

  if (!scope) {
    return { success: false, error: "Site SDK is only available to top frames" }
  }

  syncSiteSdkRegistrations(scope, message.registrations)
  invalidateSearchIndex()

  return { success: true }
}

export const siteSdkSync = createMessageHandler(
  handleSiteSdkSync,
  "Failed to sync site SDK commands",
)
