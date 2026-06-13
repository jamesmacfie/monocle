// Architecture: background feature layer (Focus Mode). The FeatureModule that
// ties the pieces together: the palette command group, the declarative settings
// schema + Zod config validation, the Start/Stop settings-page actions, the
// blocklist-change broadcast, and the startup lifecycle. Registered in
// background/features/index.ts. See docs/focus-mode.md.
import { z } from "zod"
import { validateUrlPattern } from "../../utils/urlFilter"
import type { FeatureModule } from "../types"
import { focusModeGroup } from "./commands"
import {
  getSession,
  initFocusSession,
  startSession,
  stopSession,
  syncFocusSurfaces,
} from "./session"
import {
  FOCUS_FEATURE_ID,
  type FocusConfig,
  focusConfigDefaults,
} from "./types"

const blockedPatternSchema = z
  .string()
  .refine((pattern) => validateUrlPattern(pattern) === true, {
    message: "Invalid URL pattern (use forms like *://*.youtube.com/*)",
  })

const focusConfigSchema = z.object({
  blockedUrlPatterns: z.array(blockedPatternSchema),
  defaultDurationMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
})

export const focusFeature: FeatureModule<FocusConfig> = {
  id: FOCUS_FEATURE_ID,
  name: "Focus Mode",
  description: "Block distracting sites during focus sessions",
  icon: { type: "lucide", name: "Shield" },
  commands: () => [focusModeGroup],
  init: initFocusSession,
  settings: {
    configSchema: focusConfigSchema,
    defaults: focusConfigDefaults,
    schema: {
      sections: [
        {
          title: "Blocked sites",
          description:
            "While a focus session is active, these sites are blocked with a full-page overlay. Uses the same URL patterns as command URL rules (e.g. *://*.youtube.com/*).",
          fields: [
            {
              id: "blockedUrlPatterns",
              label: "Blocked sites",
              type: "text-list",
              placeholder: "*://*.youtube.com/*",
            },
            {
              id: "defaultDurationMinutes",
              label: "Pomodoro / default duration (minutes)",
              type: "number",
              min: 1,
              max: 1440,
            },
          ],
        },
      ],
      actions: [
        { id: "start", label: "Start focus", style: "primary" },
        { id: "stop", label: "Stop focus", style: "danger" },
      ],
    },
    handleAction: async (actionId) => {
      if (actionId === "start") {
        await startSession("indefinite")
      } else if (actionId === "stop") {
        await stopSession()
      }
    },
    // Blocklist edits must re-project surfaces so open overlays re-evaluate
    // live (the new blocklist changes which URLs are blocked).
    onConfigChange: async () => {
      const session = await getSession()
      await syncFocusSurfaces(session)
    },
  },
}
