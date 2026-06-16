// Architecture: background layer. The unified READ surface for automations.
// An "automation" is either a user-authored document stored in
// `monocle-userscripts` (storage.ts) or a read-only document PROJECTED from a
// feature's config (background/features). This module unions the two so every
// consumer that RUNS or LISTS automations sees both:
//   - the engine resolving a script by id (so feature automations run),
//   - the trigger engine arming page triggers (so they fire on page load),
//   - the scheduled-alarm sync, and
//   - the options listing.
// It is deliberately READ-ONLY: writes still go through storage.ts, which owns
// `monocle-userscripts` and never touches projected feature documents. The
// import is one-directional (userScripts -> features), so there is no cycle.
// See docs/features.md and docs/user-scripts.md.
import type { UserScript } from "../../shared/types"
import { getFeatureAutomations } from "../features"
import { getUserScripts } from "./storage"

/** Stored user documents followed by feature-projected ones. */
export const getAllAutomations = async (): Promise<UserScript[]> => {
  const [userScripts, featureAutomations] = await Promise.all([
    getUserScripts(),
    getFeatureAutomations(),
  ])
  return [...userScripts, ...featureAutomations]
}

/** One automation by id, resolving stored user docs and feature projections. */
export const getAutomationById = async (
  id: string,
): Promise<UserScript | undefined> => {
  const all = await getAllAutomations()
  return all.find((automation) => automation.id === id)
}
