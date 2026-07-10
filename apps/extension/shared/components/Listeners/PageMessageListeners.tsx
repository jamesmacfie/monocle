import { ToastContainer } from "../ToastContainer"
import CopyPageAsMarkdownListener from "./CopyPageAsMarkdownListener"
import CopyToClipboardListener from "./CopyToClipboardListener"
import InsertTextListener from "./InsertTextListener"
import NewTabListener from "./NewTabListener"
import ScreenshotListener from "./ScreenshotListener"
import ScrollListener from "./ScrollListener"

export function PageMessageListeners({
  includePageMarkdown = false,
}: {
  includePageMarkdown?: boolean
}) {
  return (
    <>
      <CopyToClipboardListener />
      {includePageMarkdown && <CopyPageAsMarkdownListener />}
      <InsertTextListener />
      <NewTabListener />
      <ScrollListener />
      <ScreenshotListener />
      <ToastContainer />
    </>
  )
}
