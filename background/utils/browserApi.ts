import { isFirefox } from "../../shared/utils/browser"
import type { BrowserAPIObject } from "../types/"

/**
 * The Promise/callback bridge underpinning every cross-browser extension API
 * call: Firefox's `browser.*` is already promisified, while Chrome's `chrome.*`
 * is callback-style and signals failure through `chrome.runtime.lastError`
 * rather than a thrown error or rejection. This wrapper normalizes both to a
 * Promise, surfacing lastError as a rejection so callers can use try/await
 * uniformly. `apiObject`/`method` are indexed dynamically, hence the `any`
 * casts. Privileged API usage stays in background code (see CLAUDE.md).
 */
export function callBrowserAPI(
  apiObject: BrowserAPIObject,
  method: string,
  ...args: any[]
): Promise<any> {
  if (isFirefox) {
    return (browser[apiObject] as any)[method](...args)
  }

  return new Promise((resolve, reject) => {
    ;(chrome[apiObject] as any)[method](...args, (result: any) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
      } else {
        resolve(result)
      }
    })
  })
}
