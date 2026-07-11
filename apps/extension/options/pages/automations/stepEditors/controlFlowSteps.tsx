import { Input, Select } from "../../../components/ui"
import { ConditionEditor, createDefaultCondition } from "../ConditionEditor"
import { EditorField as Field } from "../components/EditorField"
import { SelectorFields } from "../SelectorFields"
import type { StepEditorMap, StepFormProps } from "./types"

function BranchForm({
  step,
  update,
  path,
  validationIssues,
}: StepFormProps<"branch">) {
  return (
    <ConditionEditor
      condition={step.if}
      issues={validationIssues}
      label="Run Then steps when"
      path={[...path, "if"]}
      onChange={(condition) => update({ ...step, if: condition })}
    />
  )
}

function ForEachForm({ step, update }: StepFormProps<"forEach">) {
  const source = "elements" in step.over ? "elements" : "variable"
  return (
    <>
      <Field label="Iterate over">
        <Select
          value={source}
          onChange={(event) =>
            update({
              ...step,
              over:
                event.target.value === "elements"
                  ? { elements: { strategy: "css", value: "" } }
                  : { variable: "items" },
            })
          }
        >
          <option value="elements">Matching elements</option>
          <option value="variable">Variable lines</option>
        </Select>
      </Field>
      {"elements" in step.over ? (
        <Field label="Elements">
          <SelectorFields
            showIndex
            value={step.over.elements}
            onChange={(elements) => update({ ...step, over: { elements } })}
          />
        </Field>
      ) : (
        <Field label="Variable">
          <Input
            value={step.over.variable}
            onChange={(event) =>
              update({ ...step, over: { variable: event.target.value } })
            }
          />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Item variable">
          <Input
            placeholder="item"
            value={step.as ?? ""}
            onChange={(event) =>
              update({ ...step, as: event.target.value || undefined })
            }
          />
        </Field>
        <Field label="Maximum iterations">
          <Input
            max={1000}
            min={1}
            placeholder="50"
            type="number"
            value={step.maxIterations ?? ""}
            onChange={(event) =>
              update({
                ...step,
                maxIterations: event.target.value
                  ? Number(event.target.value)
                  : undefined,
              })
            }
          />
        </Field>
      </div>
    </>
  )
}

function WhileForm({
  step,
  update,
  path,
  validationIssues,
}: StepFormProps<"while">) {
  return (
    <>
      <ConditionEditor
        condition={step.condition}
        issues={validationIssues}
        label="Continue while"
        path={[...path, "condition"]}
        onChange={(condition) => update({ ...step, condition })}
      />
      <Field label="Maximum iterations">
        <Input
          className="max-w-40"
          max={1000}
          min={1}
          placeholder="50"
          type="number"
          value={step.maxIterations ?? ""}
          onChange={(event) =>
            update({
              ...step,
              maxIterations: event.target.value
                ? Number(event.target.value)
                : undefined,
            })
          }
        />
      </Field>
    </>
  )
}

type ControlFlowOp = "branch" | "forEach" | "while"

export const controlFlowStepEditors = {
  branch: {
    label: "Branch",
    createDefault: () => ({
      op: "branch",
      if: createDefaultCondition(),
      then: [{ op: "toast", message: "Matched" }],
    }),
    Form: BranchForm,
  },
  forEach: {
    label: "For each",
    createDefault: () => ({
      op: "forEach",
      over: { elements: { strategy: "css", value: "li" } },
      as: "item",
      maxIterations: 50,
      steps: [{ op: "toast", message: "{{item}}" }],
    }),
    Form: ForEachForm,
  },
  while: {
    label: "While",
    createDefault: () => ({
      op: "while",
      condition: createDefaultCondition(),
      maxIterations: 50,
      steps: [{ op: "wait", for: { timeMs: 500 } }],
    }),
    Form: WhileForm,
  },
} satisfies StepEditorMap<ControlFlowOp>
