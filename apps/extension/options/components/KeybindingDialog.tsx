import { Keyboard } from "lucide-react"
import { useEffect, useRef } from "react"
import { KeybindingCaptureField } from "../../shared/components/KeybindingCaptureField"
import { KeybindingDisplay } from "../../shared/components/KeybindingDisplay"
import { useKeybindingCapture } from "../../shared/hooks/useKeybindingCapture"
import type { SettingsCatalogCommand } from "../../shared/types"
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

function KeybindingDialogCapture({
  command,
  onSave,
  onReset,
  onCancel,
}: {
  command: SettingsCatalogCommand
  onSave: (keybinding: string) => void
  onReset: () => void
  onCancel: () => void
}) {
  const captureRef = useRef<HTMLButtonElement>(null)
  const capture = useKeybindingCapture({
    commandId: command.id,
    requirements: command.keybindingRequirements,
    contextOverride:
      command.categoryId === "new-tab" ? { isNewTab: true } : undefined,
    onComplete: (keybinding) => {
      onSave(keybinding)
      onCancel()
    },
    onCancel,
  })

  useEffect(() => {
    window.setTimeout(() => captureRef.current?.focus(), 30)
  }, [])

  return (
    <>
      <KeybindingCaptureField
        {...capture}
        captureRef={captureRef}
        requirements={command.keybindingRequirements}
        onKeyDownCapture={capture.handleKeyDown}
      />

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
            disabled={!capture.canSave}
            type="button"
            onClick={() => {
              onSave(capture.keybinding)
              onCancel()
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </>
  )
}

export function KeybindingDialog({
  command,
  open,
  onOpenChange,
  onSave,
  onReset,
}: KeybindingDialogProps) {
  if (!command) {
    return null
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

        {open && (
          <KeybindingDialogCapture
            command={command}
            onSave={onSave}
            onReset={onReset}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
