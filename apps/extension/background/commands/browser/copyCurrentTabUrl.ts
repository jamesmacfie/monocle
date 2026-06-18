import type { CommandNode } from "../../../shared/types"
import { getActiveTab } from "../../utils/browser"
import { deliverClipboard } from "../clipboardDelivery"

export const copyCurrentTabUrl: CommandNode = {
  type: "group",
  id: "copyCurrentTabUrl",
  name: "Copy current tab URL",
  icon: { type: "lucide", name: "Copy" },
  color: "teal",
  async children() {
    return [
      {
        type: "action",
        id: "copyCurrentTabUrl-copy-url",
        name: "Copy URL",
        icon: { type: "lucide", name: "Copy" },
        keybinding: "enter",
        external: { result: "value" },
        async execute() {
          const activeTab = await getActiveTab()
          if (!activeTab?.url) {
            return
          }
          await deliverClipboard(
            activeTab.id,
            activeTab.url,
            "URL copied to clipboard",
          )
          return { value: activeTab.url }
        },
      },
      {
        type: "action",
        id: "copyCurrentTabUrl-copy-url-no-params",
        name: "Copy URL without parameters",
        icon: { type: "lucide", name: "Copy" },
        keybinding: "<cmd-enter>",
        external: { result: "value" },
        async execute() {
          const activeTab = await getActiveTab()
          if (!activeTab?.url) {
            return
          }
          let value = activeTab.url
          let toast = "URL copied to clipboard"
          try {
            const url = new URL(activeTab.url)
            value = `${url.protocol}//${url.host}${url.pathname}`
            toast = "Clean URL copied to clipboard"
          } catch (_error) {
            // Fallback to original URL if parsing fails
          }
          await deliverClipboard(activeTab.id, value, toast)
          return { value }
        },
      },
      {
        type: "action",
        id: "copyCurrentTabUrl-copy-domain",
        name: "Copy domain only",
        icon: { type: "lucide", name: "Globe" },
        keybinding: "<cmd-shift-enter>",
        external: { result: "value" },
        async execute() {
          const activeTab = await getActiveTab()
          if (!activeTab?.url) {
            return
          }
          let value = activeTab.url
          let toast = "URL copied to clipboard"
          try {
            value = new URL(activeTab.url).hostname
            toast = "Domain copied to clipboard"
          } catch (_error) {
            // Fallback to original URL if parsing fails
          }
          await deliverClipboard(activeTab.id, value, toast)
          return { value }
        },
      },
    ]
  },
}
