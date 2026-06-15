import { LayoutTemplate } from "lucide-react"
import { useMemo, useState } from "react"
import { KeybindingDisplay } from "../../shared/components/KeybindingDisplay"
import { cn } from "../../shared/components/ui/cn"
import type {
  SettingsCatalogCommand,
  UpdateCommandKeybindingsConflict,
} from "../../shared/types"
import {
  getKeybindingTemplate,
  getTemplatePreviewRows,
  getTemplateSaveOperations,
  type KeybindingTemplateId,
  keybindingTemplates,
  type TemplateSaveOperation,
} from "../lib/keybindingTemplates"
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui"

type KeybindingTemplateDialogProps = {
  commands: SettingsCatalogCommand[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onApply: (
    operations: TemplateSaveOperation[],
  ) => Promise<{ conflicts: UpdateCommandKeybindingsConflict[] }>
}

const getRowStatusLabel = (
  status: ReturnType<typeof getTemplatePreviewRows>[number]["status"],
) => {
  if (status === "pending") return "Pending"
  if (status === "unavailable") return "Unavailable"
  return "Ready"
}

export function KeybindingTemplateDialog({
  commands,
  open,
  onOpenChange,
  onApply,
}: KeybindingTemplateDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<KeybindingTemplateId>("vim")
  const [overrideCustomKeybindings, setOverrideCustomKeybindings] =
    useState(false)
  const [saving, setSaving] = useState(false)
  const [conflicts, setConflicts] = useState<
    UpdateCommandKeybindingsConflict[]
  >([])
  const selectedTemplate = getKeybindingTemplate(selectedTemplateId)
  const previewRows = useMemo(
    () => getTemplatePreviewRows(selectedTemplateId, commands),
    [commands, selectedTemplateId],
  )
  const operations = useMemo(
    () =>
      getTemplateSaveOperations({
        templateId: selectedTemplateId,
        commands,
        overrideCustomKeybindings,
      }),
    [commands, overrideCustomKeybindings, selectedTemplateId],
  )
  const customCount = previewRows.filter(
    (row) => row.hasCustomKeybinding,
  ).length
  const pendingCount = previewRows.filter(
    (row) => row.status === "pending",
  ).length

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await onApply(operations)
      if (result.conflicts.length > 0) {
        // Keep the dialog open so the user sees which bindings were skipped.
        setConflicts(result.conflicts)
      } else {
        setConflicts([])
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(96vw,1040px)] gap-0 p-0">
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
            <LayoutTemplate className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">
              Use Template
            </DialogTitle>
            <DialogDescription className="text-sm text-[var(--color-fg-muted)]">
              Preview shortcut templates before applying them.
            </DialogDescription>
          </div>
        </div>

        <div className="grid max-h-[72vh] min-h-[520px] grid-cols-[220px_minmax(0,1fr)] overflow-hidden">
          <aside className="border-r border-[var(--color-border)] bg-[var(--color-bg-page)] p-3">
            <div className="space-y-1">
              {keybindingTemplates.map((template) => {
                const selected = template.id === selectedTemplateId

                return (
                  <button
                    key={template.id}
                    className={cn(
                      "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                      selected
                        ? "bg-[var(--color-accent)] text-white"
                        : "text-[var(--color-fg)] hover:bg-[var(--color-bg-hover)]",
                    )}
                    type="button"
                    onClick={() => {
                      setSelectedTemplateId(template.id)
                      setOverrideCustomKeybindings(false)
                      setConflicts([])
                    }}
                  >
                    <span className="block font-medium">{template.name}</span>
                    <span
                      className={cn(
                        "mt-0.5 block text-xs",
                        selected
                          ? "text-white/80"
                          : "text-[var(--color-fg-muted)]",
                      )}
                    >
                      {template.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </aside>

          <main className="flex min-w-0 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">
                  {selectedTemplate.name}
                </h2>
                <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                  {previewRows.length} rows, {operations.length} changes ready
                  to save
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {customCount > 0 && <Badge>{customCount} custom</Badge>}
                {pendingCount > 0 && <Badge>{pendingCount} pending</Badge>}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto options-scrollbar">
              <table className="w-full min-w-[760px] table-fixed border-collapse">
                <colgroup>
                  <col />
                  <col className="w-48" />
                  <col className="w-44" />
                  <col className="w-28" />
                </colgroup>
                <thead className="sticky top-0 bg-[var(--color-surface)]">
                  <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-fg-muted)]">
                    <th className="px-4 py-3">Command</th>
                    <th className="px-3 py-3">Template shortcut</th>
                    <th className="px-3 py-3">Current shortcut</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-[var(--color-border)]",
                        row.status !== "enabled" &&
                          "bg-[var(--color-bg-page)] text-[var(--color-fg-muted)]",
                      )}
                    >
                      <td className="min-w-0 px-4 py-3 align-top">
                        <div className="truncate text-sm font-medium">
                          {row.commandName}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {row.command && (
                            <Badge>{row.command.categoryLabel}</Badge>
                          )}
                          {row.hasCustomKeybinding && <Badge>Custom</Badge>}
                          {row.note && <Badge>{row.note}</Badge>}
                          {row.dependencyProposal && (
                            <Badge>{row.dependencyProposal}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {row.keybinding ? (
                          <KeybindingDisplay keybinding={row.keybinding} />
                        ) : (
                          <span className="text-sm text-[var(--color-fg-muted)]">
                            {selectedTemplateId === "default"
                              ? "None"
                              : "Built-in default"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        {row.command?.effectiveKeybinding ? (
                          <KeybindingDisplay
                            keybinding={row.command.effectiveKeybinding}
                          />
                        ) : (
                          <span className="text-sm text-[var(--color-fg-muted)]">
                            None
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Badge>{getRowStatusLabel(row.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-[var(--color-border)] px-5 py-4">
              {conflicts.length > 0 && (
                <div className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-page)] px-4 py-3">
                  <p className="text-sm font-medium">
                    {conflicts.length} shortcut
                    {conflicts.length === 1 ? " was" : "s were"} not applied
                  </p>
                  <ul className="mt-2 space-y-1">
                    {conflicts.map((conflict) => (
                      <li
                        key={`${conflict.commandId}:${conflict.keybinding}`}
                        className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-fg-muted)]"
                      >
                        <KeybindingDisplay keybinding={conflict.keybinding} />
                        <span>
                          {conflict.reason === "requirement-not-met"
                            ? "not applied — this command requires ⌘, ⌃, or ⌥ in every stroke"
                            : `not applied — already used by ${conflict.conflictingCommand?.name ?? "another command"}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <label className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={overrideCustomKeybindings}
                  onCheckedChange={(checked) =>
                    setOverrideCustomKeybindings(checked === true)
                  }
                />
                <span>
                  Override custom keybindings
                  <span className="ml-2 text-[var(--color-fg-muted)]">
                    {selectedTemplateId === "default"
                      ? "Clears custom shortcuts so built-in defaults return."
                      : "Replaces existing custom shortcuts with this template."}
                  </span>
                </span>
              </label>

              <div className="mt-4 flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  disabled={saving || operations.length === 0}
                  type="button"
                  onClick={() => {
                    void handleSave()
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}
