import { Icon } from "../../shared/components/Icon"
import type { SettingsCatalogCommand } from "../../shared/types"

type CommandIdentityProps = {
  command: SettingsCatalogCommand
  detail?: "description" | "parents" | "id"
}

export function CommandIdentity({
  command,
  detail = "description",
}: CommandIdentityProps) {
  const fallback =
    detail === "parents" && command.parentNames.length > 0
      ? command.parentNames.join(" / ")
      : detail === "id"
        ? command.id
        : command.description || command.id

  return (
    <div className="flex min-w-0 max-w-full items-center gap-3 overflow-hidden">
      <Icon
        icon={command.icon}
        color={typeof command.color === "string" ? command.color : undefined}
      />
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="truncate text-sm font-medium">{command.name}</div>
        <div className="truncate text-xs text-[var(--color-fg-muted)]">
          {fallback}
        </div>
      </div>
    </div>
  )
}
