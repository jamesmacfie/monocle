// Architecture: background generation contract. OpenAI's strict schema is the
// precise wire contract; this defensive Zod envelope proves the response has
// the expected top-level containers before the field-aware normalizer sends it
// through Monocle's canonical, fully strict automation validator.
import { z } from "zod"
import { COLOR_NAMES } from "../../../shared/types/automationValidation"
import { ICON_NAMES } from "../../../shared/types/icons"

const JsonNodeSchema: z.ZodType<AutomationGenerationJsonNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("null") }).strict(),
    z.object({ type: z.literal("string"), value: z.string() }).strict(),
    z.object({ type: z.literal("number"), value: z.number() }).strict(),
    z.object({ type: z.literal("boolean"), value: z.boolean() }).strict(),
    z
      .object({ type: z.literal("array"), items: z.array(JsonNodeSchema) })
      .strict(),
    z
      .object({
        type: z.literal("object"),
        entries: z.array(
          z.object({ key: z.string(), value: JsonNodeSchema }).strict(),
        ),
      })
      .strict(),
  ]),
)

const IrObjectSchema = z.record(z.string(), z.unknown())

export const AutomationGenerationIrSchema = z
  .object({
    note: z.string(),
    script: z
      .object({
        schemaVersion: z.literal(1),
        name: z.string(),
        description: z.string().nullable(),
        icon: z.enum(ICON_NAMES).nullable(),
        color: z.enum(COLOR_NAMES).nullable(),
        enabled: z.boolean(),
        urlRules: IrObjectSchema.nullable(),
        triggers: z.array(IrObjectSchema),
        variables: z.array(
          z
            .object({
              name: z.string(),
              definition: IrObjectSchema,
            })
            .strict(),
        ),
        steps: z.array(IrObjectSchema),
        showResultToast: z.boolean().nullable(),
      })
      .strict(),
  })
  .strict()

export type AutomationGenerationJsonNode =
  | { type: "null" }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "array"; items: AutomationGenerationJsonNode[] }
  | {
      type: "object"
      entries: Array<{ key: string; value: AutomationGenerationJsonNode }>
    }

export type AutomationGenerationIr = z.infer<
  typeof AutomationGenerationIrSchema
>

export const parseAutomationGenerationJsonNode = (
  value: unknown,
): AutomationGenerationJsonNode | null => {
  const parsed = JsonNodeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
