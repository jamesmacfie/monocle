import type { Command } from "../../../types/"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const copyCurrentTabUrl: Command = {
  id: "copyCurrentTabUrl",
  name: "Copy current tab URL",
  icon: { type: "lucide", name: "Copy" },
  color: "teal",
  actions: [
    {
      id: "copyCurrentTabUrl-copy-url",
      name: "Copy URL",
      icon: { type: "lucide", name: "Copy" },
      keybinding: "↵",
      run: async () => {
        const activeTab = await getActiveTab()
        if (activeTab?.url) {
          await sendTabMessage(activeTab.id, {
            type: "monocle-copyToClipboard",
            message: activeTab.url,
          })
          console.log("URL copied to clipboard 5")
          await sendTabMessage(activeTab.id, {
            type: "monocle-toast",
            level: "success",
            message: "URL copied to clipboard",
          })
        }
      },
    },
    {
      id: "copyCurrentTabUrl-copy-url-no-params",
      name: "Copy URL without parameters",
      icon: { type: "lucide", name: "Copy" },
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
            console.log("URL copied to clipboard 4")
            await sendTabMessage(activeTab.id, {
              type: "monocle-toast",
              level: "success",
              message: "Clean URL copied to clipboard",
            })
          } catch (_error) {
            // Fallback to original URL if parsing fails
            await sendTabMessage(activeTab.id, {
              type: "monocle-copyToClipboard",
              message: activeTab.url,
            })
            await sendTabMessage(activeTab.id, {
              type: "monocle-toast",
              level: "success",
              message: "URL copied to clipboard",
            })
          }
        }
      },
    },
    {
      id: "copyCurrentTabUrl-copy-domain",
      name: "Copy domain only",
      icon: { type: "lucide", name: "Globe" },
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
            await sendTabMessage(activeTab.id, {
              type: "monocle-toast",
              level: "success",
              message: "Domain copied to clipboard",
            })
          } catch (_error) {
            // Fallback to original URL if parsing fails
            await sendTabMessage(activeTab.id, {
              type: "monocle-copyToClipboard",
              message: activeTab.url,
            })
            console.log("URL copied to clipboard 3")
            await sendTabMessage(activeTab.id, {
              type: "monocle-toast",
              level: "success",
              message: "URL copied to clipboard",
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
      console.log("URL copied to clipboard", activeTab.url)
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: "URL copied to clipboard",
      })
    }
  },
}
