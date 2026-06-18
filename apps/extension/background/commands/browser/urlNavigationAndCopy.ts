import type { ActionCommandNode, CommandIcon } from "../../../shared/types"
import {
  callBrowserAPI,
  getActiveTab,
  sendErrorToastToActiveTab,
  updateTab,
} from "../../utils/browser"
import { deliverClipboard } from "../clipboardDelivery"

type UrlCommandConfig = {
  id: string
  name: string
  description: string
  icon: CommandIcon
  keywords: string[]
  external?: ActionCommandNode["external"]
  // Reuse the executor type (accepts void or a CommandResult) instead of an
  // inline void union, which biome's noConfusingVoidType would autofix.
  execute: ActionCommandNode["execute"]
}

const createUrlCommand = ({
  id,
  name,
  description,
  icon,
  keywords,
  external,
  execute,
}: UrlCommandConfig): ActionCommandNode => ({
  type: "action",
  id,
  name,
  description,
  icon,
  color: "teal",
  keywords,
  ...(external ? { external } : {}),
  execute,
})

const withActiveTabUrl = async <T>(
  callback: (tab: { id: number; title?: string; url: string }) => Promise<T>,
): Promise<T | undefined> => {
  const activeTab = await getActiveTab()
  if (!activeTab?.id || !activeTab.url) {
    return undefined
  }

  return callback({
    id: activeTab.id,
    title: activeTab.title,
    url: activeTab.url,
  })
}

const cleanUrl = (href: string): string => {
  const url = new URL(href)
  url.search = ""
  url.hash = ""
  return url.toString()
}

const getParentUrl = (href: string): string => {
  const url = new URL(href)
  const segments = url.pathname.split("/").filter(Boolean)

  url.search = ""
  url.hash = ""

  if (segments.length === 0) {
    url.pathname = "/"
    return url.toString()
  }

  segments.pop()
  url.pathname = segments.length > 0 ? `/${segments.join("/")}/` : "/"
  return url.toString()
}

const getRootUrl = (href: string): string => {
  const url = new URL(href)
  url.pathname = "/"
  url.search = ""
  url.hash = ""
  return url.toString()
}

const changeLastNumberInUrl = (
  href: string,
  delta: 1 | -1,
): string | undefined => {
  const match = href.match(/^(.*?)(\d+)(\D*)$/)
  if (!match) {
    return undefined
  }

  const [, before, digits, after] = match
  const currentValue = Number.parseInt(digits, 10)
  if (!Number.isFinite(currentValue)) {
    return undefined
  }

  const nextValue = currentValue + delta
  if (nextValue < 0) {
    return undefined
  }

  const paddedValue = String(nextValue).padStart(digits.length, "0")
  return `${before}${paddedValue}${after}`
}

const getCanonicalUrl = async (tabId: number): Promise<string | undefined> => {
  try {
    const [result] = await callBrowserAPI("scripting", "executeScript", {
      target: { tabId },
      func: () => {
        const link = document.querySelector<HTMLLinkElement>(
          'link[rel~="canonical" i]',
        )
        return link?.href || undefined
      },
    })

    return result?.result
  } catch (_error) {
    return undefined
  }
}

export const goToParentUrl = createUrlCommand({
  id: "go-to-parent-url",
  name: "Go to parent URL",
  description: "Navigate the current tab one URL path level up",
  icon: { type: "lucide", name: "ArrowUpToLine" },
  keywords: ["url", "parent", "up", "vim"],
  execute: async () =>
    withActiveTabUrl(async (tab) => {
      await updateTab(tab.id, { url: getParentUrl(tab.url) })
    }),
})

export const goToRootUrl = createUrlCommand({
  id: "go-to-root-url",
  name: "Go to root URL",
  description: "Navigate the current tab to the site root",
  icon: { type: "lucide", name: "House" },
  keywords: ["url", "root", "origin", "home", "vim"],
  execute: async () =>
    withActiveTabUrl(async (tab) => {
      await updateTab(tab.id, { url: getRootUrl(tab.url) })
    }),
})

export const incrementUrlNumber = createUrlCommand({
  id: "increment-url-number",
  name: "Increment URL number",
  description: "Increase the last number in the current tab URL",
  icon: { type: "lucide", name: "Plus" },
  keywords: ["url", "increment", "number", "next", "vim"],
  execute: async () =>
    withActiveTabUrl(async (tab) => {
      const nextUrl = changeLastNumberInUrl(tab.url, 1)
      if (!nextUrl) {
        await sendErrorToastToActiveTab("No URL number to increment")
        return
      }
      await updateTab(tab.id, { url: nextUrl })
    }),
})

export const decrementUrlNumber = createUrlCommand({
  id: "decrement-url-number",
  name: "Decrement URL number",
  description: "Decrease the last number in the current tab URL",
  icon: { type: "lucide", name: "Minus" },
  keywords: ["url", "decrement", "number", "previous", "vim"],
  execute: async () =>
    withActiveTabUrl(async (tab) => {
      const nextUrl = changeLastNumberInUrl(tab.url, -1)
      if (!nextUrl) {
        await sendErrorToastToActiveTab("No URL number to decrement")
        return
      }
      await updateTab(tab.id, { url: nextUrl })
    }),
})

export const viewSourceCurrentTab = createUrlCommand({
  id: "view-source-current-tab",
  name: "View page source",
  description: "Open the current tab URL as page source",
  icon: { type: "lucide", name: "FileCode" },
  keywords: ["view", "source", "html", "page", "vim"],
  execute: async () =>
    withActiveTabUrl(async (tab) => {
      if (tab.url.startsWith("view-source:")) {
        return
      }
      await updateTab(tab.id, { url: `view-source:${tab.url}` })
    }),
})

export const copyCurrentUrl = createUrlCommand({
  id: "copy-current-url",
  name: "Copy URL",
  description: "Copy the current tab URL",
  icon: { type: "lucide", name: "Copy" },
  keywords: ["copy", "url", "link", "yank", "vim"],
  external: { result: "value" },
  execute: async () =>
    withActiveTabUrl(async (tab) => {
      await deliverClipboard(tab.id, tab.url, "URL copied to clipboard")
      return { value: tab.url }
    }),
})

export const copyCleanCurrentUrl = createUrlCommand({
  id: "copy-clean-current-url",
  name: "Copy URL without parameters",
  description: "Copy the current tab URL without query parameters or hash",
  icon: { type: "lucide", name: "ClipboardCheck" },
  keywords: ["copy", "url", "clean", "parameters", "vim"],
  external: { result: "value" },
  execute: async () =>
    withActiveTabUrl(async (tab) => {
      const value = cleanUrl(tab.url)
      await deliverClipboard(tab.id, value, "Clean URL copied to clipboard")
      return { value }
    }),
})

export const copyCurrentDomain = createUrlCommand({
  id: "copy-current-domain",
  name: "Copy domain",
  description: "Copy the current tab domain",
  icon: { type: "lucide", name: "Globe" },
  keywords: ["copy", "domain", "host", "vim"],
  external: { result: "value" },
  execute: async () =>
    withActiveTabUrl(async (tab) => {
      const value = new URL(tab.url).hostname
      await deliverClipboard(tab.id, value, "Domain copied to clipboard")
      return { value }
    }),
})

export const copyCurrentTitle = createUrlCommand({
  id: "copy-current-title",
  name: "Copy page title",
  description: "Copy the current tab title",
  icon: { type: "lucide", name: "FileText" },
  keywords: ["copy", "title", "page", "vim"],
  external: { result: "value" },
  execute: async () =>
    withActiveTabUrl(async (tab) => {
      const value = tab.title || tab.url
      await deliverClipboard(tab.id, value, "Page title copied to clipboard")
      return { value }
    }),
})

export const copyCanonicalUrl = createUrlCommand({
  id: "copy-canonical-url",
  name: "Copy canonical URL",
  description: "Copy the page canonical URL when available",
  icon: { type: "lucide", name: "Link" },
  keywords: ["copy", "canonical", "url", "vim"],
  external: { result: "value" },
  execute: async () =>
    withActiveTabUrl(async (tab) => {
      const canonicalUrl = await getCanonicalUrl(tab.id)
      const value = canonicalUrl || tab.url
      await deliverClipboard(
        tab.id,
        value,
        canonicalUrl
          ? "Canonical URL copied to clipboard"
          : "URL copied to clipboard",
      )
      return { value }
    }),
})

export const urlNavigationAndCopyCommands = [
  goToParentUrl,
  goToRootUrl,
  incrementUrlNumber,
  decrementUrlNumber,
  viewSourceCurrentTab,
  copyCurrentUrl,
  copyCleanCurrentUrl,
  copyCurrentDomain,
  copyCurrentTitle,
  copyCanonicalUrl,
]
