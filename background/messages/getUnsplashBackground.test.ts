import { describe, expect, it, vi } from "vitest"
import type { UnsplashPhoto } from "../../shared/types"
import { fetchUnsplashBackground } from "./getUnsplashBackground"

const photo: UnsplashPhoto = {
  id: "photo-1",
  urls: {
    raw: "https://images.example/raw.jpg",
    full: "https://images.example/full.jpg",
    regular: "https://images.example/regular.jpg",
    small: "https://images.example/small.jpg",
    thumb: "https://images.example/thumb.jpg",
  },
  user: {
    name: "Ada",
    username: "ada",
    links: {
      html: "https://unsplash.example/ada",
    },
  },
  links: {
    html: "https://unsplash.example/photo-1",
  },
}

const createLogger = () => ({
  error: vi.fn(),
})

describe("Unsplash background message model", () => {
  it("returns a no-key fallback without calling fetch", async () => {
    const fetchImpl = vi.fn()

    await expect(
      fetchUnsplashBackground({
        accessKey: "",
        fetchImpl,
      }),
    ).resolves.toEqual({
      imageUrl: "",
      photographerName: "",
      photographerUrl: "",
      photoUrl: "",
      error: "Unsplash API key not configured",
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("maps a successful Unsplash fetch response", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => photo,
    }))

    await expect(
      fetchUnsplashBackground({
        accessKey: "access-key",
        fetchImpl,
      }),
    ).resolves.toEqual({
      imageUrl: "https://images.example/regular.jpg",
      photographerName: "Ada",
      photographerUrl: "https://unsplash.example/ada",
      photoUrl: "https://unsplash.example/photo-1",
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.unsplash.com/photos/random?orientation=landscape&w=1920&h=1080",
      {
        headers: {
          Authorization: "Client-ID access-key",
        },
      },
    )
  })

  it("returns a deterministic error response when Unsplash fails", async () => {
    const logger = createLogger()
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => photo,
    }))

    await expect(
      fetchUnsplashBackground({
        accessKey: "access-key",
        fetchImpl,
        logger,
      }),
    ).resolves.toEqual({
      imageUrl: "",
      photographerName: "",
      photographerUrl: "",
      photoUrl: "",
      error: "Unsplash API error: 403",
    })
    expect(logger.error).toHaveBeenCalledWith(
      "Failed to fetch Unsplash background:",
      expect.any(Error),
    )
  })
})
