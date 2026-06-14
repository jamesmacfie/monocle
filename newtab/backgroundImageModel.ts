import type { UnsplashBackgroundResponse } from "../shared/types"

export const BACKGROUND_IMAGE_CACHE_KEY = "monocle-unsplash-background"

type BackgroundImageCache = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem?: (key: string) => void
}

type BackgroundImageLogger = Pick<Console, "error" | "warn">

type BackgroundImageCallbacks = {
  onBackground: (data: UnsplashBackgroundResponse) => void
  onFallback: (error: string) => void
}

type InitializeBackgroundImageOptions = BackgroundImageCallbacks & {
  cache: BackgroundImageCache
  requestBackground: () => Promise<UnsplashBackgroundResponse>
  preloadImage: (url: string) => Promise<void>
  logger?: BackgroundImageLogger
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null
}

export const hasUsableBackgroundImage = (
  data: UnsplashBackgroundResponse | null,
): data is UnsplashBackgroundResponse => {
  return typeof data?.imageUrl === "string" && data.imageUrl.length > 0
}

const normalizeCachedBackground = (
  value: unknown,
): UnsplashBackgroundResponse | null => {
  if (!isRecord(value) || typeof value.imageUrl !== "string") {
    return null
  }

  return {
    imageUrl: value.imageUrl,
    photographerName:
      typeof value.photographerName === "string" ? value.photographerName : "",
    photographerUrl:
      typeof value.photographerUrl === "string" ? value.photographerUrl : "",
    photoUrl: typeof value.photoUrl === "string" ? value.photoUrl : "",
    error: typeof value.error === "string" ? value.error : undefined,
  }
}

export const getCachedBackground = (
  cache: BackgroundImageCache,
  logger: BackgroundImageLogger = console,
): UnsplashBackgroundResponse | null => {
  try {
    const cached = cache.getItem(BACKGROUND_IMAGE_CACHE_KEY)
    if (!cached) {
      return null
    }

    const normalized = normalizeCachedBackground(JSON.parse(cached))
    if (!normalized) {
      cache.removeItem?.(BACKGROUND_IMAGE_CACHE_KEY)
    }

    return normalized
  } catch (error) {
    logger.warn("Failed to parse cached background:", error)
    cache.removeItem?.(BACKGROUND_IMAGE_CACHE_KEY)
    return null
  }
}

export const setCachedBackground = (
  cache: BackgroundImageCache,
  data: UnsplashBackgroundResponse,
  logger: BackgroundImageLogger = console,
): void => {
  try {
    cache.setItem(BACKGROUND_IMAGE_CACHE_KEY, JSON.stringify(data))
  } catch (error) {
    logger.warn("Failed to cache background:", error)
  }
}

/**
 * Two-phase new-tab background load. Phase 1: if a usable image is cached, show
 * it immediately (no flash of empty background on open). Phase 2: fetch a fresh
 * image, preload it, and re-cache it for next time. The fresh image only paints
 * if no cached image was already shown — otherwise it silently primes the cache,
 * avoiding a mid-session swap. `onFallback` fires only when there's nothing
 * cached to fall back on. Dependencies are injected so it's environment-agnostic
 * and unit-testable. See docs/new-tab-and-theme.md.
 */
export async function initializeBackgroundImage({
  cache,
  requestBackground,
  preloadImage,
  onBackground,
  onFallback,
  logger = console,
}: InitializeBackgroundImageOptions): Promise<void> {
  let hasShownCachedImage = false
  const cachedBackground = getCachedBackground(cache, logger)

  if (hasUsableBackgroundImage(cachedBackground)) {
    onBackground(cachedBackground)
    hasShownCachedImage = true
  }

  try {
    const response = await requestBackground()

    if (!response.error && hasUsableBackgroundImage(response)) {
      try {
        await preloadImage(response.imageUrl)
      } catch (preloadError) {
        logger.warn("Failed to preload image:", preloadError)
      }

      setCachedBackground(cache, response, logger)

      if (!hasShownCachedImage) {
        onBackground(response)
      }

      return
    }

    logger.warn("Failed to fetch new background:", response.error)
    if (!hasShownCachedImage) {
      onFallback(response.error || "Failed to load background")
    }
  } catch (error) {
    logger.error("Failed to fetch background image:", error)
    if (!hasShownCachedImage) {
      onFallback(
        error instanceof Error ? error.message : "Failed to load background",
      )
    }
  }
}
