import { defineContentScript } from "wxt/utils/define-content-script"
import { installMonocleSiteSdk } from "../content/siteSdkFacade"

export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "manifest",
  runAt: "document_start",
  world: "MAIN",
  allFrames: false,
  main() {
    installMonocleSiteSdk()
  },
})
