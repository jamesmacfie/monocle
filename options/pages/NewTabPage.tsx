import { Clock, Image, Palette, RefreshCcw } from "lucide-react"
import { useEffect, useState } from "react"
import {
  BACKGROUND_IMAGE_CACHE_KEY,
  getCachedBackground,
  setCachedBackground,
} from "../../newtab/backgroundImageModel"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  selectBackgroundCategories,
  selectClockVisibility,
  updateBackgroundCategories,
  updateClockVisibility,
} from "../../shared/store/slices/settings.slice"
import type { UnsplashBackgroundResponse } from "../../shared/types"
import { UNSPLASH_CATEGORIES } from "../../shared/utils/unsplash-categories"
import { Button, Panel, Switch } from "../components/ui"

const requestBackground = () =>
  new Promise<UnsplashBackgroundResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: "get-unsplash-background",
        context: {
          title: document.title,
          url: window.location.href,
          modifierKey: null,
          isNewTab: true,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError)
          return
        }

        resolve(response)
      },
    )
  })

export function NewTabPage() {
  const dispatch = useAppDispatch()
  const showClock = useAppSelector(selectClockVisibility)
  const backgroundCategories = useAppSelector(selectBackgroundCategories)
  const [background, setBackground] =
    useState<UnsplashBackgroundResponse | null>(null)
  const [loadingBackground, setLoadingBackground] = useState(false)
  const [backgroundError, setBackgroundError] = useState<string | null>(null)

  useEffect(() => {
    setBackground(getCachedBackground(localStorage))
  }, [])

  const toggleCategory = async (key: string, enabled: boolean) => {
    const next = enabled
      ? [...backgroundCategories, key]
      : backgroundCategories.filter((category) => category !== key)

    await dispatch(updateBackgroundCategories(next))
    // Refresh the preview so the effect of the new categories is visible.
    void refreshBackground()
  }

  const refreshBackground = async () => {
    setLoadingBackground(true)
    setBackgroundError(null)

    try {
      localStorage.removeItem(BACKGROUND_IMAGE_CACHE_KEY)
      const response = await requestBackground()

      if (response.error || !response.imageUrl) {
        setBackground(null)
        setBackgroundError(response.error || "Background unavailable")
        return
      }

      setCachedBackground(localStorage, response)
      setBackground(response)
    } catch (error) {
      setBackgroundError(
        error instanceof Error ? error.message : "Background unavailable",
      )
    } finally {
      setLoadingBackground(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">New Tab</h1>
      </header>

      <Panel>
        <div className="flex items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium">Clock</div>
              <div className="text-sm text-[var(--color-fg-muted)]">
                {showClock ? "Shown" : "Hidden"}
              </div>
            </div>
          </div>
          <Switch
            aria-label="Clock"
            checked={showClock}
            onCheckedChange={(checked) => {
              void dispatch(updateClockVisibility(checked))
            }}
          />
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
              <Image className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">Background</div>
              <div className="truncate text-sm text-[var(--color-fg-muted)]">
                {background?.photographerName
                  ? `Photo by ${background.photographerName}`
                  : backgroundError || "Gradient fallback"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:justify-end">
            <Button
              disabled={loadingBackground}
              type="button"
              variant="secondary"
              onClick={() => {
                void refreshBackground()
              }}
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>

          <div className="overflow-hidden rounded-md border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-hero-start)] to-[var(--color-hero-end)] lg:col-span-2">
            {background?.imageUrl ? (
              <img
                alt=""
                className="aspect-[16/7] w-full object-cover"
                src={background.imageUrl}
              />
            ) : (
              <div className="aspect-[16/7] w-full" />
            )}
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="space-y-5 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium">Background categories</div>
              <div className="text-sm text-[var(--color-fg-muted)]">
                {backgroundCategories.length > 0
                  ? "New backgrounds are drawn from the enabled categories"
                  : "Leave all off for fully random backgrounds"}
              </div>
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {UNSPLASH_CATEGORIES.map((category) => {
              const enabled = backgroundCategories.includes(category.key)

              return (
                <div
                  key={category.key}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] px-3 py-2"
                >
                  <span className="text-sm">{category.label}</span>
                  <Switch
                    aria-label={category.label}
                    checked={enabled}
                    onCheckedChange={(checked) => {
                      void toggleCategory(category.key, checked)
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </Panel>
    </div>
  )
}
