import { useEffect, useState } from "react"
import type { UnsplashBackgroundResponse } from "../../shared/types"

interface BackgroundImageProps {
  className?: string
}

const CACHE_KEY = "monocle-unsplash-background"

// Helper functions for localStorage caching
const getCachedBackground = (): UnsplashBackgroundResponse | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch (error) {
    console.warn("Failed to parse cached background:", error)
    return null
  }
}

const setCachedBackground = (data: UnsplashBackgroundResponse): void => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
  } catch (error) {
    console.warn("Failed to cache background:", error)
  }
}

// Preload image in browser cache
const preloadImage = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = reject
    img.src = url
  })
}

export function BackgroundImage({ className = "" }: BackgroundImageProps) {
  const [backgroundData, setBackgroundData] =
    useState<UnsplashBackgroundResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let hasShownCachedImage = false

    const initializeBackground = async () => {
      // 1. Try to get cached image first
      const cachedBackground = getCachedBackground()

      if (cachedBackground?.imageUrl) {
        // Show cached image immediately - no loading state
        setBackgroundData(cachedBackground)
        setIsLoading(false)
        hasShownCachedImage = true
      }

      // 2. Always fetch fresh image for next time (in background)
      try {
        const context = {
          title: document.title,
          url: window.location.href,
          modifierKey: null,
          isNewTab: true,
        }

        const response = await new Promise<UnsplashBackgroundResponse>(
          (resolve, reject) => {
            chrome.runtime.sendMessage(
              { type: "get-unsplash-background", context },
              (response) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError)
                } else {
                  resolve(response)
                }
              },
            )
          },
        )

        if (!response.error && response.imageUrl) {
          // Preload the image in browser cache
          try {
            await preloadImage(response.imageUrl)
          } catch (preloadError) {
            console.warn("Failed to preload image:", preloadError)
          }

          // Cache for next new tab
          setCachedBackground(response)

          // If no image is displayed yet (first time), show this one
          if (!hasShownCachedImage) {
            setBackgroundData(response)
            setIsLoading(false)
          }
        } else {
          console.warn("Failed to fetch new background:", response.error)
          // If this is first time and we have an error, show error state
          if (!hasShownCachedImage) {
            setError(response.error || "Failed to load background")
            setIsLoading(false)
          }
        }
      } catch (err) {
        console.error("Failed to fetch background image:", err)
        // Only set error if no cached image is showing
        if (!hasShownCachedImage) {
          setError(
            err instanceof Error ? err.message : "Failed to load background",
          )
          setIsLoading(false)
        }
      }
    }

    initializeBackground()
  }, [])

  if (isLoading) {
    return (
      <div
        className={`fixed inset-0 bg-gradient-to-br from-blue-400 to-purple-500 ${className}`}
      >
        <div className="absolute inset-0 bg-black/20" />
      </div>
    )
  }

  if (error || !backgroundData?.imageUrl) {
    return (
      <div
        className={`fixed inset-0 bg-gradient-to-br from-gray-500 to-gray-700 ${className}`}
      >
        <div className="absolute inset-0 bg-black/20" />
      </div>
    )
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-cover bg-center bg-no-repeat ${className}`}
        style={{ backgroundImage: `url(${backgroundData.imageUrl})` }}
      />
      <div className="absolute inset-0 bg-black/20" />
      {backgroundData.photographerName && (
        <div className="fixed bottom-4 right-4 text-white text-sm opacity-75 hover:opacity-100 transition-opacity">
          Photo by{" "}
          <a
            href={backgroundData.photographerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-300"
          >
            {backgroundData.photographerName}
          </a>{" "}
          on{" "}
          <a
            href={backgroundData.photoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-blue-300"
          >
            Unsplash
          </a>
        </div>
      )}
    </>
  )
}
