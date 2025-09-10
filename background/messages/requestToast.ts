import type { RequestToastMessage } from "../../types/"
import { showToast } from "./showToast"

export const requestToast = async (message: RequestToastMessage) => {
  console.debug(
    "[RequestToast] Handling toast request:",
    message.level,
    message.message,
  )

  // Forward to showToast with the same parameters
  return showToast({
    type: "show-toast",
    level: message.level,
    message: message.message,
  })
}
