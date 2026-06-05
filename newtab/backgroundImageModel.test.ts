import { describe, expect, it, vi } from "vitest"
import type { UnsplashBackgroundResponse } from "../shared/types"
import {
  BACKGROUND_IMAGE_CACHE_KEY,
  initializeBackgroundImage,
} from "./backgroundImageModel"

type BackgroundEvent =
  | { type: "background"; data: UnsplashBackgroundResponse }
  | { type: "fallback"; error: string }

const background = (
  imageUrl: string,
  overrides: Partial<UnsplashBackgroundResponse> = {},
): UnsplashBackgroundResponse => ({
  imageUrl,
  photographerName: "Ada",
  photographerUrl: "https://unsplash.example/ada",
  photoUrl: "https://unsplash.example/photo",
  ...overrides,
})

const createCache = (initialValue?: string) => {
  const values = new Map<string, string>()
  if (initialValue !== undefined) {
    values.set(BACKGROUND_IMAGE_CACHE_KEY, initialValue)
  }

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    values,
  }
}

const createLogger = () => ({
  error: vi.fn(),
  warn: vi.fn(),
})

const loadBackground = async ({
  cache = createCache(),
  requestBackground,
  preloadImage = vi.fn(async () => undefined),
  logger = createLogger(),
}: {
  cache?: ReturnType<typeof createCache>
  requestBackground: () => Promise<UnsplashBackgroundResponse>
  preloadImage?: (url: string) => Promise<void>
  logger?: ReturnType<typeof createLogger>
}) => {
  const events: BackgroundEvent[] = []

  await initializeBackgroundImage({
    cache,
    requestBackground,
    preloadImage,
    logger,
    onBackground: (data) => events.push({ type: "background", data }),
    onFallback: (error) => events.push({ type: "fallback", error }),
  })

  return { cache, events, logger, preloadImage }
}

describe("new-tab background image model", () => {
  it("falls back deterministically when the background service has no Unsplash API key", async () => {
    const preloadImage = vi.fn(async () => undefined)

    const { cache, events } = await loadBackground({
      preloadImage,
      requestBackground: async () =>
        background("", {
          error: "Unsplash API key not configured",
        }),
    })

    expect(events).toEqual([
      { type: "fallback", error: "Unsplash API key not configured" },
    ])
    expect(preloadImage).not.toHaveBeenCalled()
    expect(cache.setItem).not.toHaveBeenCalled()
  })

  it("preloads, caches, and shows a successful fresh image when no cache exists", async () => {
    const freshBackground = background("https://images.example/fresh.jpg")
    const preloadImage = vi.fn(async () => undefined)

    const { cache, events } = await loadBackground({
      preloadImage,
      requestBackground: async () => freshBackground,
    })

    expect(preloadImage).toHaveBeenCalledWith(freshBackground.imageUrl)
    expect(cache.setItem).toHaveBeenCalledWith(
      BACKGROUND_IMAGE_CACHE_KEY,
      JSON.stringify(freshBackground),
    )
    expect(events).toEqual([{ type: "background", data: freshBackground }])
  })

  it("keeps showing the cached image when fetching a fresh image fails", async () => {
    const cachedBackground = background("https://images.example/cached.jpg")
    const cache = createCache(JSON.stringify(cachedBackground))

    const { events, logger } = await loadBackground({
      cache,
      requestBackground: async () => {
        throw new Error("Network unavailable")
      },
    })

    expect(events).toEqual([{ type: "background", data: cachedBackground }])
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to fetch background image:",
      expect.any(Error),
    )
  })

  it("falls back when fetching fails and no cached image is available", async () => {
    const { events } = await loadBackground({
      requestBackground: async () => {
        throw new Error("Network unavailable")
      },
    })

    expect(events).toEqual([{ type: "fallback", error: "Network unavailable" }])
  })

  it("removes corrupt cache data and uses the deterministic fallback", async () => {
    const cache = createCache("{not-json")

    const { events, logger } = await loadBackground({
      cache,
      requestBackground: async () =>
        background("", {
          error: "Unsplash API key not configured",
        }),
    })

    expect(cache.removeItem).toHaveBeenCalledWith(BACKGROUND_IMAGE_CACHE_KEY)
    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to parse cached background:",
      expect.any(Error),
    )
    expect(events).toEqual([
      { type: "fallback", error: "Unsplash API key not configured" },
    ])
  })
})
