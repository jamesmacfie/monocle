import type { CommandIcon } from "../../shared/types"
import { isFirefox } from "../../shared/utils/browser"

/**
 * Get local favicon URL using Chrome's built-in favicon service
 * @param url The website URL to get favicon for
 * @returns Chrome favicon URL, or empty string if not Chrome or invalid URL
 */
export function getLocalFaviconUrl(url: string): string {
  if (isFirefox) {
    return ""
  }

  try {
    // Chrome's local favicon service
    return `chrome://favicon/size/16@1x/${encodeURIComponent(url)}`
  } catch {
    return ""
  }
}

/**
 * Get favicon URL using DuckDuckGo's privacy-focused favicon service
 * @param url The website URL to get favicon for
 * @returns Favicon URL from DuckDuckGo's service, or empty string if URL is invalid
 */
export function getDuckDuckGoFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://icons.duckduckgo.com/ip3/${domain}.ico`
  } catch {
    return ""
  }
}

/**
 * Get favicon URL for a given website URL using privacy-preserving services
 * @param url The website URL to get favicon for
 * @returns Favicon URL from DuckDuckGo's service, or empty string if URL is invalid
 * @deprecated Use getFaviconIcon instead for better fallback logic
 */
export function getFaviconUrl(url: string): string {
  return getDuckDuckGoFaviconUrl(url)
}

/**
 * Get icon for a tab or bookmark with comprehensive fallback logic
 * @param options Configuration for favicon resolution
 * @returns Promise that resolves to a CommandIcon
 */
export async function getFaviconIcon(options: {
  /** Browser-provided favicon URL (from tab.favIconUrl) */
  browserFaviconUrl?: string
  /** Website URL to get favicon for */
  url?: string
  /** Fallback icon configuration */
  fallback?: {
    /** Use state-based icons for tabs (pinned, audible, etc.) */
    useTabStateIcons?: boolean
    pinned?: boolean
    audible?: boolean
    muted?: boolean
  }
}): Promise<CommandIcon> {
  // First priority: Use browser-provided favicon if available
  if (options.browserFaviconUrl) {
    return { type: "url", url: options.browserFaviconUrl }
  }

  // Second priority: Try local Chrome favicon service if available
  if (options.url && !isFirefox) {
    const localFaviconUrl = getLocalFaviconUrl(options.url)
    if (localFaviconUrl) {
      return { type: "url", url: localFaviconUrl }
    }
  }

  // Third priority: Try DuckDuckGo favicon service if we have a URL
  if (options.url) {
    const faviconUrl = getDuckDuckGoFaviconUrl(options.url)
    if (faviconUrl) {
      return { type: "url", url: faviconUrl }
    }
  }

  // Fourth priority: Use tab state-based icons if enabled
  if (options.fallback?.useTabStateIcons) {
    const { pinned, audible, muted } = options.fallback

    if (pinned) {
      return { type: "lucide", name: "Pin" }
    }

    if (audible) {
      return { type: "lucide", name: "Volume2" }
    }

    if (muted) {
      return { type: "lucide", name: "VolumeX" }
    }
  }

  // Final fallback: Generic globe icon
  return { type: "lucide", name: "Globe" }
}
