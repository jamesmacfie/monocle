import { ChevronDown, ChevronRight, Globe2, Keyboard, Star } from "lucide-react"
import { KeybindingDisplay } from "../../shared/components/KeybindingDisplay"
import { cn } from "../../shared/components/ui/cn"
import type { SettingsCatalogCommand } from "../../shared/types"
import { getRuleCount } from "../lib/catalog"
import { CommandIdentity } from "./CommandIdentity"
import { Badge, Button, Checkbox, Switch } from "./ui"

type CommandCatalogRowsProps = {
  groupLabel: string
  items: SettingsCatalogCommand[]
  expanded: boolean
  selectedIds: string[]
  updatingIds: string[]
  onToggle: () => void
  onSelect: (commandId: string, selected: boolean) => void
  onHiddenChange: (command: SettingsCatalogCommand, hidden: boolean) => void
  onFavoriteChange: (command: SettingsCatalogCommand, favorite: boolean) => void
  onEditKeybinding: (command: SettingsCatalogCommand) => void
  onEditUrlRules: (command: SettingsCatalogCommand) => void
}

export function CommandCatalogRows({
  groupLabel,
  items,
  expanded,
  selectedIds,
  updatingIds,
  onToggle,
  onSelect,
  onHiddenChange,
  onFavoriteChange,
  onEditKeybinding,
  onEditUrlRules,
}: CommandCatalogRowsProps) {
  return (
    <>
      <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
        <td className="px-3 py-2" colSpan={7}>
          <button
            aria-expanded={expanded}
            className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left text-xs font-semibold text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
            type="button"
            onClick={onToggle}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span>{groupLabel}</span>
            <span className="font-normal">({items.length})</span>
          </button>
        </td>
      </tr>
      {expanded &&
        items.map((command) => {
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
                <CommandIdentity command={command} detail="parents" />
              </td>
              <td className="px-3 py-3">
                <Badge>{command.categoryLabel}</Badge>
              </td>
              <td className="px-3 py-3">
                <Switch
                  aria-label={`Hidden ${command.name}`}
                  checked={command.settings.hidden === true}
                  disabled={updating || !command.capabilities.canHide}
                  onCheckedChange={(checked) =>
                    onHiddenChange(command, checked)
                  }
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
