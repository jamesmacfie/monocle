import { Keyboard } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { KeybindingDisplay } from "../../shared/components/KeybindingDisplay"
import type { SettingsCatalogCommand } from "../../shared/types"
import {
  getKeyString,
  normalizeKeybinding,
} from "../../shared/utils/key-normalizer"
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

const checkConflict = (keybinding: string, command: SettingsCatalogCommand) =>
  new Promise<Conflict>((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "check-keybinding-conflict",
        keybinding,
        excludeCommandId: command.id,
        context: getConflictContext(command),
      },
      (response) => {
        if (chrome.runtime.lastError || response?.error) {
          resolve(null)
          return
        }

        resolve(response?.conflictingCommand ?? null)
      },
    )
  })

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

  useEffect(() => {
    if (!open) {
      setStrokes([])
      setConflict(null)
      return
    }

    window.setTimeout(() => captureRef.current?.focus(), 30)
  }, [open])

  if (!command) {
    return null
  }

  const keybinding = normalizeKeybinding(strokes.join(", "))
  const canSave = Boolean(keybinding) && !conflict
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
      setConflict(
        nextKeybinding ? await checkConflict(nextKeybinding, command) : null,
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
    setConflict(await checkConflict(nextKeybinding, command))
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

        {conflict && (
          <div className="rounded-md border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-fg)]">
            Conflict: {conflict.name}
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
