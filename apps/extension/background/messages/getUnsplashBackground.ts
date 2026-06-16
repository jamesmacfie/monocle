import type {
  GetUnsplashBackgroundMessage,
  UnsplashBackgroundResponse,
  UnsplashPhoto,
} from "../../shared/types"
import { getCategoryQueries } from "../../shared/utils/unsplash-categories"
import { getNewTabSettings } from "../commands/settings"

type UnsplashFetchResponse = {
  ok: boolean
  status: number
  json: () => Promise<UnsplashPhoto>
}

type UnsplashFetch = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<UnsplashFetchResponse>

type FetchUnsplashBackgroundOptions = {
  accessKey?: string
  // Optional Unsplash search term used to bias the random photo toward an
  // enabled background category. Omitted means a fully random photo.
  query?: string
  fetchImpl?: UnsplashFetch
  logger?: Pick<Console, "error">
}

const buildRandomPhotoUrl = (query?: string): string => {
  const params = new URLSearchParams({
    orientation: "landscape",
    w: "1920",
    h: "1080",
  })

  if (query) {
    params.set("query", query)
  }

  return `https://api.unsplash.com/photos/random?${params.toString()}`
}

const getUnsplashAccessKey = (): string | undefined => {
  return (
    import.meta.env.WXT_UNSPLASH_ACCESS_KEY ||
    import.meta.env.EXTENSION_PUBLIC_UNSPLASH_ACCESS_KEY
  )
}

export async function fetchUnsplashBackground({
  accessKey,
  query,
  fetchImpl = globalThis.fetch as UnsplashFetch,
  logger = console,
}: FetchUnsplashBackgroundOptions): Promise<UnsplashBackgroundResponse> {
  if (!accessKey) {
    return {
      imageUrl: "",
      photographerName: "",
      photographerUrl: "",
      photoUrl: "",
      error: "Unsplash API key not configured",
    }
  }

  try {
    const response = await fetchImpl(buildRandomPhotoUrl(query), {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Unsplash API error: ${response.status}`)
    }

    const photo: UnsplashPhoto = await response.json()

    return {
      imageUrl: photo.urls.regular,
      photographerName: photo.user.name,
      photographerUrl: photo.user.links.html,
      photoUrl: photo.links.html,
    }
  } catch (error) {
    logger.error("Failed to fetch Unsplash background:", error)
    return {
      imageUrl: "",
      photographerName: "",
      photographerUrl: "",
      photoUrl: "",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function getUnsplashBackground(
  _message: GetUnsplashBackgroundMessage,
): Promise<UnsplashBackgroundResponse> {
  const { backgroundCategories } = await getNewTabSettings()
  const queries = getCategoryQueries(backgroundCategories)
  // When several categories are enabled, pick one at random per request so
  // backgrounds rotate across the user's chosen categories.
  const query =
    queries.length > 0
      ? queries[Math.floor(Math.random() * queries.length)]
      : undefined

  return await fetchUnsplashBackground({
    accessKey: getUnsplashAccessKey(),
    query,
  })
}
