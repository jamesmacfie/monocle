import { describe, expect, it, vi } from "vitest"
import { AUTOMATION_GENERATION_MODEL } from "../../../shared/types/automationGeneration"
import type { AutomationGenerationIr } from "./contract"
import { requestOpenAiAutomation } from "./openai"

const ir: AutomationGenerationIr = {
  note: "Review the selector",
  script: {
    schemaVersion: 1,
    name: "Notify",
    description: null,
    icon: null,
    color: null,
    enabled: true,
    urlRules: null,
    triggers: [{ type: "manual", parameters: null }],
    variables: [],
    steps: [
      {
        op: "toast",
        id: null,
        description: null,
        level: "success",
        message: "Done",
      },
    ],
    showResultToast: null,
  },
}

const successResponse = () =>
  new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(ir) }],
        },
      ],
    }),
    { status: 200, headers: { "x-request-id": "req_123" } },
  )

describe("OpenAI automation client", () => {
  it("uses the Responses API with strict output and no server storage", async () => {
    const fetchImpl = vi.fn(async () => successResponse())
    const result = await requestOpenAiAutomation({
      apiKey: "secret-key",
      instructions: "contract",
      request: "make an automation",
      signal: new AbortController().signal,
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(result).toMatchObject({ ok: true, ir, requestId: "req_123" })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe("https://api.openai.com/v1/responses")
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer secret-key",
    )
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      model: AUTOMATION_GENERATION_MODEL,
      store: false,
      text: {
        format: {
          type: "json_schema",
          strict: true,
        },
      },
    })
    expect(body).not.toHaveProperty("tools")
  })

  it.each([
    [401, "invalid-api-key", false],
    [403, "forbidden", false],
    [404, "model-unavailable", false],
    [500, "service-error", true],
  ] as const)("maps HTTP %s safely", async (status, code, retryable) => {
    const result = await requestOpenAiAutomation({
      apiKey: "secret-key",
      instructions: "contract",
      request: "request",
      signal: new AbortController().signal,
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: "fixture" } }), {
            status,
            headers: { "x-request-id": "req_error" },
          }),
      ) as typeof fetch,
    })
    expect(result).toMatchObject({
      ok: false,
      code,
      retryable,
      requestId: "req_error",
    })
    expect(JSON.stringify(result)).not.toContain("secret-key")
  })

  it("handles refusal, incomplete, malformed, and cancelled responses", async () => {
    const request = (payload: unknown, signal = new AbortController().signal) =>
      requestOpenAiAutomation({
        apiKey: "key",
        instructions: "contract",
        request: "request",
        signal,
        fetchImpl: vi.fn(
          async () => new Response(JSON.stringify(payload), { status: 200 }),
        ) as typeof fetch,
      })

    await expect(
      request({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "refusal", refusal: "No" }] },
        ],
      }),
    ).resolves.toMatchObject({ ok: false, code: "refusal" })
    await expect(
      request({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
      }),
    ).resolves.toMatchObject({ ok: false, code: "incomplete" })
    await expect(
      request({
        status: "completed",
        output: [
          { type: "message", content: [{ type: "output_text", text: "{" }] },
        ],
      }),
    ).resolves.toMatchObject({ ok: false, code: "invalid-output" })

    const controller = new AbortController()
    const pending = requestOpenAiAutomation({
      apiKey: "key",
      instructions: "contract",
      request: "request",
      signal: controller.signal,
      fetchImpl: vi.fn(
        async (_url, init) =>
          await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            )
          }),
      ) as typeof fetch,
    })
    controller.abort()
    await expect(pending).resolves.toMatchObject({
      ok: false,
      code: "cancelled",
    })
  })
})
