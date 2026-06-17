// Architecture: background utility. Cross-browser runtime message errors are
// plain Error-like objects with browser-specific text. Keep the classifiers in
// one small module so retry policy can be shared without coupling callers to
// the palette helper.

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export function isMissingContentScriptError(error: unknown): boolean {
  const message = errorMessage(error)
  return (
    message.includes("Could not establish connection") ||
    message.includes("Receiving end does not exist")
  )
}

export function isNoResponseError(error: unknown): boolean {
  return errorMessage(error).includes(
    "The message port closed before a response was received",
  )
}
