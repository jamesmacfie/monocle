import type { JsonValue } from "../types/automations"

export const HTTP_REQUEST_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const

export const OUTBOUND_DATA_CATEGORIES = [
  "authenticationInfo",
  "browsingActivity",
  "personallyIdentifyingInfo",
  "searchTerms",
  "websiteActivity",
  "websiteContent",
] as const

export const HTTP_REQUEST_MAX_BYTES = 65_536
export const HTTP_RESPONSE_MAX_BYTES = 65_536
export const HTTP_REQUEST_DEFAULT_TIMEOUT_MS = 10_000
export const HTTP_REQUEST_MIN_TIMEOUT_MS = 1_000
export const HTTP_REQUEST_MAX_TIMEOUT_MS = 30_000
export const HTTP_JSON_MAX_DEPTH = 10
export const HTTP_JSON_MAX_NODES = 1_000
export const HTTP_MAX_HEADERS = 20
export const HTTP_MAX_HEADER_NAME_LENGTH = 128
export const HTTP_MAX_HEADER_VALUE_LENGTH = 8_192
export const HTTP_MAX_ENCODED_HEADERS_BYTES = 16 * 1_024

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])
const FORBIDDEN_HEADERS = new Set([
  "cookie",
  "cookie2",
  "host",
  "origin",
  "referer",
  "content-length",
  "content-type",
  "connection",
  "transfer-encoding",
  "user-agent",
])
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

export type HttpEndpointPolicyResult =
  | { ok: true; url: URL; permissionPattern: string }
  | { ok: false; error: string }

const normalizeHostname = (hostname: string): string =>
  hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "")

export const inspectHttpEndpoint = (
  rawUrl: string,
): HttpEndpointPolicyResult => {
  if (rawUrl.length === 0 || rawUrl.length > 2_000 || rawUrl.includes("{{")) {
    return {
      ok: false,
      error: "The endpoint must be a static URL up to 2000 characters",
    }
  }

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { ok: false, error: "The endpoint URL is invalid" }
  }

  const hostname = normalizeHostname(url.hostname)
  if (!hostname || (url.protocol !== "https:" && url.protocol !== "http:")) {
    return {
      ok: false,
      error: "Only HTTPS and exact loopback HTTP endpoints are allowed",
    }
  }
  if (url.username || url.password) {
    return { ok: false, error: "Endpoint URLs cannot contain credentials" }
  }
  if (url.hash) {
    return { ok: false, error: "Endpoint URLs cannot contain fragments" }
  }
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(hostname)) {
    return {
      ok: false,
      error: "Plaintext HTTP is allowed only for exact loopback hosts",
    }
  }

  const permissionHost = hostname === "::1" ? "[::1]" : hostname
  return {
    ok: true,
    url,
    permissionPattern: `${url.protocol}//${permissionHost}/*`,
  }
}

export const validateHttpHeaderName = (name: string): string | null => {
  const normalized = name.toLowerCase()
  if (
    name.length === 0 ||
    name.length > HTTP_MAX_HEADER_NAME_LENGTH ||
    !HEADER_NAME.test(name)
  ) {
    return "Header name is invalid"
  }
  if (
    FORBIDDEN_HEADERS.has(normalized) ||
    normalized.startsWith("proxy-") ||
    normalized.startsWith("sec-")
  ) {
    return `Header "${name}" is controlled by the browser and cannot be set`
  }
  return null
}

export type JsonInspection =
  | { ok: true; nodes: number }
  | { ok: false; error: string }

export const inspectJsonValue = (value: unknown): JsonInspection => {
  let nodes = 0

  const walk = (current: unknown, depth: number): string | null => {
    nodes += 1
    if (nodes > HTTP_JSON_MAX_NODES) {
      return `JSON bodies may contain at most ${HTTP_JSON_MAX_NODES} nodes`
    }
    if (depth > HTTP_JSON_MAX_DEPTH) {
      return `JSON bodies may nest at most ${HTTP_JSON_MAX_DEPTH} levels`
    }
    if (current === null || typeof current === "boolean") {
      return null
    }
    if (typeof current === "number") {
      return Number.isFinite(current) ? null : "JSON numbers must be finite"
    }
    if (typeof current === "string") {
      return current.length <= 10_000
        ? null
        : "JSON string values may contain at most 10000 characters"
    }
    if (Array.isArray(current)) {
      for (const entry of current) {
        const error = walk(entry, depth + 1)
        if (error) return error
      }
      return null
    }
    if (
      typeof current === "object" &&
      Object.getPrototypeOf(current) === Object.prototype
    ) {
      for (const entry of Object.values(current)) {
        const error = walk(entry, depth + 1)
        if (error) return error
      }
      return null
    }
    return "Request bodies must contain only JSON values"
  }

  const error = walk(value, 0)
  return error ? { ok: false, error } : { ok: true, nodes }
}

export const interpolateJsonStrings = async (
  value: JsonValue,
  interpolate: (value: string) => Promise<string>,
): Promise<JsonValue> => {
  if (typeof value === "string") return await interpolate(value)
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) {
    return await Promise.all(
      value.map((entry) => interpolateJsonStrings(entry, interpolate)),
    )
  }
  return Object.fromEntries(
    await Promise.all(
      Object.entries(value).map(async ([key, entry]) => [
        key,
        await interpolateJsonStrings(entry, interpolate),
      ]),
    ),
  )
}
