/**
 * Utility functions for working with commands
 */
import type {
  ActionCommandNode,
  AsyncValue,
  Browser,
  CommandIcon,
  CommandNode,
} from "../../shared/types"

// Helper type for properties that can be static or async
type AsyncProperty<T> = T | ((context: Browser.Context) => Promise<T>)

/**
 * Resolves a property that can be either a static value or an async function
 */
export async function resolveAsyncProperty<T>(
  property: AsyncProperty<T> | undefined,
  context: Browser.Context,
): Promise<T | undefined> {
  if (property === undefined) {
    return undefined
  }

  return typeof property === "function"
    ? await (property as (context: Browser.Context) => Promise<T>)(context)
    : property
}

/**
 * Resolves actionLabel with default value handling
 */
export async function resolveActionLabel(
  command: ActionCommandNode | { actionLabel?: AsyncValue<string> },
  context: Browser.Context,
): Promise<string> {
  if ("actionLabel" in command && command.actionLabel) {
    return (await resolveAsyncProperty(command.actionLabel, context)) ?? "Run"
  }
  return "Run"
}

/**
 * Resolves all modifier action labels
 */
export async function resolveModifierActionLabels(
  command:
    | ActionCommandNode
    | {
        modifierActionLabel?: {
          [K in Browser.ModifierKey]?: AsyncValue<string>
        }
      },
  context: Browser.Context,
): Promise<{
  alt?: string
  ctrl?: string
  shift?: string
  cmd?: string
}> {
  if (!("modifierActionLabel" in command) || !command.modifierActionLabel) {
    return {
      alt: undefined,
      ctrl: undefined,
      shift: undefined,
      cmd: undefined,
    }
  }

  const { modifierActionLabel } = command as any

  return {
    alt: await resolveAsyncProperty(modifierActionLabel.alt, context),
    ctrl: await resolveAsyncProperty(modifierActionLabel.ctrl, context),
    shift: await resolveAsyncProperty(modifierActionLabel.shift, context),
    cmd: await resolveAsyncProperty(modifierActionLabel.cmd, context),
  }
}

/**
 * Resolves a command name that can be either static or async
 * @param name - The name property (string, string[], or function)
 * @param context - The execution context for async resolution
 * @returns The resolved name as a string (first element if array)
 */
export async function resolveCommandName(
  name: any,
  context: Browser.Context,
): Promise<string> {
  const resolvedName = typeof name === "function" ? await name(context) : name
  return Array.isArray(resolvedName) ? resolvedName[0] : resolvedName
}

/**
 * Gets display name from command name (handles array format)
 * @param name - Command name (string or string[])
 * @returns Primary display name
 */
export function getDisplayName(name: string | string[]): string {
  return Array.isArray(name) ? name[0] : name
}

export function createNoOpCommand(
  id: string,
  name: string,
  description: string,
  icon: CommandIcon = { type: "lucide", name: "Info" },
): CommandNode {
  return {
    type: "display",
    id,
    name,
    description,
    icon,
    color: "gray",
  }
}
