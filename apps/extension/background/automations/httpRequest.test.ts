import { beforeEach, describe, expect, it, vi } from "vitest"

const { callBrowserAPI, hasOutboundDataConsent } = vi.hoisted(() => ({
  callBrowserAPI: vi.fn(),
  hasOutboundDataConsent: vi.fn(),
}))

vi.mock("../utils/browserApi", () => ({ callBrowserAPI }))
vi.mock("./outboundDataConsent", () => ({ hasOutboundDataConsent }))

import {
  executeHttpRequest,
  type HttpRequestError,
  preflightHttpRequests,
} from "./httpRequest"

beforeEach(() => {
  callBrowserAPI
    .mockReset()
    .mockImplementation((object: string, method: string) => {
      if (object === "tabs" && method === "get")
        return Promise.resolve({ incognito: false })
      if (object === "permissions" && method === "contains")
        return Promise.resolve(true)
      return Promise.resolve(undefined)
    })
  hasOutboundDataConsent.mockReset().mockResolvedValue(true)
})

const streamResponse = (chunks: Uint8Array[], init: ResponseInit = {}) =>
  new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk))
        controller.close()
      },
    }),
    init,
  )

describe("executeHttpRequest", () => {
  it("uses hardened fetch options and maps scalar JSON atomically", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init).toMatchObject({
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
      })
      expect((init?.headers as Headers).get("Content-Type")).toBe(
        "application/json",
      )
      return new Response('{"request":{"id":"abc"},"accepted":true}', {
        status: 202,
      })
    })
    const result = await executeHttpRequest(
      {
        op: "httpRequest",
        method: "POST",
        url: "http://127.0.0.1:43121/events",
        body: { event: "open" },
        response: {
          statusToVar: "status",
          json: [
            { path: ["request", "id"], toVar: "requestId", required: true },
            { path: ["accepted"], toVar: "accepted" },
            { path: ["missing"], toVar: "optional" },
          ],
        },
      },
      { fetchImpl: fetchImpl as typeof fetch },
    )
    expect(result.values).toEqual({
      status: "202",
      requestId: "abc",
      accepted: "true",
      optional: "",
    })
  })

  it("rejects request and response bodies over 64 KiB", async () => {
    await expect(
      executeHttpRequest({
        op: "httpRequest",
        method: "POST",
        url: "https://api.example.com",
        body: "x".repeat(65_537),
      }),
    ).rejects.toMatchObject({ category: "request-too-large" })

    const chunk = new Uint8Array(65_537)
    await expect(
      executeHttpRequest(
        {
          op: "httpRequest",
          method: "GET",
          url: "https://api.example.com",
          response: { json: [{ path: ["id"], toVar: "id" }] },
        },
        {
          fetchImpl: vi.fn(async () => streamResponse([chunk])) as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({ category: "response-too-large" })
  })

  it("rejects redirects, non-2xx, invalid JSON, missing required, and aggregate mappings", async () => {
    const run = (
      response: Response,
      mapping = { path: ["id"], toVar: "id", required: true },
    ) =>
      executeHttpRequest(
        {
          op: "httpRequest",
          method: "GET",
          url: "https://api.example.com",
          response: { json: [mapping] },
        },
        { fetchImpl: vi.fn(async () => response) as typeof fetch },
      )

    await expect(
      run(new Response(null, { status: 302 })),
    ).rejects.toMatchObject({ category: "redirect" })
    await expect(
      run(new Response("secret", { status: 500 })),
    ).rejects.toMatchObject({ category: "status" })
    await expect(run(new Response("not json"))).rejects.toMatchObject({
      category: "invalid-json",
    })
    await expect(run(new Response("{}"))).rejects.toMatchObject({
      category: "missing-mapping",
    })
    await expect(run(new Response('{"id":{}}'))).rejects.toMatchObject({
      category: "non-scalar-mapping",
    })
  })

  it("times out without exposing request data in the error", async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          )
        }),
    )
    const promise = executeHttpRequest(
      {
        op: "httpRequest",
        method: "POST",
        url: "https://api.example.com",
        headers: { Authorization: "Bearer super-secret" },
        body: { secret: "private" },
        timeoutMs: 1_000,
      },
      {
        fetchImpl: fetchImpl as typeof fetch,
        setTimer: ((callback: TimerHandler) => {
          queueMicrotask(callback as () => void)
          return 1
        }) as typeof setTimeout,
        clearTimer: vi.fn() as typeof clearTimeout,
      },
    )
    const error = (await promise.catch(
      (cause) => cause as HttpRequestError,
    )) as HttpRequestError
    expect(error.category).toBe("timeout")
    expect(error.message).not.toContain("super-secret")
    expect(error.message).not.toContain("private")
  })
})

describe("outbound capability preflight", () => {
  const steps = [
    {
      op: "httpRequest" as const,
      method: "POST" as const,
      url: "https://api.example.com/events",
      body: { value: "{{snippet:token}}" },
    },
  ]

  it("checks private mode, Firefox consent, and the concrete endpoint grant", async () => {
    await expect(preflightHttpRequests(steps, 7)).resolves.toBeUndefined()
    expect(callBrowserAPI).toHaveBeenCalledWith("tabs", "get", 7)
    expect(callBrowserAPI).toHaveBeenCalledWith("permissions", "contains", {
      origins: ["https://api.example.com/*"],
    })
  })

  it("fails before endpoint checks in private mode or without data consent", async () => {
    callBrowserAPI.mockResolvedValueOnce({ incognito: true })
    await expect(preflightHttpRequests(steps, 7)).rejects.toThrow(
      /private windows/,
    )

    callBrowserAPI.mockReset().mockResolvedValue({ incognito: false })
    hasOutboundDataConsent.mockResolvedValue(false)
    await expect(preflightHttpRequests(steps, 7)).rejects.toThrow(
      /data consent/,
    )
  })

  it("fails on a missing or revoked concrete origin grant", async () => {
    callBrowserAPI.mockImplementation((object: string, method: string) => {
      if (object === "tabs" && method === "get")
        return Promise.resolve({ incognito: false })
      if (object === "permissions" && method === "contains")
        return Promise.resolve(false)
      return Promise.resolve(undefined)
    })
    await expect(preflightHttpRequests(steps, 7)).rejects.toThrow(
      /Grant endpoint access for https:\/\/api\.example\.com\/\*/,
    )
  })
})
