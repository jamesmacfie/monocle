import * as React from "react"
import type { ShowToastMessage } from "../../shared/types"
import { useSendMessage } from "./useSendMessage"

export function useToast() {
  const sendMessage = useSendMessage()

  return React.useCallback(
    (level: "info" | "warning" | "success" | "error", message: string) => {
      const toastMessage: ShowToastMessage = {
        type: "monocle-toast-show",
        level,
        message,
      }

      // Toasts are fire-and-forget UI feedback. If the background is briefly
      // unreachable (e.g. an asleep MV3 worker, or no receiver in tests) the
      // toast simply doesn't show — swallow the rejection so it never surfaces
      // as an unhandled promise rejection in the calling component.
      return sendMessage(toastMessage).catch(() => undefined)
    },
    [sendMessage],
  )
}
