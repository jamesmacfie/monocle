// Architecture: background feature layer (tests). Element Hider: the
// config-to-automation projection (grouping by URL pattern, and every projected
// document being a VALID Automation — the only validation gate for projected
// docs, since they bypass addAutomation), plus the handleAction paths
// (element-picked saves a domain rule + hides immediately; delete-rule removes
// one). Workflow execution and the surfaces store are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { ActionCommandNode } from "../../../shared/types"
import { isFeatureAutomation } from "../../../shared/types/automations"
import { AutomationSchema } from "../../../shared/types/automationValidation"
import { getFeatureConfig, setFeatureConfig } from "../config"

const {
  hideNow,
  removeSurface,
  upsertSurface,
  ensureHostPermission,
  openHostPermissionGrantPage,
  showToast,
} = vi.hoisted(() => ({
  hideNow: vi.fn(async () => ({
    tabId: 1,
    result: {
      success: true as boolean,
      error: undefined as string | undefined,
    },
  })),
  removeSurface: vi.fn(async () => {}),
  upsertSurface: vi.fn(async () => {}),
  ensureHostPermission: vi.fn(async () => ({
    granted: true,
    originPattern: "https://shop.example.com/*",
  })),
  openHostPermissionGrantPage: vi.fn(async () => ({
    granted: false,
    originPattern: "https://shop.example.com/*",
  })),
  showToast: vi.fn(async () => ({ success: true })),
}))

vi.mock("../../workflows/execution", () => ({
  executeWorkflowOnTargetTab: hideNow,
}))
vi.mock("../../surfaces", () => ({
  removeSurface,
  upsertSurface,
}))
vi.mock("../../messages/showToast", () => ({
  showToast,
}))
vi.mock("../../utils/hostPermissions", () => ({
  ensureHostPermission,
  openHostPermissionGrantPage,
  hostPermissionPatternForUrl: (url: string) => {
    if (!/^https?:\/\//.test(url)) {
      return { ok: false, error: "not a web page" }
    }
    const parsed = new URL(url)
    return {
      ok: true,
      originPattern: `${parsed.protocol}//${parsed.hostname}/*`,
    }
  },
}))

import { projectElementHiderAutomations } from "./automations"
import { elementHiderFeature } from "./index"
import { ELEMENT_HIDER_FEATURE_ID, elementHiderConfigDefaults } from "./types"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", { runtime: { id: "monocle-test" } })
}

beforeEach(async () => {
  fakeBrowser.reset()
  installBrowserStubs()
  await fakeBrowser.storage.local.clear()
  hideNow.mockReset().mockResolvedValue({
    tabId: 1,
    result: {
      success: true as boolean,
      error: undefined as string | undefined,
    },
  })
  removeSurface.mockClear()
  upsertSurface.mockClear()
  openHostPermissionGrantPage.mockClear()
  showToast.mockClear()
  ensureHostPermission.mockReset().mockResolvedValue({
    granted: true,
    originPattern: "https://shop.example.com/*",
  })
})

const getConfig = () =>
  getFeatureConfig(ELEMENT_HIDER_FEATURE_ID, elementHiderConfigDefaults)

describe("projectElementHiderAutomations", () => {
  it("projects one isolated elementAppears automation per rule", () => {
    const automations = projectElementHiderAutomations({
      rules: [
        { id: "1", urlPattern: "*://a.com/*", selector: ".ad" },
        { id: "2", urlPattern: "*://a.com/*", selector: ".banner" },
        { id: "3", urlPattern: "*://b.com/*", selector: "#promo" },
      ],
    })

    expect(automations).toHaveLength(3)
    const ad = automations.find((a) =>
      a.steps.some(
        (step) => step.op === "hideElement" && step.target.value === ".ad",
      ),
    )
    expect(ad?.steps).toHaveLength(1)
    expect(ad?.steps[0]?.op).toBe("hideElement")
    expect(ad?.urlRules?.allowUrls).toEqual(["*://a.com/*"])
    expect(ad?.triggers[0]).toMatchObject({
      type: "elementAppears",
      selector: { strategy: "css", value: ".ad" },
    })
  })

  it("emits valid, feature-owned Automation documents", () => {
    const longSelector = `.${"x".repeat(1800)}`
    const automations = projectElementHiderAutomations({
      rules: [{ id: "1", urlPattern: "*://x.com/*", selector: longSelector }],
    })
    for (const automation of automations) {
      expect(AutomationSchema.safeParse(automation).success).toBe(true)
      expect(isFeatureAutomation(automation)).toBe(true)
      // Silent on every page load — no success toast.
      expect(automation.options?.showResultToast).toBe(false)
      expect(
        automation.id.startsWith(`feature:${ELEMENT_HIDER_FEATURE_ID}:`),
      ).toBe(true)
    }
  })

  it("produces deterministic ids for the same rule data", () => {
    const once = projectElementHiderAutomations({
      rules: [{ id: "1", urlPattern: "*://x.com/*", selector: ".x" }],
    })
    const twice = projectElementHiderAutomations({
      rules: [{ id: "1", urlPattern: "*://x.com/*", selector: ".x" }],
    })
    expect(once[0].id).toBe(twice[0].id)
  })
})

describe("elementHiderFeature.settings.lists", () => {
  it("shows the selector as the label and the text + pattern in the sublabel", async () => {
    const rows = await elementHiderFeature.settings?.lists?.({
      rules: [
        {
          id: "1",
          urlPattern: "*://a.com/*",
          selector: ".cookie-banner",
          label: "We use cookies",
        },
      ],
    })
    expect(rows?.rules[0]).toEqual({
      id: "1",
      label: ".cookie-banner",
      sublabel: "We use cookies · *://a.com/*",
    })
  })

  it("falls back to just the pattern when there is no text", async () => {
    const rows = await elementHiderFeature.settings?.lists?.({
      rules: [{ id: "1", urlPattern: "*://a.com/*", selector: ".ad" }],
    })
    expect(rows?.rules[0]).toEqual({
      id: "1",
      label: ".ad",
      sublabel: "*://a.com/*",
    })
  })
})

describe("elementHiderFeature.commands", () => {
  const pickCommand = (): ActionCommandNode | undefined =>
    elementHiderFeature
      .commands?.()
      .find((command): command is ActionCommandNode => {
        return command.id === "element-hider-pick" && command.type === "action"
      })

  const stubActiveTab = (url = "https://shop.example.com/products") => {
    vi.stubGlobal("chrome", {
      runtime: { id: "monocle-test", lastError: undefined },
      tabs: {
        query: vi.fn((_query, callback) => callback([{ id: 7, url }])),
        sendMessage: vi.fn((_tabId, _message, callback) =>
          callback?.({ received: true }),
        ),
      },
    })
  }

  it("requests host access before creating the picker surface", async () => {
    stubActiveTab()

    await pickCommand()?.execute?.({
      url: "https://shop.example.com/products",
      title: "Shop",
      modifierKey: null,
    })

    expect(ensureHostPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 7,
        url: "https://shop.example.com/products",
        reason: "elementHider",
        request: false,
        ensureContentScript: true,
      }),
    )
    expect(openHostPermissionGrantPage).not.toHaveBeenCalled()
    expect(upsertSurface).toHaveBeenCalledTimes(1)
  })

  it("does not create the picker when host access is denied", async () => {
    stubActiveTab()
    ensureHostPermission.mockResolvedValueOnce({
      granted: false,
      originPattern: "https://shop.example.com/*",
    })

    await pickCommand()?.execute?.({
      url: "https://shop.example.com/products",
      title: "Shop",
      modifierKey: null,
    })

    expect(upsertSurface).not.toHaveBeenCalled()
    expect(openHostPermissionGrantPage).toHaveBeenCalledWith({
      tabId: 7,
      url: "https://shop.example.com/products",
      reason: "elementHider",
    })
  })
})

describe("elementHiderFeature.handleAction", () => {
  const handle = elementHiderFeature.settings?.handleAction

  it("element-picked saves an origin-scoped rule and hides immediately", async () => {
    await handle?.("element-picked", {
      selection: {
        selector: ".cookie-banner",
        tagName: "DIV",
        innerText: "We use cookies",
      },
      tab: { id: 7, url: "https://shop.example.com/products?x=1" },
    })

    const config = await getConfig()
    expect(config.rules).toHaveLength(1)
    expect(config.rules[0]).toMatchObject({
      urlPattern: "https://shop.example.com/*",
      selector: ".cookie-banner",
      label: "We use cookies",
    })
    expect(hideNow).toHaveBeenCalledTimes(1)
    expect(removeSurface).toHaveBeenCalledWith(
      ELEMENT_HIDER_FEATURE_ID,
      "picker",
    )
  })

  it("warns when the immediate hide workflow fails", async () => {
    hideNow.mockResolvedValueOnce({
      tabId: 7,
      result: {
        success: false,
        error: "Could not find element for selector",
      },
    })

    await handle?.("element-picked", {
      selection: {
        selector: ".cookie-banner",
        tagName: "DIV",
        innerText: "We use cookies",
      },
      tab: { id: 7, url: "https://shop.example.com/products?x=1" },
    })

    const config = await getConfig()
    expect(config.rules).toHaveLength(1)
    expect(hideNow).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warning",
        message: "Could not find element for selector",
      }),
    )
    expect(removeSurface).toHaveBeenCalledWith(
      ELEMENT_HIDER_FEATURE_ID,
      "picker",
    )
  })

  it("uses the scheme and host for localhost URL patterns", async () => {
    await handle?.("element-picked", {
      selection: {
        selector: "#debug-panel",
        tagName: "DIV",
      },
      tab: { id: 7, url: "http://localhost:3000/dashboard" },
    })

    const config = await getConfig()
    expect(config.rules[0]).toMatchObject({
      urlPattern: "http://localhost/*",
      selector: "#debug-panel",
    })
  })

  it("does not save or hide when host access was revoked before picking", async () => {
    ensureHostPermission.mockResolvedValueOnce({
      granted: false,
      originPattern: "https://shop.example.com/*",
    })

    await handle?.("element-picked", {
      selection: {
        selector: ".cookie-banner",
        tagName: "DIV",
      },
      tab: { id: 7, url: "https://shop.example.com/products" },
    })

    const config = await getConfig()
    expect(config.rules).toHaveLength(0)
    expect(hideNow).not.toHaveBeenCalled()
    expect(removeSurface).toHaveBeenCalledWith(
      ELEMENT_HIDER_FEATURE_ID,
      "picker",
    )
  })

  it("element-picked is a no-op without a selector or tab url", async () => {
    await handle?.("element-picked", { selection: undefined, tab: undefined })
    const config = await getConfig()
    expect(config.rules).toHaveLength(0)
    expect(hideNow).not.toHaveBeenCalled()
  })

  it("delete-rule removes the matching rule", async () => {
    await setFeatureConfig(ELEMENT_HIDER_FEATURE_ID, {
      rules: [
        { id: "keep", urlPattern: "*://a.com/*", selector: ".a" },
        { id: "drop", urlPattern: "*://a.com/*", selector: ".b" },
      ],
    })

    await handle?.("delete-rule", { payload: { itemId: "drop" } })

    const config = await getConfig()
    expect(config.rules.map((r) => r.id)).toEqual(["keep"])
  })
})
