// Architecture: options/ page-local UI for the Automations builder. This is
// the stable row shell: operation selection, ordering, deletion, JSON fallback,
// and validation errors. Form-op knowledge lives in the typed stepEditors
// registry so the shell never switches on operation details. Rows edit pure
// `StepRowState` data and report changes upward; nothing here executes steps.
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Trash2,
} from "lucide-react"
import type { ReactNode } from "react"
import type { AutomationStep, Snippet } from "../../../shared/types"
import { Button, Select, Textarea } from "../../components/ui"
import { EditorField as Field } from "./components/EditorField"
import {
  getStepEditor,
  type StepListContext,
  type StepNodeState,
} from "./stepEditors"
import { createDefaultStepNode, updateStepNodeRow } from "./stepTree"

type StepRowProps = {
  index: number
  node: StepNodeState
  context: StepListContext
  operationOptions: Array<{ op: AutomationStep["op"]; label: string }>
  isFirst: boolean
  isLast: boolean
  isExpanded: boolean
  canDelete: boolean
  errors: string[]
  validationIssues: Array<{ path: string; message: string }>
  snippets: Snippet[]
  children?: ReactNode
  onChange: (node: StepNodeState) => void
  onExpandedChange: (expanded: boolean) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}

const rowOp = (row: StepNodeState["row"]): string =>
  row.kind === "form" ? row.step.op : (row.parsed?.op ?? "branch")

export function StepRow({
  index,
  node,
  context,
  operationOptions,
  isFirst,
  isLast,
  isExpanded,
  canDelete,
  errors,
  validationIssues,
  snippets,
  children,
  onChange,
  onExpandedChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: StepRowProps) {
  const { row } = node
  const op = rowOp(row)
  const knownOp = operationOptions.some((option) => option.op === op)
  const StepForm =
    row.kind === "form" ? getStepEditor(row.step.op)?.Form : undefined
  const bodyId = `automation-step-body-${node.editorKey}`

  return (
    <div
      className={
        context.nested
          ? "border-y border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3"
          : "rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3"
      }
      data-automation-step-row={context.nested ? "nested" : "root"}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button
            aria-controls={bodyId}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "Collapse" : "Expand"} ${context.label} step ${index + 1}`}
            className="shrink-0 active:bg-[var(--color-bg-selected)]"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => onExpandedChange(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
          <span className="w-6 shrink-0 text-center text-xs font-medium text-[var(--color-fg-muted)]">
            {index + 1}
          </span>
          <Select
            aria-label={`${context.label} step ${index + 1} operation`}
            className="min-w-0 flex-1"
            value={op}
            onChange={(event) => {
              onExpandedChange(true)
              const next = createDefaultStepNode(
                event.target.value as AutomationStep["op"],
              )
              onChange(
                // Changing the operation replaces the form data but remains
                // the same editor row, so disclosure identity survives.
                { ...next, editorKey: node.editorKey },
              )
            }}
          >
            {!knownOp && <option value={op}>{op} (JSON)</option>}
            {operationOptions.map((option) => (
              <option key={option.op} value={option.op}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button
            aria-label={`Move ${context.label} step ${index + 1} up`}
            disabled={isFirst}
            size="icon"
            type="button"
            variant="ghost"
            onClick={onMoveUp}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button
            aria-label={`Move ${context.label} step ${index + 1} down`}
            disabled={isLast}
            size="icon"
            type="button"
            variant="ghost"
            onClick={onMoveDown}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button
            aria-label={`Delete ${context.label} step ${index + 1}`}
            disabled={!canDelete}
            size="icon"
            type="button"
            variant="ghost"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 grid gap-3 sm:pl-8" id={bodyId}>
          {row.kind === "form" && StepForm ? (
            <StepForm
              snippets={snippets}
              step={row.step}
              controlFlowDepth={context.controlFlowDepth}
              path={[...context.path, index]}
              validationIssues={validationIssues}
              update={(step) =>
                onChange(updateStepNodeRow(node, { kind: "form", step }))
              }
            />
          ) : row.kind === "json" ? (
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
                    onChange(
                      updateStepNodeRow(node, {
                        kind: "json",
                        text: row.text,
                        parsed: parsed as never,
                        error: null,
                      }),
                    )
                  } catch (error) {
                    onChange(
                      updateStepNodeRow(node, {
                        ...row,
                        error:
                          error instanceof Error
                            ? error.message
                            : String(error),
                      }),
                    )
                  }
                }}
                onChange={(event) =>
                  onChange(
                    updateStepNodeRow(node, {
                      ...row,
                      text: event.target.value,
                    }),
                  )
                }
              />
              {row.error && (
                <span className="text-xs text-[var(--color-error-fg)]">
                  {row.error}
                </span>
              )}
            </Field>
          ) : null}

          {errors.length > 0 && (
            <ul className="grid gap-1 text-xs text-[var(--color-error-fg)]">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}

          {children}
        </div>
      )}
    </div>
  )
}
