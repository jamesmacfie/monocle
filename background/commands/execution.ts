// Architecture: background command system. Execution dispatch — the single
// path every command run takes, whether it started from a palette
// selection, a keybinding, a generated row action, or a user-script
// runCommand step (via the bridge in background/index.ts). Resolves the
// command (background/commands/query.ts), enforces permissions at execute
// time, normalizes form values for older executors, records usage, and
// implements the generated per-suggestion actions (favorite, hide,
// hide-from-domain, keybinding reset) parsed from synthetic ids
// (background/commands/generatedActions.ts). Split out of the old
// overloaded index.ts; suggestion conversion lives in
// background/commands/suggestions.ts.
import type {
  Browser,
  CommandExecutionScope,
  CommandNode,
} from "../../shared/types"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { showToast } from "../messages/showToast"
import { isSettingsCatalogConfigurable } from "../utils/commands"
import { checkPermissions } from "../utils/permissions"
import { createUrlPatternForDomain, extractDomain } from "../utils/urlFilter"
import { toggleFavoriteCommandId } from "./favorites"
import {
  type GeneratedCommandAction,
  parseGeneratedCommandAction,
} from "./generatedActions"
import {
  normalizeContext,
  type ResolvedCommand,
  resolveCommandById,
  resolveCommandInPage,
} from "./query"
import { invalidateSearchIndex } from "./searchIndex"
import {
  getCommandSettings,
  removeCommandSetting,
  updateCommandSettings,
  updateCommandUrlRules,
} from "./settings"
import type { CommandLoadOptions } from "./source"
import { recordCommandUsage } from "./usage"

const showMissingPermissionsToast = async (
  missingPermissions: string[],
): Promise<void> => {
  const permissionList = missingPermissions
    .map(
      (permission) => permission.charAt(0).toUpperCase() + permission.slice(1),
    )
    .join(", ")

  await showToast({
    type: "show-toast",
    level: "error",
    message:
      "Missing permissions: " +
      permissionList +
      ". Please grant these permissions to use this command.",
  })
}

// Multi-value UI fields can hold arrays; older command executors expect
// comma-joined strings, so values are normalized at the dispatch boundary.
const normalizeFormValues = (
  formValues: Record<string, string | string[]> = {},
): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(formValues).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(",") : (value ?? ""),
    ]),
  )
}

const shouldRecordUsage = (command: CommandNode): boolean => {
  if (command.type === "action") {
    return true
  }

  if (command.type === "submit") {
    return command.doNotAddToRecents !== true
  }

  return false
}

/**
 * Executes an already-resolved command: permission check, executor call,
 * usage recording. Both the public executeCommand entry and generated-action
 * dispatch funnel through here so the permission/usage invariants hold on
 * every path.
 */
const executeResolvedCommand = async (
  resolved: ResolvedCommand,
  context: Browser.Context,
  formValues: Record<string, string | string[]>,
  parentNames?: string[],
): Promise<void> => {
  const { command, permissions } = resolved

  if (
    command.type !== "action" &&
    command.type !== "submit" &&
    command.type !== "search"
  ) {
    throw new Error(`Command ${command.id} is not executable`)
  }

  if (permissions.length > 0) {
    const { hasAllPermissions, missingPermissions } =
      await checkPermissions(permissions)

    if (!hasAllPermissions) {
      await showMissingPermissionsToast(missingPermissions)
      return
    }
  }

  try {
    await command.execute?.(context, normalizeFormValues(formValues))

    if (shouldRecordUsage(command)) {
      await recordCommandUsage(command.id, parentNames ?? resolved.parentNames)
    }
  } catch (error) {
    console.error(
      `[ExecuteCommand] Error executing action ${command.id}:`,
      error,
    )
    throw error
  }
}

const resolveGeneratedActionTarget = async (
  action: GeneratedCommandAction,
  context: Browser.Context,
  executionScope?: CommandExecutionScope,
  options?: CommandLoadOptions,
): Promise<ResolvedCommand> => {
  const resolved = await resolveCommandInPage(
    action.targetCommandId,
    context,
    executionScope,
    options,
  )

  if (!resolved) {
    throw new Error(`Command not found: ${action.targetCommandId}`)
  }

  return resolved
}

// Dispatch for the synthetic per-row actions parsed out of a generated command
// id (favorite/hide/hide-from-domain/reset-keybinding/modifier/primary). These
// arrive through the same execute-command path as real commands because the UI
// only ever holds Suggestions with ids — never executable functions — so the
// action is encoded into the id and decoded here against the resolved target.
// setKeybinding is UI-only and a no-op here. See docs/execution-and-actions.md.
const executeGeneratedAction = async (
  action: GeneratedCommandAction,
  context: Browser.Context,
  formValues: Record<string, string | string[]>,
  parentNames?: string[],
  executionScope?: CommandExecutionScope,
  options?: CommandLoadOptions,
): Promise<void> => {
  const resolved = await resolveGeneratedActionTarget(
    action,
    context,
    executionScope,
    options,
  )

  if (action.type === "favorite") {
    await toggleFavoriteCommandId(action.targetCommandId)
    return
  }

  if (action.type === "setKeybinding") {
    console.warn(
      "setKeybinding action should be handled in UI layer, not background script",
    )
    return
  }

  if (action.type === "resetKeybinding") {
    await removeCommandSetting(action.targetCommandId, "keybinding")
    await refreshKeybindingRegistry()
    return
  }

  if (action.type === "hideDomain") {
    if (!context.url || context.isNewTab) {
      return
    }

    const domain = extractDomain(context.url)
    if (!domain) {
      return
    }

    const pattern = createUrlPatternForDomain(domain)
    const currentSettings =
      (await getCommandSettings(action.targetCommandId)) || {}
    const currentDenyUrls = currentSettings.urlRules?.denyUrls || []

    if (!currentDenyUrls.includes(pattern)) {
      await updateCommandUrlRules(action.targetCommandId, {
        denyUrls: [...currentDenyUrls, pattern],
      })
    }

    return
  }

  if (action.type === "hideCommand") {
    if (!isSettingsCatalogConfigurable(resolved.command)) {
      return
    }

    await updateCommandSettings(action.targetCommandId, {
      hidden: true,
    })
    await refreshKeybindingRegistry()
    invalidateSearchIndex()
    return
  }

  if (action.type === "primary") {
    if (resolved.command.type === "group") {
      return
    }

    await executeResolvedCommand(resolved, context, formValues, parentNames)
    return
  }

  await executeResolvedCommand(
    resolved,
    {
      ...context,
      modifierKey: action.modifierKey,
    },
    formValues,
    parentNames,
  )
}

/**
 * The public command execution entry point: routes generated-action ids
 * (favorite/hide/keybinding rows) to their handlers and real command ids
 * through resolution + executeResolvedCommand. `executionScope` pins
 * resolution to the palette page the user was on (search results, child
 * pages); `options` carries platform/site-SDK load context.
 */
export const executeCommand = async (
  id: string,
  context: Browser.Context,
  formValues: Record<string, string | string[]>,
  parentNames?: string[],
  executionScope?: CommandExecutionScope,
  options?: CommandLoadOptions,
): Promise<void> => {
  const normalizedContext = normalizeContext(context)
  const generatedAction = parseGeneratedCommandAction(id)

  if (generatedAction) {
    await executeGeneratedAction(
      generatedAction,
      normalizedContext,
      formValues,
      parentNames,
      executionScope,
      options,
    )
    return
  }

  const resolved = executionScope
    ? await resolveCommandInPage(id, normalizedContext, executionScope, options)
    : await resolveCommandById(id, normalizedContext, options)

  if (!resolved) {
    console.error(`[ExecuteCommand] Command not found: ${id}`)
    throw new Error(`Command not found: ${id}`)
  }

  await executeResolvedCommand(
    resolved,
    normalizedContext,
    formValues,
    parentNames,
  )
}
