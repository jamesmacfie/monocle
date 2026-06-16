import { callBrowserAPI } from "./browserApi"

// Minimal shape of a cookie returned by the cookies API; the ambient chrome
// types in this project don't declare the cookies namespace.
interface BrowserCookie {
  name: string
  domain: string
  path: string
  secure: boolean
  storeId?: string
}

// Clear every cookie scoped to the host of the given page URL ("this site").
//
// We deliberately use the cookies API rather than `browsingData.remove` with an
// origin/hostname filter: Chrome scopes per-site cookie removal via `origins`
// while Firefox uses `hostnames`, so the browsingData path is not uniform. The
// cookies API behaves the same on both engines.
//
// Returns the number of cookies removed so the caller can report it.
export async function clearCookiesForUrl(url: string): Promise<number> {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return 0
  }

  if (!hostname) {
    return 0
  }

  const cookies: BrowserCookie[] = await callBrowserAPI("cookies", "getAll", {
    domain: hostname,
  })

  await Promise.all(
    cookies.map((cookie) => {
      // Cookie domains may carry a leading dot for domain cookies; strip it to
      // build a valid URL for removal.
      const cookieDomain = cookie.domain.replace(/^\./, "")
      const cookieUrl = `${cookie.secure ? "https" : "http"}://${cookieDomain}${cookie.path}`

      return callBrowserAPI("cookies", "remove", {
        url: cookieUrl,
        name: cookie.name,
        storeId: cookie.storeId,
      })
    }),
  )

  return cookies.length
}
