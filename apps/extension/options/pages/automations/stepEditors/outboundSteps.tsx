import { useEffect, useState } from "react"
import type {
  HttpRequestStep,
  JsonValue,
  ShowSurfaceStep,
} from "../../../../shared/types"
import { Checkbox, Input, Select, Textarea } from "../../../components/ui"
import { EditorField as Field } from "../components/EditorField"
import type { StepEditorMap, StepFormProps } from "./types"

function JsonEditor({
  label,
  value,
  validate,
  onValid,
}: {
  label: string
  value: unknown
  validate?: (value: unknown) => string | null
  onValid: (value: unknown) => void
}) {
  const serialized = JSON.stringify(value, null, 2)
  const [text, setText] = useState(serialized)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setText(serialized), [serialized])

  return (
    <Field label={`${label} (parsed when you click away)`}>
      <Textarea
        className="font-mono text-xs"
        rows={7}
        value={text}
        onBlur={() => {
          try {
            const parsed = JSON.parse(text) as unknown
            const validationError = validate?.(parsed)
            if (validationError) throw new Error(validationError)
            onValid(parsed)
            setError(null)
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause))
          }
        }}
        onChange={(event) => setText(event.target.value)}
      />
      {error && (
        <span className="text-xs text-[var(--color-error-fg)]">{error}</span>
      )}
    </Field>
  )
}

function ShowSurfaceForm({ step, update }: StepFormProps<"showSurface">) {
  const contentFields = (
    <>
      <Field label="Title">
        <Input
          value={step.content.title ?? ""}
          onChange={(event) =>
            update({
              ...step,
              content: {
                ...step.content,
                title: event.target.value || undefined,
              },
            } as ShowSurfaceStep)
          }
        />
      </Field>
      <Field label="Text">
        <Input
          value={step.content.text ?? ""}
          onChange={(event) =>
            update({
              ...step,
              content: {
                ...step.content,
                text: event.target.value || undefined,
              },
            } as ShowSurfaceStep)
          }
        />
      </Field>
    </>
  )

  return (
    <>
      <Field label="Surface id">
        <Input
          value={step.surfaceId}
          onChange={(event) =>
            update({ ...step, surfaceId: event.target.value })
          }
        />
      </Field>
      <Field label="Kind">
        <Select
          value={step.kind}
          onChange={(event) => {
            const kind = event.target.value as ShowSurfaceStep["kind"]
            if (kind === "inline") {
              update({
                op: "showSurface",
                surfaceId: step.surfaceId,
                kind,
                content: step.content,
                placement: { selector: "body", position: "append" },
                actions: [
                  {
                    id: "run",
                    label: "Run",
                    style: "primary",
                    steps: [{ op: "toast", message: "Done" }],
                  },
                ],
              })
            } else {
              update({
                op: "showSurface",
                surfaceId: step.surfaceId,
                kind,
                content: step.content,
              })
            }
          }}
        >
          <option value="overlay">Overlay</option>
          <option value="badge">Badge</option>
          <option value="inline">Inline buttons</option>
        </Select>
      </Field>
      {contentFields}
      {step.kind === "inline" ? (
        <>
          <Field label="CSS selector (static)">
            <Input
              value={step.placement.selector}
              onChange={(event) =>
                update({
                  ...step,
                  placement: {
                    ...step.placement,
                    selector: event.target.value,
                  },
                })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Match index">
              <Input
                type="number"
                min={0}
                max={1000}
                value={step.placement.index ?? 0}
                onChange={(event) =>
                  update({
                    ...step,
                    placement: {
                      ...step.placement,
                      index: Number(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="Position">
              <Select
                value={step.placement.position}
                onChange={(event) =>
                  update({
                    ...step,
                    placement: {
                      ...step.placement,
                      position: event.target
                        .value as typeof step.placement.position,
                    },
                  })
                }
              >
                <option value="before">Before target</option>
                <option value="prepend">Inside, first</option>
                <option value="append">Inside, last</option>
                <option value="after">After target</option>
              </Select>
            </Field>
          </div>
          <p className="text-xs text-[var(--color-fg-muted)]">
            Inline controls appear in every matching tab and remain until a
            hideSurface step removes them. Buttons execute a fresh action run.
          </p>
        </>
      ) : (
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={step.blocking ?? false}
            onCheckedChange={(checked) =>
              update({ ...step, blocking: checked === true })
            }
          />
          Block page interaction (overlay only)
        </label>
      )}
    </>
  )
}

function HttpRequestForm({ step, update }: StepFormProps<"httpRequest">) {
  return (
    <>
      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <Field label="Method">
          <Select
            value={step.method}
            onChange={(event) =>
              update({
                ...step,
                method: event.target.value as HttpRequestStep["method"],
              })
            }
          >
            {(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).map(
              (method) => (
                <option key={method}>{method}</option>
              ),
            )}
          </Select>
        </Field>
        <Field label="Static endpoint URL">
          <Input
            value={step.url}
            onChange={(event) => update({ ...step, url: event.target.value })}
          />
        </Field>
      </div>
      <JsonEditor
        label="Headers"
        value={step.headers ?? {}}
        validate={(value) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? null
            : "Expected a JSON object"
        }
        onValid={(headers) =>
          update({ ...step, headers: headers as Record<string, string> })
        }
      />
      {step.method !== "GET" && (
        <JsonEditor
          label="Structured JSON body"
          value={step.body ?? {}}
          onValid={(body) => update({ ...step, body: body as JsonValue })}
        />
      )}
      <Field label="Timeout (milliseconds, 1000–30000)">
        <Input
          type="number"
          min={1000}
          max={30000}
          value={step.timeoutMs ?? 10000}
          onChange={(event) =>
            update({ ...step, timeoutMs: Number(event.target.value) })
          }
        />
      </Field>
      <JsonEditor
        label="Response mapping"
        value={step.response ?? {}}
        validate={(value) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? null
            : "Expected a JSON object"
        }
        onValid={(response) =>
          update({ ...step, response: response as HttpRequestStep["response"] })
        }
      />
      <p className="text-xs text-[var(--color-fg-muted)]">
        GET has no body. Only 2xx succeeds; responses are capped at 64 KiB.
        Cookies, redirects, retries, and private-window delivery are disabled.
        Use snippet references for credentials because literal values are
        included in exports.
      </p>
    </>
  )
}

type OutboundFormOp = "showSurface" | "httpRequest"

export const outboundStepEditors = {
  showSurface: {
    label: "Show surface",
    createDefault: () => ({
      op: "showSurface",
      surfaceId: "notice",
      kind: "badge",
      content: { text: "Done" },
    }),
    Form: ShowSurfaceForm,
  },
  httpRequest: {
    label: "Send HTTP request",
    createDefault: () => ({
      op: "httpRequest",
      method: "POST",
      url: "https://api.example.com/events",
      body: {},
    }),
    Form: HttpRequestForm,
  },
} satisfies StepEditorMap<OutboundFormOp>
