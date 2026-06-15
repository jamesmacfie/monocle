// Architecture: background layer (tests). The unified automation read surface:
// getAllAutomations unions stored user documents with feature-projected ones,
// and getAutomationById resolves either kind. Uses the real storage + feature
// registry (Element Hider projects from its config), so this also guards that
// feature automations actually surface to the engine/trigger consumers.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { isFeatureAutomation } from "../../shared/types/userScripts"
import { setFeatureConfig } from "../features/config"
import { ELEMENT_HIDER_FEATURE_ID } from "../features/elementHider/types"
import { getAllAutomations, getAutomationById } from "./registry"
import { addUserScript } from "./storage"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", { runtime: { id: "monocle-test" } })
}

beforeEach(async () => {
  fakeBrowser.reset()
  installBrowserStubs()
  await fakeBrowser.storage.local.clear()
})

const minimalUserDraft = {
  schemaVersion: 1 as const,
  name: "My automation",
  enabled: true,
  triggers: [{ type: "manual" as const }],
  steps: [{ op: "toast" as const, message: "hi" }],
}

describe("getAllAutomations", () => {
  it("returns only stored user docs when no feature projects automations", async () => {
    await addUserScript(minimalUserDraft)
    const all = await getAllAutomations()
    expect(all).toHaveLength(1)
    expect(all.every((a) => !isFeatureAutomation(a))).toBe(true)
  })

  it("unions user docs with feature-projected automations", async () => {
    await addUserScript(minimalUserDraft)
    await setFeatureConfig(ELEMENT_HIDER_FEATURE_ID, {
      rules: [{ id: "1", urlPattern: "*://a.com/*", selector: ".ad" }],
    })

    const all = await getAllAutomations()
    const featureOnes = all.filter(isFeatureAutomation)
    expect(all.length).toBe(2)
    expect(featureOnes).toHaveLength(1)
    expect(featureOnes[0].owner).toEqual({
      kind: "feature",
      featureId: ELEMENT_HIDER_FEATURE_ID,
    })
  })
})

describe("getAutomationById", () => {
  it("resolves a feature-projected automation by its deterministic id", async () => {
    await setFeatureConfig(ELEMENT_HIDER_FEATURE_ID, {
      rules: [{ id: "1", urlPattern: "*://a.com/*", selector: ".ad" }],
    })
    const all = await getAllAutomations()
    const featureId = all.find(isFeatureAutomation)?.id as string

    const resolved = await getAutomationById(featureId)
    expect(resolved?.id).toBe(featureId)
    expect(isFeatureAutomation(resolved ?? { owner: undefined })).toBe(true)
  })
})
