// Architecture: background transport guard. Per-sender in-memory validation
// rate limiting; worker suspension naturally resets this best-effort flood
// protection, and stale buckets are pruned periodically while the worker lives.
const validationRateLimit = new Map<
  string,
  { count: number; resetTime: number }
>()
const RATE_LIMIT_WINDOW = 60_000
const RATE_LIMIT_MAX = 1000

export const isRateLimited = (senderId: string): boolean => {
  const now = Date.now()
  const key = senderId || "unknown"
  const entry = validationRateLimit.get(key)

  if (!entry || now > entry.resetTime) {
    validationRateLimit.set(key, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    })
    return false
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return true
  }

  entry.count += 1
  return false
}

export const cleanupValidationData = (): void => {
  const now = Date.now()
  for (const [key, entry] of validationRateLimit.entries()) {
    if (now > entry.resetTime) {
      validationRateLimit.delete(key)
    }
  }
}

setInterval(cleanupValidationData, 5 * 60 * 1000)
