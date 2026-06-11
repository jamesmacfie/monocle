// Curated set of Unsplash background categories surfaced as settings-only
// toggles on the options New Tab page. `key` is the stable value persisted in
// `newTab.backgroundCategories`; `label` is shown in the UI; `query` is the
// Unsplash search term used when requesting a random photo.
//
// Unsplash's legacy `/categories` endpoint is deprecated, so we filter the
// random-photo endpoint with a `query` term rather than topic ids. When the
// user enables several categories we pick one at random per request, which
// gives variety while keeping results reliable.

export interface UnsplashCategory {
  key: string
  label: string
  query: string
}

export const UNSPLASH_CATEGORIES: readonly UnsplashCategory[] = [
  { key: "nature", label: "Nature", query: "nature landscape" },
  { key: "wallpapers", label: "Wallpapers", query: "wallpaper" },
  { key: "3d", label: "3D Renders", query: "3d render" },
  { key: "textures", label: "Textures & Patterns", query: "texture pattern" },
  { key: "architecture", label: "Architecture", query: "architecture" },
  { key: "travel", label: "Travel", query: "travel" },
  { key: "street", label: "Street Photography", query: "street photography" },
  { key: "animals", label: "Animals", query: "animals" },
  { key: "space", label: "Space", query: "space galaxy" },
  { key: "minimal", label: "Minimal", query: "minimal" },
  { key: "food", label: "Food & Drink", query: "food drink" },
  { key: "abstract", label: "Abstract", query: "abstract" },
] as const

const CATEGORY_BY_KEY = new Map(UNSPLASH_CATEGORIES.map((c) => [c.key, c]))

// Maps an array of stored category keys to their Unsplash query terms,
// dropping any unknown keys. Order follows the input.
export const getCategoryQueries = (
  keys: readonly string[] | undefined,
): string[] => {
  if (!keys?.length) {
    return []
  }

  return keys
    .map((key) => CATEGORY_BY_KEY.get(key)?.query)
    .filter((query): query is string => typeof query === "string")
}
