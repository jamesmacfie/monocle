type ExtensionGlobal = typeof globalThis & {
  browser?: typeof chrome
  chrome?: typeof chrome
}

export function getBrowserAPI(): typeof chrome {
  const scope = globalThis as ExtensionGlobal
  const api = scope.browser?.runtime?.id ? scope.browser : scope.chrome

  return (api || scope.browser || {}) as typeof chrome
}

// Opens the Monocle options page at the given hash route (defaults to the
// root "/"). Prefers opening an active tab so the page lands in the
// foreground; falls back to the browser's native options-page handler.
export async function openOptionsPage(hash = "/"): Promise<void> {
  const browserAPI = getBrowserAPI()
  const optionsUrl = `${browserAPI.runtime.getURL("/options.html" as never)}#${hash}`

  if (browserAPI.tabs?.create) {
    await browserAPI.tabs.create({ url: optionsUrl, active: true })
    return
  }

  await browserAPI.runtime.openOptionsPage()
}
