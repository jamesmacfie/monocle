import type { Browser } from "../../../shared/types"

export type SiteSdkScope = {
  key: string
  tabId: number
  frameId: number
  documentId?: string
  origin: string
  url: string
  title: string
}

const getOrigin = (url: string): string | undefined => {
  try {
    const parsed = new URL(url)
    if (parsed.origin === "null") {
      return `${parsed.protocol}//`
    }
    return parsed.origin
  } catch {
    return undefined
  }
}

/**
 * Builds the registry key that makes SDK commands document-specific.
 *
 * V1 accepts only top-frame content-script senders so a subframe cannot add
 * commands to the parent page's palette.
 */
export const createSiteSdkScopeFromSender = (
  sender: any,
  context?: Browser.Context,
): SiteSdkScope | undefined => {
  const tabId = sender?.tab?.id ?? sender?.validationContext?.senderTab
  const frameId = sender?.frameId ?? 0

  if (typeof tabId !== "number" || frameId !== 0) {
    return undefined
  }

  const url = context?.url || sender?.url || ""
  const origin = getOrigin(url)

  if (!origin) {
    return undefined
  }

  const documentId =
    typeof sender?.documentId === "string" ? sender.documentId : undefined
  const documentKey = documentId ?? String(frameId)

  return {
    key: `tab:${tabId}:document:${documentKey}:origin:${origin}`,
    tabId,
    frameId,
    documentId,
    origin,
    url,
    title: context?.title || "",
  }
}

/**
 * Produces a compact, deterministic origin segment for internal command ids.
 *
 * The hash is not a security boundary; it keeps ids readable while avoiding
 * raw origin characters in generated action ids.
 */
export const hashSiteSdkOrigin = (origin: string): string => {
  let hash = 2166136261

  for (let index = 0; index < origin.length; index += 1) {
    hash ^= origin.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

/**
 * Converts an origin into the human-facing label used by the generated site
 * group. Falls back to the raw origin for uncommon schemes.
 */
export const getSiteSdkHostLabel = (origin: string): string => {
  try {
    return new URL(origin).host || origin
  } catch {
    return origin
  }
}
