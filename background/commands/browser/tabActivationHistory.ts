import { getTab } from "../../utils/browser"

const MAX_HISTORY_LENGTH = 50
const activatedTabIds: number[] = []

export function recordActivatedTab(tabId: number): void {
  const existingIndex = activatedTabIds.indexOf(tabId)
  if (existingIndex >= 0) {
    activatedTabIds.splice(existingIndex, 1)
  }

  activatedTabIds.push(tabId)

  if (activatedTabIds.length > MAX_HISTORY_LENGTH) {
    activatedTabIds.splice(0, activatedTabIds.length - MAX_HISTORY_LENGTH)
  }
}

export function forgetActivatedTab(tabId: number): void {
  const existingIndex = activatedTabIds.indexOf(tabId)
  if (existingIndex >= 0) {
    activatedTabIds.splice(existingIndex, 1)
  }
}

export async function getPreviousActivatedTabId(
  currentTabId?: number,
): Promise<number | undefined> {
  for (let index = activatedTabIds.length - 1; index >= 0; index -= 1) {
    const tabId = activatedTabIds[index]
    if (tabId === currentTabId) {
      continue
    }

    try {
      const tab = await getTab(tabId)
      if (tab?.id) {
        return tab.id
      }
    } catch (_error) {
      forgetActivatedTab(tabId)
    }
  }

  return undefined
}
