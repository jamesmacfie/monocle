// Structured editor for the complete recursive AutomationCondition union.
// Conditions remain plain data; this component only edits the shared contract.
import { Plus, Trash2 } from "lucide-react"
import type {
  AutomationComparisonOperator,
  AutomationCondition,
} from "../../../shared/types"
import { Button, Input, Select } from "../../components/ui"
import { EditorField as Field } from "./components/EditorField"
import { SelectorFields } from "./SelectorFields"
import {
  directMessagesForPath,
  type EditorValidationIssue,
} from "./validationPaths"

const CONDITION_OPTIONS: Array<{
  kind: AutomationCondition["kind"]
  label: string
}> = [
  { kind: "elementExists", label: "Element exists" },
  { kind: "elementVisible", label: "Element is visible" },
  { kind: "elementText", label: "Element text matches" },
  { kind: "urlIncludes", label: "URL contains" },
  { kind: "varCompare", label: "Variable compares" },
  { kind: "varMatches", label: "Variable matches regex" },
  { kind: "not", label: "Not" },
  { kind: "allOf", label: "All conditions" },
  { kind: "anyOf", label: "Any condition" },
]

const COMPARISON_OPTIONS: Array<{
  value: AutomationComparisonOperator
  label: string
}> = [
  { value: "equals", label: "Equals" },
  { value: "equalsIgnoreCase", label: "Equals (ignore case)" },
  { value: "notEquals", label: "Does not equal" },
  { value: "contains", label: "Contains" },
  { value: "notContains", label: "Does not contain" },
  { value: "startsWith", label: "Starts with" },
  { value: "endsWith", label: "Ends with" },
  { value: "greaterThan", label: "Greater than" },
  { value: "lessThan", label: "Less than" },
]

export const createDefaultCondition = (
  kind: AutomationCondition["kind"] = "elementExists",
): AutomationCondition => {
  switch (kind) {
    case "elementExists":
    case "elementVisible":
      return { kind, selector: { strategy: "css", value: "" } }
    case "elementText":
      return {
        kind,
        selector: { strategy: "css", value: "" },
        operator: "contains",
        value: "",
      }
    case "urlIncludes":
      return { kind, value: "" }
    case "varCompare":
      return { kind, name: "value", operator: "equals", value: "" }
    case "varMatches":
      return { kind, name: "value", pattern: "" }
    case "not":
      return { kind, of: createDefaultCondition() }
    case "allOf":
    case "anyOf":
      return { kind, of: [createDefaultCondition()] }
  }
}

type ConditionEditorProps = {
  condition: AutomationCondition
  onChange: (condition: AutomationCondition) => void
  label?: string
  issues?: EditorValidationIssue[]
  path?: Array<string | number>
}

export function ConditionEditor({
  condition,
  onChange,
  label = "Condition",
  issues = [],
  path = [],
}: ConditionEditorProps) {
  const directErrors = directMessagesForPath(issues, path, ["of"])
  return (
    <div className="grid gap-3">
      <Field label={label}>
        <Select
          value={condition.kind}
          onChange={(event) =>
            onChange(
              createDefaultCondition(
                event.target.value as AutomationCondition["kind"],
              ),
            )
          }
        >
          {CONDITION_OPTIONS.map((option) => (
            <option key={option.kind} value={option.kind}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {(condition.kind === "elementExists" ||
        condition.kind === "elementVisible") && (
        <Field label="Element">
          <SelectorFields
            showIndex
            value={condition.selector}
            onChange={(selector) => onChange({ ...condition, selector })}
          />
        </Field>
      )}

      {condition.kind === "elementText" && (
        <>
          <Field label="Element">
            <SelectorFields
              showIndex
              value={condition.selector}
              onChange={(selector) => onChange({ ...condition, selector })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Comparison">
              <Select
                value={condition.operator}
                onChange={(event) =>
                  onChange({
                    ...condition,
                    operator: event.target
                      .value as AutomationComparisonOperator,
                  })
                }
              >
                {COMPARISON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Value">
              <Input
                value={condition.value}
                onChange={(event) =>
                  onChange({ ...condition, value: event.target.value })
                }
              />
            </Field>
          </div>
        </>
      )}

      {condition.kind === "urlIncludes" && (
        <Field label="URL contains">
          <Input
            placeholder="/checkout"
            value={condition.value}
            onChange={(event) =>
              onChange({ ...condition, value: event.target.value })
            }
          />
        </Field>
      )}

      {condition.kind === "varCompare" && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Variable">
            <Input
              value={condition.name}
              onChange={(event) =>
                onChange({ ...condition, name: event.target.value })
              }
            />
          </Field>
          <Field label="Comparison">
            <Select
              value={condition.operator}
              onChange={(event) =>
                onChange({
                  ...condition,
                  operator: event.target.value as AutomationComparisonOperator,
                })
              }
            >
              {COMPARISON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Value">
            <Input
              value={condition.value}
              onChange={(event) =>
                onChange({ ...condition, value: event.target.value })
              }
            />
          </Field>
        </div>
      )}

      {condition.kind === "varMatches" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Variable">
            <Input
              value={condition.name}
              onChange={(event) =>
                onChange({ ...condition, name: event.target.value })
              }
            />
          </Field>
          <Field label="Regular expression">
            <Input
              className="font-mono"
              placeholder="^[^@]+@[^@]+$"
              value={condition.pattern}
              onChange={(event) =>
                onChange({ ...condition, pattern: event.target.value })
              }
            />
          </Field>
        </div>
      )}

      {condition.kind === "not" && (
        <div className="border-s border-[var(--color-border-strong)] bg-[var(--color-bg-page)] py-2 ps-3">
          <ConditionEditor
            condition={condition.of}
            issues={issues}
            label="Condition to invert"
            path={[...path, "of"]}
            onChange={(of) => onChange({ ...condition, of })}
          />
        </div>
      )}

      {(condition.kind === "allOf" || condition.kind === "anyOf") && (
        <div className="grid gap-3 border-s border-[var(--color-border-strong)] bg-[var(--color-bg-page)] py-2 ps-3">
          {condition.of.map((child, index) => (
            <div className="grid gap-2" key={index}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[var(--color-fg-muted)]">
                  {condition.kind === "allOf" ? "Required" : "Alternative"}{" "}
                  {index + 1}
                </span>
                <Button
                  aria-label={`Remove condition ${index + 1}`}
                  disabled={condition.of.length === 1}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    onChange({
                      ...condition,
                      of: condition.of.filter(
                        (_, childIndex) => childIndex !== index,
                      ),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <ConditionEditor
                condition={child}
                issues={issues}
                path={[...path, "of", index]}
                onChange={(next) =>
                  onChange({
                    ...condition,
                    of: condition.of.map((entry, childIndex) =>
                      childIndex === index ? next : entry,
                    ),
                  })
                }
              />
            </div>
          ))}
          <Button
            className="justify-self-start"
            disabled={condition.of.length >= 10}
            size="sm"
            type="button"
            variant="secondary"
            onClick={() =>
              onChange({
                ...condition,
                of: [...condition.of, createDefaultCondition()],
              })
            }
          >
            <Plus className="h-4 w-4" />
            Add condition
          </Button>
        </div>
      )}

      {directErrors.length > 0 && (
        <ul className="grid gap-1 text-xs text-[var(--color-error-fg)]">
          {directErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
