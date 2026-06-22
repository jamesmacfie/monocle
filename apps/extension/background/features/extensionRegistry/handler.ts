// Architecture: background feature layer (extension-to-extension). The cross-
// extension message handler — the peer→Monocle control plane. Registered on
// `chrome.runtime.onMessageExternal` (NOT the internal message router; this is a
// deliberately separate, externally-reachable seam). Validates the public Zod
// envelope, gates on the master opt-in + the browser-verified `sender.id`
// allowlist, then dispatches announce/register/dispose. The invoke RPC goes the
// other direction (Monocle → peer over a port; see extensionSdk/transport.ts).
// See docs/extension-extension/protocol.md and registration-and-trust.md.
import {
  type ExtRequest,
  ExtRequestSchema,
  type ExtResponse,
  extError,
  extOk,
  validateExternalRegistrations,
} from "../../../shared/types"
import { getBrowserAPI } from "../../../shared/utils/extension-api"
import {
  clearExtensionRegistrations,
  setExtensionRegistrations,
} from "../../commands/extensionSdk"
import { invalidateSearchIndex } from "../../commands/searchIndex"
import {
  addPendingPeer,
  isExtensionRegistryEnabled,
  isPeerApproved,
  touchPeerSeen,
} from "./store"

const echoId = (raw: unknown): string =>
  raw &&
  typeof raw === "object" &&
  typeof (raw as { id?: unknown }).id === "string"
    ? (raw as { id: string }).id
    : ""

export const handleExternalMessage = async (
  raw: unknown,
  senderId: string | undefined,
): Promise<ExtResponse> => {
  const parsed = ExtRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return extError(
      echoId(raw),
      "bad_request",
      parsed.error.issues[0]?.message ?? "Invalid request",
    )
  }

  const request: ExtRequest = parsed.data
  const { id } = request

  // The browser sets sender.id from the peer's signing key; we cannot be lied
  // to about it. Absence means a malformed sender — reject.
  if (!senderId) {
    return extError(id, "unauthorized", "Missing sender id")
  }

  if (!(await isExtensionRegistryEnabled())) {
    return extError(id, "not_enabled", "Extension integrations are disabled")
  }

  try {
    if (request.kind === "announce") {
      if (await isPeerApproved(senderId)) {
        await touchPeerSeen(senderId)
        return extOk(id, { status: "approved" })
      }
      await addPendingPeer({
        extId: senderId,
        name: request.params.manifest.name,
        description: request.params.manifest.description,
        announcedAt: Date.now(),
      })
      return extOk(id, { status: "pending" })
    }

    if (request.kind === "register") {
      if (!(await isPeerApproved(senderId))) {
        return extError(id, "unauthorized", "Extension is not approved")
      }
      const validation = validateExternalRegistrations(
        request.params.registrations,
      )
      if (!validation.success) {
        return extError(id, "bad_request", validation.error)
      }
      const entry = await setExtensionRegistrations(
        senderId,
        validation.registrations,
      )
      await touchPeerSeen(senderId)
      invalidateSearchIndex()
      return extOk(id, {
        accepted: validation.registrations.length,
        revision: entry.revision,
      })
    }

    // dispose: clear the peer's commands but keep its approval.
    await clearExtensionRegistrations(senderId)
    invalidateSearchIndex()
    return extOk(id, { ok: true })
  } catch (error) {
    console.error("[extension-registry] request failed:", error)
    return extError(id, "internal", "Internal error")
  }
}

// Register the externally-reachable listener once, at startup. MV3 wants event
// listeners registered synchronously at the top level, so this is called
// directly from background/index.ts (not via the async feature init).
export const initExtensionMessaging = (): void => {
  const runtime = getBrowserAPI().runtime as unknown as {
    onMessageExternal?: {
      addListener: (
        cb: (
          message: unknown,
          sender: { id?: string },
          sendResponse: (response: unknown) => void,
        ) => boolean | undefined,
      ) => void
    }
  }

  runtime.onMessageExternal?.addListener((message, sender, sendResponse) => {
    handleExternalMessage(message, sender?.id)
      .then(sendResponse)
      .catch((error) => {
        console.error("[extension-registry] handler crashed:", error)
        sendResponse(extError(echoId(message), "internal", "Internal error"))
      })
    return true // keep the message channel open for the async reply
  })
}
