import { v4 as uuidv4 } from "uuid"
import type { ActionCommandNode } from "../../../shared/types"
import { getActiveTab } from "../../utils/browser"
import { deliverClipboard } from "../clipboardDelivery"

export const copyUuidV4: ActionCommandNode = {
  id: "uuidv4",
  type: "action",
  name: "Copy UUID v4",
  icon: { type: "lucide", name: "Copy" },
  color: "teal",
  external: { result: "value" },
  execute: async () => {
    const uuid = uuidv4()
    const activeTab = await getActiveTab()
    if (activeTab?.id) {
      await deliverClipboard(activeTab.id, uuid, "UUID copied to clipboard")
    }
    return { value: uuid }
  },
}
