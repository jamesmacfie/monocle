import type { ActionCommandNode } from "../../../shared/types"
import {
  callBrowserAPI,
  getActiveTab,
  sendErrorToastToActiveTab,
} from "../../utils/browser"

export const focusFirstInput: ActionCommandNode = {
  type: "action",
  id: "focus-first-input",
  name: "Focus first input",
  description: "Focus the first visible input field on the page",
  icon: { type: "lucide", name: "TextCursorInput" },
  color: "blue",
  keywords: ["focus", "input", "field", "form", "text"],
  execute: async () => {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return
    }

    const [result] = await callBrowserAPI("scripting", "executeScript", {
      target: { tabId: activeTab.id },
      // Serialized and run in the page; must stay self-contained
      func: () => {
        const skippedInputTypes = [
          "hidden",
          "submit",
          "button",
          "reset",
          "checkbox",
          "radio",
          "file",
          "image",
          "range",
          "color",
        ]
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>(
            'input, textarea, [contenteditable="true"], [contenteditable=""]',
          ),
        )
        const target = candidates.find((element) => {
          if (element instanceof HTMLInputElement) {
            if (skippedInputTypes.includes(element.type)) {
              return false
            }
            if (element.disabled || element.readOnly) {
              return false
            }
          }
          if (
            element instanceof HTMLTextAreaElement &&
            (element.disabled || element.readOnly)
          ) {
            return false
          }
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })

        if (!target) {
          return false
        }

        target.scrollIntoView({ block: "center" })
        target.focus()
        return true
      },
    })

    if (result?.result !== true) {
      await sendErrorToastToActiveTab("No focusable input found on this page")
    }
  },
}
