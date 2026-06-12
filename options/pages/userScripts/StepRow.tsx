// Architecture: options/ page-local UI for the Automations builder. One row
// of the vertical step list: an op dropdown that swaps in per-op form fields
// for every flat operation, plus a raw-JSON editor (parsed on blur) for
// control-flow steps and any op without a dedicated form. Rows edit pure
// `StepRowState` data (editorState.ts) and report changes upward — the page
// owns assembly and validation; nothing here executes anything.
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import type { PropsWithChildren } from "react"
import type { Snippet, UserScriptStep } from "../../../shared/types"
import { Button, Checkbox, Input, Select, Textarea } from "../../components/ui"
import {
  createDefaultSelector,
  createDefaultStepRow,
  STEP_OP_OPTIONS,
  type StepRowState,
} from "./editorState"
import { SelectorFields } from "./SelectorFields"

type StepRowProps = {
  index: number
  row: StepRowState
  isFirst: boolean
  isLast: boolean
  errors: string[]
  snippets: Snippet[]
  onChange: (row: StepRowState) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}

function Field({ label, children }: PropsWithChildren<{ label: string }>) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-[var(--color-fg-muted)]">
        {label}
      </span>
      {children}
    </label>
  )
}

const rowOp = (row: StepRowState): string =>
  row.kind === "form" ? row.step.op : (row.parsed?.op ?? "branch")

export function StepRow({
  index,
  row,
  isFirst,
  isLast,
  errors,
  snippets,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: StepRowProps) {
  const op = rowOp(row)
  const knownOp = STEP_OP_OPTIONS.some((option) => option.op === op)

  const update = (step: UserScriptStep) => onChange({ kind: "form", step })

  const renderFormFields = (step: UserScriptStep) => {
    switch (step.op) {
      case "click":
        return (
          <Field label="Target">
            <SelectorFields
              showIndex
              value={step.target}
              onChange={(target) => update({ ...step, target })}
            />
          </Field>
        )
      case "fill":
        return (
          <>
            <Field label="Target">
              <SelectorFields
                value={step.target}
                onChange={(target) => update({ ...step, target })}
              />
            </Field>
            <Field label="Text">
              <Input
                placeholder="Text to fill (supports {{variables}})"
                value={step.text}
                onChange={(event) =>
                  update({ ...step, text: event.target.value })
                }
              />
            </Field>
          </>
        )
      case "select": {
        const mode =
          step.by.value !== undefined
            ? "value"
            : step.by.label !== undefined
              ? "label"
              : "index"
        return (
          <>
            <Field label="Dropdown">
              <SelectorFields
                value={step.target}
                onChange={(target) => update({ ...step, target })}
              />
            </Field>
            <Field label="Pick option by">
              <div className="flex gap-2">
                <Select
                  value={mode}
                  onChange={(event) => {
                    const next = event.target.value
                    update({
                      ...step,
                      by:
                        next === "value"
                          ? { value: "" }
                          : next === "label"
                            ? { label: "" }
                            : { index: 0 },
                    })
                  }}
                >
                  <option value="value">Value</option>
                  <option value="label">Label</option>
                  <option value="index">Index</option>
                </Select>
                {mode === "index" ? (
                  <Input
                    className="w-24"
                    min={0}
                    type="number"
                    value={step.by.index ?? 0}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10)
                      update({
                        ...step,
                        by: { index: Number.isNaN(parsed) ? 0 : parsed },
                      })
                    }}
                  />
                ) : (
                  <Input
                    className="flex-1"
                    placeholder={
                      mode === "value" ? "Option value" : "Option label"
                    }
                    value={
                      mode === "value"
                        ? (step.by.value ?? "")
                        : (step.by.label ?? "")
                    }
                    onChange={(event) =>
                      update({
                        ...step,
                        by:
                          mode === "value"
                            ? { value: event.target.value }
                            : { label: event.target.value },
                      })
                    }
                  />
                )}
              </div>
            </Field>
          </>
        )
      }
      case "check":
      case "uncheck":
      case "submit":
      case "focus":
      case "blur":
      case "hover":
        return (
          <Field label="Target">
            <SelectorFields
              value={step.target}
              onChange={(target) => update({ ...step, target })}
            />
          </Field>
        )
      case "scroll": {
        const to = typeof step.to === "string" ? step.to : "bottom"
        return (
          <>
            <Field label="Scroll to">
              <Select
                value={to}
                onChange={(event) =>
                  update({
                    ...step,
                    to: event.target.value as "top" | "bottom" | "center",
                  })
                }
              >
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="center">Center</option>
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={step.target !== undefined}
                onCheckedChange={(checked) => {
                  const next = { ...step }
                  if (checked === true) {
                    next.target = createDefaultSelector()
                  } else {
                    delete next.target
                  }
                  update(next)
                }}
              />
              Scroll a specific element instead of the window
            </label>
            {step.target && (
              <Field label="Element">
                <SelectorFields
                  value={step.target}
                  onChange={(target) => update({ ...step, target })}
                />
              </Field>
            )}
          </>
        )
      }
      case "wait": {
        const mode =
          "timeMs" in step.for
            ? "time"
            : "selector" in step.for
              ? "selector"
              : "urlIncludes" in step.for
                ? "url"
                : "readyState"
        return (
          <>
            <Field label="Wait for">
              <Select
                value={mode}
                onChange={(event) => {
                  const next = event.target.value
                  update({
                    ...step,
                    for:
                      next === "time"
                        ? { timeMs: 500 }
                        : next === "selector"
                          ? {
                              selector: createDefaultSelector(),
                              state: "visible",
                            }
                          : next === "url"
                            ? { urlIncludes: "" }
                            : { readyState: "complete" },
                  })
                }}
              >
                <option value="time">A fixed time</option>
                <option value="selector">An element state</option>
                <option value="url">URL to include text</option>
                <option value="readyState">Document ready state</option>
              </Select>
            </Field>
            {"timeMs" in step.for && (
              <Field label="Milliseconds">
                <Input
                  className="w-32"
                  min={0}
                  type="number"
                  value={step.for.timeMs}
                  onChange={(event) => {
                    const parsed = Number.parseInt(event.target.value, 10)
                    update({
                      ...step,
                      for: { timeMs: Number.isNaN(parsed) ? 0 : parsed },
                    })
                  }}
                />
              </Field>
            )}
            {"selector" in step.for && (
              <>
                <Field label="Element">
                  <SelectorFields
                    value={step.for.selector}
                    onChange={(selector) =>
                      update({ ...step, for: { ...step.for, selector } })
                    }
                  />
                </Field>
                <Field label="State">
                  <Select
                    value={step.for.state ?? "visible"}
                    onChange={(event) =>
                      update({
                        ...step,
                        for: {
                          ...step.for,
                          state: event.target.value as
                            | "attached"
                            | "visible"
                            | "hidden"
                            | "detached",
                        },
                      })
                    }
                  >
                    <option value="attached">Attached</option>
                    <option value="visible">Visible</option>
                    <option value="hidden">Hidden</option>
                    <option value="detached">Detached</option>
                  </Select>
                </Field>
              </>
            )}
            {"urlIncludes" in step.for && (
              <Field label="URL contains">
                <Input
                  value={step.for.urlIncludes}
                  onChange={(event) =>
                    update({
                      ...step,
                      for: { urlIncludes: event.target.value },
                    })
                  }
                />
              </Field>
            )}
            {"readyState" in step.for && (
              <Field label="Ready state">
                <Select
                  value={step.for.readyState}
                  onChange={(event) =>
                    update({
                      ...step,
                      for: {
                        readyState: event.target.value as
                          | "loading"
                          | "interactive"
                          | "complete",
                      },
                    })
                  }
                >
                  <option value="loading">Loading</option>
                  <option value="interactive">Interactive</option>
                  <option value="complete">Complete</option>
                </Select>
              </Field>
            )}
          </>
        )
      }
      case "getText":
        return (
          <>
            <Field label="Read from">
              <SelectorFields
                value={step.from}
                onChange={(from) => update({ ...step, from })}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Field label="Attribute (blank = text content)">
                <Input
                  className="w-44"
                  placeholder="e.g. value, href"
                  value={step.attr ?? ""}
                  onChange={(event) => {
                    const next = { ...step }
                    if (event.target.value) {
                      next.attr = event.target.value
                    } else {
                      delete next.attr
                    }
                    update(next)
                  }}
                />
              </Field>
              <Field label="Store into variable">
                <Input
                  className="w-44"
                  placeholder="variableName"
                  value={step.toVar}
                  onChange={(event) =>
                    update({ ...step, toVar: event.target.value })
                  }
                />
              </Field>
            </div>
          </>
        )
      case "removeElement":
      case "hideElement":
        return (
          <>
            <Field label="Target">
              <SelectorFields
                value={step.target}
                onChange={(target) => update({ ...step, target })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={step.all === true}
                onCheckedChange={(checked) => {
                  const next = { ...step }
                  if (checked === true) {
                    next.all = true
                  } else {
                    delete next.all
                  }
                  update(next)
                }}
              />
              Apply to every match, not just the first
            </label>
          </>
        )
      case "injectCss":
        return (
          <Field label="CSS">
            <Textarea
              placeholder=".banner { display: none; }"
              rows={4}
              value={step.css}
              onChange={(event) => update({ ...step, css: event.target.value })}
            />
          </Field>
        )
      case "toast":
        return (
          <div className="flex flex-wrap gap-2">
            <Field label="Level">
              <Select
                value={step.level ?? "info"}
                onChange={(event) =>
                  update({
                    ...step,
                    level: event.target.value as "info" | "success" | "error",
                  })
                }
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
              </Select>
            </Field>
            <Field label="Message">
              <Input
                className="min-w-64"
                placeholder="Message (supports {{variables}})"
                value={step.message}
                onChange={(event) =>
                  update({ ...step, message: event.target.value })
                }
              />
            </Field>
          </div>
        )
      case "setVariable":
        return (
          <div className="flex flex-wrap gap-2">
            <Field label="Variable">
              <Input
                className="w-44"
                placeholder="variableName"
                value={step.name}
                onChange={(event) =>
                  update({ ...step, name: event.target.value })
                }
              />
            </Field>
            <Field label="Value">
              <Input
                className="min-w-64"
                placeholder="Value (supports {{variables}})"
                value={step.value}
                onChange={(event) =>
                  update({ ...step, value: event.target.value })
                }
              />
            </Field>
          </div>
        )
      case "insertSnippet":
        return (
          <>
            <Field label="Snippet">
              <Select
                value={step.snippetId}
                onChange={(event) =>
                  update({ ...step, snippetId: event.target.value })
                }
              >
                <option value="">Select a snippet…</option>
                {snippets.map((snippet) => (
                  <option key={snippet.id} value={snippet.id}>
                    {snippet.name}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={step.target !== undefined}
                onCheckedChange={(checked) => {
                  const next = { ...step }
                  if (checked === true) {
                    next.target = createDefaultSelector()
                  } else {
                    delete next.target
                  }
                  update(next)
                }}
              />
              Insert into a specific element (otherwise the focused field)
            </label>
            {step.target && (
              <Field label="Target">
                <SelectorFields
                  value={step.target}
                  onChange={(target) => update({ ...step, target })}
                />
              </Field>
            )}
          </>
        )
      case "navigate":
        return (
          <Field label="URL">
            <Input
              placeholder="https://example.com (supports {{variables}})"
              value={step.url}
              onChange={(event) => update({ ...step, url: event.target.value })}
            />
          </Field>
        )
      case "openUrl":
        return (
          <>
            <Field label="URL">
              <Input
                placeholder="https://example.com (supports {{variables}})"
                value={step.url}
                onChange={(event) =>
                  update({ ...step, url: event.target.value })
                }
              />
            </Field>
            <Field label="Open in">
              <Select
                value={step.disposition ?? "newTab"}
                onChange={(event) =>
                  update({
                    ...step,
                    disposition: event.target.value as
                      | "currentTab"
                      | "newTab"
                      | "newWindow",
                  })
                }
              >
                <option value="newTab">New tab</option>
                <option value="currentTab">Current tab</option>
                <option value="newWindow">New window</option>
              </Select>
            </Field>
          </>
        )
      case "clipboardWrite":
        return (
          <Field label="Text">
            <Textarea
              placeholder="Text to copy (supports {{variables}})"
              rows={3}
              value={step.text}
              onChange={(event) =>
                update({ ...step, text: event.target.value })
              }
            />
          </Field>
        )
      case "runCommand":
        return (
          <Field label="Command id">
            <Input
              placeholder="e.g. new-tab"
              value={step.commandId}
              onChange={(event) =>
                update({ ...step, commandId: event.target.value })
              }
            />
            <span className="text-xs text-[var(--color-fg-muted)]">
              Use the command's id from the Commands page. Destructive commands
              are blocked, and automatic triggers can only run an allowlisted
              subset.
            </span>
          </Field>
        )
      default:
        return null
    }
  }

  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
      <div className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-center text-xs font-medium text-[var(--color-fg-muted)]">
          {index + 1}
        </span>
        <Select
          aria-label={`Step ${index + 1} operation`}
          className="flex-1"
          value={op}
          onChange={(event) =>
            onChange(createDefaultStepRow(event.target.value))
          }
        >
          {!knownOp && <option value={op}>{op} (JSON)</option>}
          {STEP_OP_OPTIONS.map((option) => (
            <option key={option.op} value={option.op}>
              {option.label}
            </option>
          ))}
        </Select>
        <Button
          aria-label="Move step up"
          disabled={isFirst}
          size="icon"
          type="button"
          variant="ghost"
          onClick={onMoveUp}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Move step down"
          disabled={isLast}
          size="icon"
          type="button"
          variant="ghost"
          onClick={onMoveDown}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          aria-label="Delete step"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 grid gap-3 pl-8">
        {row.kind === "form" ? (
          renderFormFields(row.step)
        ) : (
          <Field label="Step JSON (parsed when you click away)">
            <Textarea
              className="font-mono text-xs"
              rows={8}
              value={row.text}
              onBlur={() => {
                try {
                  const parsed = JSON.parse(row.text) as unknown
                  if (
                    typeof parsed !== "object" ||
                    parsed === null ||
                    typeof (parsed as { op?: unknown }).op !== "string"
                  ) {
                    throw new Error('Expected an object with an "op" field')
                  }
                  onChange({
                    kind: "json",
                    text: row.text,
                    parsed: parsed as never,
                    error: null,
                  })
                } catch (error) {
                  onChange({
                    ...row,
                    error:
                      error instanceof Error ? error.message : String(error),
                  })
                }
              }}
              onChange={(event) =>
                onChange({ ...row, text: event.target.value })
              }
            />
            {row.error && (
              <span className="text-xs text-[var(--color-error-fg)]">
                {row.error}
              </span>
            )}
          </Field>
        )}

        {errors.length > 0 && (
          <ul className="grid gap-1 text-xs text-[var(--color-error-fg)]">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
