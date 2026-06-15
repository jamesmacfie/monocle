// Shared declarative content-block vocabulary.
//
// The Zod schema in `./contentValidation` (`ContentBlockSchema`) is the single
// source of truth; this type is DERIVED from it via `z.infer`, so the type and
// its validator can never drift. A `ContentBlock[]` is the closed, validated
// schema for structured content rendered by Monocle components — never
// author-supplied markup (the same posture as Surfaces and the site SDK). It is
// rendered by one generic component (`shared/components/ContentBlocks/`) mounted
// in two places:
//   - inside a calculation's palette row (docs/calculations.md), and
//   - inside `modal` Surfaces' body (docs/surfaces.md).
import type { z } from "zod"
import type { ContentBlockSchema } from "./contentValidation"

export type ContentBlock = z.infer<typeof ContentBlockSchema>
