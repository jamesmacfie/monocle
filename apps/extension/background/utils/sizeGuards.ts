// Architecture: background transport guard. Bounds serialized message size
// and recursively rejects oversized string fields before schema parsing.
const MAX_MESSAGE_SIZE = 1024 * 1024
// Must cover the largest schema-allowed field (snippet body, 100,000 chars).
const MAX_STRING_LENGTH = 100_000

export const exceedsMessageLimits = (message: unknown): boolean => {
  try {
    const messageString = JSON.stringify(message)
    if (messageString.length > MAX_MESSAGE_SIZE) {
      return true
    }

    const checkStrings = (value: unknown, depth = 0): boolean => {
      if (depth > 10 || typeof value !== "object" || value === null) {
        return false
      }

      for (const nested of Object.values(value)) {
        if (typeof nested === "string" && nested.length > MAX_STRING_LENGTH) {
          return true
        }
        if (checkStrings(nested, depth + 1)) {
          return true
        }
      }
      return false
    }

    return checkStrings(message)
  } catch {
    return true
  }
}
