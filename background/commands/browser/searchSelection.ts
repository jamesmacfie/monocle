import type { CommandNode } from "../../../shared/types"
import {
  callBrowserAPI,
  createTab,
  getActiveTab,
  sendErrorToastToActiveTab,
} from "../../utils/browser"

type SearchProvider = {
  key: string
  name: string
  buildSearchUrl: (query: string) => string
}

const searchProviders: SearchProvider[] = [
  {
    key: "google",
    name: "Google",
    buildSearchUrl: (query) =>
      `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  },
]

const getActiveTabSelection = async (
  tabId: number,
): Promise<string | undefined> => {
  try {
    const [result] = await callBrowserAPI("scripting", "executeScript", {
      target: { tabId },
      func: () => window.getSelection()?.toString() ?? "",
    })

    return typeof result?.result === "string" ? result.result.trim() : undefined
  } catch (_error) {
    return undefined
  }
}

const createProviderCommand = (provider: SearchProvider): CommandNode => ({
  type: "action",
  id: `search-selection-${provider.key}`,
  name: `Search selection on ${provider.name}`,
  description: `Search the selected text on ${provider.name} in a new tab`,
  icon: { type: "lucide", name: "Search" },
  color: "teal",
  keywords: ["search", "selection", "selected", "text", provider.name],
  async execute() {
    const activeTab = await getActiveTab()
    if (!activeTab?.id) {
      return
    }

    const selection = await getActiveTabSelection(activeTab.id)
    if (!selection) {
      await sendErrorToastToActiveTab("No text selected")
      return
    }

    await createTab({ url: provider.buildSearchUrl(selection) })
  },
})

export const searchSelection: CommandNode = {
  type: "group",
  id: "search-selection",
  name: "Search selection",
  description: "Search the selected text with a search provider",
  icon: { type: "lucide", name: "TextSearch" },
  color: "teal",
  keywords: ["search", "selection", "selected", "text", "google"],
  async children() {
    return searchProviders.map(createProviderCommand)
  },
}
