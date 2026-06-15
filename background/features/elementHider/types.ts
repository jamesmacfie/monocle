// Architecture: background feature layer (Element Hider). Config types + Zod
// validation for the feature that hides DOM elements on matching URLs. The
// rules are the single source of truth (durable in `monocle-feature-config`);
// the page-load hiding is a projected automation (./automations.ts) that runs
// through the shared user-script engine, and selectors are captured through the
// generic `picker` surface. Element Hider is the first consumer of those three
// architecture extensions, not bespoke hiding code. See docs/element-hider.md.
import { z } from "zod"
import { validateUrlPattern } from "../../utils/urlFilter"

export const ELEMENT_HIDER_FEATURE_ID = "element-hider"

// One hidden element: a CSS selector scoped to a URL pattern. `label` is a
// human hint (the element's text or selector) shown in the settings list.
export type ElementHiderRule = {
  id: string
  urlPattern: string
  selector: string
  label?: string
}

export type ElementHiderConfig = {
  rules: ElementHiderRule[]
}

export const elementHiderConfigDefaults: ElementHiderConfig = { rules: [] }

const ruleSchema = z
  .object({
    id: z.string().min(1).max(100),
    urlPattern: z
      .string()
      .refine((pattern) => validateUrlPattern(pattern) === true, {
        message: "Invalid URL pattern (use forms like *://example.com/*)",
      }),
    selector: z.string().min(1).max(2000),
    label: z.string().max(200).optional(),
  })
  .strict()

export const elementHiderConfigSchema = z.object({
  rules: z.array(ruleSchema).max(500),
})
