// Architecture: background layer. Optional host access for page-owned
// features: automations, pickers, and any workflow that must message a content
// script on an already-loaded tab. The manifest declares broad optional web
// patterns, but this module requests/checks one concrete scheme+host pattern
// at a time.
import type { ContentMessage } from "../../shared/types"
import { callBrowserAPI } from "./browserApi"
import { getActiveTab, getTab, sendTabMessage } from "./browserTabs"
import { isNoResponseError } from "./messagingErrors"

const CONTENT_SCRIPT_FILE = "content-scripts/content.js"
const CONTENT_READY_RETRY_DELAY_MS = 75
const CONTENT_READY_RETRY_ATTEMPTS = 8

export type HostPermissionReason = "automation" | "elementHider"

export type HostPermissionResult = {
  granted: boolean
  originPattern?: string
  error?: string
}

export type EnsureHostPermissionInput = {
  tabId?: number
  url?: string
  reason: HostPermissionReason
  request?: boolean
  ensureContentScript?: boolean
}

type PatternResult =
  | { ok: true; originPattern: string }
  | { ok: false; error: string }

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const hostPermissionPatternForUrl = (url: string): PatternResult => {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ok: false, error: "Host access is only available for valid URLs" }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: "Host access is only available for http(s) web pages",
    }
  }

  if (!parsed.hostname) {
    return { ok: false, error: "Host access requires a page host" }
  }

  return { ok: true, originPattern: `${parsed.protocol}//${parsed.hostname}/*` }
}

export const hasHostPermissionForUrl = async (
  url: string,
): Promise<HostPermissionResult> => {
  const pattern = hostPermissionPatternForUrl(url)
  if (!pattern.ok) {
    return { granted: false, error: pattern.error }
  }

  try {
    const granted = await callBrowserAPI("permissions", "contains", {
      origins: [pattern.originPattern],
    })
    return { granted: Boolean(granted), originPattern: pattern.originPattern }
  } catch (error) {
    return {
      granted: false,
      originPattern: pattern.originPattern,
      error: `Failed to check host access: ${errorMessage(error)}`,
    }
  }
}

export const requestHostPermissionForUrl = async (
  url: string,
): Promise<HostPermissionResult> => {
  const pattern = hostPermissionPatternForUrl(url)
  if (!pattern.ok) {
    return { granted: false, error: pattern.error }
  }

  try {
    const granted = await callBrowserAPI("permissions", "request", {
      origins: [pattern.originPattern],
    })
    return { granted: Boolean(granted), originPattern: pattern.originPattern }
  } catch (error) {
    return {
      granted: false,
      originPattern: pattern.originPattern,
      error: `Failed to request host access: ${errorMessage(error)}`,
    }
  }
}

const contentPingMessage: ContentMessage = { type: "monocle-content-ping" }

const isContentScriptReady = async (tabId: number): Promise<boolean> => {
  try {
    await sendTabMessage(tabId, contentPingMessage)
    return true
  } catch (error) {
    return isNoResponseError(error)
  }
}

const waitForContentScriptReady = async (tabId: number): Promise<boolean> => {
  for (let attempt = 0; attempt < CONTENT_READY_RETRY_ATTEMPTS; attempt += 1) {
    if (await isContentScriptReady(tabId)) {
      return true
    }
    await wait(CONTENT_READY_RETRY_DELAY_MS)
  }
  return false
}

export const ensureContentScriptForTab = async (
  tabId: number,
): Promise<{ ready: boolean; error?: string }> => {
  if (await isContentScriptReady(tabId)) {
    return { ready: true }
  }

  try {
    await callBrowserAPI("scripting", "executeScript", {
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    })
  } catch (error) {
    return {
      ready: false,
      error: `Could not inject Monocle on this page: ${errorMessage(error)}`,
    }
  }

  if (await waitForContentScriptReady(tabId)) {
    return { ready: true }
  }

  return {
    ready: false,
    error: "Monocle was injected, but the page listener did not become ready",
  }
}

export const ensureHostPermission = async ({
  tabId,
  url,
  request = true,
  ensureContentScript = true,
}: EnsureHostPermissionInput): Promise<HostPermissionResult> => {
  let targetTabId = tabId
  let targetUrl = url

  if (!targetUrl && targetTabId) {
    try {
      const tab = await getTab(targetTabId)
      targetUrl = typeof tab?.url === "string" ? tab.url : undefined
    } catch {
      // Fall through to the no-URL error below.
    }
  }

  if (!targetUrl) {
    const activeTab = await getActiveTab()
    targetTabId ??= activeTab?.id
    targetUrl = typeof activeTab?.url === "string" ? activeTab.url : undefined
  }

  if (!targetUrl) {
    return { granted: false, error: "No web page is available for host access" }
  }

  const permission = request
    ? await requestHostPermissionForUrl(targetUrl)
    : await hasHostPermissionForUrl(targetUrl)

  if (!permission.granted || !targetTabId || !ensureContentScript) {
    return permission
  }

  const content = await ensureContentScriptForTab(targetTabId)
  if (content.ready) {
    return permission
  }

  return {
    granted: false,
    originPattern: permission.originPattern,
    error: content.error,
  }
}
