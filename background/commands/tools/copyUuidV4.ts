import type { Command } from "../../../types";
import { v4 as uuidv4 } from "uuid";
import { queryTabs, sendTabMessage } from "../../utils/browser";

export const copyUuidV4: Command = {
  id: "uuidv4",
  name: "Copy UUID v4",
  icon: { name: "Copy" },
  color: "teal",
  run: async (context, values) => {
    const uuid = uuidv4();
    const [activeTab] = await queryTabs({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await sendTabMessage(activeTab.id, {
        type: "monocle-copyToClipboard",
        message: uuid
      });
    }
  },
};
