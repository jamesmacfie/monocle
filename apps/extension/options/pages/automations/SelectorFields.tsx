// Architecture: options/ page-local UI for the Automations builder. Edits a
// workflow `Selector` (shared/types/workflow.ts) — strategy, value, optional
// match index — as a compact field group reused by step rows and the
// elementAppears trigger. Extra selector facets (text `exact`/`within`) are
// preserved by spreading, never dropped.
import type { Selector } from "../../../shared/types/workflow"
import { Input, Select } from "../../components/ui"

type SelectorFieldsProps = {
  value: Selector
  onChange: (next: Selector) => void
  showIndex?: boolean
}

export function SelectorFields({
  value,
  onChange,
  showIndex = false,
}: SelectorFieldsProps) {
  const handleIndexChange = (raw: string) => {
    const next = { ...value }
    const parsed = Number.parseInt(raw, 10)
    if (raw === "" || Number.isNaN(parsed)) {
      delete next.index
    } else {
      next.index = parsed
    }
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Selector strategy"
        value={value.strategy}
        onChange={(event) => {
          const strategy = event.target.value as Selector["strategy"]
          if (strategy === value.strategy) {
            return
          }
          onChange(
            strategy === "css"
              ? {
                  strategy: "css",
                  value: value.value,
                  ...(value.index !== undefined ? { index: value.index } : {}),
                }
              : {
                  strategy: "text",
                  value: value.value,
                  ...(value.index !== undefined ? { index: value.index } : {}),
                },
          )
        }}
      >
        <option value="css">CSS</option>
        <option value="text">Text</option>
      </Select>
      <Input
        aria-label="Selector value"
        className="min-w-40 flex-1"
        placeholder={
          value.strategy === "css" ? "e.g. button.submit" : "Visible text"
        }
        value={value.value}
        onChange={(event) => onChange({ ...value, value: event.target.value })}
      />
      {showIndex && (
        <Input
          aria-label="Match index"
          className="w-20"
          min={0}
          placeholder="Index"
          type="number"
          value={value.index ?? ""}
          onChange={(event) => handleIndexChange(event.target.value)}
        />
      )}
    </div>
  )
}
