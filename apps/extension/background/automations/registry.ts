// Architecture: background layer. The unified READ surface for automations.
// An "automation" is either a user-authored document stored in
// `monocle-automations` (storage.ts) or a read-only document PROJECTED from a
// feature's config (background/features). This module unions the two so every
// consumer that RUNS or LISTS automations sees both:
//   - the engine resolving an automation by id (so feature automations run),
//   - the trigger engine arming page triggers (so they fire on page load),
//   - the scheduled-alarm sync, and
//   - the options listing.
// It is deliberately READ-ONLY: writes still go through storage.ts, which owns
// `monocle-automations` and never touches projected feature documents. The
// import is one-directional (automations -> features), so there is no cycle.
// See docs/features.md and docs/automations.md.
import type { Automation } from "../../shared/types"
import { getFeatureAutomations } from "../features"
import { getAutomations } from "./storage"

/** Stored user documents followed by feature-projected ones. */
export const getAllAutomations = async (): Promise<Automation[]> => {
  const [automations, featureAutomations] = await Promise.all([
    getAutomations(),
    getFeatureAutomations(),
  ])
  return [...automations, ...featureAutomations]
}

/** One automation by id, resolving stored user docs and feature projections. */
export const getAutomationById = async (
  id: string,
): Promise<Automation | undefined> => {
  const all = await getAllAutomations()
  return all.find((automation) => automation.id === id)
}
