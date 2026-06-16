// Architecture: background feature layer. Shared helper that builds the
// "Configure {name}" palette command a feature exposes to open its settings
// page. Kept as an explicit helper a feature includes in its own commands()
// (rather than registry magic) so a feature's palette surface stays greppable.
// See docs/features.md.
import type { ActionCommandNode } from "../../shared/types"
import { openOptionsPage } from "../../shared/utils/extension-api"

export const configureFeatureCommandId = (featureId: string): string =>
  `feature-${featureId}-configure`

export const createConfigureFeatureCommand = (
  featureId: string,
  name: string,
): ActionCommandNode => ({
  type: "action",
  id: configureFeatureCommandId(featureId),
  name: `Configure ${name}`,
  description: `Open ${name} settings`,
  icon: { type: "lucide", name: "Settings" },
  keywords: ["settings", "configure", "options", name.toLowerCase()],
  execute: async () => {
    await openOptionsPage(`/features/${featureId}`)
  },
})
