import { Globe2 } from "lucide-react"
import { useEffect, useState } from "react"
import type {
  CommandUrlRulesSetting,
  SettingsCatalogCommand,
} from "../../shared/types"
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Textarea,
} from "./ui"

type UrlRulesDialogProps = {
  command: SettingsCatalogCommand | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (urlRules: CommandUrlRulesSetting) => void
}

const toText = (values?: string[]) => values?.join("\n") ?? ""

const toPatterns = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

export function UrlRulesDialog({
  command,
  open,
  onOpenChange,
  onSave,
}: UrlRulesDialogProps) {
  const [allowText, setAllowText] = useState("")
  const [denyText, setDenyText] = useState("")

  useEffect(() => {
    if (!command || !open) {
      return
    }

    setAllowText(toText(command.settings.urlRules?.allowUrls))
    setDenyText(toText(command.settings.urlRules?.denyUrls))
  }, [command, open])

  if (!command) {
    return null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
            <Globe2 className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">
              {command.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--color-fg-muted)]">
              URL rules
            </DialogDescription>
          </div>
        </div>

        <label className="grid gap-2 text-sm">
          <span className="font-medium">Allow patterns</span>
          <Textarea
            value={allowText}
            placeholder="*://*.example.com/*"
            onChange={(event) => setAllowText(event.target.value)}
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium">Deny patterns</span>
          <Textarea
            value={denyText}
            placeholder="*://blocked.example.com/*"
            onChange={(event) => setDenyText(event.target.value)}
          />
        </label>

        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={() => {
              onSave({
                allowUrls: toPatterns(allowText),
                denyUrls: toPatterns(denyText),
              })
              onOpenChange(false)
            }}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
