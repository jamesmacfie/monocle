import { isFirefox } from "../../shared/utils/browser"
import type { BrowserAPIObject } from "../types/"

// Generic wrapper for API methods that exist in both browsers but use
// Promise-returning Firefox APIs and callback-based Chrome APIs.
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
