import type {
  CommandIcon,
  FormField,
  SiteSdkCommand,
  SiteSdkExecuteEvent,
  SiteSdkInvokeRequest,
  SiteSdkResolveEvent,
  SiteSdkSearchEvent,
} from "../shared/types"

const PAGE_SOURCE = "monocle-site-sdk"
const BRIDGE_SOURCE = "monocle-extension-sdk-bridge"

type MonoclePlacement = "site" | "root"

type MonocleCommandBase = {
  id: string
  name: string | string[]
  description?: string
  icon?: CommandIcon
  color?: unknown
  keywords?: string[]
  executionPayload?: Record<string, string | string[]>
  placement?: MonoclePlacement
  urlRules?: { allowUrls?: string[]; denyUrls?: string[] }
}

type MonocleActionCommand = MonocleCommandBase & {
  type: "action"
  actionLabel?: string
  modifierActionLabel?: Record<string, string>
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  onExecute: (event: SiteSdkExecuteEvent) => void | Promise<void>
}

type MonocleSubmitCommand = MonocleCommandBase & {
  type: "submit"
  actionLabel?: string
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  doNotAddToRecents?: boolean
  onExecute: (event: SiteSdkExecuteEvent) => void | Promise<void>
}

type MonocleGroupCommand = MonocleCommandBase & {
  type: "group"
  enableDeepSearch?: boolean
  children:
    | MonocleCommand[]
    | ((
        event: SiteSdkResolveEvent,
      ) => MonocleCommand[] | Promise<MonocleCommand[]>)
}

type MonocleSearchCommand = MonocleCommandBase & {
  type: "search"
  actionLabel?: string
  onExecute?: (event: SiteSdkExecuteEvent) => void | Promise<void>
  getResults: (
    event: SiteSdkSearchEvent,
  ) => MonocleCommand[] | Promise<MonocleCommand[]>
}

type MonocleInputCommand = MonocleCommandBase & {
  type: "input"
  field: Exclude<FormField, { type: "radio" }>
}

type MonocleDisplayCommand = MonocleCommandBase & {
  type: "display"
}

type MonocleCommand =
  | MonocleActionCommand
  | MonocleSubmitCommand
  | MonocleGroupCommand
  | MonocleSearchCommand
  | MonocleInputCommand
  | MonocleDisplayCommand

type MonocleRegistrationInput = {
  namespace?: string
  name?: string
  icon?: CommandIcon
  commands: MonocleCommand[]
}

type MonocleRegistrationHandle = {
  id: string
  update(commands: MonocleCommand[]): void
  dispose(): void
}

type StoredRegistration = {
  id: string
  namespace: string
  input: MonocleRegistrationInput
  callbackIds: Set<string>
  serialized: {
    id: string
    namespace: string
    name?: string
    icon?: CommandIcon
    commands: SiteSdkCommand[]
  }
}

type PageCallback =
  | ((event: SiteSdkExecuteEvent) => void | Promise<void>)
  | ((
      event: SiteSdkResolveEvent,
    ) => MonocleCommand[] | Promise<MonocleCommand[]>)
  | ((
      event: SiteSdkSearchEvent,
    ) => MonocleCommand[] | Promise<MonocleCommand[]>)

declare global {
  interface Window {
    Monocle?: {
      commands: {
        register(input: MonocleRegistrationInput): MonocleRegistrationHandle
      }
    }
  }
}

const registrations = new Map<string, StoredRegistration>()
const callbacks = new Map<string, PageCallback>()
const namespaceCounters = new Map<string, number>()
let callbackCounter = 0

// Keep generated registration ids inside the public schema before the bridge
// sees them. Full validation still happens in the isolated world.
const sanitizeIdentifier = (value: unknown, fallback: string): string => {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalized || fallback
}

const allocateRegistrationId = (namespace: string): string => {
  const next = (namespaceCounters.get(namespace) || 0) + 1
  namespaceCounters.set(namespace, next)
  return next === 1 ? namespace : `${namespace}-${next}`
}

// Callback functions cannot cross the page/extension boundary. The facade keeps
// them in page memory and serializes stable callback refs for the bridge.
const createCallbackRef = (
  registration: StoredRegistration,
  commandId: string,
  kind: string,
  callback: PageCallback,
) => {
  const callbackId = `${registration.id}:${kind}:${commandId}:${++callbackCounter}`
  callbacks.set(callbackId, callback)
  registration.callbackIds.add(callbackId)
  return { callbackId }
}

const serializeBase = (command: MonocleCommand) => ({
  id: command.id,
  type: command.type,
  name: command.name,
  description: command.description,
  icon: command.icon,
  color: command.color as any,
  keywords: command.keywords,
  executionPayload: command.executionPayload,
  placement: command.placement,
  urlRules: command.urlRules,
})

// Turn page-world command declarations into the function-free wire shape that
// the isolated bridge can validate and send to the background.
const serializeCommand = (
  registration: StoredRegistration,
  command: MonocleCommand,
): SiteSdkCommand => {
  const base = serializeBase(command)

  if (command.type === "action") {
    return {
      ...base,
      type: "action",
      actionLabel: command.actionLabel,
      modifierActionLabel: command.modifierActionLabel as any,
      confirmAction: command.confirmAction,
      remainOpenOnSelect: command.remainOpenOnSelect,
      execute: createCallbackRef(
        registration,
        command.id,
        "execute",
        command.onExecute,
      ),
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
      execute: createCallbackRef(
        registration,
        command.id,
        "execute",
        command.onExecute,
      ),
    }
  }

  if (command.type === "group") {
    return {
      ...base,
      type: "group",
      enableDeepSearch: command.enableDeepSearch,
      children: Array.isArray(command.children)
        ? {
            type: "static",
            commands: command.children.map((child) =>
              serializeCommand(registration, child),
            ),
          }
        : {
            type: "callback",
            callback: createCallbackRef(
              registration,
              command.id,
              "children",
              command.children,
            ),
          },
    }
  }

  if (command.type === "search") {
    return {
      ...base,
      type: "search",
      actionLabel: command.actionLabel,
      execute: command.onExecute
        ? createCallbackRef(
            registration,
            command.id,
            "execute",
            command.onExecute,
          )
        : undefined,
      getResults: createCallbackRef(
        registration,
        command.id,
        "search",
        command.getResults,
      ),
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

// Updating a registration replaces the whole serialized tree, so stale callback
// refs must be removed before new refs are allocated.
const removeRegistrationCallbacks = (registration: StoredRegistration) => {
  for (const callbackId of registration.callbackIds) {
    callbacks.delete(callbackId)
  }
  registration.callbackIds.clear()
}

const serializeRegistration = (
  registration: StoredRegistration,
): StoredRegistration["serialized"] => {
  removeRegistrationCallbacks(registration)

  return {
    id: registration.id,
    namespace: registration.namespace,
    name: registration.input.name,
    icon: registration.input.icon,
    commands: registration.input.commands.map((command) =>
      serializeCommand(registration, command),
    ),
  }
}

// A sync always sends the complete registration snapshot. This makes update,
// dispose, late bridge startup, and service-worker resync use the same path.
const postSync = () => {
  window.postMessage(
    {
      source: PAGE_SOURCE,
      type: "sync",
      registrations: [...registrations.values()].map(
        (registration) => registration.serialized,
      ),
    },
    "*",
  )
}

// Background requests are correlated by the isolated bridge, but execution
// happens here so page callbacks run in the same JS world that registered them.
const respondToInvoke = (
  requestId: string,
  response:
    | { success: true; commands?: SiteSdkCommand[] }
    | {
        success: false
        error: string
      },
) => {
  window.postMessage(
    {
      source: PAGE_SOURCE,
      type: "invoke-response",
      requestId,
      ...response,
    },
    "*",
  )
}

// Dynamic children/search callbacks must reuse the registration that owns the
// callback so any returned commands get callback refs in the same lifecycle set.
const findRegistrationForCallback = (
  callbackId: string,
): StoredRegistration | undefined => {
  return [...registrations.values()].find((registration) =>
    registration.callbackIds.has(callbackId),
  )
}

// Dispatches background-originated execute, children, and search requests to
// the page callback store, then serializes any returned command declarations.
const handleInvoke = async (
  requestId: string,
  request: SiteSdkInvokeRequest,
) => {
  const callback = callbacks.get(request.callbackId) as any
  const registration = findRegistrationForCallback(request.callbackId)

  if (!callback || !registration) {
    respondToInvoke(requestId, {
      success: false,
      error: `SDK callback not found: ${request.callbackId}`,
    })
    return
  }

  try {
    if (request.type === "execute") {
      await callback({
        commandId: request.commandId,
        context: request.context,
        values: request.values,
        executionPayload: request.executionPayload,
      } satisfies SiteSdkExecuteEvent)
      respondToInvoke(requestId, { success: true })
      return
    }

    if (request.type === "children") {
      const commands = await callback({
        commandId: request.commandId,
        context: request.context,
      } satisfies SiteSdkResolveEvent)
      respondToInvoke(requestId, {
        success: true,
        commands: (commands || []).map((command: MonocleCommand) =>
          serializeCommand(registration, command),
        ),
      })
      return
    }

    const commands = await callback({
      commandId: request.commandId,
      context: request.context,
      search: request.search,
    } satisfies SiteSdkSearchEvent)
    respondToInvoke(requestId, {
      success: true,
      commands: (commands || []).map((command: MonocleCommand) =>
        serializeCommand(registration, command),
      ),
    })
  } catch (error) {
    respondToInvoke(requestId, {
      success: false,
      error: error instanceof Error ? error.message : "Unknown SDK error",
    })
  }
}

// Listens only to bridge-tagged same-window messages; normal page postMessage
// traffic is ignored by source marker and request shape.
const installMessageListener = () => {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== BRIDGE_SOURCE) return

    if (data.type === "ready" || data.type === "sync-request") {
      postSync()
      return
    }

    if (
      data.type === "invoke" &&
      typeof data.requestId === "string" &&
      data.request
    ) {
      void handleInvoke(data.requestId, data.request)
    }
  })
}

/**
 * Installs the public page-world SDK facade.
 *
 * The facade intentionally runs in the main world so site code can call it
 * directly, while all validation and background communication stays in the
 * isolated content bridge.
 */
export function installMonocleSiteSdk() {
  if (window.Monocle?.commands?.register) {
    postSync()
    return
  }

  installMessageListener()

  window.Monocle = {
    ...(window.Monocle || {}),
    commands: {
      register(input: MonocleRegistrationInput): MonocleRegistrationHandle {
        const namespace = sanitizeIdentifier(input.namespace, "default")
        const id = allocateRegistrationId(namespace)
        const registration: StoredRegistration = {
          id,
          namespace,
          input: {
            ...input,
            namespace,
          },
          callbackIds: new Set(),
          serialized: {
            id,
            namespace,
            commands: [],
          },
        }

        registration.serialized = serializeRegistration(registration)
        registrations.set(id, registration)
        postSync()

        return {
          id,
          update(commands: MonocleCommand[]) {
            const current = registrations.get(id)
            if (!current) return

            current.input = {
              ...current.input,
              commands,
            }
            current.serialized = serializeRegistration(current)
            postSync()
          },
          dispose() {
            const current = registrations.get(id)
            if (!current) return

            removeRegistrationCallbacks(current)
            registrations.delete(id)
            postSync()
          },
        }
      },
    },
  }

  postSync()
}
