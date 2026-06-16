import type { OpenPermissionGrantPageMessage } from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"

export const openPermissionGrantPage = async (
  message: OpenPermissionGrantPageMessage,
) => {
  const browserAPI = getBrowserAPI()
  const grantUrl = browserAPI.runtime.getURL(
    `/newtab.html?grantPermission=${encodeURIComponent(message.permission)}`,
  )

  await browserAPI.tabs.create({
    active: true,
    url: grantUrl,
  })

  return { success: true }
}
