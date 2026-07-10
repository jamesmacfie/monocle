import { Input, Select } from "../../../components/ui"
import { EditorField as Field } from "../components/EditorField"
import { SelectorFields } from "../SelectorFields"
import {
  createDefaultSelector,
  type StepEditorMap,
  type StepFormProps,
} from "./types"

function WaitForm({ step, update }: StepFormProps<"wait">) {
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
                    ? { selector: createDefaultSelector(), state: "visible" }
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
              update({ ...step, for: { urlIncludes: event.target.value } })
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

function GetTextForm({ step, update }: StepFormProps<"getText">) {
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
            onChange={(event) => update({ ...step, toVar: event.target.value })}
          />
        </Field>
      </div>
    </>
  )
}

type ObservationOp = "wait" | "getText"

export const observationStepEditors = {
  wait: {
    label: "Wait",
    createDefault: () => ({ op: "wait", for: { timeMs: 500 } }),
    Form: WaitForm,
  },
  getText: {
    label: "Read text into variable",
    createDefault: () => ({
      op: "getText",
      from: createDefaultSelector(),
      toVar: "result",
    }),
    Form: GetTextForm,
  },
} satisfies StepEditorMap<ObservationOp>
