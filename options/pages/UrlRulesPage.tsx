import { Eraser, Globe2, RotateCcw, Search } from "lucide-react"
import { useMemo, useState } from "react"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  loadSettingsCatalog,
  selectSettingsCatalogCommands,
  selectSettingsCatalogError,
  selectSettingsCatalogLoading,
  selectSettingsCatalogUpdatingIds,
  setCatalogCommandUrlRules,
} from "../../shared/store/slices/settingsCatalog.slice"
import type { SettingsCatalogCommand } from "../../shared/types"
import { CommandIdentity } from "../components/CommandIdentity"
import { Badge, Button, Checkbox, Input, Panel, Select } from "../components/ui"
import { useCatalogCommandActions } from "../hooks/useCatalogCommandActions"
import {
  getCategoryOptions,
  getRuleCount,
  matchesCommandQuery,
} from "../lib/catalog"

type RuleFilter = "all" | "with-rules" | "allow" | "deny" | "no-rules"

const getAllowCount = (command: SettingsCatalogCommand) =>
  command.settings.urlRules?.allowUrls?.length ?? 0

const getDenyCount = (command: SettingsCatalogCommand) =>
  command.settings.urlRules?.denyUrls?.length ?? 0

const PatternSummary = ({ patterns }: { patterns?: string[] }) => {
  if (!patterns?.length) {
    return <span className="text-sm text-[var(--color-fg-muted)]">None</span>
  }

  return (
    <div className="flex max-w-full flex-wrap gap-1 overflow-hidden">
      {patterns.slice(0, 2).map((pattern) => (
        <code
          key={pattern}
          className="max-w-full truncate rounded border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-1.5 py-0.5 text-xs text-[var(--color-fg)]"
        >
          {pattern}
        </code>
      ))}
      {patterns.length > 2 && (
        <span className="text-xs text-[var(--color-fg-muted)]">
          +{patterns.length - 2}
        </span>
      )}
    </div>
  )
}

export function UrlRulesPage() {
  const dispatch = useAppDispatch()
  const commands = useAppSelector(selectSettingsCatalogCommands)
  const loading = useAppSelector(selectSettingsCatalogLoading)
  const error = useAppSelector(selectSettingsCatalogError)
  const updatingIds = useAppSelector(selectSettingsCatalogUpdatingIds)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [ruleFilter, setRuleFilter] = useState<RuleFilter>("with-rules")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const { dialogs, editUrlRules } = useCatalogCommandActions()

  const urlRuleCommands = useMemo(
    () => commands.filter((command) => command.capabilities.canEditUrlRules),
    [commands],
  )
  const categories = useMemo(
    () => getCategoryOptions(urlRuleCommands),
    [urlRuleCommands],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const filteredCommands = useMemo(() => {
    return urlRuleCommands.filter((command) => {
      if (category !== "all" && command.categoryId !== category) {
        return false
      }

      if (ruleFilter === "with-rules" && getRuleCount(command) === 0) {
        return false
      }

      if (ruleFilter === "allow" && getAllowCount(command) === 0) {
        return false
      }

      if (ruleFilter === "deny" && getDenyCount(command) === 0) {
        return false
      }

      if (ruleFilter === "no-rules" && getRuleCount(command) > 0) {
        return false
      }

      return matchesCommandQuery(command, normalizedQuery)
    })
  }, [category, normalizedQuery, ruleFilter, urlRuleCommands])

  const filteredIds = filteredCommands.map((command) => command.id)
  const selectedFilteredIds = selectedIds.filter((id) =>
    filteredIds.includes(id),
  )
  const allFilteredSelected =
    filteredIds.length > 0 && selectedFilteredIds.length === filteredIds.length

  const clearRules = (commandIds: string[]) => {
    for (const commandId of commandIds) {
      void dispatch(
        setCatalogCommandUrlRules({
          commandId,
          urlRules: {
            allowUrls: [],
            denyUrls: [],
          },
        }),
      )
    }
    setSelectedIds([])
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">URL Rules</h1>
          <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {
              urlRuleCommands.filter((command) => getRuleCount(command) > 0)
                .length
            }{" "}
            commands with saved rules
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={selectedFilteredIds.length === 0}
            type="button"
            variant="secondary"
            onClick={() => clearRules(selectedFilteredIds)}
          >
            <Eraser className="h-4 w-4" />
            Clear
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
              aria-label="Search URL rules"
              className="pl-9"
              placeholder="Search URL rules"
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
            aria-label="Rule filter"
            value={ruleFilter}
            onChange={(event) =>
              setRuleFilter(event.target.value as RuleFilter)
            }
          >
            <option value="with-rules">With rules</option>
            <option value="all">All editable</option>
            <option value="allow">Allow rules</option>
            <option value="deny">Deny rules</option>
            <option value="no-rules">No rules</option>
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
          <table className="w-full min-w-[980px] table-fixed border-collapse">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-36" />
              <col className="w-64" />
              <col className="w-64" />
              <col className="w-32" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-fg-muted)]">
                <th className="w-10 px-4 py-3">
                  <Checkbox
                    aria-label="Select all URL rules"
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
                <th className="w-64 px-3 py-3">Allow</th>
                <th className="w-64 px-3 py-3">Deny</th>
                <th className="w-32 px-3 py-3">Actions</th>
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
                      <PatternSummary
                        patterns={command.settings.urlRules?.allowUrls}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <PatternSummary
                        patterns={command.settings.urlRules?.denyUrls}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <Button
                          aria-label={`Edit URL rules for ${command.name}`}
                          disabled={updating}
                          size="icon"
                          type="button"
                          variant="secondary"
                          onClick={() => editUrlRules(command)}
                        >
                          <Globe2 className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={`Clear URL rules for ${command.name}`}
                          disabled={updating || getRuleCount(command) === 0}
                          size="icon"
                          type="button"
                          variant="ghost"
                          onClick={() => clearRules([command.id])}
                        >
                          <Eraser className="h-4 w-4" />
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
            No URL rules
          </div>
        )}
      </Panel>

      {dialogs}
    </div>
  )
}
