import type {
  GetUnsplashBackgroundMessage,
  UnsplashBackgroundResponse,
  UnsplashPhoto,
} from "../../shared/types"

export async function getUnsplashBackground(
  _message: GetUnsplashBackgroundMessage,
): Promise<UnsplashBackgroundResponse> {
  const accessKey = process.env.EXTENSION_PUBLIC_UNSPLASH_ACCESS_KEY

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
    const response = await fetch(
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
    console.error("Failed to fetch Unsplash background:", error)
    return {
      imageUrl: "",
      photographerName: "",
      photographerUrl: "",
      photoUrl: "",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}
