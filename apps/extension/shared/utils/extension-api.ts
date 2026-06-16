type ExtensionGlobal = typeof globalThis & {
  browser?: typeof chrome
  chrome?: typeof chrome
}

export function getBrowserAPI(): typeof chrome {
  const scope = globalThis as ExtensionGlobal
  const api = scope.browser?.runtime?.id ? scope.browser : scope.chrome

  return (api || scope.browser || {}) as typeof chrome
}

/**
 * Promise wrapper over `runtime.sendMessage` that REJECTS on
 * `runtime.lastError`. This is the shared transport for request/response
 * messages from any UI surface (content overlay, new tab, options) where the
 * caller wants to handle a failed round-trip. Callers that need page context
 * on the message (palette senders) build that context themselves and pass the
 * finished message here — see `createPaletteSendMessage` and `useSendMessage`.
 */
export function sendRuntimeMessage<T = unknown>(message: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const runtime = getBrowserAPI().runtime
    runtime.sendMessage(message, (response: T) => {
      const error = runtime.lastError
      if (error) {
        reject(error)
      } else {
        resolve(response)
      }
    })
  })
}

/**
 * Fire-and-forget variant of {@link sendRuntimeMessage}: resolves `undefined`
 * instead of rejecting when the background is briefly unavailable (an asleep
 * MV3 worker) or no receiver exists. It reads `lastError` to suppress the
 * runtime's "unchecked error" console log. Used by page-side pollers that must
 * never throw into the page — the `SurfaceHost` get-surfaces query and the
 * user-script trigger service. See docs/surfaces.md and docs/user-scripts.md.
 */
export function sendRuntimeMessageSafe<T = unknown>(
  message: unknown,
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    try {
      const runtime = getBrowserAPI().runtime
      runtime.sendMessage(message, (response: T) => {
        void runtime.lastError
        resolve(response)
      })
    } catch {
      resolve(undefined)
    }
  })
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
