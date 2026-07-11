import type { AutomationDraft } from "../../../shared/types/automationValidation"
import type { AutomationSummary } from "../../../shared/utils/automation-summary"
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../../components/ui"

export function AutomationReviewDialog({
  open,
  draft,
  summary,
  sourceLabel,
  note,
  saving,
  error,
  snippetLabel,
  onOpenChange,
  onConfirm,
  onBack,
}: {
  open: boolean
  draft: AutomationDraft | null
  summary: AutomationSummary | null
  sourceLabel: string
  note?: string
  saving: boolean
  error?: string | null
  snippetLabel: (snippetId: string) => string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  onBack?: () => void
}) {
  if (!draft || !summary) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-base font-semibold">
          Add "{draft.name}"?
        </DialogTitle>
        <DialogDescription className="text-sm text-[var(--color-fg-muted)]">
          Review what this {sourceLabel} automation can do before saving it.
        </DialogDescription>

        {note ? (
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-xs text-[var(--color-fg-muted)]">
            <span className="font-medium text-[var(--color-fg)]">
              Generation note:
            </span>{" "}
            {note}
          </div>
        ) : null}

        <div className="grid max-h-80 gap-3 overflow-y-auto text-sm options-scrollbar">
          <div>
            <div className="text-xs font-medium text-[var(--color-fg-muted)]">
              Scope
            </div>
            <div>{summary.scope}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--color-fg-muted)]">
              Triggers
            </div>
            <ul className="list-inside list-disc">
              {summary.triggers.map((trigger, index) => (
                <li key={index}>{trigger}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--color-fg-muted)]">
              Actions
            </div>
            <ul className="list-inside list-disc">
              {summary.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </div>
          {summary.snippetIds.length > 0 ? (
            <div>
              <div className="text-xs font-medium text-[var(--color-fg-muted)]">
                Snippets used
              </div>
              <ul className="list-inside list-disc">
                {summary.snippetIds.map((snippetId) => (
                  <li key={snippetId}>{snippetLabel(snippetId)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary.openedUrls.length > 0 ? (
            <div>
              <div className="text-xs font-medium text-[var(--color-fg-muted)]">
                Navigates to / opens
              </div>
              <ul className="list-inside list-disc break-all">
                {summary.openedUrls.map((url, index) => (
                  <li key={index}>{url}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary.runCommandIds.length > 0 ? (
            <div>
              <div className="text-xs font-medium text-[var(--color-fg-muted)]">
                Runs Monocle commands
              </div>
              <ul className="list-inside list-disc">
                {summary.runCommandIds.map((commandId, index) => (
                  <li key={index}>{commandId}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary.inlineActions.length > 0 ? (
            <div>
              <div className="text-xs font-medium text-[var(--color-fg-muted)]">
                Inline page actions
              </div>
              <ul className="list-inside list-disc">
                {summary.inlineActions.map((action) => (
                  <li key={`${action.surfaceId}:${action.actionId}`}>
                    {action.label} ({action.surfaceId}/{action.actionId})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary.outboundRequests.length > 0 ? (
            <div>
              <div className="text-xs font-medium text-[var(--color-fg-muted)]">
                Sends data to
              </div>
              <ul className="list-inside list-disc break-all">
                {summary.outboundRequests.map((request, index) => (
                  <li key={`${request.method}:${request.url}:${index}`}>
                    {request.method} {request.url}
                    {request.headerNames.length > 0
                      ? ` · headers: ${request.headerNames.join(", ")}`
                      : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
                Request and response values are not shown. Endpoint access must
                be granted separately.
              </p>
            </div>
          ) : null}
          {summary.usesClipboard ? (
            <div className="text-xs text-[var(--color-fg-muted)]">
              Writes to the clipboard.
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-xs text-[var(--color-fg-muted)]">
          Automatic triggers arrive disarmed. This automation only runs manually
          until you review and arm them in the editor.
        </div>
        {error ? (
          <div className="text-sm text-[var(--color-error-fg)]">{error}</div>
        ) : null}

        <div className="flex justify-end gap-2">
          {onBack ? (
            <Button
              disabled={saving}
              type="button"
              variant="secondary"
              onClick={onBack}
            >
              Back to prompt
            </Button>
          ) : (
            <DialogClose asChild>
              <Button disabled={saving} type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
          )}
          <Button disabled={saving} type="button" onClick={onConfirm}>
            {saving ? "Adding…" : "Add Automation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
