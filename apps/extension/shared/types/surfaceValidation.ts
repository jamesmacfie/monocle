// Architecture: shared/ validation layer for the Surfaces primitive
// (./surface.ts). A Surface crosses the background<->UI boundary and is pushed
// into the store by three kinds of owner — features, commands, and automation
// automations — so this Zod schema is the SINGLE SOURCE OF TRUTH:
//   - surface.ts derives its TS types from it (`z.infer`), so type and schema
//     cannot drift;
//   - background/surfaces.ts validates every write against it, closing the
//     silent-accept gap (previously only automations were validated);
//   - automationValidation reuses these schemas (extended with tighter caps on
//     attacker-facing free-text), so the two can never diverge again.
// Content is the closed content-block vocabulary (./contentValidation) — never
// author-supplied markup. See docs/surfaces.md.
import { z } from "zod"
import { ContentBlockSchema } from "./contentValidation"
import { ICON_NAMES } from "./icons"

// `picker` is an interactive, ephemeral kind: it puts the content host into
// element pick-mode (highlight on hover, report the clicked element back via
// `surface-action`). Unlike the render-only kinds, the host attaches page-level
// listeners while a picker is present; the surface itself never mutates the
// page. See docs/surfaces.md.
export const SurfaceKindSchema = z.enum(["overlay", "badge", "modal", "picker"])

// Optional URL gate (reuses the command url-rule pattern via matchesUrlPattern).
// Absent = the surface applies everywhere.
export const SurfaceUrlMatchSchema = z
  .object({
    allowUrls: z.array(z.string()).optional(),
    denyUrls: z.array(z.string()).optional(),
  })
  .strict()

// The renderable payload. Every field is declarative and optional; the host
// renders what is present. `countdownTo` is a generic live-countdown (epoch ms);
// `blocks` is the shared, validated content-block vocabulary rendered by the
// same ContentBlocks component the palette uses (currently the `modal` kind).
export const SurfaceContentSchema = z
  .object({
    icon: z.enum(ICON_NAMES).optional(),
    title: z.string().optional(),
    text: z.string().optional(),
    countdownTo: z.number().int().nonnegative().optional(),
    blocks: z.array(ContentBlockSchema).optional(),
    // `picker` only: CSS property names whose computed values the owner wants
    // reported back in the PickedElement (e.g. the font inspector requests the
    // font-* properties). Content reads getComputedStyle for these at click time.
    css: z.array(z.string().max(128)).max(64).optional(),
  })
  .strict()

export const SurfaceSchema = z
  .object({
    // Unique within an owner (the store namespaces by owner).
    id: z.string().min(1),
    // Stamped onto returned surfaces by getSurfacesForUrl so the host can target
    // an owner in a surface-action; not part of the stored shape.
    ownerId: z.string().optional(),
    kind: SurfaceKindSchema,
    urlMatch: SurfaceUrlMatchSchema.optional(),
    // Optional tab gate for interactive or tab-specific surfaces. Absent keeps
    // the existing URL-only behavior used by focus overlays, badges, and modals.
    targetTabId: z.number().int().positive().optional(),
    // Overlay only: intercept pointer/scroll (a hard block).
    blocking: z.boolean().optional(),
    content: SurfaceContentSchema,
  })
  .strict()

// Returns the validated surface, or null when the value is not a well-formed
// Surface. Callers (the store) log and skip invalid surfaces rather than
// persisting them.
export function validateSurface(
  value: unknown,
): z.infer<typeof SurfaceSchema> | null {
  const result = SurfaceSchema.safeParse(value)
  return result.success ? result.data : null
}
