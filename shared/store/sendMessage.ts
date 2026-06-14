import { sendRuntimeMessage } from "../utils/extension-api"

// Shared background-messaging factory for palette stores (options, new tab, and
// the content overlay's secondary store). Attaches the current page context to
// every message; the Promise/lastError transport is the shared
// `sendRuntimeMessage` (see shared/utils/extension-api.ts). The React palette
// uses the richer `useSendMessage` hook instead — this factory exists for
// non-hook store wiring that still needs a context-stamped sender.
export const createPaletteSendMessage = (
  extraContext: Record<string, unknown> = {},
) => {
  return (message: any) => {
    const context = {
      title: document.title,
      url: window.location.href,
      modifierKey: null,
      ...extraContext,
    }
    return sendRuntimeMessage({ ...message, context })
  }
}
