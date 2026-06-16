import { Palette } from "lucide-react"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  selectThemeMode,
  updateThemeMode,
} from "../../shared/store/slices/settings.slice"
import type { ThemeMode } from "../../shared/types"
import { Panel, Select } from "../components/ui"

const themeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "solarized-light", label: "Solarized Light" },
  { value: "solarized-dark", label: "Solarized Dark" },
  { value: "monokai", label: "Monokai" },
  { value: "nord", label: "Nord" },
  { value: "catppuccin-latte", label: "Catppuccin Latte" },
  { value: "catppuccin-frappe", label: "Catppuccin Frappe" },
  { value: "catppuccin-macchiato", label: "Catppuccin Macchiato" },
  { value: "catppuccin-mocha", label: "Catppuccin Mocha" },
  { value: "one-dark", label: "One Dark" },
  { value: "dracula", label: "Dracula" },
]

export function GeneralPage() {
  const dispatch = useAppDispatch()
  const themeMode = useAppSelector(selectThemeMode)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">General</h1>
      </header>

      <Panel>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium">Theme</div>
              <div className="text-sm text-[var(--color-fg-muted)]">
                {themeOptions.find((option) => option.value === themeMode)
                  ?.label ?? "System"}
              </div>
            </div>
          </div>
          <Select
            aria-label="Theme"
            className="w-full sm:w-64"
            value={themeMode}
            onChange={(event) => {
              void dispatch(updateThemeMode(event.target.value as ThemeMode))
            }}
          >
            {themeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </Panel>
    </div>
  )
}
