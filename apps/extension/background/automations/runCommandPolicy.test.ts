// Architecture: background tests. The runCommand policy table
// (background/automations/runCommandPolicy.ts): universal deny rules, the
// non-manual (automation) allowlist restriction, and the bridge-mode
// external.allowed override.
import { describe, expect, it } from "vitest"
import {
  checkRunCommandPolicy,
  NON_MANUAL_RUN_COMMAND_ALLOWLIST,
} from "./runCommandPolicy"

const target = { exists: true, confirmAction: false }

describe("runCommand policy", () => {
  it("denies recursion, confirm-gated commands, debug tools, and unknown ids (every mode)", () => {
    for (const executionMode of ["manual", "automation", "bridge"] as const) {
      expect(
        checkRunCommandPolicy({
          commandId: "automation-abc",
          executionMode,
          target,
        }).allowed,
      ).toBe(false)

      expect(
        checkRunCommandPolicy({
          commandId: "clear-browser-data",
          executionMode,
          target: { exists: true, confirmAction: true },
        }).allowed,
      ).toBe(false)

      expect(
        checkRunCommandPolicy({
          commandId: "debug-workflow",
          executionMode,
          target,
        }).allowed,
      ).toBe(false)

      expect(
        checkRunCommandPolicy({
          commandId: "missing-command",
          executionMode,
          target: { exists: false, confirmAction: false },
        }).allowed,
      ).toBe(false)
    }
  })

  it("allows any eligible command for manual runs", () => {
    expect(
      checkRunCommandPolicy({
        commandId: "capture-screenshot",
        executionMode: "manual",
        target,
      }).allowed,
    ).toBe(true)
  })

  it("restricts automation runs to the static allowlist", () => {
    expect(
      checkRunCommandPolicy({
        commandId: "capture-screenshot",
        executionMode: "automation",
        target,
      }),
    ).toMatchObject({ allowed: false })

    for (const commandId of NON_MANUAL_RUN_COMMAND_ALLOWLIST) {
      expect(
        checkRunCommandPolicy({
          commandId,
          executionMode: "automation",
          target,
        }).allowed,
      ).toBe(true)
    }
  })

  it("bridge mode bypasses the automation allowlist", () => {
    // A command absent from the non-manual allowlist is fine for the bridge
    // (human-initiated in the app), unlike an automation trigger.
    expect(
      checkRunCommandPolicy({
        commandId: "capture-screenshot",
        executionMode: "bridge",
        target,
      }).allowed,
    ).toBe(true)
  })

  it("bridge mode force-denies external.allowed:false", () => {
    expect(
      checkRunCommandPolicy({
        commandId: "open-settings",
        executionMode: "bridge",
        target: { ...target, externalAllowed: false },
      }).allowed,
    ).toBe(false)
  })

  it("bridge external.allowed:true never overrides the universal denies", () => {
    expect(
      checkRunCommandPolicy({
        commandId: "clear-browser-data",
        executionMode: "bridge",
        target: { exists: true, confirmAction: true, externalAllowed: true },
      }).allowed,
    ).toBe(false)

    expect(
      checkRunCommandPolicy({
        commandId: "automation-abc",
        executionMode: "bridge",
        target: { ...target, externalAllowed: true },
      }).allowed,
    ).toBe(false)
  })

  it("never allowlists destructive command classes", () => {
    expect(NON_MANUAL_RUN_COMMAND_ALLOWLIST.has("clear-browser-data")).toBe(
      false,
    )
    expect(NON_MANUAL_RUN_COMMAND_ALLOWLIST.has("debug-workflow")).toBe(false)
  })
})
