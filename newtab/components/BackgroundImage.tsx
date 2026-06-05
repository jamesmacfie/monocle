import { useEffect, useState } from "react"
import type { UnsplashBackgroundResponse } from "../../shared/types"
import { initializeBackgroundImage } from "../backgroundImageModel"

interface BackgroundImageProps {
  className?: string
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
    let isMounted = true

    const requestBackground = () => {
      const context = {
        title: document.title,
        url: window.location.href,
        modifierKey: null,
        isNewTab: true,
      }

      return new Promise<UnsplashBackgroundResponse>((resolve, reject) => {
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
      })
    }

    void initializeBackgroundImage({
      cache: localStorage,
      requestBackground,
      preloadImage,
      onBackground: (data) => {
        if (!isMounted) return
        setBackgroundData(data)
        setError(null)
        setIsLoading(false)
      },
      onFallback: (message) => {
        if (!isMounted) return
        setError(message)
        setIsLoading(false)
      },
    })

    return () => {
      isMounted = false
    }
  }, [])

  if (isLoading) {
    return (
      <div
        className={`fixed inset-0 bg-gradient-to-br from-[var(--color-hero-start)] to-[var(--color-hero-end)] ${className}`}
      >
        <div className="absolute inset-0 bg-[var(--color-hero-overlay)]" />
      </div>
    )
  }

  if (error || !backgroundData?.imageUrl) {
    return (
      <div
        className={`fixed inset-0 bg-gradient-to-br from-[var(--color-hero-start)] to-[var(--color-hero-end)] ${className}`}
      >
        <div className="absolute inset-0 bg-[var(--color-hero-overlay)]" />
      </div>
    )
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-cover bg-center bg-no-repeat ${className}`}
        style={{ backgroundImage: `url(${backgroundData.imageUrl})` }}
      />
      <div className="absolute inset-0 bg-[var(--color-hero-overlay)]" />
      {backgroundData.photographerName && (
        <div className="fixed bottom-4 right-4 text-[var(--color-fg-inverse)] text-sm opacity-75 hover:opacity-100 transition-opacity">
          Photo by{" "}
          <a
            href={backgroundData.photographerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--color-link)] hover:text-[var(--color-link-hover)]"
          >
            {backgroundData.photographerName}
          </a>{" "}
          on{" "}
          <a
            href={backgroundData.photoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--color-link)] hover:text-[var(--color-link-hover)]"
          >
            Unsplash
          </a>
        </div>
      )}
    </>
  )
}
