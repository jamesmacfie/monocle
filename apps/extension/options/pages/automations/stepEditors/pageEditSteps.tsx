import type { Selector } from "../../../../shared/types/workflow"
import { Checkbox, Textarea } from "../../../components/ui"
import { EditorField as Field } from "../components/EditorField"
import { SelectorFields } from "../SelectorFields"
import {
  createDefaultSelector,
  type StepEditorMap,
  type StepFormProps,
} from "./types"

type ElementEditOp = "removeElement" | "hideElement"

function ElementEditForm({
  target,
  all,
  onTargetChange,
  onAllChange,
}: {
  target: Selector
  all: boolean
  onTargetChange: (target: Selector) => void
  onAllChange: (all: boolean) => void
}) {
  return (
    <>
      <Field label="Target">
        <SelectorFields value={target} onChange={onTargetChange} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={all}
          onCheckedChange={(checked) => onAllChange(checked === true)}
        />
        Apply to every match, not just the first
      </label>
    </>
  )
}

function InjectCssForm({ step, update }: StepFormProps<"injectCss">) {
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
}

type PageEditOp = ElementEditOp | "injectCss"

export const pageEditStepEditors = {
  removeElement: {
    label: "Remove element",
    createDefault: () => ({
      op: "removeElement",
      target: createDefaultSelector(),
    }),
    Form: ({ step, update }) => (
      <ElementEditForm
        all={step.all === true}
        target={step.target}
        onAllChange={(all) => {
          const next = { ...step }
          if (all) next.all = true
          else delete next.all
          update(next)
        }}
        onTargetChange={(target) => update({ ...step, target })}
      />
    ),
  },
  hideElement: {
    label: "Hide element",
    createDefault: () => ({
      op: "hideElement",
      target: createDefaultSelector(),
    }),
    Form: ({ step, update }) => (
      <ElementEditForm
        all={step.all === true}
        target={step.target}
        onAllChange={(all) => {
          const next = { ...step }
          if (all) next.all = true
          else delete next.all
          update(next)
        }}
        onTargetChange={(target) => update({ ...step, target })}
      />
    ),
  },
  injectCss: {
    label: "Inject CSS",
    createDefault: () => ({ op: "injectCss", css: "" }),
    Form: InjectCssForm,
  },
} satisfies StepEditorMap<PageEditOp>
