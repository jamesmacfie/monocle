// Architecture: options/ page-local UI for the Automations builder. This is
// the stable row shell: operation selection, ordering, deletion, JSON fallback,
// and validation errors. Form-op knowledge lives in the typed stepEditors
// registry so the shell never switches on operation details. Rows edit pure
// `StepRowState` data and report changes upward; nothing here executes steps.
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import type { AutomationStep, Snippet } from "../../../shared/types"
import { Button, Select, Textarea } from "../../components/ui"
import { EditorField as Field } from "./components/EditorField"
import {
  createDefaultStepRow,
  STEP_OP_OPTIONS,
  type StepRowState,
} from "./editorState"
import { getStepEditor } from "./stepEditors"

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
  const StepForm =
    row.kind === "form" ? getStepEditor(row.step.op)?.Form : undefined

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
            onChange(
              createDefaultStepRow(event.target.value as AutomationStep["op"]),
            )
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
        {row.kind === "form" && StepForm ? (
          <StepForm
            snippets={snippets}
            step={row.step}
            update={(step) => onChange({ kind: "form", step })}
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
        ) : null}

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
