// Architecture: background feature layer (Native Messaging bridge). The crypto
// primitives for pairing: CSPRNG code/token generation, SHA-256 hashing (codes
// and tokens are stored hashed), and a constant-time hex comparison. All run in
// the MV3 service worker, where `crypto.subtle` and `crypto.getRandomValues`
// are available. Never uses Math.random. See docs/native-messaging/.

// 6-digit pairing code from a CSPRNG. The modulo introduces a negligible bias
// across 2^32 for a short-lived 6-digit code; acceptable for a 60s, attempt-
// capped, human-confirmed pairing.
// ponytail: modulo bias is immaterial here; rejection-sample only if a longer
// fixed-alphabet code is ever needed.
export const generatePairingCode = (): string => {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return (arr[0] % 1_000_000).toString().padStart(6, "0")
}

// Opaque 256-bit token as hex.
export const generateToken = (): string => {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return bytesToHex(arr)
}

export const sha256Hex = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  return bytesToHex(new Uint8Array(digest))
}

// Constant-time comparison over two hex strings of equal length. Hashes are
// always 64 hex chars, so the length check leaks nothing.
export const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false
  }
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
