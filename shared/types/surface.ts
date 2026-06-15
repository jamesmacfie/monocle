// Architecture: shared/ type layer. The Surfaces primitive — a declarative,
// background-owned description of persistent UI that content/new-tab render
// through one generic host (shared/components/SurfaceHost.tsx). Modeled on
// toasts (background owns the UI state, content listens + renders) but
// persistent and URL-scoped. Surfaces are DATA, never markup: a trusted
// bundled component renders the fixed fields, so there is no arbitrary HTML/JS
// — the same store-safe-harbor posture as the rest of the codebase. Any
// feature, user-script automation, OR command can push surfaces.
//
// These types are DERIVED from the Zod schema in ./surfaceValidation (the single
// source of truth, which also validates every write to the store), so the type
// and its validator can never drift. The `modal` kind is a centered, dismissible
// card that renders structured `content.blocks` through the shared ContentBlocks
// renderer (the first surface body to do so). See docs/surfaces.md.
import type { z } from "zod"
import type {
  SurfaceContentSchema,
  SurfaceKindSchema,
  SurfaceSchema,
  SurfaceUrlMatchSchema,
} from "./surfaceValidation"

export type SurfaceKind = z.infer<typeof SurfaceKindSchema>
export type SurfaceUrlMatch = z.infer<typeof SurfaceUrlMatchSchema>
export type SurfaceContent = z.infer<typeof SurfaceContentSchema>
export type Surface = z.infer<typeof SurfaceSchema>

// Response to get-surfaces: the surfaces whose urlMatch admits the sender URL.
// The host filters by kind locally (it knows which kinds it renders).
export type GetSurfacesResponse = {
  surfaces: Surface[]
}
