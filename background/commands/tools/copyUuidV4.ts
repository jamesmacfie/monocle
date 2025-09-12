import { v4 as uuidv4 } from "uuid"
import type { ActionCommandNode } from "../../../types/"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const copyUuidV4: ActionCommandNode = {
  id: "uuidv4",
  type: "action",
  name: "Copy UUID v4",
  icon: { type: "lucide", name: "Copy" },
  color: "teal",
  execute: async () => {
    const uuid = uuidv4()
    const activeTab = await getActiveTab()
    if (activeTab?.id) {
      await sendTabMessage(activeTab.id, {
        type: "monocle-copyToClipboard",
        message: uuid,
      })
      await sendTabMessage(activeTab.id, {
        type: "monocle-toast",
        level: "success",
        message: "UUID copied to clipboard",
      })
    }
  },
}
