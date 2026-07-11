import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import type { IconName } from "../../../shared/types"
import { AUTOMATION_MAX_STEPS } from "../../../shared/types/automationValidation"
import { ICON_NAMES } from "../../../shared/types/icons"
import { Button, Input, Select } from "../../components/ui"
import { EditorField as Field } from "./components/EditorField"
import type {
  StepListContext,
  StepNodeState,
  SurfaceActionEditorState,
} from "./stepEditors"
import { createSurfaceActionEditorState } from "./stepTree"
import {
  directMessagesForPath,
  type EditorValidationIssue,
  pathStartsWith,
} from "./validationPaths"

type SurfaceActionsEditorProps = {
  actions: SurfaceActionEditorState[]
  context: StepListContext
  issues: EditorValidationIssue[]
  totalStepCount: number
  onChange: (actions: SurfaceActionEditorState[]) => void
  renderSteps: (
    steps: StepNodeState[],
    context: StepListContext,
    onChange: (steps: StepNodeState[]) => void,
  ) => ReactNode
}

export function SurfaceActionsEditor({
  actions,
  context,
  issues,
  totalStepCount,
  onChange,
  renderSteps,
}: SurfaceActionsEditorProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(actions[0] ? [actions[0].editorKey] : []),
  )

  useEffect(() => {
    const invalidKeys = actions
      .filter((_, index) =>
        issues.some((issue) =>
          pathStartsWith(issue.path, [...context.path, index]),
        ),
      )
      .map((action) => action.editorKey)
    if (invalidKeys.length === 0) return
    setExpanded((current) => {
      if (invalidKeys.every((key) => current.has(key))) return current
      return new Set([...current, ...invalidKeys])
    })
  }, [actions, context.path, issues])

  const updateAction = (
    index: number,
    action: SurfaceActionEditorState,
  ): void => onChange(actions.map((entry, i) => (i === index ? action : entry)))

  return (
    <div
      className="grid gap-3 border-y border-[var(--color-border-strong)] bg-[var(--color-bg-page)] py-3"
      data-automation-surface-actions="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold">Inline buttons</div>
          <div className="text-xs text-[var(--color-fg-muted)]">
            Each button starts a fresh run of its nested steps.
          </div>
        </div>
        <span className="text-xs tabular-nums text-[var(--color-fg-muted)]">
          {actions.length} / 5
        </span>
      </div>

      {actions.map((action, index) => {
        const actionPath = [...context.path, index]
        const actionErrors = directMessagesForPath(issues, actionPath, [
          "steps",
        ])
        const isExpanded = expanded.has(action.editorKey)
        return (
          <div
            className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]"
            data-automation-surface-action="true"
            key={action.editorKey}
          >
            <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <button
                aria-expanded={isExpanded}
                aria-label={`Edit button ${index + 1}: ${action.label || `Button ${index + 1}`}`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-selected)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]"
                type="button"
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current)
                    if (next.has(action.editorKey))
                      next.delete(action.editorKey)
                    else next.add(action.editorKey)
                    return next
                  })
                }
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate text-sm font-medium">
                  {action.label || `Button ${index + 1}`}
                </span>
                <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-xs text-[var(--color-fg-muted)]">
                  {action.style ?? "default"}
                </span>
                <span className="text-xs tabular-nums text-[var(--color-fg-muted)]">
                  {action.steps.length} step
                  {action.steps.length === 1 ? "" : "s"}
                </span>
              </button>
              <div className="flex items-center justify-end gap-1">
                <Button
                  aria-label={`Move button ${index + 1} up`}
                  disabled={index === 0}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const next = [...actions]
                    ;[next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ]
                    onChange(next)
                  }}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={`Move button ${index + 1} down`}
                  disabled={index === actions.length - 1}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const next = [...actions]
                    ;[next[index], next[index + 1]] = [
                      next[index + 1],
                      next[index],
                    ]
                    onChange(next)
                  }}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  aria-label={`Delete button ${index + 1}`}
                  disabled={actions.length === 1}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    onChange(actions.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {isExpanded && (
              <div className="grid gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Button id">
                    <Input
                      value={action.id}
                      onChange={(event) =>
                        updateAction(index, {
                          ...action,
                          id: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Label">
                    <Input
                      value={action.label}
                      onChange={(event) =>
                        updateAction(index, {
                          ...action,
                          label: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Icon">
                    <Select
                      value={action.icon ?? ""}
                      onChange={(event) =>
                        updateAction(index, {
                          ...action,
                          icon: (event.target.value || undefined) as
                            | IconName
                            | undefined,
                        })
                      }
                    >
                      <option value="">None</option>
                      {ICON_NAMES.map((icon) => (
                        <option key={icon} value={icon}>
                          {icon}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Style">
                    <Select
                      value={action.style ?? "default"}
                      onChange={(event) =>
                        updateAction(index, {
                          ...action,
                          style: event.target.value as NonNullable<
                            SurfaceActionEditorState["style"]
                          >,
                        })
                      }
                    >
                      <option value="default">Default</option>
                      <option value="primary">Primary</option>
                      <option value="danger">Danger</option>
                    </Select>
                  </Field>
                </div>

                {actionErrors.length > 0 && (
                  <ul className="grid gap-1 text-xs text-[var(--color-error-fg)]">
                    {actionErrors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                )}

                {renderSteps(
                  action.steps,
                  {
                    path: [...actionPath, "steps"],
                    label: `${action.label || `Button ${index + 1}`} nested`,
                    controlFlowDepth: context.controlFlowDepth,
                    minimumSteps: 1,
                    nested: true,
                  },
                  (steps) => updateAction(index, { ...action, steps }),
                )}
              </div>
            )}
          </div>
        )
      })}

      <Button
        className="justify-self-start whitespace-nowrap"
        disabled={actions.length >= 5 || totalStepCount >= AUTOMATION_MAX_STEPS}
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => {
          const action = createSurfaceActionEditorState(
            actions.map(({ id }) => id),
          )
          setExpanded((current) => new Set([...current, action.editorKey]))
          onChange([...actions, action])
        }}
      >
        <Plus className="h-4 w-4" />
        Add button
      </Button>
    </div>
  )
}
