import type { ActionCommandNode, CommandNode, SearchCommandNode } from "../../../shared/types"
import { createTab, getActiveTab, updateTab } from "../../utils/browser"

function isProbablyUrl(input: string): boolean {
  if (!input) return false
  const hasSpace = /\s/.test(input)
  if (hasSpace) return false
  // Looks like a domain or has a scheme
  return /^(https?:\/\/)/i.test(input) || /\.[a-z]{2,}$/i.test(input)
}

function toHttpUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input
  return `https://${input}`
}

function safeIdSegment(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\-._:]+/g, "-")
    .slice(0, 80)
}

function buildGoogleQueryUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

function createOpenUrlAction(
  id: string,
  title: string,
  url: string,
): ActionCommandNode {
  return {
    type: "action",
    id,
    name: title,
    description: url,
    icon: { type: "lucide", name: "Globe" },
    color: "blue",
    keywords: [title, url],
    actionLabel: "Open",
    modifierActionLabel: { cmd: "Open in New Tab" },
    allowCustomKeybinding: false,
    async execute(context) {
      try {
        if (context?.modifierKey === "cmd") {
          await createTab({ url })
        } else {
          const activeTab = await getActiveTab()
          if (activeTab) {
            await updateTab(activeTab.id, { url })
          } else {
            await createTab({ url })
          }
        }
      } catch (error) {
        console.error(`[GoogleSearch] Failed to open URL: ${url}`, error)
      }
    },
  }
}

function createSearchQueryAction(id: string, query: string): ActionCommandNode {
  const url = buildGoogleQueryUrl(query)
  return {
    type: "action",
    id,
    name: `Search Google for "${query}"`,
    description: url,
    icon: { type: "lucide", name: "Search" },
    color: "teal",
    keywords: [query, "google", "search"],
    actionLabel: "Search",
    modifierActionLabel: { cmd: "Open in New Tab" },
    allowCustomKeybinding: false,
    async execute(context) {
      try {
        if (context?.modifierKey === "cmd") {
          await createTab({ url })
        } else {
          const activeTab = await getActiveTab()
          if (activeTab) {
            await updateTab(activeTab.id, { url })
          } else {
            await createTab({ url })
          }
        }
      } catch (error) {
        console.error(`[GoogleSearch] Failed to open search: ${url}`, error)
      }
    },
  }
}

async function fetchGoogleSuggestions(query: string): Promise<string[]> {
  try {
    const endpoint = `https://www.google.com/complete/search?client=chrome&q=${encodeURIComponent(
      query,
    )}`
    const res = await fetch(endpoint, { method: "GET" })
    if (!res.ok) return []
    const data = (await res.json()) as any
    // Expected shape: [query, [suggestions...], ...]
    if (Array.isArray(data) && Array.isArray(data[1])) {
      return (data[1] as any[])
        .map((s) => (typeof s === "string" ? s : String(s)))
        .filter(Boolean)
    }
    return []
  } catch (e) {
    console.warn("[GoogleSearch] Suggest fetch failed:", e)
    return []
  }
}

export const googleSearch: SearchCommandNode = {
  type: "search",
  id: "google-search",
  name: "Google Search",
  icon: { type: "lucide", name: "Search" },
  color: "teal",
  actionLabel: "Search",
  async execute(_context, values) {
    // Execute using a URL payload if provided by the UI (dynamic children selection)
    const url = (values as any)?.dynamicUrl
    if (typeof url === "string" && /^https?:\/\//i.test(url)) {
      try {
        if (_context?.modifierKey === "cmd") {
          await createTab({ url })
        } else {
          const activeTab = await getActiveTab()
          if (activeTab) {
            await updateTab(activeTab.id, { url })
          } else {
            await createTab({ url })
          }
        }
      } catch (error) {
        console.error("[GoogleSearch] Failed to open dynamic URL:", url, error)
      }
    }
  },
  async getResults(_context, search) {
    const query = (search || "").trim()
    if (!query) return []

    // Suggest opening URL directly when query looks like a URL/domain
    const nodes: CommandNode[] = []
    if (isProbablyUrl(query)) {
      const url = toHttpUrl(query)
      nodes.push(
        createOpenUrlAction(
          `google-search-url-${safeIdSegment(query)}`,
          `Open ${query}`,
          url,
        ),
      )
    }

    // Base query as explicit search action
    nodes.push(createSearchQueryAction(`google-search-q-${safeIdSegment(query)}`, query))

    // Remote autosuggestions
    const suggestions = await fetchGoogleSuggestions(query)
    const lowerQuery = query.toLowerCase()
    const unique = new Set<string>()
    for (const s of suggestions.slice(0, 8)) {
      const normalized = s.trim()
      if (!normalized) continue
      const key = normalized.toLowerCase()
      if (key === lowerQuery) continue
      if (unique.has(key)) continue
      unique.add(key)
      nodes.push(
        createSearchQueryAction(
          `google-suggest-${safeIdSegment(normalized)}`,
          normalized,
        ),
      )
    }

    return nodes
  },
}
