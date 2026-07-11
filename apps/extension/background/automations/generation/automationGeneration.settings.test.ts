import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import {
  clearAutomationGenerationApiKey,
  getAutomationGenerationApiKey,
  getAutomationGenerationSettingsStatus,
  setAutomationGenerationApiKey,
} from "./settings"

beforeEach(() => {
  fakeBrowser.reset()
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", { runtime: { id: "monocle-test" } })
})

describe("automation generation API-key settings", () => {
  it("supports missing, set, replace, and clear without exposing the key in status", async () => {
    await expect(
      getAutomationGenerationSettingsStatus(),
    ).resolves.toMatchObject({
      hasApiKey: false,
    })
    await setAutomationGenerationApiKey("  first-secret  ")
    await expect(getAutomationGenerationApiKey()).resolves.toBe("first-secret")
    const status = await getAutomationGenerationSettingsStatus()
    expect(status).toMatchObject({ hasApiKey: true })
    expect(JSON.stringify(status)).not.toContain("first-secret")

    await setAutomationGenerationApiKey("second-secret")
    await expect(getAutomationGenerationApiKey()).resolves.toBe("second-secret")
    await clearAutomationGenerationApiKey()
    await expect(getAutomationGenerationApiKey()).resolves.toBeUndefined()
  })

  it("rejects an empty key", async () => {
    await expect(setAutomationGenerationApiKey("   ")).rejects.toThrow(/empty/i)
  })
})
