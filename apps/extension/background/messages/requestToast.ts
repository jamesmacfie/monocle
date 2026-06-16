import type { RequestToastMessage } from "../../shared/types"
import { showToast } from "./showToast"

export const requestToast = async (message: RequestToastMessage) => {
  // Forward to showToast with the same parameters
  return showToast({
    type: "show-toast",
    level: message.level,
    message: message.message,
  })
}
