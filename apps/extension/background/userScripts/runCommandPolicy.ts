// Architecture: background layer. Policy for the user-script `runCommand`
// step — the step that lets scripts compose with the wider command system,
// and therefore the step whose reach must be bounded. Two layers, both
// re-checked at execute time (not just at save):
//
// 1. Deny rules applied to EVERY run: a script may never invoke commands
//    requiring confirmation (a script must not bypass a confirm dialog),
//    other user scripts (no recursion), or the workflow debug tool.
//    Permission-gated commands additionally fail at execution when their
//    permissions are not granted (the normal dispatch path enforces that).
// 2. For runs started by a NON-MANUAL trigger (urlMatch/elementAppears/
//    schedules), targets are restricted to the static allowlist below, so
//    the entire non-gesture capability surface is reviewable in one place
//    in the source. Navigation/tab/UI-class commands only — never
//    clear-data-class commands.
//
// This module is import-free of the command system on purpose: the engine
// receives a command-execution bridge from background/index.ts at startup
// (dependency injection) to keep the userScripts <-> commands module graph
// acyclic, and this file stays a pure, reviewable policy table.

/** Command ids a non-manual (trigger-started) run may invoke. */
export const NON_MANUAL_RUN_COMMAND_ALLOWLIST: ReadonlySet<string> = new Set([
  // Navigation
  "go-back",
  "go-forward",
  "go-to-parent-url",
  "go-to-root-url",
  "reload-current-tab",
  "hard-reload-current-tab",
  "scroll-to-top",
  "scroll-to-bottom",
  // Tab management
  "open-new-tab",
  "duplicate-current-tab",
  "focus-next-tab",
  "focus-previous-tab",
  "focus-first-tab",
  "focus-last-tab",
  "focus-last-active-tab",
  "toggle-pin-current-tab",
  "toggle-mute-current-tab",
  // Page utilities (read-only / reversible)
  "copy-current-url",
  "copy-current-title",
  "copy-title-and-url",
  "copy-title-and-url-as-markdown",
  "focus-first-input",
])

/** Command ids no script run may ever invoke, regardless of trigger. */
const ALWAYS_DENIED_COMMAND_IDS: ReadonlySet<string> = new Set([
  "debug-workflow",
])

export type RunCommandPolicyInput = {
  commandId: string
  // True when the run started from a palette selection/keybinding (manual
  // trigger); false for event/scheduled triggers.
  isManualRun: boolean
  // Resolved target metadata supplied by the command bridge.
  target: {
    exists: boolean
    confirmAction: boolean
  }
}

export type RunCommandPolicyVerdict =
  | { allowed: true }
  | { allowed: false; reason: string }

/**
 * Applies the runCommand policy. Called at save time (by validation in the
 * message layer, with isManualRun true to apply only universal rules) and
 * re-checked by the engine immediately before dispatch.
 */
export const checkRunCommandPolicy = (
  input: RunCommandPolicyInput,
): RunCommandPolicyVerdict => {
  const { commandId } = input

  if (commandId.startsWith("userscript-")) {
    return {
      allowed: false,
      reason: "User scripts cannot run other user scripts",
    }
  }

  if (ALWAYS_DENIED_COMMAND_IDS.has(commandId)) {
    return { allowed: false, reason: `Command ${commandId} cannot be scripted` }
  }

  if (!input.target.exists) {
    return { allowed: false, reason: `Command not found: ${commandId}` }
  }

  if (input.target.confirmAction) {
    return {
      allowed: false,
      reason: `Command ${commandId} requires confirmation and cannot be scripted`,
    }
  }

  if (!input.isManualRun && !NON_MANUAL_RUN_COMMAND_ALLOWLIST.has(commandId)) {
    return {
      allowed: false,
      reason: `Command ${commandId} is not allowed from automatic triggers`,
    }
  }

  return { allowed: true }
}
