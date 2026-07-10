import type { KeybindingCaptureState } from "../hooks/useKeybindingCapture"
import type { KeybindingRequirements } from "../types"
import { describeKeybindingRequirements } from "../utils/keybinding-requirements"
import { KeybindingDisplay } from "./KeybindingDisplay"

type KeybindingCaptureFieldProps = KeybindingCaptureState & {
  captureRef: React.RefObject<HTMLButtonElement | null>
  onKeyDownCapture: (event: React.KeyboardEvent) => void
  requirements?: KeybindingRequirements | null
}

export function KeybindingCaptureField({
  captureRef,
  onKeyDownCapture,
  requirements,
  strokes,
  keybinding,
  conflict,
  conflictType,
  warnings,
  requirementViolation,
}: KeybindingCaptureFieldProps) {
  const requirementHint = describeKeybindingRequirements(
    requirements ?? undefined,
  )
  const hasBlockingIssue = Boolean(conflict || requirementViolation)

  return (
    <div className="w-full">
      <button
        type="button"
        ref={captureRef}
        aria-label="Capture shortcut"
        className={`flex min-h-14 w-full cursor-text items-center rounded-md border-2 bg-[var(--color-bg-input,var(--background))] px-3 text-left text-sm outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/20 ${
          hasBlockingIssue
            ? "border-[var(--color-error-border)]"
            : "border-[var(--color-focus-ring)]"
        }`}
        onKeyDownCapture={onKeyDownCapture}
      >
        {keybinding ? (
          <KeybindingDisplay keybinding={keybinding} />
        ) : (
          <span className="text-xs text-[var(--cmdk-muted-foreground,var(--color-fg-muted))]">
            {requirementHint
              ? `Press keys in sequence. Enter to save · ${requirementHint}`
              : "Press keys in sequence. Enter to save"}
          </span>
        )}
      </button>

      {strokes.length > 0 && conflict && (
        <div className="mt-1 px-1 text-xs text-[var(--color-error-fg)]">
          {conflictType === "shadowed-by-open-palette"
            ? `Blocked: shares a prefix with "${conflict.name}", whose open-palette binding would make the longer sequence unreachable`
            : `Already assigned to "${conflict.name}"`}
        </div>
      )}
      {strokes.length > 0 && requirementViolation && (
        <div className="mt-1 px-1 text-xs text-[var(--color-error-fg)]">
          {requirementViolation}
        </div>
      )}
      {strokes.length > 0 && !conflict && warnings.length > 0 && (
        <div className="mt-1 px-1 text-xs text-[var(--color-warning-fg)]">
          {`Overlaps with "${warnings[0].command.name}" — the shared prefix only executes after a short delay`}
        </div>
      )}
    </div>
  )
}
