import { Eye, EyeOff, RotateCcw, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  loadSettingsCatalog,
  selectSettingsCatalogCommands,
  selectSettingsCatalogError,
  selectSettingsCatalogLoading,
  selectSettingsCatalogUpdatingIds,
  setCatalogCommandFavorite,
  setCatalogCommandHidden,
} from "../../shared/store/slices/settingsCatalog.slice"
import { CommandCatalogRows } from "../components/CommandCatalogRows"
import { Button, Checkbox, Input, Panel, Select } from "../components/ui"
import { useCatalogCommandActions } from "../hooks/useCatalogCommandActions"
import {
  getCategoryOptions,
  groupByCatalogSection,
  matchesCommandQuery,
} from "../lib/catalog"

type HiddenFilter = "all" | "visible" | "hidden"

export function CommandsPage() {
  const dispatch = useAppDispatch()
  const commands = useAppSelector(selectSettingsCatalogCommands)
  const loading = useAppSelector(selectSettingsCatalogLoading)
  const error = useAppSelector(selectSettingsCatalogError)
  const updatingIds = useAppSelector(selectSettingsCatalogUpdatingIds)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [hiddenFilter, setHiddenFilter] = useState<HiddenFilter>("all")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sectionExpansion, setSectionExpansion] = useState<
    Record<string, boolean>
  >({})
  const { dialogs, editKeybinding, editUrlRules } = useCatalogCommandActions()

  const normalizedQuery = query.trim().toLowerCase()
  const categories = useMemo(() => getCategoryOptions(commands), [commands])

  const filteredCommands = useMemo(() => {
    return commands.filter((command) => {
      if (category !== "all" && command.categoryId !== category) {
        return false
      }

      if (hiddenFilter === "visible" && command.settings.hidden === true) {
        return false
      }

      if (hiddenFilter === "hidden" && command.settings.hidden !== true) {
        return false
      }

      return matchesCommandQuery(command, normalizedQuery)
    })
  }, [category, commands, hiddenFilter, normalizedQuery])
  const sections = useMemo(
    () => groupByCatalogSection(filteredCommands),
    [filteredCommands],
  )

  const filteredIds = filteredCommands.map((command) => command.id)
  const selectedFilteredIds = selectedIds.filter((id) =>
    filteredIds.includes(id),
  )
  const allFilteredSelected =
    filteredIds.length > 0 && selectedFilteredIds.length === filteredIds.length

  const setSelected = (commandId: string, selected: boolean) => {
    setSelectedIds((current) =>
      selected
        ? Array.from(new Set([...current, commandId]))
        : current.filter((id) => id !== commandId),
    )
  }

  const bulkSetHidden = (hidden: boolean) => {
    for (const commandId of selectedFilteredIds) {
      void dispatch(setCatalogCommandHidden({ commandId, hidden }))
    }
    setSelectedIds([])
  }

  const isSectionExpanded = (section: (typeof sections)[number]) => {
    if (normalizedQuery) {
      return true
    }

    return sectionExpansion[section.id] ?? !section.defaultCollapsed
  }

  const toggleSection = (section: (typeof sections)[number]) => {
    setSectionExpansion((current) => ({
      ...current,
      [section.id]: !isSectionExpanded(section),
    }))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Commands</h1>
          <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {commands.length} commands
          </div>
        </div>
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
      </header>

      <Panel className="p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_180px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-muted)]" />
            <Input
              aria-label="Search commands"
              className="pl-9"
              placeholder="Search commands"
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
            aria-label="Visibility"
            value={hiddenFilter}
            onChange={(event) =>
              setHiddenFilter(event.target.value as HiddenFilter)
            }
          >
            <option value="all">All visibility</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </Select>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button
              disabled={selectedFilteredIds.length === 0}
              type="button"
              variant="secondary"
              onClick={() => bulkSetHidden(true)}
            >
              <EyeOff className="h-4 w-4" />
              Hide
            </Button>
            <Button
              disabled={selectedFilteredIds.length === 0}
              type="button"
              variant="secondary"
              onClick={() => bulkSetHidden(false)}
            >
              <Eye className="h-4 w-4" />
              Show
            </Button>
          </div>
        </div>
      </Panel>

      {error && (
        <div className="rounded-md border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-fg)]">
          {error}
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto options-scrollbar">
          <table className="w-full min-w-[980px] table-fixed border-collapse">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-36" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-52" />
              <col className="w-32" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-fg-muted)]">
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    aria-label="Select all"
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
                <th className="w-28 px-3 py-3">Hidden</th>
                <th className="w-28 px-3 py-3">Favorite</th>
                <th className="w-52 px-3 py-3">Shortcut</th>
                <th className="w-32 px-3 py-3">URL Rules</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <CommandCatalogRows
                  key={section.id}
                  expanded={isSectionExpanded(section)}
                  groupLabel={section.label}
                  items={section.items}
                  selectedIds={selectedIds}
                  updatingIds={updatingIds}
                  onToggle={() => toggleSection(section)}
                  onSelect={setSelected}
                  onHiddenChange={(command, hidden) => {
                    void dispatch(
                      setCatalogCommandHidden({
                        commandId: command.id,
                        hidden,
                      }),
                    )
                  }}
                  onFavoriteChange={(command, favorite) => {
                    void dispatch(
                      setCatalogCommandFavorite({
                        commandId: command.id,
                        favorite,
                      }),
                    )
                  }}
                  onEditKeybinding={editKeybinding}
                  onEditUrlRules={editUrlRules}
                />
              ))}
            </tbody>
          </table>
        </div>
        {filteredCommands.length === 0 && (
          <div className="p-8 text-center text-sm text-[var(--color-fg-muted)]">
            No commands
          </div>
        )}
      </Panel>

      {dialogs}
    </div>
  )
}
