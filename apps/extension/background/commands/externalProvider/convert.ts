// Architecture: background command system, shared external-command provider.
// The per-node-type conversion (action/submit/group/search/input/display) from
// a validated declarative ExternalCommand into a background-owned CommandNode.
// The wrapper never holds the owner's logic: every executable/dynamic field
// becomes a closure that calls adapter.invoke (re-validating returned
// children/results) so privileged background code never trusts or runs external
// output. allowCustomKeybinding is forced false — external commands must not
// claim global keybindings at registration (the user can still assign one later
// through settings, keyed by id). Extracted verbatim from siteSdk/commands.ts so
// both the site SDK and the extension feature share one engine. See
// docs/extension-extension/provider-refactor.md.
import type {
  Browser,
  CommandNode,
  ExternalCommand,
} from "../../../shared/types"
import { toInternalCommandId } from "./ids"
import type { ExternalProviderAdapter } from "./types"

export type ConvertContext<TEntry> = {
  adapter: ExternalProviderAdapter<TEntry>
  entry: TEntry
  registrationId: string
  path: string[]
}

const normalizeValues = (
  values: Record<string, string> | undefined,
): Record<string, string> => values ?? {}

// Preserve only schema-backed display fields. Privileged fields such as
// permissions/keybindings are never present on external command declarations.
const createBaseCommand = <TEntry>(
  command: ExternalCommand,
  context: ConvertContext<TEntry>,
) => ({
  id: toInternalCommandId(
    context.adapter,
    context.entry,
    context.registrationId,
    [...context.path, command.id],
  ),
  name: command.name,
  description: command.description,
  icon: command.icon,
  color: command.color,
  keywords: command.keywords,
  executionPayload: command.executionPayload,
  urlRules: command.urlRules,
  settingsCatalog: {
    configurable: false,
  },
})

export const convertCommands = <TEntry>(
  commands: ExternalCommand[],
  context: ConvertContext<TEntry>,
): CommandNode[] => commands.map((command) => convertCommand(command, context))

export const convertCommand = <TEntry>(
  command: ExternalCommand,
  context: ConvertContext<TEntry>,
): CommandNode => {
  const base = createBaseCommand(command, context)
  const { adapter, entry } = context

  if (command.type === "action") {
    return {
      ...base,
      type: "action",
      actionLabel: command.actionLabel,
      modifierActionLabel: command.modifierActionLabel,
      confirmAction: command.confirmAction,
      remainOpenOnSelect: command.remainOpenOnSelect,
      allowCustomKeybinding: false,
      execute: async (browserContext, values) => {
        await adapter.invoke(entry, {
          type: "execute",
          callbackId: command.execute.callbackId,
          commandId: command.id,
          context: browserContext || adapter.fallbackContext(entry),
          values: normalizeValues(values),
          executionPayload: command.executionPayload,
        })
      },
    }
  }

  if (command.type === "submit") {
    return {
      ...base,
      type: "submit",
      actionLabel: command.actionLabel,
      confirmAction: command.confirmAction,
      remainOpenOnSelect: command.remainOpenOnSelect,
      doNotAddToRecents: command.doNotAddToRecents,
      allowCustomKeybinding: false,
      execute: async (browserContext, values) => {
        await adapter.invoke(entry, {
          type: "execute",
          callbackId: command.execute.callbackId,
          commandId: command.id,
          context: browserContext || adapter.fallbackContext(entry),
          values: normalizeValues(values),
          executionPayload: command.executionPayload,
        })
      },
    }
  }

  if (command.type === "group") {
    return {
      ...base,
      type: "group",
      enableDeepSearch: command.enableDeepSearch !== false,
      children: async (browserContext: Browser.Context) => {
        if (command.children.type === "static") {
          return convertCommands(command.children.commands, {
            ...context,
            path: [...context.path, command.id],
          })
        }

        const children = await adapter.invoke(entry, {
          type: "children",
          callbackId: command.children.callback.callbackId,
          commandId: command.id,
          context: browserContext,
        })

        return convertCommands(children || [], {
          ...context,
          path: [...context.path, command.id],
        })
      },
    }
  }

  if (command.type === "search") {
    return {
      ...base,
      type: "search",
      actionLabel: command.actionLabel,
      execute: command.execute
        ? async (browserContext, values) => {
            await adapter.invoke(entry, {
              type: "execute",
              callbackId: command.execute!.callbackId,
              commandId: command.id,
              context: browserContext || adapter.fallbackContext(entry),
              values: normalizeValues(values),
              executionPayload: command.executionPayload,
            })
          }
        : undefined,
      getResults: async (browserContext, search) => {
        const results = await adapter.invoke(entry, {
          type: "search",
          callbackId: command.getResults.callbackId,
          commandId: command.id,
          context: browserContext,
          search,
        })

        return convertCommands(results || [], {
          ...context,
          path: [...context.path, command.id],
        })
      },
    }
  }

  if (command.type === "input") {
    return {
      ...base,
      type: "input",
      field: command.field,
    }
  }

  return {
    ...base,
    type: "display",
  }
}
