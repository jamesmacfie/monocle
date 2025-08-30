import { v4 as uuidv4 } from "uuid"
import type { Command } from "../../../types/"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const copyUuidV4: Command = {
  id: "uuidv4",
  name: "Copy UUID v4",
  icon: { type: "lucide", name: "Copy" },
  color: "teal",
  run: async () => {
    const uuid = uuidv4()
    const activeTab = await getActiveTab()
    if (activeTab?.id) {
      await sendTabMessage(activeTab.id, {
        type: "monocle-copyToClipboard",
        message: uuid,
      })
    }
  },
}
