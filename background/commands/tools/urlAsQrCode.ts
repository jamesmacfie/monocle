import type { ActionCommandNode, ContentBlock } from "../../../shared/types"
import { validateContentBlocks } from "../../../shared/types"
import { upsertSurface } from "../../surfaces"
import { getActiveTab, sendTabMessage } from "../../utils/browser"
import { qrCodeSvgDataUrl } from "../../utils/qr"

// The first command that triggers a Surface. Rather than copy anything, it
// pushes a `modal` surface containing the QR as an `image` content block; the
// generic SurfaceHost renders it over the page. Owner id is `command:<id>` so
// the modal is treated as per-session (cleared on startup, like automations).
// See docs/surfaces.md.
const OWNER_ID = "command:url-as-qr-code"
const SURFACE_ID = "qr"

export const urlAsQrCode: ActionCommandNode = {
  id: "url-as-qr-code",
  type: "action",
  name: "Website URL as QR code",
  description: "Show a QR code for the current page",
  icon: { type: "lucide", name: "QrCode" },
  color: "indigo",
  keywords: ["qr", "code", "scan", "url", "share", "phone"],
  execute: async (context) => {
    const url = context?.url ?? ""

    // QR of a page only makes sense for real http(s) pages — not the new tab,
    // chrome://, or about: pages.
    if (!/^https?:\/\//i.test(url)) {
      const activeTab = await getActiveTab()
      if (activeTab?.id) {
        await sendTabMessage(activeTab.id, {
          type: "monocle-toast",
          level: "warning",
          message: "No page URL to encode",
        })
      }
      return
    }

    const blocks: ContentBlock[] = [
      { type: "image", dataUrl: qrCodeSvgDataUrl(url) },
    ]
    // Fail-quiet at the content-block boundary, mirroring the calculation path.
    const validated = validateContentBlocks(blocks)
    if (!validated) {
      return
    }

    await upsertSurface(OWNER_ID, {
      id: SURFACE_ID,
      kind: "modal",
      // Scope the modal to the page it was triggered on.
      urlMatch: { allowUrls: [url] },
      content: { title: "QR code", text: url, blocks: validated },
    })
  },
}
