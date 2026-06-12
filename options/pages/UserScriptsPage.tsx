// Architecture: options/ page layer. The Automations list view: renders the
// user-script documents mirrored by the userScripts slice (storage truth
// lives behind background/messages/userScripts.ts), with immediate
// enable/disable toggles, edit/delete/export per row, and the import flow —
// file pick, sanitize + validate (userScripts/importExport.ts), then a
// review dialog built from summarizeUserScript before anything is saved.
// The builder itself lives at /automations/new and /automations/:id
// (userScripts/UserScriptEditorPage.tsx).
import {
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  Workflow,
} from "lucide-react"
import { useRef, useState } from "react"
import { Link } from "wouter"
import { getIconComponent } from "../../shared/components/iconRegistry"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import { selectSnippets } from "../../shared/store/slices/snippets.slice"
import {
  addUserScript,
  deleteUserScript,
  loadUserScripts,
  selectUserScripts,
  selectUserScriptsError,
  selectUserScriptsLoading,
  selectUserScriptsUpdatingIds,
  updateUserScript,
} from "../../shared/store/slices/userScripts.slice"
import type { UserScript } from "../../shared/types"
import type { UserScriptDraft } from "../../shared/types/userScriptValidation"
import {
  summarizeUserScript,
  type UserScriptSummary,
  userScriptBlurb,
} from "../../shared/utils/user-script-summary"
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Panel,
  Switch,
} from "../components/ui"
import {
  downloadUserScriptExport,
  prepareImportedDraft,
} from "./userScripts/importExport"

const formatDate = (timestamp: number) => {
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return ""
  }
}

const toDraft = (script: UserScript): UserScriptDraft => {
  const { id, createdAt, updatedAt, ...draft } = script
  void id
  void createdAt
  void updatedAt
  return draft
}

type ImportState =
  | { stage: "closed" }
  | { stage: "invalid"; fileName: string; errors: string[] }
  | {
      stage: "review"
      fileName: string
      draft: UserScriptDraft
      summary: UserScriptSummary
    }

export function UserScriptsPage() {
  const dispatch = useAppDispatch()
  const scripts = useAppSelector(selectUserScripts)
  const loading = useAppSelector(selectUserScriptsLoading)
  const error = useAppSelector(selectUserScriptsError)
  const updatingIds = useAppSelector(selectUserScriptsUpdatingIds)
  const snippets = useAppSelector(selectSnippets)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importState, setImportState] = useState<ImportState>({
    stage: "closed",
  })

  const handleImportFile = async (file: File) => {
    const raw = await file.text()
    const prepared = prepareImportedDraft(raw)
    if (!prepared.ok) {
      setImportState({
        stage: "invalid",
        fileName: file.name,
        errors: prepared.errors,
      })
      return
    }
    setImportState({
      stage: "review",
      fileName: file.name,
      draft: prepared.draft,
      summary: summarizeUserScript(prepared.draft),
    })
  }

  const snippetLabel = (snippetId: string) =>
    snippets.find((snippet) => snippet.id === snippetId)?.name ??
    `${snippetId} (missing)`

  const closeImport = () => setImportState({ stage: "closed" })

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Automations</h1>
          <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {scripts.length} saved automations — declarative scripts that run
            from the palette or on triggers you arm
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild type="button">
            <Link href="/automations/new">
              <Plus className="h-4 w-4" />
              New Automation
            </Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button
            disabled={loading}
            type="button"
            variant="secondary"
            onClick={() => {
              void dispatch(loadUserScripts())
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Refresh
          </Button>
          <input
            ref={fileInputRef}
            accept="application/json,.json"
            className="hidden"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) {
                void handleImportFile(file)
              }
            }}
          />
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-fg)]">
          {error}
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto options-scrollbar">
          <table className="w-full min-w-[760px] table-fixed border-collapse">
            <colgroup>
              <col className="w-64" />
              <col />
              <col className="w-24" />
              <col className="w-32" />
              <col className="w-36" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-fg-muted)]">
                <th className="px-4 py-3">Name</th>
                <th className="px-3 py-3">Details</th>
                <th className="px-3 py-3">Enabled</th>
                <th className="px-3 py-3">Updated</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {scripts.map((script) => {
                const updating = updatingIds.includes(script.id)
                const Icon = getIconComponent(script.icon ?? "") ?? Workflow

                return (
                  <tr
                    key={script.id}
                    className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-hover)]"
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-4 w-4 shrink-0 text-[var(--color-fg-muted)]" />
                        <span className="truncate">{script.name}</span>
                      </div>
                    </td>
                    <td className="min-w-0 px-3 py-3 text-sm text-[var(--color-fg-muted)]">
                      <span className="line-clamp-2">
                        {userScriptBlurb(script)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Switch
                        aria-label={`Toggle ${script.name}`}
                        checked={script.enabled}
                        disabled={updating}
                        onCheckedChange={(checked) => {
                          void dispatch(
                            updateUserScript({
                              id: script.id,
                              script: { ...toDraft(script), enabled: checked },
                            }),
                          )
                        }}
                      />
                    </td>
                    <td className="px-3 py-3 text-sm text-[var(--color-fg-muted)]">
                      {formatDate(script.updatedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <Button
                          asChild
                          aria-label={`Edit ${script.name}`}
                          size="icon"
                          variant="secondary"
                        >
                          <Link href={`/automations/${script.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          aria-label={`Export ${script.name}`}
                          size="icon"
                          type="button"
                          variant="secondary"
                          onClick={() => downloadUserScriptExport(script)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={`Delete ${script.name}`}
                          disabled={updating}
                          size="icon"
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            void dispatch(deleteUserScript({ id: script.id }))
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {scripts.length === 0 && (
          <div className="p-8 text-center text-sm text-[var(--color-fg-muted)]">
            {loading
              ? "Loading automations…"
              : "No automations yet. Create one or import a .monocle-automation.json file."}
          </div>
        )}
      </Panel>

      <Dialog
        open={importState.stage !== "closed"}
        onOpenChange={(open) => {
          if (!open) {
            closeImport()
          }
        }}
      >
        <DialogContent>
          {importState.stage === "invalid" && (
            <>
              <DialogTitle className="text-base font-semibold">
                Could not import {importState.fileName}
              </DialogTitle>
              <DialogDescription className="text-sm text-[var(--color-fg-muted)]">
                The file is not a valid Monocle automation.
              </DialogDescription>
              <ul className="grid max-h-60 gap-1 overflow-y-auto text-xs text-[var(--color-error-fg)] options-scrollbar">
                {importState.errors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
              <div className="flex justify-end">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
              </div>
            </>
          )}

          {importState.stage === "review" && (
            <>
              <DialogTitle className="text-base font-semibold">
                Import "{importState.draft.name}"?
              </DialogTitle>
              <DialogDescription className="text-sm text-[var(--color-fg-muted)]">
                Review what this automation can do before saving it.
              </DialogDescription>

              <div className="grid max-h-80 gap-3 overflow-y-auto text-sm options-scrollbar">
                <div>
                  <div className="text-xs font-medium text-[var(--color-fg-muted)]">
                    Scope
                  </div>
                  <div>{importState.summary.scope}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-[var(--color-fg-muted)]">
                    Triggers
                  </div>
                  <ul className="list-inside list-disc">
                    {importState.summary.triggers.map((trigger, index) => (
                      <li key={index}>{trigger}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-medium text-[var(--color-fg-muted)]">
                    Actions
                  </div>
                  <ul className="list-inside list-disc">
                    {importState.summary.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
                {importState.summary.snippetIds.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-[var(--color-fg-muted)]">
                      Snippets used
                    </div>
                    <ul className="list-inside list-disc">
                      {importState.summary.snippetIds.map((snippetId) => (
                        <li key={snippetId}>{snippetLabel(snippetId)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {importState.summary.openedUrls.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-[var(--color-fg-muted)]">
                      Navigates to / opens
                    </div>
                    <ul className="list-inside list-disc break-all">
                      {importState.summary.openedUrls.map((url, index) => (
                        <li key={index}>{url}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {importState.summary.runCommandIds.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-[var(--color-fg-muted)]">
                      Runs Monocle commands
                    </div>
                    <ul className="list-inside list-disc">
                      {importState.summary.runCommandIds.map(
                        (commandId, index) => (
                          <li key={index}>{commandId}</li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
                {importState.summary.usesClipboard && (
                  <div className="text-xs text-[var(--color-fg-muted)]">
                    Writes to the clipboard.
                  </div>
                )}
              </div>

              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-xs text-[var(--color-fg-muted)]">
                Automatic triggers arrive disarmed: this automation will only
                run when you trigger it manually until you review and arm them
                in the editor.
              </div>

              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={() => {
                    void dispatch(addUserScript({ script: importState.draft }))
                    closeImport()
                  }}
                >
                  Import Automation
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
