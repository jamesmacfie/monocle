import * as React from "react"
import type { RequestToastMessage } from "../../shared/types"
import { useSendMessage } from "./useSendMessage"

export function useToast() {
  const sendMessage = useSendMessage()

  return React.useCallback(
    (level: "info" | "warning" | "success" | "error", message: string) => {
      const toastMessage: RequestToastMessage = {
        type: "request-toast",
        level,
        message,
      }

      return sendMessage(toastMessage)
    },
    [sendMessage],
  )
}
