import type { Command } from "../../../types";
import { v4 as uuidv4 } from "uuid";
import { queryTabs, sendTabMessage } from "../../utils/browser";

export const copyCurrentTabUrl: Command = {
  id: "copyCurrentTabUrl",
  name: "Copy current tab URL",
  icon: { name: "Copy" },
  color: "teal",
  actions: [
    {
      id: "copyCurrentTabUrl-copy-url",
      name: "Copy URL",
      icon: { name: 'Copy' },
      keybinding: "↵",
      run: async (context, values) => {
        const [activeTab] = await queryTabs({ active: true, currentWindow: true });
        if (activeTab?.id) {
          await sendTabMessage(activeTab.id, {
            type: "monocle-copyToClipboard",
            message: activeTab.url
          });
        }
      },
    },
    {
      id: "copyCurrentTabUrl-copy-url-no-params",
      name: "Copy URL without parameters",
      icon: { name: 'Copy' },
      keybinding: "⌘ ↵",
      run: async (context, values) => {
        const [activeTab] = await queryTabs({ active: true, currentWindow: true });
        if (activeTab?.id && activeTab.url) {
          try {
            const url = new URL(activeTab.url);
            const cleanUrl = `${url.protocol}//${url.host}${url.pathname}`;
            await sendTabMessage(activeTab.id, {
              type: "monocle-copyToClipboard",
              message: cleanUrl
            });
          } catch (error) {
            // Fallback to original URL if parsing fails
            await sendTabMessage(activeTab.id, {
              type: "monocle-copyToClipboard",
              message: activeTab.url
            });
          }
        }
      },
    },
    {
      id: "copyCurrentTabUrl-copy-domain",
      name: "Copy domain only",
      icon: { name: 'Globe' },
      keybinding: "⌘ ⇧ ↵",
      run: async (context, values) => {
        const [activeTab] = await queryTabs({ active: true, currentWindow: true });
        if (activeTab?.id && activeTab.url) {
          try {
            const url = new URL(activeTab.url);
            await sendTabMessage(activeTab.id, {
              type: "monocle-copyToClipboard",
              message: url.hostname
            });
          } catch (error) {
            // Fallback to original URL if parsing fails
            await sendTabMessage(activeTab.id, {
              type: "monocle-copyToClipboard",
              message: activeTab.url
            });
          }
        }
      },
    }
  ],
  run: async (context, values) => {
    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await sendTabMessage(activeTab.id, {
        type: "monocle-copyToClipboard",
        message: activeTab.url
      });
    }
  },
};
