import type { GetSettingsCatalogMessage } from "../../shared/types"
import { getSettingsCatalog as getSettingsCatalogFromBackground } from "../commands/settingsCatalog"
import { createMessageHandler } from "../utils/messages"

const handleGetSettingsCatalog = async (message: GetSettingsCatalogMessage) => {
  return await getSettingsCatalogFromBackground({
    platform: message.platform,
  })
}

export const getSettingsCatalog = createMessageHandler(
  handleGetSettingsCatalog,
  "Failed to get settings catalog",
)
