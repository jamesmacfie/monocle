import type {
  Browser,
  KeybindingBehavior,
  KeybindingRequirements,
} from "../../shared/types"
import { resolveCommandById } from "../commands/query"
import { getSettingsCatalogCommandById } from "../commands/settingsCatalog"
import type { CommandLoadOptions } from "../commands/source"
import { getKeybindingTargetMetadata } from "./targets"

export type KeybindingAssignmentTarget = {
  allowed: boolean
  behavior: KeybindingBehavior
  requirements?: KeybindingRequirements
  source: "resolved-command" | "catalog" | "missing"
}

type ResolveKeybindingAssignmentTargetOptions = {
  commandId: string
  context?: Browser.Context
  options?: CommandLoadOptions
}

export const resolveKeybindingAssignmentTarget = async ({
  commandId,
  context,
  options,
}: ResolveKeybindingAssignmentTargetOptions): Promise<KeybindingAssignmentTarget> => {
  const resolved = await resolveCommandById(commandId, context, options)

  if (resolved) {
    const metadata = getKeybindingTargetMetadata(resolved.command)
    return {
      allowed: metadata.allowed,
      behavior: metadata.behavior,
      requirements: metadata.requirements,
      source: "resolved-command",
    }
  }

  const catalogCommand = await getSettingsCatalogCommandById(commandId)
  if (catalogCommand) {
    return {
      allowed: catalogCommand.capabilities.canSetKeybinding,
      // Catalog rows intentionally do not encode runtime behavior; context-only
      // fallbacks default to execute and are re-evaluated when resolvable.
      behavior: "execute",
      requirements: catalogCommand.keybindingRequirements,
      source: "catalog",
    }
  }

  return {
    allowed: false,
    behavior: "execute",
    source: "missing",
  }
}
