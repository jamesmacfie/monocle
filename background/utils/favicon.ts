import type { CommandIcon } from "../../types"

/**
 * Get favicon URL for a given website URL using Google's favicon service
 * @param url The website URL to get favicon for
 * @returns Favicon URL from Google's service, or empty string if URL is invalid
 */
export function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
  } catch {
    return ""
  }
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

  // Second priority: Try Google favicon service if we have a URL
  if (options.url) {
    const faviconUrl = getFaviconUrl(options.url)
    if (faviconUrl) {
      return { type: "url", url: faviconUrl }
    }
  }

  // Third priority: Use tab state-based icons if enabled
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
