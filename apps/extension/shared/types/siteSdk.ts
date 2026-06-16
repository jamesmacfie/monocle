import { z } from "zod"
import {
  GENERATED_ACTION_PREFIXES,
  GENERATED_ACTION_SUFFIXES,
} from "../utils/generated-actions"
import { validateSvgIconMarkup } from "../utils/svg-icon"
import type { Browser } from "./browser"
import type { ColorName, CommandColor, CommandIcon } from "./commands"
import { ICON_NAMES, type IconName } from "./icons"
import type { FormField, SuggestionExecutionPayload } from "./ui"

export type SiteSdkPlacement = "site" | "root"

export type SiteSdkCallbackRef = {
  callbackId: string
}

export type SiteSdkCommandBase = {
  id: string
  name: string | string[]
  description?: string
  icon?: CommandIcon
  color?: ColorName | CommandColor
  keywords?: string[]
  executionPayload?: SuggestionExecutionPayload
  placement?: SiteSdkPlacement
  urlRules?: {
    allowUrls?: string[]
    denyUrls?: string[]
  }
}

export type SiteSdkActionCommand = SiteSdkCommandBase & {
  type: "action"
  actionLabel?: string
  modifierActionLabel?: Partial<Record<Browser.ModifierKey, string>>
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  execute: SiteSdkCallbackRef
}

export type SiteSdkSubmitCommand = SiteSdkCommandBase & {
  type: "submit"
  actionLabel?: string
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  doNotAddToRecents?: boolean
  execute: SiteSdkCallbackRef
}

export type SiteSdkGroupChildren =
  | { type: "static"; commands: SiteSdkCommand[] }
  | { type: "callback"; callback: SiteSdkCallbackRef }

export type SiteSdkGroupCommand = SiteSdkCommandBase & {
  type: "group"
  enableDeepSearch?: boolean
  children: SiteSdkGroupChildren
}

export type SiteSdkSearchCommand = SiteSdkCommandBase & {
  type: "search"
  actionLabel?: string
  execute?: SiteSdkCallbackRef
  getResults: SiteSdkCallbackRef
}

export type SiteSdkFormField = Extract<
  FormField,
  {
    type:
      | "text"
      | "textarea"
      | "select"
      | "checkbox"
      | "switch"
      | "multi"
      | "text-list"
      | "color"
  }
>

export type SiteSdkInputCommand = SiteSdkCommandBase & {
  type: "input"
  field: SiteSdkFormField
}

export type SiteSdkDisplayCommand = SiteSdkCommandBase & {
  type: "display"
}

export type SiteSdkCommand =
  | SiteSdkActionCommand
  | SiteSdkSubmitCommand
  | SiteSdkGroupCommand
  | SiteSdkSearchCommand
  | SiteSdkInputCommand
  | SiteSdkDisplayCommand

export type SiteSdkRegistration = {
  id: string
  namespace: string
  name?: string
  icon?: CommandIcon
  commands: SiteSdkCommand[]
}

export type SiteSdkExecuteEvent = {
  commandId: string
  context: Browser.Context
  values: Record<string, string>
  executionPayload?: SuggestionExecutionPayload
}

export type SiteSdkResolveEvent = {
  commandId: string
  context: Browser.Context
}

export type SiteSdkSearchEvent = SiteSdkResolveEvent & {
  search: string
}

export type SiteSdkInvokeRequest =
  | {
      type: "execute"
      callbackId: string
      commandId: string
      context: Browser.Context
      values: Record<string, string>
      executionPayload?: SuggestionExecutionPayload
    }
  | {
      type: "children"
      callbackId: string
      commandId: string
      context: Browser.Context
    }
  | {
      type: "search"
      callbackId: string
      commandId: string
      context: Browser.Context
      search: string
    }

export type SiteSdkInvokeResponse =
  | { success: true; commands?: SiteSdkCommand[] }
  | { success: false; error: string }

export const SITE_SDK_PAGE_SOURCE = "monocle-site-sdk"
export const SITE_SDK_BRIDGE_SOURCE = "monocle-extension-sdk-bridge"
export const SITE_SDK_MAX_COMMANDS = 100
export const SITE_SDK_MAX_DEPTH = 5

const SafeIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)

const TextSchema = z.string().max(500)
const TextArraySchema = z.array(TextSchema).min(1).max(8)
const KeywordSchema = z.array(z.string().min(1).max(80)).max(20)
const COLOR_NAMES = [
  "red",
  "green",
  "blue",
  "amber",
  "lightBlue",
  "gray",
  "purple",
  "orange",
  "teal",
  "pink",
  "indigo",
  "yellow",
] as const satisfies readonly ColorName[]

const ColorNameSchema = z.enum(COLOR_NAMES)

const IconSchema: z.ZodType<CommandIcon> = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("lucide"),
      name: z.enum([...ICON_NAMES] as [IconName, ...IconName[]]),
    })
    .strict(),
  z
    .object({
      type: z.literal("url"),
      url: z
        .string()
        .url()
        .refine((value) => {
          try {
            const url = new URL(value)
            return url.protocol === "http:" || url.protocol === "https:"
          } catch {
            return false
          }
        }, "Icon URL must use http or https"),
    })
    .strict(),
  z
    .object({
      type: z.literal("svg"),
      // Defense-in-depth only; the rendering boundary is the static <img>
      // data URI in shared/components/Icon.tsx. See shared/utils/svg-icon.ts.
      svg: z.string().superRefine((value, ctx) => {
        const result = validateSvgIconMarkup(value)
        if (result !== true) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: result })
        }
      }),
    })
    .strict(),
])

const ColorSchema = z.union([
  ColorNameSchema,
  z.object({ preset: ColorNameSchema }).strict(),
  z.object({ custom: z.string().max(80) }).strict(),
])

const ExecutionPayloadSchema = z.record(
  z.string().min(1).max(80),
  z.union([z.string().max(1000), z.array(z.string().max(1000)).max(50)]),
)

// Kept local to shared types so SDK validation can run in both the isolated
// content bridge and background tests without importing background utilities.
const validateSiteSdkUrlPattern = (pattern: string): true | string => {
  const normalizedPattern = pattern.trim()

  if (!normalizedPattern) {
    return "Pattern cannot be empty"
  }

  if (/\s/.test(normalizedPattern)) {
    return "Pattern cannot contain whitespace"
  }

  if (normalizedPattern.includes("://")) {
    const protocolMatch = normalizedPattern.match(/^([^:]+):\/\/(.*)$/)

    if (!protocolMatch) {
      return "Pattern protocol is invalid"
    }

    const [, protocol, rest] = protocolMatch
    if (!["*", "http", "https"].includes(protocol.toLowerCase())) {
      return "Pattern protocol must be http, https, or *"
    }

    const host = rest.split("/")[0]
    if (!host) {
      return "Pattern host cannot be empty"
    }
  } else {
    const host = normalizedPattern.split("/")[0]
    if (!host || host.startsWith(":")) {
      return "Pattern host cannot be empty"
    }
  }

  try {
    new RegExp(
      normalizedPattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*"),
    )
    return true
  } catch {
    return "Invalid pattern format"
  }
}

const UrlPatternSchema = z
  .string()
  .min(1)
  .max(500)
  .superRefine((pattern, ctx) => {
    const validation = validateSiteSdkUrlPattern(pattern)

    if (validation !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation,
      })
    }
  })

const UrlRulesSchema = z
  .object({
    allowUrls: z.array(UrlPatternSchema).max(25).optional(),
    denyUrls: z.array(UrlPatternSchema).max(25).optional(),
  })
  .strict()

const CallbackRefSchema: z.ZodType<SiteSdkCallbackRef> = z
  .object({
    callbackId: z.string().min(1).max(160),
  })
  .strict()

const OptionSchema = z
  .object({
    value: z.string().max(300),
    label: z.string().max(300),
  })
  .strict()

const JsonSchemaSchema = z.record(z.string(), z.unknown())

const FormFieldSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: SafeIdSchema,
      label: TextSchema,
      required: z.boolean().optional(),
      validation: JsonSchemaSchema.optional(),
      type: z.literal("text"),
      placeholder: TextSchema.optional(),
      defaultValue: z.string().max(1000).optional(),
    })
    .strict(),
  z
    .object({
      id: SafeIdSchema,
      label: TextSchema,
      required: z.boolean().optional(),
      validation: JsonSchemaSchema.optional(),
      type: z.literal("textarea"),
      placeholder: TextSchema.optional(),
      defaultValue: z.string().max(10_000).optional(),
      rows: z.number().int().positive().max(30).optional(),
    })
    .strict(),
  z
    .object({
      id: SafeIdSchema,
      label: TextSchema,
      required: z.boolean().optional(),
      validation: JsonSchemaSchema.optional(),
      type: z.literal("select"),
      options: z.array(OptionSchema).min(1).max(50),
      defaultValue: z.string().max(300).optional(),
      placeholder: TextSchema.optional(),
    })
    .strict(),
  z
    .object({
      id: SafeIdSchema,
      label: TextSchema,
      required: z.boolean().optional(),
      validation: JsonSchemaSchema.optional(),
      type: z.union([z.literal("checkbox"), z.literal("switch")]),
      defaultChecked: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      id: SafeIdSchema,
      label: TextSchema,
      required: z.boolean().optional(),
      validation: JsonSchemaSchema.optional(),
      type: z.literal("multi"),
      options: z.array(OptionSchema).min(1).max(50),
      defaultValue: z.array(z.string().max(300)).max(50).optional(),
    })
    .strict(),
  z
    .object({
      id: SafeIdSchema,
      label: TextSchema,
      required: z.boolean().optional(),
      validation: JsonSchemaSchema.optional(),
      type: z.literal("text-list"),
      placeholder: TextSchema.optional(),
      defaultValue: z.array(z.string().max(1000)).max(50).optional(),
      maxItems: z.number().int().positive().max(50).optional(),
    })
    .strict(),
  z
    .object({
      id: SafeIdSchema,
      label: TextSchema,
      required: z.boolean().optional(),
      validation: JsonSchemaSchema.optional(),
      type: z.literal("color"),
      defaultValue: z.string().max(30).optional(),
      placeholder: TextSchema.optional(),
    })
    .strict(),
])

const BaseCommandSchema = z.object({
  id: SafeIdSchema,
  name: z.union([TextSchema, TextArraySchema]),
  description: TextSchema.optional(),
  icon: IconSchema.optional(),
  color: ColorSchema.optional(),
  keywords: KeywordSchema.optional(),
  executionPayload: ExecutionPayloadSchema.optional(),
  placement: z.enum(["site", "root"]).optional(),
  urlRules: UrlRulesSchema.optional(),
})

type SiteSdkCommandSchema = z.ZodType<SiteSdkCommand>

const SiteSdkCommandSchema: SiteSdkCommandSchema = z.lazy(() =>
  z.discriminatedUnion("type", [
    BaseCommandSchema.extend({
      type: z.literal("action"),
      actionLabel: TextSchema.optional(),
      modifierActionLabel: z
        .object({
          shift: TextSchema.optional(),
          cmd: TextSchema.optional(),
          alt: TextSchema.optional(),
          ctrl: TextSchema.optional(),
        })
        .strict()
        .optional(),
      confirmAction: z.boolean().optional(),
      remainOpenOnSelect: z.boolean().optional(),
      execute: CallbackRefSchema,
    }).strict(),
    BaseCommandSchema.extend({
      type: z.literal("submit"),
      actionLabel: TextSchema.optional(),
      confirmAction: z.boolean().optional(),
      remainOpenOnSelect: z.boolean().optional(),
      doNotAddToRecents: z.boolean().optional(),
      execute: CallbackRefSchema,
    }).strict(),
    BaseCommandSchema.extend({
      type: z.literal("group"),
      enableDeepSearch: z.boolean().optional(),
      children: z.discriminatedUnion("type", [
        z
          .object({
            type: z.literal("static"),
            commands: z.array(SiteSdkCommandSchema),
          })
          .strict(),
        z
          .object({
            type: z.literal("callback"),
            callback: CallbackRefSchema,
          })
          .strict(),
      ]),
    }).strict(),
    BaseCommandSchema.extend({
      type: z.literal("search"),
      actionLabel: TextSchema.optional(),
      execute: CallbackRefSchema.optional(),
      getResults: CallbackRefSchema,
    }).strict(),
    BaseCommandSchema.extend({
      type: z.literal("input"),
      field: FormFieldSchema,
    }).strict(),
    BaseCommandSchema.extend({
      type: z.literal("display"),
    }).strict(),
  ]),
)

export const SiteSdkRegistrationSchema: z.ZodType<SiteSdkRegistration> = z
  .object({
    id: SafeIdSchema,
    namespace: SafeIdSchema,
    name: TextSchema.optional(),
    icon: IconSchema.optional(),
    commands: z.array(SiteSdkCommandSchema).max(SITE_SDK_MAX_COMMANDS),
  })
  .strict()

export const SiteSdkRegistrationsSchema = z
  .array(SiteSdkRegistrationSchema)
  .max(20)

// Sites cannot claim ids that collide with Monocle's generated action rows.
const isReservedCommandId = (id: string): boolean => {
  return (
    GENERATED_ACTION_SUFFIXES.some((suffix) => id.endsWith(suffix)) ||
    GENERATED_ACTION_PREFIXES.some((prefix) => id.startsWith(prefix))
  )
}

type ValidationIssue = {
  path: string
  message: string
}

// Zod validates shape; this second pass validates tree-level invariants such as
// duplicate ids, max depth/count, reserved ids, and root-only placement.
const visitCommands = (
  commands: SiteSdkCommand[],
  issues: ValidationIssue[],
  options: {
    path: string
    depth: number
    allowPlacement: boolean
    ids: Set<string>
    count: { value: number }
  },
) => {
  if (options.depth > SITE_SDK_MAX_DEPTH) {
    issues.push({
      path: options.path,
      message: `Command tree exceeds maximum depth ${SITE_SDK_MAX_DEPTH}`,
    })
    return
  }

  for (const [index, command] of commands.entries()) {
    const path = `${options.path}[${index}]`
    options.count.value += 1

    if (options.count.value > SITE_SDK_MAX_COMMANDS) {
      issues.push({
        path,
        message: `Command tree exceeds maximum command count ${SITE_SDK_MAX_COMMANDS}`,
      })
    }

    if (options.ids.has(command.id)) {
      issues.push({ path, message: `Duplicate command id "${command.id}"` })
    }
    options.ids.add(command.id)

    if (isReservedCommandId(command.id)) {
      issues.push({ path, message: `Command id "${command.id}" is reserved` })
    }

    if (!options.allowPlacement && command.placement !== undefined) {
      issues.push({
        path,
        message: "placement is only allowed on root commands",
      })
    }

    if (command.type === "group" && command.children.type === "static") {
      visitCommands(command.children.commands, issues, {
        ...options,
        path: `${path}.children.commands`,
        depth: options.depth + 1,
        allowPlacement: false,
      })
    }
  }
}

/**
 * Validates a list of SDK commands without a registration wrapper.
 *
 * The content bridge and background use this for callback-returned dynamic
 * children/search results, where `placement` must be rejected because returned
 * commands are already nested under an existing page.
 */
export function validateSiteSdkCommandList(
  input: unknown,
  options: { allowPlacement?: boolean } = {},
):
  | { success: true; commands: SiteSdkCommand[] }
  | { success: false; error: string } {
  const parsed = z
    .array(SiteSdkCommandSchema)
    .max(SITE_SDK_MAX_COMMANDS)
    .safeParse(input)

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    }
  }

  const issues: ValidationIssue[] = []
  visitCommands(parsed.data, issues, {
    path: "commands",
    depth: 1,
    allowPlacement: options.allowPlacement ?? true,
    ids: new Set(),
    count: { value: 0 },
  })

  if (issues.length > 0) {
    return {
      success: false,
      error: issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; "),
    }
  }

  return { success: true, commands: parsed.data }
}

/**
 * Validates the full page registration snapshot sent by the SDK facade.
 *
 * A successful result is safe to store in the background registry, but still
 * contains only serialized callback refs; executable functions remain in the
 * page-world facade.
 */
export function validateSiteSdkRegistrations(
  input: unknown,
):
  | { success: true; registrations: SiteSdkRegistration[] }
  | { success: false; error: string } {
  const parsed = SiteSdkRegistrationsSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    }
  }

  const issues: ValidationIssue[] = []
  const registrationIds = new Set<string>()

  for (const [index, registration] of parsed.data.entries()) {
    if (registrationIds.has(registration.id)) {
      issues.push({
        path: `[${index}]`,
        message: `Duplicate registration id "${registration.id}"`,
      })
    }
    registrationIds.add(registration.id)

    visitCommands(registration.commands, issues, {
      path: `[${index}].commands`,
      depth: 1,
      allowPlacement: true,
      ids: new Set(),
      count: { value: 0 },
    })
  }

  if (issues.length > 0) {
    return {
      success: false,
      error: issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; "),
    }
  }

  return { success: true, registrations: parsed.data }
}
