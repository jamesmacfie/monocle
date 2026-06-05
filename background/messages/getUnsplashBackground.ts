import type {
  GetUnsplashBackgroundMessage,
  UnsplashBackgroundResponse,
  UnsplashPhoto,
} from "../../shared/types"

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
  fetchImpl?: UnsplashFetch
  logger?: Pick<Console, "error">
}

const getUnsplashAccessKey = (): string | undefined => {
  return (
    import.meta.env.WXT_UNSPLASH_ACCESS_KEY ||
    import.meta.env.EXTENSION_PUBLIC_UNSPLASH_ACCESS_KEY
  )
}

export async function fetchUnsplashBackground({
  accessKey,
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
    const response = await fetchImpl(
      "https://api.unsplash.com/photos/random?orientation=landscape&w=1920&h=1080",
      {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
        },
      },
    )

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
  return await fetchUnsplashBackground({
    accessKey: getUnsplashAccessKey(),
  })
}
