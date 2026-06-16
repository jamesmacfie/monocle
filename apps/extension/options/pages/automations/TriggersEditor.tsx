// Architecture: options/ page-local UI for the Automations builder. Edits
// the trigger list of a draft document: per-type field groups for the six
// trigger types in shared/types/automations.ts, manual-trigger parameters as
// a JSON textarea (parsed on blur), and an add control that enforces the
// schema's at-most-one-of-each-non-manual-type rule up front by disabling
// used types. Edits pure `TriggerRowState` data; the page owns validation.
import { Trash2 } from "lucide-react"
import { useState } from "react"
import type {
  AutomationParameterField,
  AutomationTrigger,
  AutomationTriggerType,
} from "../../../shared/types"
import { Button, Checkbox, Input, Select, Textarea } from "../../components/ui"
import { EditorField as Field } from "./components/EditorField"
import {
  createDefaultTrigger,
  TRIGGER_TYPE_LABELS,
  TRIGGER_TYPES,
  type TriggerRowState,
  triggerRowFromTrigger,
} from "./editorState"
import { SelectorFields } from "./SelectorFields"

const MAX_TRIGGERS = 5

const PARAMS_PLACEHOLDER = `[
  { "id": "env", "label": "Environment", "type": "select",
    "options": [{ "value": "prod", "label": "Production" }] }
]`

type TriggersEditorProps = {
  rows: TriggerRowState[]
  errorsByIndex: Record<number, string[]>
  onChange: (rows: TriggerRowState[]) => void
}

function CheckboxField({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean
  label: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      {label}
    </label>
  )
}

export function TriggersEditor({
  rows,
  errorsByIndex,
  onChange,
}: TriggersEditorProps) {
  const [addType, setAddType] = useState<AutomationTriggerType>("manual")

  const usedNonManualTypes = new Set(
    rows.map((row) => row.trigger.type).filter((type) => type !== "manual"),
  )

  const replaceRow = (index: number, row: TriggerRowState) => {
    const next = [...rows]
    next[index] = row
    onChange(next)
  }

  const setTrigger = (index: number, trigger: AutomationTrigger) => {
    replaceRow(index, { ...rows[index], trigger })
  }

  const renderDisarmed = (
    index: number,
    trigger: Extract<AutomationTrigger, { disarmed?: boolean }>,
  ) => (
    <CheckboxField
      checked={trigger.disarmed ?? false}
      label="Disarmed (trigger will not fire until armed)"
      onCheckedChange={(checked) =>
        setTrigger(index, { ...trigger, disarmed: checked })
      }
    />
  )

  const renderFields = (row: TriggerRowState, index: number) => {
    const trigger = row.trigger
    switch (trigger.type) {
      case "manual":
        return (
          <Field label="Prompt-before-run parameters (JSON array, optional)">
            <Textarea
              className="font-mono text-xs"
              placeholder={PARAMS_PLACEHOLDER}
              rows={4}
              value={row.paramsText}
              onBlur={() => {
                const text = row.paramsText.trim()
                if (!text) {
                  const next = { ...trigger }
                  delete next.parameters
                  replaceRow(index, {
                    trigger: next,
                    paramsText: row.paramsText,
                    paramsError: null,
                  })
                  return
                }
                try {
                  const parsed = JSON.parse(text) as unknown
                  if (!Array.isArray(parsed)) {
                    throw new Error("Expected a JSON array of fields")
                  }
                  replaceRow(index, {
                    trigger: {
                      ...trigger,
                      parameters: parsed as AutomationParameterField[],
                    },
                    paramsText: row.paramsText,
                    paramsError: null,
                  })
                } catch (error) {
                  replaceRow(index, {
                    ...row,
                    paramsError:
                      error instanceof Error ? error.message : String(error),
                  })
                }
              }}
              onChange={(event) =>
                replaceRow(index, { ...row, paramsText: event.target.value })
              }
            />
            {row.paramsError && (
              <span className="text-xs text-[var(--color-error-fg)]">
                {row.paramsError}
              </span>
            )}
          </Field>
        )
      case "urlMatch": {
        const on = trigger.on ?? ["load"]
        const toggleOn = (kind: "load" | "spa") => {
          const next = on.includes(kind)
            ? on.filter((entry) => entry !== kind)
            : [...on, kind]
          if (next.length === 0) {
            return
          }
          setTrigger(index, { ...trigger, on: next })
        }
        return (
          <>
            <div className="flex flex-wrap gap-4">
              <CheckboxField
                checked={on.includes("load")}
                label="On page load"
                onCheckedChange={() => toggleOn("load")}
              />
              <CheckboxField
                checked={on.includes("spa")}
                label="On SPA navigation"
                onCheckedChange={() => toggleOn("spa")}
              />
            </div>
            <CheckboxField
              checked={trigger.oncePerPage ?? true}
              label="Fire at most once per page"
              onCheckedChange={(checked) =>
                setTrigger(index, { ...trigger, oncePerPage: checked })
              }
            />
            <Field label="Delay after match (ms, max 10000)">
              <Input
                className="w-32"
                max={10000}
                min={0}
                type="number"
                value={trigger.delayMs ?? ""}
                onChange={(event) => {
                  const next = { ...trigger }
                  const parsed = Number.parseInt(event.target.value, 10)
                  if (event.target.value === "" || Number.isNaN(parsed)) {
                    delete next.delayMs
                  } else {
                    next.delayMs = parsed
                  }
                  setTrigger(index, next)
                }}
              />
            </Field>
            {renderDisarmed(index, trigger)}
            <span className="text-xs text-[var(--color-fg-muted)]">
              Matches the allow/deny patterns in the Scope section above.
            </span>
          </>
        )
      }
      case "elementAppears":
        return (
          <>
            <Field label="Element">
              <SelectorFields
                value={trigger.selector}
                onChange={(selector) =>
                  setTrigger(index, { ...trigger, selector })
                }
              />
            </Field>
            <Field label="Throttle (ms, min 250)">
              <Input
                className="w-32"
                max={60000}
                min={250}
                type="number"
                value={trigger.throttleMs ?? ""}
                onChange={(event) => {
                  const next = { ...trigger }
                  const parsed = Number.parseInt(event.target.value, 10)
                  if (event.target.value === "" || Number.isNaN(parsed)) {
                    delete next.throttleMs
                  } else {
                    next.throttleMs = parsed
                  }
                  setTrigger(index, next)
                }}
              />
            </Field>
            <CheckboxField
              checked={trigger.oncePerPage ?? true}
              label="Fire at most once per page"
              onCheckedChange={(checked) =>
                setTrigger(index, { ...trigger, oncePerPage: checked })
              }
            />
            {renderDisarmed(index, trigger)}
          </>
        )
      case "interval":
        return (
          <>
            <Field label="Every (minutes, min 1)">
              <Input
                className="w-32"
                min={1}
                type="number"
                value={trigger.everyMinutes}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10)
                  setTrigger(index, {
                    ...trigger,
                    everyMinutes: Number.isNaN(parsed) ? 1 : parsed,
                  })
                }}
              />
            </Field>
            {renderDisarmed(index, trigger)}
          </>
        )
      case "schedule":
        return (
          <>
            <Field label="At (daily, local time)">
              <Input
                className="w-32"
                type="time"
                value={trigger.at}
                onChange={(event) =>
                  setTrigger(index, { ...trigger, at: event.target.value })
                }
              />
            </Field>
            {renderDisarmed(index, trigger)}
          </>
        )
      case "onStartup":
        return renderDisarmed(index, trigger)
    }
  }

  return (
    <div className="grid gap-3">
      {rows.map((row, index) => (
        <div
          key={index}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              {TRIGGER_TYPE_LABELS[row.trigger.type]}
            </span>
            <Button
              aria-label="Remove trigger"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 grid gap-3">{renderFields(row, index)}</div>
          {(errorsByIndex[index] ?? []).length > 0 && (
            <ul className="mt-2 grid gap-1 text-xs text-[var(--color-error-fg)]">
              {(errorsByIndex[index] ?? []).map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Select
          aria-label="Trigger type to add"
          value={addType}
          onChange={(event) =>
            setAddType(event.target.value as AutomationTriggerType)
          }
        >
          {TRIGGER_TYPES.map((type) => (
            <option
              key={type}
              disabled={type !== "manual" && usedNonManualTypes.has(type)}
              value={type}
            >
              {TRIGGER_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
        <Button
          disabled={
            rows.length >= MAX_TRIGGERS ||
            (addType !== "manual" && usedNonManualTypes.has(addType))
          }
          type="button"
          variant="secondary"
          onClick={() =>
            onChange([
              ...rows,
              triggerRowFromTrigger(createDefaultTrigger(addType)),
            ])
          }
        >
          Add Trigger
        </Button>
      </div>
    </div>
  )
}
