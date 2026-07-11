import { KeyRound, Loader2, WandSparkles } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type {
  ClearAutomationGenerationApiKeyResponse,
  GenerateAutomationResponse,
  GetAutomationGenerationSettingsResponse,
  SetAutomationGenerationApiKeyResponse,
} from "../../../shared/types"
import {
  AUTOMATION_GENERATION_MAX_API_KEY_LENGTH,
  AUTOMATION_GENERATION_MAX_REQUEST_LENGTH,
  AUTOMATION_GENERATION_ORIGIN,
} from "../../../shared/types/automationGeneration"
import type { AutomationDraft } from "../../../shared/types/automationValidation"
import { isFirefox } from "../../../shared/utils/browser"
import {
  getBrowserAPI,
  sendRuntimeMessage,
} from "../../../shared/utils/extension-api"
import { OUTBOUND_DATA_CATEGORIES } from "../../../shared/utils/http-request-policy"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Textarea,
} from "../../components/ui"

type GeneratedDraft = {
  draft: AutomationDraft
  note?: string
  model: string
}

const responseError = (response: unknown): string | null =>
  typeof response === "object" &&
  response !== null &&
  "error" in response &&
  typeof response.error === "string"
    ? response.error
    : null

export function GenerateAutomationDialog({
  open,
  onOpenChange,
  onGenerated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGenerated: (generated: GeneratedDraft) => void
}) {
  const [status, setStatus] =
    useState<GetAutomationGenerationSettingsResponse | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [changingKey, setChangingKey] = useState(false)
  const [request, setRequest] = useState("")
  const [busy, setBusy] = useState<
    "saving" | "generating" | "cancelling" | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const generationId = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    void sendRuntimeMessage<
      GetAutomationGenerationSettingsResponse | { error: string }
    >({
      type: "monocle-automation-generation-settings-get",
    })
      .then((response) => {
        const message = responseError(response)
        if (message) throw new Error(message)
        if ("hasApiKey" in response) setStatus(response)
      })
      .catch(() => setError("Could not load generation settings."))
  }, [open])

  const cancel = () => {
    if (!generationId.current) return
    setBusy("cancelling")
    void sendRuntimeMessage({
      type: "monocle-automation-generation-cancel",
      generationId: generationId.current,
    })
  }

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      cancel()
      setApiKey("")
    }
    onOpenChange(nextOpen)
  }

  const saveKey = async () => {
    if (!apiKey.trim()) return
    setBusy("saving")
    setError(null)
    try {
      const response = await sendRuntimeMessage<
        SetAutomationGenerationApiKeyResponse | { error: string }
      >({
        type: "monocle-automation-generation-key-set",
        apiKey,
      })
      const message = responseError(response)
      if (message) throw new Error(message)
      if ("status" in response) setStatus(response.status)
      setApiKey("")
      setChangingKey(false)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save API key.",
      )
    } finally {
      setBusy(null)
    }
  }

  const clearKey = async () => {
    setBusy("saving")
    setError(null)
    try {
      const response = await sendRuntimeMessage<
        ClearAutomationGenerationApiKeyResponse | { error: string }
      >({ type: "monocle-automation-generation-key-clear" })
      const message = responseError(response)
      if (message) throw new Error(message)
      if ("status" in response) setStatus(response.status)
      setChangingKey(true)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove API key.",
      )
    } finally {
      setBusy(null)
    }
  }

  const grantOpenAiAccess = async (): Promise<boolean> => {
    const permissions = getBrowserAPI().permissions as unknown as {
      request: (request: unknown) => Promise<boolean>
      contains: (request: unknown) => Promise<boolean>
    }
    const grant = {
      origins: [AUTOMATION_GENERATION_ORIGIN],
      ...(isFirefox ? { data_collection: [...OUTBOUND_DATA_CATEGORIES] } : {}),
    }
    const requested = await permissions.request(grant)
    return (
      requested &&
      (await permissions.contains({ origins: [AUTOMATION_GENERATION_ORIGIN] }))
    )
  }

  const generate = async () => {
    const prompt = request.trim()
    if (!prompt || !status?.hasApiKey) return
    setError(null)
    try {
      if (!(await grantOpenAiAccess())) {
        setError("OpenAI endpoint permission was denied.")
        return
      }
      setBusy("generating")
      const id = crypto.randomUUID()
      generationId.current = id
      const response = await sendRuntimeMessage<GenerateAutomationResponse>({
        type: "monocle-automation-generate",
        generationId: id,
        request: prompt,
      })
      if (!response.ok) {
        if (response.code === "cancelled") {
          setError(null)
          return
        }
        setError(response.message)
        if (response.code === "invalid-api-key") setChangingKey(true)
        return
      }
      onGenerated({
        draft: response.draft,
        note: response.note,
        model: response.model,
      })
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generation failed.")
    } finally {
      generationId.current = null
      setBusy(null)
    }
  }

  const showKeyForm = !status?.hasApiKey || changingKey
  const generationPending = busy === "generating" || busy === "cancelling"

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="w-[min(94vw,680px)]">
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <WandSparkles className="h-4 w-4" /> Generate with AI
        </DialogTitle>
        <DialogDescription className="text-sm text-[var(--color-fg-muted)]">
          Describe the automation you want. Monocle sends your request, its
          automation contract, curated examples, and saved snippet names/ids to
          OpenAI—never snippet bodies or existing automations.
        </DialogDescription>

        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3 text-xs text-[var(--color-fg-muted)]">
          Your API key is stored locally in this extension profile. Browser
          storage is not a secure server-side secret. OpenAI API charges apply.
        </div>

        {showKeyForm ? (
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="openai-api-key">
              OpenAI API key
            </label>
            <div className="flex gap-2">
              <Input
                id="openai-api-key"
                autoComplete="off"
                maxLength={AUTOMATION_GENERATION_MAX_API_KEY_LENGTH}
                placeholder="Paste a project API key"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <Button
                disabled={!apiKey.trim() || busy !== null}
                type="button"
                variant="secondary"
                onClick={() => void saveKey()}
              >
                <KeyRound className="h-4 w-4" />
                {busy === "saving" ? "Saving…" : "Save"}
              </Button>
            </div>
            <a
              className="w-fit text-xs text-[var(--color-accent)] hover:underline"
              href="https://platform.openai.com/api-keys"
              rel="noreferrer"
              target="_blank"
            >
              Create or manage OpenAI API keys
            </a>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>API key saved on this device.</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setChangingKey(true)}
              >
                Change
              </Button>
              <Button
                disabled={busy !== null}
                type="button"
                variant="ghost"
                onClick={() => void clearKey()}
              >
                Remove
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium" htmlFor="automation-request">
              What should it do?
            </label>
            <span className="text-xs text-[var(--color-fg-muted)]">
              {request.length}/{AUTOMATION_GENERATION_MAX_REQUEST_LENGTH}
            </span>
          </div>
          <Textarea
            id="automation-request"
            disabled={generationPending}
            maxLength={AUTOMATION_GENERATION_MAX_REQUEST_LENGTH}
            placeholder="On GitHub pull request pages, copy the title and URL, POST them to my webhook, then show a success toast when the API returns 200."
            rows={8}
            value={request}
            onChange={(event) => setRequest(event.target.value)}
          />
          <p className="text-xs text-[var(--color-fg-muted)]">
            Model: {status?.model ?? "loading…"}. The model cannot inspect the
            live site, so review selectors and use Test on Active Tab.
          </p>
        </div>

        {error ? (
          <div className="rounded-md border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-fg)]">
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          {generationPending ? (
            <Button
              disabled={busy === "cancelling"}
              type="button"
              variant="secondary"
              onClick={cancel}
            >
              {busy === "cancelling" ? "Cancelling…" : "Cancel generation"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => changeOpen(false)}
            >
              Close
            </Button>
          )}
          <Button
            disabled={!status?.hasApiKey || !request.trim() || busy !== null}
            type="button"
            onClick={() => void generate()}
          >
            {generationPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <WandSparkles className="h-4 w-4" />
            )}
            {busy === "cancelling"
              ? "Cancelling…"
              : busy === "generating"
                ? "Generating and validating…"
                : "Generate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
