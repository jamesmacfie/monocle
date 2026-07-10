import type {
  AutomationStep,
  HttpRequestStep,
  JsonValue,
} from "../../shared/types"
import { walkAutomationSteps } from "../../shared/utils/automation-introspection"
import {
  HTTP_MAX_ENCODED_HEADERS_BYTES,
  HTTP_REQUEST_DEFAULT_TIMEOUT_MS,
  HTTP_REQUEST_MAX_BYTES,
  HTTP_RESPONSE_MAX_BYTES,
  inspectHttpEndpoint,
  interpolateJsonStrings,
} from "../../shared/utils/http-request-policy"
import { callBrowserAPI } from "../utils/browserApi"
import { hasOutboundDataConsent } from "./outboundDataConsent"

export type ExecutableHttpRequest = Omit<
  HttpRequestStep,
  "headers" | "body"
> & {
  headers?: Record<string, string>
  body?: JsonValue
}

export type HttpRequestExecutionResult = {
  values: Record<string, string>
}

export type HttpRequestDependencies = {
  fetchImpl?: typeof fetch
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
}

export class HttpRequestError extends Error {
  constructor(
    public readonly category: string,
    message: string,
  ) {
    super(message)
  }
}

const assertOutboundCapability = async (
  url: string,
  tabId: number,
): Promise<void> => {
  const endpoint = inspectHttpEndpoint(url)
  if (!endpoint.ok) throw new Error(endpoint.error)
  const tab = await callBrowserAPI("tabs", "get", tabId)
  if (tab?.incognito) {
    throw new Error(
      "Outbound Automation requests are disabled in private windows",
    )
  }
  if (!(await hasOutboundDataConsent())) {
    throw new Error(
      "Grant Firefox outbound-data consent in Automations settings, then run this action again",
    )
  }
  const granted = await callBrowserAPI("permissions", "contains", {
    origins: [endpoint.permissionPattern],
  })
  if (!granted) {
    throw new Error(
      `Grant endpoint access for ${endpoint.permissionPattern} in Automations settings, then run this action again`,
    )
  }
}

/** Checks every static outbound authority before initial values/snippets resolve. */
export const preflightHttpRequests = async (
  steps: AutomationStep[],
  tabId: number,
): Promise<void> => {
  const urls: string[] = []
  walkAutomationSteps(steps, (step) => {
    if (step.op === "httpRequest") urls.push(step.url)
  })
  for (const url of urls) await assertOutboundCapability(url, tabId)
}

/** Rechecks capability, interpolates permitted leaves, and returns atomic mappings. */
export const executeAutomationHttpRequest = async (
  step: HttpRequestStep,
  input: { tabId: number; interpolate: (value: string) => string },
): Promise<HttpRequestExecutionResult> => {
  await assertOutboundCapability(step.url, input.tabId)
  const headers = Object.fromEntries(
    Object.entries(step.headers ?? {}).map(([name, value]) => [
      name,
      input.interpolate(value),
    ]),
  )
  const body =
    step.body === undefined
      ? undefined
      : await interpolateJsonStrings(step.body, async (value) =>
          input.interpolate(value),
        )
  return await executeHttpRequest({ ...step, headers, body })
}

const utf8Length = (value: string): number =>
  new TextEncoder().encode(value).length

const scalarToString = (value: unknown): string | null => {
  if (value === null) return "null"
  if (["string", "number", "boolean"].includes(typeof value)) {
    return String(value)
  }
  return null
}

const resolvePath = (
  value: unknown,
  path: Array<string | number>,
): { found: boolean; value?: unknown } => {
  let current = value
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current) || segment >= current.length)
        return { found: false }
      current = current[segment]
    } else {
      if (
        !current ||
        typeof current !== "object" ||
        Array.isArray(current) ||
        !Object.hasOwn(current, segment)
      ) {
        return { found: false }
      }
      current = (current as Record<string, unknown>)[segment]
    }
  }
  return { found: true, value: current }
}

const readBoundedResponse = async (response: Response): Promise<string> => {
  if (!response.body) return ""
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ""
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > HTTP_RESPONSE_MAX_BYTES) {
        await reader.cancel()
        throw new HttpRequestError(
          "response-too-large",
          "The HTTP response exceeded 64 KiB",
        )
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

export const executeHttpRequest = async (
  step: ExecutableHttpRequest,
  dependencies: HttpRequestDependencies = {},
): Promise<HttpRequestExecutionResult> => {
  const endpoint = inspectHttpEndpoint(step.url)
  if (!endpoint.ok)
    throw new HttpRequestError("invalid-endpoint", endpoint.error)

  const headers = new Headers(step.headers)
  let body: string | undefined
  if (step.method !== "GET") {
    headers.set("Content-Type", "application/json")
    if (step.body !== undefined) {
      body = JSON.stringify(step.body)
      if (utf8Length(body) > HTTP_REQUEST_MAX_BYTES) {
        throw new HttpRequestError(
          "request-too-large",
          "The HTTP request body exceeded 64 KiB",
        )
      }
    }
  }

  let headerBytes = 0
  headers.forEach((value, name) => {
    headerBytes += utf8Length(name) + utf8Length(value)
  })
  if (headerBytes > HTTP_MAX_ENCODED_HEADERS_BYTES) {
    throw new HttpRequestError(
      "headers-too-large",
      "The HTTP request headers exceeded 16 KiB",
    )
  }

  const controller = new AbortController()
  const setTimer = dependencies.setTimer ?? setTimeout
  const clearTimer = dependencies.clearTimer ?? clearTimeout
  const timeout = setTimer(
    () => controller.abort(),
    step.timeoutMs ?? HTTP_REQUEST_DEFAULT_TIMEOUT_MS,
  )

  let response: Response
  try {
    response = await (dependencies.fetchImpl ?? fetch)(endpoint.url.href, {
      method: step.method,
      headers,
      body,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    })
  } catch (_error) {
    if (controller.signal.aborted) {
      throw new HttpRequestError("timeout", "The HTTP request timed out")
    }
    throw new HttpRequestError(
      "network",
      "The HTTP request failed before a response was received",
    )
  } finally {
    clearTimer(timeout)
  }

  if (response.status >= 300 && response.status < 400) {
    response.body?.cancel().catch(() => undefined)
    throw new HttpRequestError(
      "redirect",
      "The HTTP endpoint returned a redirect, which Monocle refuses",
    )
  }
  if (!response.ok) {
    response.body?.cancel().catch(() => undefined)
    throw new HttpRequestError(
      "status",
      `The HTTP endpoint returned status ${response.status}`,
    )
  }

  const values: Record<string, string> = {}
  if (step.response?.statusToVar)
    values[step.response.statusToVar] = String(response.status)
  const mappings = step.response?.json ?? []
  if (mappings.length === 0) {
    response.body?.cancel().catch(() => undefined)
    return { values }
  }

  const text = await readBoundedResponse(response)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HttpRequestError(
      "invalid-json",
      "The HTTP response was not valid JSON",
    )
  }

  const mapped: Record<string, string> = {}
  for (const mapping of mappings) {
    const resolved = resolvePath(parsed, mapping.path)
    if (!resolved.found) {
      if (mapping.required) {
        throw new HttpRequestError(
          "missing-mapping",
          `The HTTP response did not contain required mapping for ${mapping.toVar}`,
        )
      }
      mapped[mapping.toVar] = ""
      continue
    }
    const scalar = scalarToString(resolved.value)
    if (scalar === null) {
      throw new HttpRequestError(
        "non-scalar-mapping",
        `The HTTP response mapping for ${mapping.toVar} was not a scalar`,
      )
    }
    mapped[mapping.toVar] = scalar
  }
  return { values: { ...values, ...mapped } }
}
