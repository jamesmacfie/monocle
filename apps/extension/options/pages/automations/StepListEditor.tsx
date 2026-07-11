// Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4
import { Plus, Trash2 } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import type { AutomationStep, Snippet } from "../../../shared/types"
import { AUTOMATION_MAX_STEPS } from "../../../shared/types/automationValidation"
import { Button, Select } from "../../components/ui"
import { StepRow } from "./StepRow"
import { SurfaceActionsEditor } from "./SurfaceActionsEditor"
import {
  STEP_OP_OPTIONS,
  type StepListContext,
  type StepNodeState,
} from "./stepEditors"
import { createDefaultStepNode } from "./stepTree"
import {
  directMessagesForPath,
  type EditorValidationIssue,
  pathStartsWith,
} from "./validationPaths"

type StepListEditorProps = {
  nodes: StepNodeState[]
  context: StepListContext
  snippets: Snippet[]
  issues: EditorValidationIssue[]
  totalStepCount: number
  onChange: (nodes: StepNodeState[]) => void
}

const optionsForContext = (
  context: StepListContext,
): Array<{ op: AutomationStep["op"]; label: string }> =>
  STEP_OP_OPTIONS.filter((option) => {
    if (context.controlFlowDepth > 0 && option.op === "navigate") return false
    if (
      context.controlFlowDepth >= 3 &&
      (option.op === "branch" ||
        option.op === "forEach" ||
        option.op === "while")
    ) {
      return false
    }
    return true
  })

const nodeHasInvalidJson = (node: StepNodeState): boolean => {
  if (node.row.kind === "json" && node.row.error) return true
  if (node.children?.kind === "branch") {
    return [...node.children.then, ...(node.children.else ?? [])].some(
      nodeHasInvalidJson,
    )
  }
  if (node.children?.kind === "forEach" || node.children?.kind === "while") {
    return node.children.steps.some(nodeHasInvalidJson)
  }
  if (node.children?.kind === "surfaceActions") {
    return node.children.actions.some((action) =>
      action.steps.some(nodeHasInvalidJson),
    )
  }
  return false
}

export function StepListEditor({
  nodes,
  context,
  snippets,
  issues,
  totalStepCount,
  onChange,
}: StepListEditorProps) {
  const operationOptions = optionsForContext(context)
  const [addOp, setAddOp] = useState<AutomationStep["op"]>(
    operationOptions[0]?.op ?? "click",
  )
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(nodes[0] ? [nodes[0].editorKey] : []),
  )

  useEffect(() => {
    const invalidKeys = nodes
      .filter(
        (node, index) =>
          nodeHasInvalidJson(node) ||
          issues.some((issue) =>
            pathStartsWith(issue.path, [...context.path, index]),
          ),
      )
      .map((node) => node.editorKey)
    if (invalidKeys.length === 0) return
    setExpandedKeys((current) => {
      if (invalidKeys.every((key) => current.has(key))) return current
      return new Set([...current, ...invalidKeys])
    })
  }, [context.path, issues, nodes])

  const setNodeExpanded = (key: string, expanded: boolean): void =>
    setExpandedKeys((current) => {
      const next = new Set(current)
      if (expanded) next.add(key)
      else next.delete(key)
      return next
    })

  const renderNestedSteps = (
    steps: StepNodeState[],
    nestedContext: StepListContext,
    update: (steps: StepNodeState[]) => void,
  ): ReactNode => (
    <StepListEditor
      context={nestedContext}
      issues={issues}
      nodes={steps}
      snippets={snippets}
      totalStepCount={totalStepCount}
      onChange={update}
    />
  )

  const renderChildren = (node: StepNodeState, index: number): ReactNode => {
    const stepPath = [...context.path, index]
    if (node.children?.kind === "branch") {
      return (
        <div className="grid gap-3">
          {renderNestedSteps(
            node.children.then,
            {
              path: [...stepPath, "then"],
              label: "Then",
              controlFlowDepth: context.controlFlowDepth + 1,
              minimumSteps: 0,
              nested: true,
            },
            (then) =>
              onChange(
                nodes.map((entry, nodeIndex) =>
                  nodeIndex === index
                    ? {
                        ...node,
                        children:
                          node.children?.kind === "branch"
                            ? { ...node.children, then }
                            : node.children,
                      }
                    : entry,
                ),
              ),
          )}

          {node.children.else ? (
            <div className="grid gap-2">
              <div className="flex justify-end">
                <Button
                  className="whitespace-nowrap"
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    onChange(
                      nodes.map((entry, nodeIndex) => {
                        if (
                          nodeIndex !== index ||
                          node.children?.kind !== "branch"
                        ) {
                          return entry
                        }
                        const { else: _else, ...children } = node.children
                        return { ...node, children }
                      }),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  Remove Otherwise
                </Button>
              </div>
              {renderNestedSteps(
                node.children.else,
                {
                  path: [...stepPath, "else"],
                  label: "Otherwise",
                  controlFlowDepth: context.controlFlowDepth + 1,
                  minimumSteps: 0,
                  nested: true,
                },
                (elseSteps) =>
                  onChange(
                    nodes.map((entry, nodeIndex) =>
                      nodeIndex === index
                        ? {
                            ...node,
                            children:
                              node.children?.kind === "branch"
                                ? { ...node.children, else: elseSteps }
                                : node.children,
                          }
                        : entry,
                    ),
                  ),
              )}
            </div>
          ) : (
            <Button
              className="justify-self-start whitespace-nowrap"
              size="sm"
              type="button"
              variant="secondary"
              onClick={() =>
                onChange(
                  nodes.map((entry, nodeIndex) =>
                    nodeIndex === index
                      ? {
                          ...node,
                          children:
                            node.children?.kind === "branch"
                              ? { ...node.children, else: [] }
                              : node.children,
                        }
                      : entry,
                  ),
                )
              }
            >
              <Plus className="h-4 w-4" />
              Add Otherwise
            </Button>
          )}
        </div>
      )
    }

    if (node.children?.kind === "forEach" || node.children?.kind === "while") {
      const children = node.children
      return renderNestedSteps(
        children.steps,
        {
          path: [...stepPath, "steps"],
          label: children.kind === "forEach" ? "For each body" : "While body",
          controlFlowDepth: context.controlFlowDepth + 1,
          minimumSteps: 1,
          nested: true,
        },
        (steps) =>
          onChange(
            nodes.map((entry, nodeIndex) =>
              nodeIndex === index
                ? { ...node, children: { ...children, steps } }
                : entry,
            ),
          ),
      )
    }

    if (node.children?.kind === "surfaceActions") {
      return (
        <SurfaceActionsEditor
          actions={node.children.actions}
          context={{
            path: [...stepPath, "actions"],
            label: "Inline button actions",
            controlFlowDepth: context.controlFlowDepth,
            minimumSteps: 1,
            nested: true,
          }}
          issues={issues}
          renderSteps={renderNestedSteps}
          totalStepCount={totalStepCount}
          onChange={(actions) =>
            onChange(
              nodes.map((entry, nodeIndex) =>
                nodeIndex === index
                  ? {
                      ...node,
                      children: { kind: "surfaceActions", actions },
                    }
                  : entry,
              ),
            )
          }
        />
      )
    }

    return null
  }

  return (
    <div
      className={
        context.nested
          ? "grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-page)] p-3"
          : "grid gap-3"
      }
      data-automation-step-list={context.nested ? "nested" : "root"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {context.nested ? (
          <span className="text-xs font-medium text-[var(--color-fg-muted)]">
            Nested steps · {context.label}
          </span>
        ) : (
          <span className="text-xs text-[var(--color-fg-muted)]">
            Steps run from top to bottom.
          </span>
        )}
        <span className="text-xs tabular-nums text-[var(--color-fg-muted)]">
          {totalStepCount} / {AUTOMATION_MAX_STEPS}
        </span>
      </div>

      {nodes.length === 0 && (
        <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-fg-muted)]">
          No steps in this path yet.
        </div>
      )}

      {nodes.map((node, index) => {
        const childKeys =
          node.children?.kind === "branch"
            ? ["if", "then", "else"]
            : node.children?.kind === "surfaceActions"
              ? ["actions"]
              : node.children?.kind === "while"
                ? ["condition", "steps"]
                : node.children
                  ? ["steps"]
                  : []
        const rowErrors = directMessagesForPath(
          issues,
          [...context.path, index],
          childKeys,
        )
        return (
          <StepRow
            canDelete={nodes.length > context.minimumSteps}
            context={context}
            errors={rowErrors}
            index={index}
            isFirst={index === 0}
            isLast={index === nodes.length - 1}
            isExpanded={expandedKeys.has(node.editorKey)}
            key={node.editorKey}
            node={node}
            operationOptions={operationOptions}
            snippets={snippets}
            validationIssues={issues}
            onChange={(next) =>
              onChange(
                nodes.map((entry, nodeIndex) =>
                  nodeIndex === index ? next : entry,
                ),
              )
            }
            onDelete={() =>
              onChange(nodes.filter((_, nodeIndex) => nodeIndex !== index))
            }
            onExpandedChange={(expanded) =>
              setNodeExpanded(node.editorKey, expanded)
            }
            onMoveDown={() => {
              if (index >= nodes.length - 1) return
              const next = [...nodes]
              ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
              onChange(next)
            }}
            onMoveUp={() => {
              if (index === 0) return
              const next = [...nodes]
              ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
              onChange(next)
            }}
          >
            {renderChildren(node, index)}
          </StepRow>
        )
      })}

      <div
        className={
          context.nested
            ? "flex flex-col gap-2 border-t border-[var(--color-border)] pt-3 sm:flex-row sm:items-center"
            : "flex flex-col gap-2 sm:flex-row sm:items-center"
        }
      >
        <Select
          aria-label={`Step type to add to ${context.label}`}
          className="min-w-0 flex-1"
          value={addOp}
          onChange={(event) =>
            setAddOp(event.target.value as AutomationStep["op"])
          }
        >
          {operationOptions.map((option) => (
            <option key={option.op} value={option.op}>
              {option.label}
            </option>
          ))}
        </Select>
        <Button
          className="shrink-0 whitespace-nowrap"
          disabled={totalStepCount >= AUTOMATION_MAX_STEPS}
          type="button"
          variant="secondary"
          onClick={() => {
            const node = createDefaultStepNode(addOp)
            setNodeExpanded(node.editorKey, true)
            onChange([...nodes, node])
          }}
        >
          <Plus className="h-4 w-4" />
          Add Step
        </Button>
      </div>
      {context.controlFlowDepth >= 3 && (
        <p className="text-xs text-[var(--color-fg-muted)]">
          Maximum branch and loop nesting depth reached.
        </p>
      )}
    </div>
  )
}
