// Architecture: options/ page-local UI for the Automations builder. Edits
// the draft's declared variables (shared/types/userScripts.ts
// UserScriptVarDef): name plus kind — a literal value, a snippet reference
// picked from the snippets slice, or a runtime slot filled by
// getText/setVariable steps. Edits pure `VarRowState` data; duplicate-name
// and name-format errors surface through the page's assembly/validation.
import { Plus, Trash2 } from "lucide-react"
import type { Snippet, UserScriptVarDef } from "../../../shared/types"
import { Button, Input, Select } from "../../components/ui"
import type { VarRowState } from "./editorState"

type VariablesEditorProps = {
  rows: VarRowState[]
  snippets: Snippet[]
  onChange: (rows: VarRowState[]) => void
}

export function VariablesEditor({
  rows,
  snippets,
  onChange,
}: VariablesEditorProps) {
  const replaceRow = (index: number, row: VarRowState) => {
    const next = [...rows]
    next[index] = row
    onChange(next)
  }

  const setKind = (index: number, kind: UserScriptVarDef["kind"]) => {
    const def: UserScriptVarDef =
      kind === "literal"
        ? { kind: "literal", value: "" }
        : kind === "snippet"
          ? { kind: "snippet", snippetId: "" }
          : { kind: "runtime" }
    replaceRow(index, { ...rows[index], def })
  }

  return (
    <div className="grid gap-2">
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Variable name"
            className="w-44"
            placeholder="variableName"
            value={row.name}
            onChange={(event) =>
              replaceRow(index, { ...row, name: event.target.value })
            }
          />
          <Select
            aria-label="Variable kind"
            value={row.def.kind}
            onChange={(event) =>
              setKind(index, event.target.value as UserScriptVarDef["kind"])
            }
          >
            <option value="literal">Literal value</option>
            <option value="snippet">Snippet</option>
            <option value="runtime">Set at run time</option>
          </Select>
          {row.def.kind === "literal" && (
            <Input
              aria-label="Variable value"
              className="min-w-48 flex-1"
              placeholder="Value"
              value={row.def.value}
              onChange={(event) =>
                replaceRow(index, {
                  ...row,
                  def: { kind: "literal", value: event.target.value },
                })
              }
            />
          )}
          {row.def.kind === "snippet" && (
            <Select
              aria-label="Snippet"
              className="min-w-48 flex-1"
              value={row.def.snippetId}
              onChange={(event) =>
                replaceRow(index, {
                  ...row,
                  def: { kind: "snippet", snippetId: event.target.value },
                })
              }
            >
              <option value="">Select a snippet…</option>
              {snippets.map((snippet) => (
                <option key={snippet.id} value={snippet.id}>
                  {snippet.name}
                </option>
              ))}
            </Select>
          )}
          {row.def.kind === "runtime" && (
            <span className="text-xs text-[var(--color-fg-muted)]">
              Empty until a getText or setVariable step fills it
            </span>
          )}
          <Button
            aria-label="Delete variable"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            onChange([
              ...rows,
              { name: "", def: { kind: "literal", value: "" } },
            ])
          }
        >
          <Plus className="h-4 w-4" />
          Add Variable
        </Button>
      </div>
    </div>
  )
}
