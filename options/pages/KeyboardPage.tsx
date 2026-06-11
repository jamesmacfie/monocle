import {
  Keyboard,
  LayoutTemplate,
  RotateCcw,
  Search,
  Undo2,
} from "lucide-react"
import { useMemo, useState } from "react"
import { KeybindingDisplay } from "../../shared/components/KeybindingDisplay"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  loadSettingsCatalog,
  selectSettingsCatalogCommands,
  selectSettingsCatalogError,
  selectSettingsCatalogLoading,
  selectSettingsCatalogUpdatingIds,
  setCatalogCommandKeybinding,
  setCatalogCommandKeybindings,
} from "../../shared/store/slices/settingsCatalog.slice"
import { CommandIdentity } from "../components/CommandIdentity"
import { KeybindingTemplateDialog } from "../components/KeybindingTemplateDialog"
import { Badge, Button, Checkbox, Input, Panel, Select } from "../components/ui"
import { useCatalogCommandActions } from "../hooks/useCatalogCommandActions"
import {
  getCategoryOptions,
  hasCustomKeybinding,
  matchesCommandQuery,
} from "../lib/catalog"

type BindingFilter = "all" | "custom" | "default" | "unbound"

const getBindingSource = (command: {
  settings: { keybinding?: string }
  defaultKeybinding?: string
  effectiveKeybinding?: string
}) => {
  if (command.settings.keybinding) {
    return "Custom"
  }

  if (command.defaultKeybinding) {
    return "Default"
  }

  return "Unbound"
}

export function KeyboardPage() {
  const dispatch = useAppDispatch()
  const commands = useAppSelector(selectSettingsCatalogCommands)
  const loading = useAppSelector(selectSettingsCatalogLoading)
  const error = useAppSelector(selectSettingsCatalogError)
  const updatingIds = useAppSelector(selectSettingsCatalogUpdatingIds)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [bindingFilter, setBindingFilter] = useState<BindingFilter>("all")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const { dialogs, editKeybinding } = useCatalogCommandActions()

  const keybindingCommands = useMemo(
    () => commands.filter((command) => command.capabilities.canSetKeybinding),
    [commands],
  )
  const categories = useMemo(
    () => getCategoryOptions(keybindingCommands),
    [keybindingCommands],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const filteredCommands = useMemo(() => {
    return keybindingCommands.filter((command) => {
      if (category !== "all" && command.categoryId !== category) {
        return false
      }

      if (bindingFilter === "custom" && !hasCustomKeybinding(command)) {
        return false
      }

      if (
        bindingFilter === "default" &&
        (hasCustomKeybinding(command) || !command.defaultKeybinding)
      ) {
        return false
      }

      if (bindingFilter === "unbound" && command.effectiveKeybinding) {
        return false
      }

      return matchesCommandQuery(command, normalizedQuery)
    })
  }, [bindingFilter, category, keybindingCommands, normalizedQuery])

  const filteredIds = filteredCommands.map((command) => command.id)
  const selectedFilteredIds = selectedIds.filter((id) =>
    filteredIds.includes(id),
  )
  const selectedCustomIds = selectedFilteredIds.filter((id) => {
    const command = commands.find((candidate) => candidate.id === id)
    return command ? hasCustomKeybinding(command) : false
  })
  const allFilteredSelected =
    filteredIds.length > 0 && selectedFilteredIds.length === filteredIds.length

  const resetKeybindings = (commandIds: string[]) => {
    for (const commandId of commandIds) {
      void dispatch(
        setCatalogCommandKeybinding({
          commandId,
          keybinding: null,
        }),
      )
    }
    setSelectedIds([])
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Keyboard</h1>
          <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {keybindingCommands.length} commands can use shortcuts
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={loading}
            type="button"
            variant="secondary"
            onClick={() => setTemplateDialogOpen(true)}
          >
            <LayoutTemplate className="h-4 w-4" />
            Use Template
          </Button>
          <Button
            disabled={selectedCustomIds.length === 0}
            type="button"
            variant="secondary"
            onClick={() => resetKeybindings(selectedCustomIds)}
          >
            <Undo2 className="h-4 w-4" />
            Reset
          </Button>
          <Button
            disabled={loading}
            type="button"
            variant="secondary"
            onClick={() => {
              void dispatch(loadSettingsCatalog())
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      <Panel className="p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_180px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-muted)]" />
            <Input
              aria-label="Search keyboard shortcuts"
              className="pl-9"
              placeholder="Search shortcuts"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Select
            aria-label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {categories.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Binding"
            value={bindingFilter}
            onChange={(event) =>
              setBindingFilter(event.target.value as BindingFilter)
            }
          >
            <option value="all">All bindings</option>
            <option value="custom">Custom</option>
            <option value="default">Default</option>
            <option value="unbound">Unbound</option>
          </Select>
        </div>
      </Panel>

      {error && (
        <div className="rounded-md border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-fg)]">
          {error}
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto options-scrollbar">
          <table className="w-full min-w-[900px] table-fixed border-collapse">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-36" />
              <col className="w-56" />
              <col className="w-28" />
              <col className="w-36" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-fg-muted)]">
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    aria-label="Select all shortcuts"
                    checked={allFilteredSelected}
                    onCheckedChange={(checked) => {
                      setSelectedIds(
                        checked
                          ? Array.from(
                              new Set([...selectedIds, ...filteredIds]),
                            )
                          : selectedIds.filter(
                              (id) => !filteredIds.includes(id),
                            ),
                      )
                    }}
                  />
                </th>
                <th className="px-3 py-3">Command</th>
                <th className="w-36 px-3 py-3">Category</th>
                <th className="w-56 px-3 py-3">Shortcut</th>
                <th className="w-28 px-3 py-3">Source</th>
                <th className="w-36 px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCommands.map((command) => {
                const updating = updatingIds.includes(command.id)
                const source = getBindingSource(command)

                return (
                  <tr
                    key={command.id}
                    className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-hover)]"
                  >
                    <td className="px-4 py-3 align-middle">
                      <Checkbox
                        aria-label={`Select ${command.name}`}
                        checked={selectedIds.includes(command.id)}
                        onCheckedChange={(checked) => {
                          setSelectedIds((current) =>
                            checked === true
                              ? Array.from(new Set([...current, command.id]))
                              : current.filter((id) => id !== command.id),
                          )
                        }}
                      />
                    </td>
                    <td className="min-w-0 overflow-hidden px-3 py-3">
                      <CommandIdentity command={command} />
                    </td>
                    <td className="px-3 py-3">
                      <Badge>{command.categoryLabel}</Badge>
                    </td>
                    <td className="overflow-hidden px-3 py-3">
                      {command.effectiveKeybinding ? (
                        <KeybindingDisplay
                          className="min-w-0 max-w-full overflow-hidden"
                          keybinding={command.effectiveKeybinding}
                        />
                      ) : (
                        <span className="text-sm text-[var(--color-fg-muted)]">
                          None
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge>{source}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <Button
                          aria-label={`Edit shortcut for ${command.name}`}
                          disabled={updating}
                          size="icon"
                          type="button"
                          variant="secondary"
                          onClick={() => editKeybinding(command)}
                        >
                          <Keyboard className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={`Reset shortcut for ${command.name}`}
                          disabled={updating || !hasCustomKeybinding(command)}
                          size="icon"
                          type="button"
                          variant="ghost"
                          onClick={() => resetKeybindings([command.id])}
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredCommands.length === 0 && (
          <div className="p-8 text-center text-sm text-[var(--color-fg-muted)]">
            No shortcuts
          </div>
        )}
      </Panel>

      {dialogs}
      <KeybindingTemplateDialog
        commands={keybindingCommands}
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        onApply={async (operations) => {
          await dispatch(
            setCatalogCommandKeybindings({
              updates: operations,
            }),
          ).unwrap()
        }}
      />
    </div>
  )
}
