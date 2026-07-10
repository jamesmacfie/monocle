import type { Selector } from "../../../../shared/types/workflow"
import { Checkbox, Input, Select } from "../../../components/ui"
import { EditorField as Field } from "../components/EditorField"
import { SelectorFields } from "../SelectorFields"
import {
  createDefaultSelector,
  type StepEditorMap,
  type StepFormProps,
} from "./types"

function ExpectNavigationToggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      Wait for the page to load after this
    </label>
  )
}

function ClickForm(props: StepFormProps<"click">) {
  const { step, update } = props
  return (
    <>
      <Field label="Target">
        <SelectorFields
          showIndex
          value={step.target}
          onChange={(target) => update({ ...step, target })}
        />
      </Field>
      <ExpectNavigationToggle
        checked={step.expectNavigation === true}
        onChange={(checked) => {
          const next = { ...step }
          if (checked) next.expectNavigation = true
          else delete next.expectNavigation
          update(next)
        }}
      />
    </>
  )
}

function FillForm({ step, update }: StepFormProps<"fill">) {
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
          onChange={(event) => update({ ...step, text: event.target.value })}
        />
      </Field>
    </>
  )
}

function SelectForm({ step, update }: StepFormProps<"select">) {
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
              placeholder={mode === "value" ? "Option value" : "Option label"}
              value={
                mode === "value" ? (step.by.value ?? "") : (step.by.label ?? "")
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

type TargetOnlyOp = "check" | "uncheck" | "focus" | "blur" | "hover"

function TargetOnlyForm({
  target,
  onChange,
}: {
  target: Selector
  onChange: (target: Selector) => void
}) {
  return (
    <Field label="Target">
      <SelectorFields value={target} onChange={onChange} />
    </Field>
  )
}

function SubmitForm(props: StepFormProps<"submit">) {
  const { step, update } = props
  return (
    <>
      <Field label="Target">
        <SelectorFields
          value={step.target}
          onChange={(target) => update({ ...step, target })}
        />
      </Field>
      <ExpectNavigationToggle
        checked={step.expectNavigation === true}
        onChange={(checked) => {
          const next = { ...step }
          if (checked) next.expectNavigation = true
          else delete next.expectNavigation
          update(next)
        }}
      />
    </>
  )
}

function ScrollForm({ step, update }: StepFormProps<"scroll">) {
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

type InteractionOp =
  | "click"
  | "fill"
  | "select"
  | TargetOnlyOp
  | "submit"
  | "scroll"

export const interactionStepEditors = {
  click: {
    label: "Click element",
    createDefault: () => ({ op: "click", target: createDefaultSelector() }),
    Form: ClickForm,
  },
  fill: {
    label: "Fill field",
    createDefault: () => ({
      op: "fill",
      target: createDefaultSelector(),
      text: "",
    }),
    Form: FillForm,
  },
  select: {
    label: "Select dropdown option",
    createDefault: () => ({
      op: "select",
      target: createDefaultSelector(),
      by: { value: "" },
    }),
    Form: SelectForm,
  },
  check: {
    label: "Check checkbox",
    createDefault: () => ({ op: "check", target: createDefaultSelector() }),
    Form: ({ step, update }) => (
      <TargetOnlyForm
        target={step.target}
        onChange={(target) => update({ ...step, target })}
      />
    ),
  },
  uncheck: {
    label: "Uncheck checkbox",
    createDefault: () => ({ op: "uncheck", target: createDefaultSelector() }),
    Form: ({ step, update }) => (
      <TargetOnlyForm
        target={step.target}
        onChange={(target) => update({ ...step, target })}
      />
    ),
  },
  submit: {
    label: "Submit form",
    createDefault: () => ({ op: "submit", target: createDefaultSelector() }),
    Form: SubmitForm,
  },
  focus: {
    label: "Focus element",
    createDefault: () => ({ op: "focus", target: createDefaultSelector() }),
    Form: ({ step, update }) => (
      <TargetOnlyForm
        target={step.target}
        onChange={(target) => update({ ...step, target })}
      />
    ),
  },
  blur: {
    label: "Blur element",
    createDefault: () => ({ op: "blur", target: createDefaultSelector() }),
    Form: ({ step, update }) => (
      <TargetOnlyForm
        target={step.target}
        onChange={(target) => update({ ...step, target })}
      />
    ),
  },
  hover: {
    label: "Hover element",
    createDefault: () => ({ op: "hover", target: createDefaultSelector() }),
    Form: ({ step, update }) => (
      <TargetOnlyForm
        target={step.target}
        onChange={(target) => update({ ...step, target })}
      />
    ),
  },
  scroll: {
    label: "Scroll",
    createDefault: () => ({ op: "scroll", to: "bottom" }),
    Form: ScrollForm,
  },
} satisfies StepEditorMap<InteractionOp>
