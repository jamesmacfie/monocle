import {
  Eye,
  EyeOff,
  Globe2,
  Keyboard,
  RotateCcw,
  Search,
  Star,
} from "lucide-react"
import { useMemo, useState } from "react"
import { Icon } from "../../shared/components/Icon"
import { KeybindingDisplay } from "../../shared/components/KeybindingDisplay"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  loadSettingsCatalog,
  selectSettingsCatalogCommands,
  selectSettingsCatalogError,
  selectSettingsCatalogLoading,
  selectSettingsCatalogUpdatingIds,
  setCatalogCommandFavorite,
  setCatalogCommandHidden,
  setCatalogCommandKeybinding,
  setCatalogCommandUrlRules,
} from "../../shared/store/slices/settingsCatalog.slice"
import type {
  CommandUrlRulesSetting,
  SettingsCatalogCommand,
} from "../../shared/types"
import { KeybindingDialog } from "../components/KeybindingDialog"
import { UrlRulesDialog } from "../components/UrlRulesDialog"
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Panel,
  Select,
  Switch,
} from "../components/ui"
import { cn } from "../lib/cn"

type HiddenFilter = "all" | "visible" | "hidden"

const matchesQuery = (command: SettingsCatalogCommand, query: string) => {
  if (!query) {
    return true
  }

  const haystack = [
    command.id,
    command.name,
    command.description ?? "",
    command.categoryLabel,
    ...command.parentNames,
  ]
    .join(" ")
    .toLowerCase()

  return haystack.includes(query)
}

const getRuleCount = (command: SettingsCatalogCommand) =>
  (command.settings.urlRules?.allowUrls?.length ?? 0) +
  (command.settings.urlRules?.denyUrls?.length ?? 0)

const groupByCategory = (commands: SettingsCatalogCommand[]) => {
  const groups = new Map<string, SettingsCatalogCommand[]>()

  for (const command of commands) {
    const existing = groups.get(command.categoryLabel)
    if (existing) {
      existing.push(command)
    } else {
      groups.set(command.categoryLabel, [command])
    }
  }

  return [...groups.entries()].map(([label, items]) => ({ label, items }))
}

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
  const [keybindingCommand, setKeybindingCommand] =
    useState<SettingsCatalogCommand | null>(null)
  const [urlRulesCommand, setUrlRulesCommand] =
    useState<SettingsCatalogCommand | null>(null)

  const normalizedQuery = query.trim().toLowerCase()
  const categories = useMemo(
    () =>
      Array.from(
        new Map(
          commands.map((command) => [
            command.categoryId,
            command.categoryLabel,
          ]),
        ).entries(),
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [commands],
  )

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

      return matchesQuery(command, normalizedQuery)
    })
  }, [category, commands, hiddenFilter, normalizedQuery])

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

  const saveUrlRules = (
    command: SettingsCatalogCommand,
    urlRules: CommandUrlRulesSetting,
  ) => {
    void dispatch(
      setCatalogCommandUrlRules({
        commandId: command.id,
        urlRules,
      }),
    )
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
          <table className="w-full min-w-[980px] border-collapse">
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
              {groupByCategory(filteredCommands).map((group) => (
                <CommandGroupRows
                  key={group.label}
                  groupLabel={group.label}
                  items={group.items}
                  selectedIds={selectedIds}
                  updatingIds={updatingIds}
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
                  onEditKeybinding={setKeybindingCommand}
                  onEditUrlRules={setUrlRulesCommand}
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

      <KeybindingDialog
        command={keybindingCommand}
        open={Boolean(keybindingCommand)}
        onOpenChange={(open) => {
          if (!open) {
            setKeybindingCommand(null)
          }
        }}
        onSave={(keybinding) => {
          if (!keybindingCommand) {
            return
          }

          void dispatch(
            setCatalogCommandKeybinding({
              commandId: keybindingCommand.id,
              keybinding,
            }),
          )
        }}
        onReset={() => {
          if (!keybindingCommand) {
            return
          }

          void dispatch(
            setCatalogCommandKeybinding({
              commandId: keybindingCommand.id,
              keybinding: null,
            }),
          )
          setKeybindingCommand(null)
        }}
      />

      <UrlRulesDialog
        command={urlRulesCommand}
        open={Boolean(urlRulesCommand)}
        onOpenChange={(open) => {
          if (!open) {
            setUrlRulesCommand(null)
          }
        }}
        onSave={(urlRules) => {
          if (urlRulesCommand) {
            saveUrlRules(urlRulesCommand, urlRules)
          }
        }}
      />
    </div>
  )
}

type CommandGroupRowsProps = {
  groupLabel: string
  items: SettingsCatalogCommand[]
  selectedIds: string[]
  updatingIds: string[]
  onSelect: (commandId: string, selected: boolean) => void
  onHiddenChange: (command: SettingsCatalogCommand, hidden: boolean) => void
  onFavoriteChange: (command: SettingsCatalogCommand, favorite: boolean) => void
  onEditKeybinding: (command: SettingsCatalogCommand) => void
  onEditUrlRules: (command: SettingsCatalogCommand) => void
}

function CommandGroupRows({
  groupLabel,
  items,
  selectedIds,
  updatingIds,
  onSelect,
  onHiddenChange,
  onFavoriteChange,
  onEditKeybinding,
  onEditUrlRules,
}: CommandGroupRowsProps) {
  return (
    <>
      <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
        <td className="px-4 py-2" />
        <td
          className="px-3 py-2 text-xs font-semibold text-[var(--color-fg-muted)]"
          colSpan={6}
        >
          {groupLabel}
        </td>
      </tr>
      {items.map((command) => {
        const updating = updatingIds.includes(command.id)
        const ruleCount = getRuleCount(command)

        return (
          <tr
            key={command.id}
            className={cn(
              "border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-hover)]",
              command.settings.hidden && "opacity-70",
            )}
          >
            <td className="px-4 py-3 align-middle">
              <Checkbox
                aria-label={`Select ${command.name}`}
                checked={selectedIds.includes(command.id)}
                onCheckedChange={(checked) =>
                  onSelect(command.id, checked === true)
                }
              />
            </td>
            <td className="min-w-0 px-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Icon
                  icon={command.icon}
                  color={
                    typeof command.color === "string"
                      ? command.color
                      : undefined
                  }
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {command.name}
                  </div>
                  <div className="truncate text-xs text-[var(--color-fg-muted)]">
                    {command.parentNames.length > 0
                      ? command.parentNames.join(" / ")
                      : command.description || command.id}
                  </div>
                </div>
              </div>
            </td>
            <td className="px-3 py-3">
              <Badge>{command.categoryLabel}</Badge>
            </td>
            <td className="px-3 py-3">
              <Switch
                aria-label={`Hidden ${command.name}`}
                checked={command.settings.hidden === true}
                disabled={updating || !command.capabilities.canHide}
                onCheckedChange={(checked) => onHiddenChange(command, checked)}
              />
            </td>
            <td className="px-3 py-3">
              <Button
                aria-label={`Favorite ${command.name}`}
                disabled={updating || !command.capabilities.canFavorite}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => onFavoriteChange(command, !command.isFavorite)}
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    command.isFavorite &&
                      "fill-[var(--color-favorite)] text-[var(--color-favorite)]",
                  )}
                />
              </Button>
            </td>
            <td className="px-3 py-3">
              <Button
                className="w-full justify-start"
                disabled={updating || !command.capabilities.canSetKeybinding}
                type="button"
                variant="secondary"
                onClick={() => onEditKeybinding(command)}
              >
                <Keyboard className="h-4 w-4" />
                {command.effectiveKeybinding ? (
                  <KeybindingDisplay
                    className="min-w-0"
                    keybinding={command.effectiveKeybinding}
                  />
                ) : (
                  "Set"
                )}
              </Button>
            </td>
            <td className="px-3 py-3">
              <Button
                className="w-full justify-start"
                disabled={updating || !command.capabilities.canEditUrlRules}
                type="button"
                variant="secondary"
                onClick={() => onEditUrlRules(command)}
              >
                <Globe2 className="h-4 w-4" />
                {ruleCount}
              </Button>
            </td>
          </tr>
        )
      })}
    </>
  )
}
