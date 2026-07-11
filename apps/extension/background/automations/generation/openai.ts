// Architecture: background OpenAI transport. Native fetch only; maps remote
// failures into a safe typed result and never logs credentials, prompts, or
// generated payloads. See docs/automations.md.
import {
  AUTOMATION_GENERATION_MODEL,
  type AutomationGenerationFailure,
} from "../../../shared/types/automationGeneration"
import {
  type AutomationGenerationIr,
  AutomationGenerationIrSchema,
} from "./contract"
import { AUTOMATION_GENERATION_JSON_SCHEMA } from "./schema"

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
const REQUEST_TIMEOUT_MS = 120_000

type OpenAiGenerationSuccess = {
  ok: true
  ir: AutomationGenerationIr
  requestId?: string
}

export type OpenAiGenerationResult =
  | OpenAiGenerationSuccess
  | AutomationGenerationFailure

type OpenAiErrorBody = {
  error?: { code?: string; message?: string; type?: string }
}

const failure = (
  code: AutomationGenerationFailure["code"],
  message: string,
  retryable: boolean,
  requestId?: string,
): AutomationGenerationFailure => ({
  ok: false,
  code,
  message,
  retryable,
  ...(requestId ? { requestId } : {}),
})

const parseErrorBody = async (response: Response): Promise<OpenAiErrorBody> => {
  try {
    return (await response.json()) as OpenAiErrorBody
  } catch {
    return {}
  }
}

const mapHttpFailure = async (
  response: Response,
): Promise<AutomationGenerationFailure> => {
  const requestId = response.headers.get("x-request-id") ?? undefined
  const body = await parseErrorBody(response)
  const remoteCode = body.error?.code ?? body.error?.type ?? ""
  if (response.status === 401)
    return failure(
      "invalid-api-key",
      "OpenAI rejected the saved API key. Replace it and try again.",
      false,
      requestId,
    )
  if (response.status === 403)
    return failure(
      "forbidden",
      "This API key is not allowed to use the selected OpenAI model.",
      false,
      requestId,
    )
  if (response.status === 400) {
    const unavailable = /model|not.found|unsupported/i.test(remoteCode)
    return failure(
      unavailable ? "model-unavailable" : "service-error",
      unavailable
        ? "The configured OpenAI model is not available for this API key."
        : "OpenAI rejected the structured generation request.",
      false,
      requestId,
    )
  }
  if (response.status === 404)
    return failure(
      "model-unavailable",
      "The configured OpenAI model is not available for this API key.",
      false,
      requestId,
    )
  if (response.status === 429) {
    const quota = /quota|billing/i.test(remoteCode)
    return failure(
      quota ? "quota-exceeded" : "rate-limited",
      quota
        ? "OpenAI reports that this account has no available API quota."
        : "OpenAI is rate limiting requests. Wait a moment and try again.",
      !quota,
      requestId,
    )
  }
  if (response.status >= 500)
    return failure(
      "service-error",
      "OpenAI is temporarily unavailable. Try again shortly.",
      true,
      requestId,
    )
  return failure(
    "service-error",
    "OpenAI could not process this generation request.",
    false,
    requestId,
  )
}

type ResponsesPayload = {
  status?: string
  incomplete_details?: { reason?: string }
  output?: Array<{
    type?: string
    content?: Array<{
      type?: string
      text?: string
      refusal?: string
    }>
  }>
}

export const requestOpenAiAutomation = async ({
  apiKey,
  instructions,
  request,
  signal,
  repair,
  fetchImpl = fetch,
}: {
  apiKey: string
  instructions: string
  request: string
  signal: AbortSignal
  repair?: { previous: AutomationGenerationIr; errors: string[] }
  fetchImpl?: typeof fetch
}): Promise<OpenAiGenerationResult> => {
  const timeoutController = new AbortController()
  const timeout = setTimeout(
    () => timeoutController.abort(),
    REQUEST_TIMEOUT_MS,
  )
  const relayAbort = () => timeoutController.abort()
  signal.addEventListener("abort", relayAbort, { once: true })

  const input = repair
    ? `${request}\n\nThe previous structured draft failed Monocle validation. Return a corrected full draft.\nErrors:\n${repair.errors.join("\n")}\nPrevious draft:\n${JSON.stringify(repair.previous)}`
    : request

  try {
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AUTOMATION_GENERATION_MODEL,
        store: false,
        reasoning: { effort: "medium" },
        instructions,
        input: [{ role: "user", content: input }],
        max_output_tokens: 24_000,
        text: {
          format: {
            type: "json_schema",
            name: "monocle_automation_generation",
            strict: true,
            schema: AUTOMATION_GENERATION_JSON_SCHEMA,
          },
        },
      }),
      signal: timeoutController.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    })

    if (!response.ok) return await mapHttpFailure(response)
    const requestId = response.headers.get("x-request-id") ?? undefined
    let payload: ResponsesPayload
    try {
      payload = (await response.json()) as ResponsesPayload
    } catch {
      return failure(
        "invalid-output",
        "OpenAI returned a malformed response.",
        true,
        requestId,
      )
    }
    if (payload.status === "incomplete") {
      return failure(
        "incomplete",
        `OpenAI returned an incomplete draft${payload.incomplete_details?.reason ? ` (${payload.incomplete_details.reason})` : ""}. Try a smaller request.`,
        true,
        requestId,
      )
    }

    const contents = (payload.output ?? [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
    const refusal = contents.find((item) => item.type === "refusal")
    if (refusal) {
      return failure(
        "refusal",
        refusal.refusal || "OpenAI declined this automation request.",
        false,
        requestId,
      )
    }
    const texts = contents.filter(
      (item): item is typeof item & { text: string } =>
        item.type === "output_text" && typeof item.text === "string",
    )
    if (texts.length !== 1) {
      return failure(
        "invalid-output",
        "OpenAI did not return one structured automation draft.",
        true,
        requestId,
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(texts[0].text)
    } catch {
      return failure(
        "invalid-output",
        "OpenAI returned malformed structured output.",
        true,
        requestId,
      )
    }
    const validated = AutomationGenerationIrSchema.safeParse(parsed)
    if (!validated.success) {
      return failure(
        "invalid-output",
        "OpenAI returned a draft that did not match the generation contract.",
        true,
        requestId,
      )
    }
    return { ok: true, ir: validated.data, ...(requestId ? { requestId } : {}) }
  } catch (_error) {
    if (signal.aborted)
      return failure("cancelled", "Generation was cancelled.", false)
    if (timeoutController.signal.aborted)
      return failure(
        "timeout",
        "OpenAI took too long to generate this automation.",
        true,
      )
    return failure(
      "network",
      "Could not reach OpenAI. Check your connection and try again.",
      true,
    )
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener("abort", relayAbort)
  }
}
