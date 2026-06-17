import { describe, expect, it, vi } from "vitest"

const ensureHostPermission = vi.hoisted(() =>
  vi.fn(async () => ({
    granted: true,
    originPattern: "https://example.com/*",
  })),
)

vi.mock("../utils/hostPermissions", () => ({
  ensureHostPermission,
}))

import { ensureHostPermissionMessage } from "./hostPermissions"

describe("ensureHostPermissionMessage", () => {
  it("checks host access and content-script readiness for the target tab", async () => {
    await expect(
      ensureHostPermissionMessage({
        type: "monocle-host-permission-ensure",
        tabId: 7,
        url: "https://example.com/app",
        reason: "automation",
      }),
    ).resolves.toEqual({
      granted: true,
      originPattern: "https://example.com/*",
    })

    expect(ensureHostPermission).toHaveBeenCalledWith({
      tabId: 7,
      url: "https://example.com/app",
      reason: "automation",
      request: false,
      ensureContentScript: true,
    })
  })
})
