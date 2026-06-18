// Architecture: background tests. The bridge execute orchestration
// (background/features/nativeMessaging/execute.ts): active-tab resolution,
// preflight denials (generated id, not found, confirmAction, platform,
// permissions, submit-by-default), the happy path result, and browser focus.
// Collaborators are mocked so the test exercises only the orchestration.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./suggestions", () => ({ resolveActiveTab: vi.fn() }))
vi.mock("../../commands/query", () => ({ resolveCommandById: vi.fn() }))
vi.mock("../../commands/execution", () => ({ executeResolvedCommand: vi.fn() }))
vi.mock("../../commands/platform", () => ({
  supportsPlatform: vi.fn(() => true),
  getPlatform: vi.fn(() => "chrome"),
}))
vi.mock("../../commands/generatedActions", () => ({
  parseGeneratedCommandAction: vi.fn(() => null),
}))
vi.mock("../../utils/permissions", () => ({
  checkPermissions: vi.fn(async () => ({
    hasAllPermissions: true,
    missingPermissions: [],
  })),
}))
vi.mock("../../utils/browser", () => ({ updateWindow: vi.fn(async () => {}) }))

import { executeResolvedCommand } from "../../commands/execution"
import { parseGeneratedCommandAction } from "../../commands/generatedActions"
import { supportsPlatform } from "../../commands/platform"
import { resolveCommandById } from "../../commands/query"
import { updateWindow } from "../../utils/browser"
import { checkPermissions } from "../../utils/permissions"
import { executeForActiveTab } from "./execute"
import { resolveActiveTab } from "./suggestions"

const mockResolveActiveTab = vi.mocked(resolveActiveTab)
const mockResolveCommandById = vi.mocked(resolveCommandById)
const mockExecuteResolved = vi.mocked(executeResolvedCommand)
const mockSupportsPlatform = vi.mocked(supportsPlatform)
const mockParseGenerated = vi.mocked(parseGeneratedCommandAction)
const mockCheckPermissions = vi.mocked(checkPermissions)
const mockUpdateWindow = vi.mocked(updateWindow)

const activeTab = {
  tab: { id: 1, windowId: 9, url: "https://example.com/", title: "Example" },
  context: { url: "https://example.com/", title: "Example", modifierKey: null },
}

// Build a resolved-command stand-in. `as any` because the real ResolvedCommand
// shape is large and only `command`/`permissions` matter here.
const resolved = (command: any, permissions: string[] = []) =>
  ({ command, permissions, parentNames: [], parentIds: [] }) as any

beforeEach(() => {
  vi.clearAllMocks()
  mockResolveActiveTab.mockResolvedValue(activeTab as any)
  mockSupportsPlatform.mockReturnValue(true)
  mockParseGenerated.mockReturnValue(null)
  mockCheckPermissions.mockResolvedValue({
    hasAllPermissions: true,
    missingPermissions: [],
  })
  mockExecuteResolved.mockResolvedValue(undefined)
})

describe("executeForActiveTab preflight", () => {
  it("returns no_active_tab when there is no active tab", async () => {
    mockResolveActiveTab.mockResolvedValue(null)
    expect(await executeForActiveTab({ id: "copy-current-url" })).toEqual({
      error: "no_active_tab",
    })
  })

  it("rejects generated-action ids", async () => {
    mockParseGenerated.mockReturnValue({ type: "favorite" } as any)
    expect(await executeForActiveTab({ id: "favorite::x" })).toEqual({
      error: "forbidden",
    })
  })

  it("returns not_found when the command does not resolve", async () => {
    mockResolveCommandById.mockResolvedValue(undefined)
    expect(await executeForActiveTab({ id: "nope" })).toEqual({
      error: "not_found",
    })
  })

  it("denies confirmAction commands", async () => {
    mockResolveCommandById.mockResolvedValue(
      resolved({ type: "action", id: "clear", confirmAction: true }),
    )
    expect(await executeForActiveTab({ id: "clear" })).toEqual({
      error: "forbidden",
    })
  })

  it("denies commands not supported on this platform", async () => {
    mockResolveCommandById.mockResolvedValue(
      resolved({ type: "action", id: "x" }),
    )
    mockSupportsPlatform.mockReturnValue(false)
    expect(await executeForActiveTab({ id: "x" })).toEqual({
      error: "forbidden",
    })
  })

  it("denies when required permissions are missing", async () => {
    mockResolveCommandById.mockResolvedValue(
      resolved({ type: "action", id: "x" }, ["tabs"]),
    )
    mockCheckPermissions.mockResolvedValue({
      hasAllPermissions: false,
      missingPermissions: ["tabs"],
    })
    expect(await executeForActiveTab({ id: "x" })).toEqual({
      error: "forbidden",
    })
  })

  it("denies submit commands by default", async () => {
    mockResolveCommandById.mockResolvedValue(
      resolved({ type: "submit", id: "s" }),
    )
    expect(await executeForActiveTab({ id: "s" })).toEqual({
      error: "forbidden",
    })
  })
})

describe("executeForActiveTab execution", () => {
  it("runs and returns the value for a result:value command", async () => {
    mockResolveCommandById.mockResolvedValue(
      resolved({ type: "action", id: "copy", external: { result: "value" } }),
    )
    mockExecuteResolved.mockResolvedValue({ value: "the-url" })

    const res = await executeForActiveTab({ id: "copy" })

    expect(res).toEqual({ ran: true, value: "the-url" })
    // Executed via the shared path with delivery "return".
    expect(mockExecuteResolved).toHaveBeenCalledWith(
      expect.anything(),
      activeTab.context,
      {},
      undefined,
      { delivery: "return" },
    )
    expect(mockUpdateWindow).not.toHaveBeenCalled()
  })

  it("raises the browser window for a focusBrowser command", async () => {
    mockResolveCommandById.mockResolvedValue(
      resolved({
        type: "action",
        id: "open",
        external: { focusBrowser: true },
      }),
    )
    const res = await executeForActiveTab({ id: "open" })
    expect(res).toEqual({ ran: true, focused: true })
    expect(mockUpdateWindow).toHaveBeenCalledWith(9, { focused: true })
  })

  it("maps an executor throw to execution_failed", async () => {
    mockResolveCommandById.mockResolvedValue(
      resolved({ type: "action", id: "boom" }),
    )
    mockExecuteResolved.mockRejectedValue(new Error("boom"))
    expect(await executeForActiveTab({ id: "boom" })).toEqual({
      error: "execution_failed",
    })
  })
})
