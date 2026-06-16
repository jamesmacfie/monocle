import { Globe2, Keyboard, RotateCcw, Search, StarOff } from "lucide-react"
import { useMemo, useState } from "react"
import { KeybindingDisplay } from "../../shared/components/KeybindingDisplay"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  loadSettingsCatalog,
  selectSettingsCatalogCommands,
  selectSettingsCatalogError,
  selectSettingsCatalogLoading,
  selectSettingsCatalogUpdatingIds,
  setCatalogCommandFavorite,
} from "../../shared/store/slices/settingsCatalog.slice"
import { CommandIdentity } from "../components/CommandIdentity"
import { Badge, Button, Checkbox, Input, Panel, Select } from "../components/ui"
import { useCatalogCommandActions } from "../hooks/useCatalogCommandActions"
import {
  formatUsageDate,
  getCategoryOptions,
  matchesCommandQuery,
} from "../lib/catalog"

export function FavoritesPage() {
  const dispatch = useAppDispatch()
  const commands = useAppSelector(selectSettingsCatalogCommands)
  const loading = useAppSelector(selectSettingsCatalogLoading)
  const error = useAppSelector(selectSettingsCatalogError)
  const updatingIds = useAppSelector(selectSettingsCatalogUpdatingIds)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const { dialogs, editKeybinding, editUrlRules } = useCatalogCommandActions()

  const favoriteCommands = useMemo(
    () => commands.filter((command) => command.isFavorite),
    [commands],
  )
  const categories = useMemo(
    () => getCategoryOptions(favoriteCommands),
    [favoriteCommands],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const filteredCommands = useMemo(() => {
    return favoriteCommands.filter((command) => {
      if (category !== "all" && command.categoryId !== category) {
        return false
      }

      return matchesCommandQuery(command, normalizedQuery)
    })
  }, [category, favoriteCommands, normalizedQuery])

  const filteredIds = filteredCommands.map((command) => command.id)
  const selectedFilteredIds = selectedIds.filter((id) =>
    filteredIds.includes(id),
  )
  const allFilteredSelected =
    filteredIds.length > 0 && selectedFilteredIds.length === filteredIds.length

  const removeFavorites = (commandIds: string[]) => {
    for (const commandId of commandIds) {
      void dispatch(
        setCatalogCommandFavorite({
          commandId,
          favorite: false,
        }),
      )
    }
    setSelectedIds([])
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Favorites</h1>
          <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {favoriteCommands.length} favorite commands
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={selectedFilteredIds.length === 0}
            type="button"
            variant="secondary"
            onClick={() => removeFavorites(selectedFilteredIds)}
          >
            <StarOff className="h-4 w-4" />
            Remove
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
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-muted)]" />
            <Input
              aria-label="Search favorites"
              className="pl-9"
              placeholder="Search favorites"
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
              <col className="w-52" />
              <col className="w-44" />
              <col className="w-48" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-fg-muted)]">
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    aria-label="Select all favorites"
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
                <th className="w-52 px-3 py-3">Shortcut</th>
                <th className="w-44 px-3 py-3">Last Used</th>
                <th className="w-48 px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCommands.map((command) => {
                const updating = updatingIds.includes(command.id)

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
                    <td className="min-w-0 px-3 py-3">
                      <CommandIdentity command={command} />
                    </td>
                    <td className="px-3 py-3">
                      <Badge>{command.categoryLabel}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      {command.effectiveKeybinding ? (
                        <KeybindingDisplay
                          keybinding={command.effectiveKeybinding}
                        />
                      ) : (
                        <span className="text-sm text-[var(--color-fg-muted)]">
                          None
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-[var(--color-fg-muted)]">
                      {formatUsageDate(command.usage.lastUsed)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <Button
                          aria-label={`Edit shortcut for ${command.name}`}
                          disabled={
                            updating || !command.capabilities.canSetKeybinding
                          }
                          size="icon"
                          type="button"
                          variant="secondary"
                          onClick={() => editKeybinding(command)}
                        >
                          <Keyboard className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={`Edit URL rules for ${command.name}`}
                          disabled={
                            updating || !command.capabilities.canEditUrlRules
                          }
                          size="icon"
                          type="button"
                          variant="secondary"
                          onClick={() => editUrlRules(command)}
                        >
                          <Globe2 className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={`Remove ${command.name} from favorites`}
                          disabled={updating}
                          size="icon"
                          type="button"
                          variant="ghost"
                          onClick={() => removeFavorites([command.id])}
                        >
                          <StarOff className="h-4 w-4" />
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
            No favorites
          </div>
        )}
      </Panel>

      {dialogs}
    </div>
  )
}
