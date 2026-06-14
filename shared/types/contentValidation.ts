// Architecture: shared/ validation layer for the declarative content-block
// vocabulary (./content.ts). Content blocks cross the background -> UI boundary
// inside calculation suggestions (and, in future, Surfaces content), so every
// block array is validated here before it is rendered. This is the closed,
// validated schema that guarantees the UI only ever renders structured blocks
// Monocle understands — never author-supplied markup.
import { z } from "zod"
import type { ContentBlock } from "./content"

const CodeBlockSchema = z.object({
  type: z.literal("code"),
  lang: z.string().optional(),
  text: z.string(),
})

const KeyValueBlockSchema = z.object({
  type: z.literal("keyValue"),
  rows: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
    }),
  ),
})

const MarkdownBlockSchema = z.object({
  type: z.literal("markdown"),
  text: z.string(),
})

const ImageBlockSchema = z.object({
  type: z.literal("image"),
  dataUrl: z.string(),
})

export const ContentBlockSchema = z.discriminatedUnion("type", [
  CodeBlockSchema,
  KeyValueBlockSchema,
  MarkdownBlockSchema,
  ImageBlockSchema,
])

export const ContentBlocksSchema = z.array(ContentBlockSchema)

// Returns the validated blocks, or null when the payload is not a valid
// ContentBlock[] (fail-quiet: an invalid block array simply renders nothing
// rather than throwing across the boundary).
export function validateContentBlocks(value: unknown): ContentBlock[] | null {
  const result = ContentBlocksSchema.safeParse(value)
  return result.success ? (result.data as ContentBlock[]) : null
}
