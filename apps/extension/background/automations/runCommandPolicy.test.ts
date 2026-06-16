// Architecture: background tests. The runCommand policy table
// (background/automations/runCommandPolicy.ts): universal deny rules and
// the non-manual allowlist restriction.
import { describe, expect, it } from "vitest"
import {
  checkRunCommandPolicy,
  NON_MANUAL_RUN_COMMAND_ALLOWLIST,
} from "./runCommandPolicy"

const target = { exists: true, confirmAction: false }

describe("runCommand policy", () => {
  it("denies recursion, confirm-gated commands, debug tools, and unknown ids", () => {
    expect(
      checkRunCommandPolicy({
        commandId: "automation-abc",
        isManualRun: true,
        target,
      }).allowed,
    ).toBe(false)

    expect(
      checkRunCommandPolicy({
        commandId: "clear-browser-data",
        isManualRun: true,
        target: { exists: true, confirmAction: true },
      }).allowed,
    ).toBe(false)

    expect(
      checkRunCommandPolicy({
        commandId: "debug-workflow",
        isManualRun: true,
        target,
      }).allowed,
    ).toBe(false)

    expect(
      checkRunCommandPolicy({
        commandId: "missing-command",
        isManualRun: true,
        target: { exists: false, confirmAction: false },
      }).allowed,
    ).toBe(false)
  })

  it("allows any eligible command for manual runs", () => {
    expect(
      checkRunCommandPolicy({
        commandId: "capture-screenshot",
        isManualRun: true,
        target,
      }).allowed,
    ).toBe(true)
  })

  it("restricts non-manual runs to the static allowlist", () => {
    expect(
      checkRunCommandPolicy({
        commandId: "capture-screenshot",
        isManualRun: false,
        target,
      }),
    ).toMatchObject({ allowed: false })

    for (const commandId of NON_MANUAL_RUN_COMMAND_ALLOWLIST) {
      expect(
        checkRunCommandPolicy({ commandId, isManualRun: false, target })
          .allowed,
      ).toBe(true)
    }
  })

  it("never allowlists destructive command classes", () => {
    expect(NON_MANUAL_RUN_COMMAND_ALLOWLIST.has("clear-browser-data")).toBe(
      false,
    )
    expect(NON_MANUAL_RUN_COMMAND_ALLOWLIST.has("debug-workflow")).toBe(false)
  })
})
