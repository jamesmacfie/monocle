import { Keyboard } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { KeybindingDisplay } from "../../shared/components/KeybindingDisplay"
import type {
  CheckKeybindingConflictResponse,
  SettingsCatalogCommand,
} from "../../shared/types"
import { sendRuntimeMessage } from "../../shared/utils/extension-api"
import {
  getKeyString,
  normalizeKeybinding,
} from "../../shared/utils/key-normalizer"
import { describeKeybindingRequirements } from "../../shared/utils/keybinding-requirements"
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui"

type KeybindingDialogProps = {
  command: SettingsCatalogCommand | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (keybinding: string) => void
  onReset: () => void
}

type Conflict = {
  id: string
  name: string
} | null

type ConflictCheckResult = {
  conflict: Conflict
  requirementViolation: string | null
}

const NO_CONFLICT_RESULT: ConflictCheckResult = {
  conflict: null,
  requirementViolation: null,
}

const getConflictContext = (command: SettingsCatalogCommand) => {
  const isNewTab = command.categoryId === "new-tab"

  return {
    title: document.title,
    url: isNewTab
      ? chrome.runtime.getURL("/newtab.html")
      : window.location.href,
    modifierKey: null,
    ...(isNewTab ? { isNewTab: true } : {}),
  }
}

const checkConflict = async (
  keybinding: string,
  command: SettingsCatalogCommand,
): Promise<ConflictCheckResult> => {
  try {
    const response = await sendRuntimeMessage<
      (CheckKeybindingConflictResponse & { error?: string }) | undefined
    >({
      type: "monocle-keybinding-conflict-check",
      keybinding,
      excludeCommandId: command.id,
      context: getConflictContext(command),
    })

    if (response?.error) {
      return NO_CONFLICT_RESULT
    }

    return {
      conflict: response?.conflictingCommand ?? null,
      requirementViolation: response?.requirementViolation?.message ?? null,
    }
  } catch {
    return NO_CONFLICT_RESULT
  }
}

export function KeybindingDialog({
  command,
  open,
  onOpenChange,
  onSave,
  onReset,
}: KeybindingDialogProps) {
  const captureRef = useRef<HTMLButtonElement | null>(null)
  const [strokes, setStrokes] = useState<string[]>([])
  const [conflict, setConflict] = useState<Conflict>(null)
  const [requirementViolation, setRequirementViolation] = useState<
    string | null
  >(null)

  useEffect(() => {
    if (!open) {
      setStrokes([])
      setConflict(null)
      setRequirementViolation(null)
      return
    }

    window.setTimeout(() => captureRef.current?.focus(), 30)
  }, [open])

  if (!command) {
    return null
  }

  const requirementHint = describeKeybindingRequirements(
    command.keybindingRequirements,
  )
  const keybinding = normalizeKeybinding(strokes.join(", "))
  const canSave = Boolean(keybinding) && !conflict && !requirementViolation

  const applyCheckResult = (result: ConflictCheckResult) => {
    setConflict(result.conflict)
    setRequirementViolation(result.requirementViolation)
  }
  const hasPlainEnter = (event: React.KeyboardEvent) =>
    event.key === "Enter" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey

  const handleKeyDown = async (event: React.KeyboardEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (event.key === "Escape") {
      onOpenChange(false)
      return
    }

    if (event.key === "Backspace") {
      const nextStrokes = strokes.slice(0, -1)
      setStrokes(nextStrokes)
      const nextKeybinding = normalizeKeybinding(nextStrokes.join(", "))
      applyCheckResult(
        nextKeybinding
          ? await checkConflict(nextKeybinding, command)
          : NO_CONFLICT_RESULT,
      )
      return
    }

    if (hasPlainEnter(event) && strokes.length > 0) {
      if (canSave) {
        onSave(keybinding)
        onOpenChange(false)
      }
      return
    }

    const stroke = getKeyString(event.nativeEvent)
    if (!stroke) {
      return
    }

    const nextStrokes = [...strokes, stroke]
    const nextKeybinding = normalizeKeybinding(nextStrokes.join(", "))
    setStrokes(nextStrokes)
    applyCheckResult(await checkConflict(nextKeybinding, command))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
            <Keyboard className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">
              {command.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--color-fg-muted)]">
              {command.effectiveKeybinding ? (
                <KeybindingDisplay keybinding={command.effectiveKeybinding} />
              ) : (
                "No shortcut"
              )}
            </DialogDescription>
          </div>
        </div>

        <button
          ref={captureRef}
          className="flex min-h-14 w-full items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-input)] px-3 text-left outline-none focus:border-[var(--color-focus-ring)] focus:ring-2 focus:ring-[var(--color-focus-ring)]/20"
          aria-label="Capture shortcut"
          type="button"
          onKeyDownCapture={handleKeyDown}
        >
          {keybinding ? (
            <KeybindingDisplay keybinding={keybinding} />
          ) : (
            <span className="text-sm text-[var(--color-fg-muted)]">
              Press shortcut keys
            </span>
          )}
        </button>

        {requirementHint && (
          <div className="text-xs text-[var(--color-fg-muted)]">
            {requirementHint}
          </div>
        )}

        {conflict && (
          <div className="rounded-md border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-fg)]">
            Conflict: {conflict.name}
          </div>
        )}

        {requirementViolation && (
          <div className="rounded-md border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-fg)]">
            {requirementViolation}
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onReset}>
            Reset
          </Button>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={!canSave}
              type="button"
              onClick={() => {
                onSave(keybinding)
                onOpenChange(false)
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
