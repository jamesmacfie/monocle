import { Checkbox, Input, Select, Textarea } from "../../../components/ui"
import { EditorField as Field } from "../components/EditorField"
import { SelectorFields } from "../SelectorFields"
import {
  createDefaultSelector,
  type StepEditorMap,
  type StepFormProps,
} from "./types"

function ToastForm({ step, update }: StepFormProps<"toast">) {
  return (
    <div className="flex flex-wrap gap-2">
      <Field label="Level">
        <Select
          value={step.level ?? "info"}
          onChange={(event) =>
            update({
              ...step,
              level: event.target.value as "info" | "success" | "error",
            })
          }
        >
          <option value="info">Info</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </Select>
      </Field>
      <Field label="Message">
        <Input
          className="min-w-64"
          placeholder="Message (supports {{variables}})"
          value={step.message}
          onChange={(event) => update({ ...step, message: event.target.value })}
        />
      </Field>
    </div>
  )
}

function SetVariableForm({ step, update }: StepFormProps<"setVariable">) {
  return (
    <div className="flex flex-wrap gap-2">
      <Field label="Variable">
        <Input
          className="w-44"
          placeholder="variableName"
          value={step.name}
          onChange={(event) => update({ ...step, name: event.target.value })}
        />
      </Field>
      <Field label="Value">
        <Input
          className="min-w-64"
          placeholder="Value (supports {{variables}})"
          value={step.value}
          onChange={(event) => update({ ...step, value: event.target.value })}
        />
      </Field>
    </div>
  )
}

function InsertSnippetForm({
  step,
  snippets,
  update,
}: StepFormProps<"insertSnippet">) {
  return (
    <>
      <Field label="Snippet">
        <Select
          value={step.snippetId}
          onChange={(event) =>
            update({ ...step, snippetId: event.target.value })
          }
        >
          <option value="">Select a snippet…</option>
          {snippets.map((snippet) => (
            <option key={snippet.id} value={snippet.id}>
              {snippet.name}
            </option>
          ))}
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
        Insert into a specific element (otherwise the focused field)
      </label>
      {step.target && (
        <Field label="Target">
          <SelectorFields
            value={step.target}
            onChange={(target) => update({ ...step, target })}
          />
        </Field>
      )}
    </>
  )
}

function NavigateForm({ step, update }: StepFormProps<"navigate">) {
  return (
    <Field label="URL">
      <Input
        placeholder="https://example.com (supports {{variables}})"
        value={step.url}
        onChange={(event) => update({ ...step, url: event.target.value })}
      />
    </Field>
  )
}

function OpenUrlForm({ step, update }: StepFormProps<"openUrl">) {
  return (
    <>
      <Field label="URL">
        <Input
          placeholder="https://example.com (supports {{variables}})"
          value={step.url}
          onChange={(event) => update({ ...step, url: event.target.value })}
        />
      </Field>
      <Field label="Open in">
        <Select
          value={step.disposition ?? "newTab"}
          onChange={(event) =>
            update({
              ...step,
              disposition: event.target.value as
                | "currentTab"
                | "newTab"
                | "newWindow",
            })
          }
        >
          <option value="newTab">New tab</option>
          <option value="currentTab">Current tab</option>
          <option value="newWindow">New window</option>
        </Select>
      </Field>
    </>
  )
}

function ClipboardWriteForm({ step, update }: StepFormProps<"clipboardWrite">) {
  return (
    <Field label="Text">
      <Textarea
        placeholder="Text to copy (supports {{variables}})"
        rows={3}
        value={step.text}
        onChange={(event) => update({ ...step, text: event.target.value })}
      />
    </Field>
  )
}

function RunCommandForm({ step, update }: StepFormProps<"runCommand">) {
  return (
    <Field label="Command id">
      <Input
        placeholder="e.g. new-tab"
        value={step.commandId}
        onChange={(event) => update({ ...step, commandId: event.target.value })}
      />
      <span className="text-xs text-[var(--color-fg-muted)]">
        Use the command's id from the Commands page. Destructive commands are
        blocked, and automatic triggers can only run an allowlisted subset.
      </span>
    </Field>
  )
}

type EngineFormOp =
  | "toast"
  | "setVariable"
  | "insertSnippet"
  | "navigate"
  | "openUrl"
  | "clipboardWrite"
  | "runCommand"

export const engineStepEditors = {
  toast: {
    label: "Show toast",
    createDefault: () => ({ op: "toast", message: "" }),
    Form: ToastForm,
  },
  setVariable: {
    label: "Set variable",
    createDefault: () => ({ op: "setVariable", name: "", value: "" }),
    Form: SetVariableForm,
  },
  insertSnippet: {
    label: "Insert snippet",
    createDefault: () => ({ op: "insertSnippet", snippetId: "" }),
    Form: InsertSnippetForm,
  },
  navigate: {
    label: "Navigate this tab",
    createDefault: () => ({ op: "navigate", url: "" }),
    Form: NavigateForm,
  },
  openUrl: {
    label: "Open URL",
    createDefault: () => ({ op: "openUrl", url: "" }),
    Form: OpenUrlForm,
  },
  clipboardWrite: {
    label: "Write to clipboard",
    createDefault: () => ({ op: "clipboardWrite", text: "" }),
    Form: ClipboardWriteForm,
  },
  runCommand: {
    label: "Run Monocle command",
    createDefault: () => ({ op: "runCommand", commandId: "" }),
    Form: RunCommandForm,
  },
} satisfies StepEditorMap<EngineFormOp>
