import type { Command } from "../../../types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const copyCurrentTabUrl: Command = {
  id: "copyCurrentTabUrl",
  name: "Copy current tab URL",
  icon: { name: "Copy" },
  color: "teal",
  actions: [
    {
      id: "copyCurrentTabUrl-copy-url",
      name: "Copy URL",
      icon: { name: "Copy" },
      keybinding: "↵",
      run: async () => {
        const activeTab = await getActiveTab()
        if (activeTab?.url) {
          await sendTabMessage(activeTab.id, {
            type: "monocle-copyToClipboard",
            message: activeTab.url,
          })
        }
      },
    },
    {
      id: "copyCurrentTabUrl-copy-url-no-params",
      name: "Copy URL without parameters",
      icon: { name: "Copy" },
      keybinding: "⌘ ↵",
      run: async () => {
        const activeTab = await getActiveTab()
        if (activeTab?.url) {
          try {
            const url = new URL(activeTab.url)
            const cleanUrl = `${url.protocol}//${url.host}${url.pathname}`
            await sendTabMessage(activeTab.id, {
              type: "monocle-copyToClipboard",
              message: cleanUrl,
            })
          } catch (_error) {
            // Fallback to original URL if parsing fails
            await sendTabMessage(activeTab.id, {
              type: "monocle-copyToClipboard",
              message: activeTab.url,
            })
          }
        }
      },
    },
    {
      id: "copyCurrentTabUrl-copy-domain",
      name: "Copy domain only",
      icon: { name: "Globe" },
      keybinding: "⌘ ⇧ ↵",
      run: async () => {
        const activeTab = await getActiveTab()
        if (activeTab?.url) {
          try {
            const url = new URL(activeTab.url)
            await sendTabMessage(activeTab.id, {
              type: "monocle-copyToClipboard",
              message: url.hostname,
            })
          } catch (_error) {
            // Fallback to original URL if parsing fails
            await sendTabMessage(activeTab.id, {
              type: "monocle-copyToClipboard",
              message: activeTab.url,
            })
          }
        }
      },
    },
  ],
  run: async () => {
    const activeTab = await getActiveTab()
    if (activeTab?.url) {
      await sendTabMessage(activeTab.id, {
        type: "monocle-copyToClipboard",
        message: activeTab.url,
      })
    }
  },
}
