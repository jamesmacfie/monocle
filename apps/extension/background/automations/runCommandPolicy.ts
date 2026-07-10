// Architecture: background layer. Policy for the automation `runCommand`
// step — the step that lets automations compose with the wider command system,
// and therefore the step whose reach must be bounded. Two layers, both
// re-checked at execute time (not just at save):
//
// 1. Deny rules applied to EVERY run: an automation may never invoke commands
//    requiring confirmation (an automation must not bypass a confirm dialog),
//    other automations (no recursion), or the workflow debug tool.
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
// (dependency injection) to keep the automations <-> commands module graph
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

/** Command ids no automation run may ever invoke, regardless of trigger. */
const ALWAYS_DENIED_COMMAND_IDS: ReadonlySet<string> = new Set([
  "debug-workflow",
])

// Who initiated the run. "manual" = palette/keybinding gesture; "automation" =
// an automation trigger (the bounded, allowlist-restricted surface); "bridge" =
// a gesture in a paired external app via the native-messaging bridge — human-
// initiated like manual, so NOT subject to the non-manual allowlist, but gated
// per-command by `external.allowed`. See docs/native-messaging/execution.md.
export type RunCommandExecutionMode = "manual" | "automation" | "bridge"

export type RunCommandPolicyInput = {
  commandId: string
  executionMode: RunCommandExecutionMode
  // The caller already obtained explicit user confirmation for this run. Lets a
  // confirm-gated command through — the caller, not this policy, owns *where*
  // that confirmation happened (a palette dialog, a Raycast alert, etc.).
  // Automations never set this, so automations still cannot bypass a confirm.
  confirmed?: boolean
  // Resolved target metadata supplied by the command bridge.
  target: {
    exists: boolean
    confirmAction: boolean
    // The command's `external.allowed` (bridge mode only): false force-denies,
    // true opts a default-denied command in (never past the universal denies).
    externalAllowed?: boolean
  }
}

export type RunCommandPolicyVerdict =
  | { allowed: true }
  | { allowed: false; reason: string }

/**
 * Applies the runCommand policy. The universal deny rules apply to every mode;
 * the non-manual allowlist applies only to "automation"; "bridge" adds the
 * `external.allowed` override. Re-checked by the engine immediately before
 * dispatch and by the bridge execute path.
 */
export const checkRunCommandPolicy = (
  input: RunCommandPolicyInput,
): RunCommandPolicyVerdict => {
  const { commandId, executionMode } = input

  // Universal denies (all modes). external.allowed:true never overrides these.
  if (commandId.startsWith("automation-")) {
    return {
      allowed: false,
      reason: "Automations cannot run other automations",
    }
  }

  if (ALWAYS_DENIED_COMMAND_IDS.has(commandId)) {
    return { allowed: false, reason: `Command ${commandId} cannot be scripted` }
  }

  if (!input.target.exists) {
    return { allowed: false, reason: `Command not found: ${commandId}` }
  }

  if (input.target.confirmAction && !input.confirmed) {
    return {
      allowed: false,
      reason: `Command ${commandId} requires confirmation`,
    }
  }

  if (
    executionMode === "automation" &&
    !NON_MANUAL_RUN_COMMAND_ALLOWLIST.has(commandId)
  ) {
    return {
      allowed: false,
      reason: `Command ${commandId} is not allowed from automatic triggers`,
    }
  }

  if (executionMode === "bridge" && input.target.externalAllowed === false) {
    return {
      allowed: false,
      reason: `Command ${commandId} is not available to external apps`,
    }
  }

  return { allowed: true }
}
