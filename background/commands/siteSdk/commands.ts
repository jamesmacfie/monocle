import type {
  Browser,
  CommandNode,
  SiteSdkCommand,
  SiteSdkInvokeRequest,
  SiteSdkRegistration,
} from "../../../shared/types"
import { validateSiteSdkCommandList } from "../../../shared/types"
import { sendTabMessage } from "../../utils/browser"
import type { SiteSdkRegistryEntry } from "./registry"
import {
  getSiteSdkHostLabel,
  hashSiteSdkOrigin,
  type SiteSdkScope,
} from "./scope"

export const SITE_SDK_COMMAND_ID_PREFIX = "site:"

type ConvertContext = {
  scope: SiteSdkScope
  registration: SiteSdkRegistration
  path: string[]
}

const normalizeValues = (
  values: Record<string, string> | undefined,
): Record<string, string> => {
  return values ?? {}
}

/**
 * Identifies commands produced from page-owned SDK declarations.
 *
 * This is used by ordering/keybinding logic without importing the registry.
 */
export const isSiteSdkCommandId = (id: string): boolean => {
  return id.startsWith(SITE_SDK_COMMAND_ID_PREFIX)
}

// Internal ids include origin, registration, and public path so dynamic
// children can be resolved and settings/favorites stay scoped to the site.
const toInternalCommandId = (context: ConvertContext, publicId: string) => {
  const originHash = hashSiteSdkOrigin(context.scope.origin)
  const path = [...context.path, publicId].join(".")
  return `${SITE_SDK_COMMAND_ID_PREFIX}${originHash}:${context.registration.id}:${path}`
}

// Callback-returned children/results are untrusted page output, so they are
// validated again and treated as nested commands where `placement` is illegal.
const validateCallbackCommands = (commands: unknown): SiteSdkCommand[] => {
  const validation = validateSiteSdkCommandList(commands, {
    allowPlacement: false,
  })

  if (!validation.success) {
    throw new Error(validation.error)
  }

  return validation.commands
}

// Sends a scoped callback request to the content bridge in the tab that owns the
// registration. The bridge then crosses into the page world.
const invokeSiteSdk = async (
  scope: SiteSdkScope,
  request: SiteSdkInvokeRequest,
): Promise<SiteSdkCommand[] | undefined> => {
  const response = await sendTabMessage(scope.tabId, {
    type: "monocle-sdk-invoke",
    request,
  })

  if (!response?.success) {
    throw new Error(response?.error || "Site SDK callback failed")
  }

  if (response.commands) {
    return validateCallbackCommands(response.commands)
  }

  return undefined
}

// Preserve only schema-backed display fields. Privileged fields such as
// permissions/keybindings are never present on SDK command declarations.
const createBaseCommand = (
  command: SiteSdkCommand,
  context: ConvertContext,
) => ({
  id: toInternalCommandId(context, command.id),
  name: command.name,
  description: command.description,
  icon: command.icon,
  color: command.color,
  keywords: command.keywords,
  executionPayload: command.executionPayload,
  urlRules: command.urlRules,
})

// Convert the serialized public schema into background-owned CommandNode
// wrappers, preserving the path used for internal ids.
const convertCommands = (
  commands: SiteSdkCommand[],
  context: ConvertContext,
): CommandNode[] => {
  return commands.map((command) => convertCommand(command, context))
}

// Wrap one SDK command as a normal background command. Execution/dynamic
// resolution is still delegated back to the owning page callback.
const convertCommand = (
  command: SiteSdkCommand,
  context: ConvertContext,
): CommandNode => {
  const base = createBaseCommand(command, context)

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
        await invokeSiteSdk(context.scope, {
          type: "execute",
          callbackId: command.execute.callbackId,
          commandId: command.id,
          context: browserContext || {
            url: context.scope.url,
            title: context.scope.title,
            modifierKey: null,
          },
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
        await invokeSiteSdk(context.scope, {
          type: "execute",
          callbackId: command.execute.callbackId,
          commandId: command.id,
          context: browserContext || {
            url: context.scope.url,
            title: context.scope.title,
            modifierKey: null,
          },
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

        const children = await invokeSiteSdk(context.scope, {
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
            await invokeSiteSdk(context.scope, {
              type: "execute",
              callbackId: command.execute!.callbackId,
              commandId: command.id,
              context: browserContext || {
                url: context.scope.url,
                title: context.scope.title,
                modifierKey: null,
              },
              values: normalizeValues(values),
              executionPayload: command.executionPayload,
            })
          }
        : undefined,
      getResults: async (browserContext, search) => {
        const results = await invokeSiteSdk(context.scope, {
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

// Commands without `placement: "root"` live under this generated group so a
// site can add a compact top-level entry without naming its own group.
const createSiteGroupCommand = (
  entry: SiteSdkRegistryEntry,
  registration: SiteSdkRegistration,
  commands: SiteSdkCommand[],
): CommandNode => {
  const hostLabel = getSiteSdkHostLabel(entry.scope.origin)
  const originHash = hashSiteSdkOrigin(entry.scope.origin)
  const id = `${SITE_SDK_COMMAND_ID_PREFIX}${originHash}:${registration.id}:__site-group`

  return {
    type: "group",
    id,
    name: registration.name || hostLabel,
    description: `Commands from ${hostLabel}`,
    icon: registration.icon || { type: "lucide", name: "Globe" },
    color: "gray",
    keywords: ["site", "website", hostLabel, registration.namespace],
    enableDeepSearch: true,
    children: async () =>
      convertCommands(commands, {
        scope: entry.scope,
        registration,
        path: ["__site-group"],
      }),
  }
}

/**
 * Builds the root commands contributed by one scoped SDK registry entry.
 *
 * Ordering matters: root-placed commands are emitted before the generated site
 * group so query sorting can place all SDK entries before native suggestions.
 */
export const createSiteSdkRootCommands = (
  entry?: SiteSdkRegistryEntry,
): CommandNode[] => {
  if (!entry) {
    return []
  }

  const rootCommands: CommandNode[] = []

  for (const registration of entry.registrations) {
    const placedAtRoot = registration.commands.filter(
      (command) => command.placement === "root",
    )
    const grouped = registration.commands.filter(
      (command) => command.placement !== "root",
    )

    rootCommands.push(
      ...convertCommands(placedAtRoot, {
        scope: entry.scope,
        registration,
        path: [],
      }),
    )

    if (grouped.length > 0) {
      rootCommands.push(createSiteGroupCommand(entry, registration, grouped))
    }
  }

  return rootCommands
}
