// Architecture: options/ page layer. The Automations list view: renders the
// automation documents mirrored by the automations slice (storage truth
// lives behind background/messages/automations.ts), with immediate
// enable/disable toggles, edit/delete/export per row, and the import flow —
// file pick, sanitize + validate (automations/importExport.ts), then a
// review dialog built from summarizeAutomation before anything is saved.
// The builder itself lives at /automations/new and /automations/:id
// (automations/AutomationEditorPage.tsx).
import {
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  Workflow,
} from "lucide-react"
import { useRef, useState } from "react"
import { Link } from "wouter"
import { EXAMPLE_AUTOMATIONS } from "../../shared/automations/examples"
import { getIconComponent } from "../../shared/components/iconRegistry"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  addAutomation,
  deleteAutomation,
  loadAutomations,
  selectAutomations,
  selectAutomationsError,
  selectAutomationsLoading,
  selectAutomationsUpdatingIds,
  updateAutomation,
} from "../../shared/store/slices/automations.slice"
import { selectSnippets } from "../../shared/store/slices/snippets.slice"
import { type Automation, isFeatureAutomation } from "../../shared/types"
import type { AutomationDraft } from "../../shared/types/automationValidation"
import {
  automationBlurb,
  summarizeAutomation,
} from "../../shared/utils/automation-summary"
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
import { AutomationReviewDialog } from "./automations/AutomationReviewDialog"
import { GenerateAutomationDialog } from "./automations/GenerateAutomationDialog"
import {
  downloadAutomationExport,
  prepareImportedDraft,
} from "./automations/importExport"

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

const toDraft = (script: Automation): AutomationDraft => {
  const { id, createdAt, updatedAt, ...draft } = script
  void id
  void createdAt
  void updatedAt
  return draft
}

type InvalidImport = { fileName: string; errors: string[] }
type ReviewState = {
  sourceLabel: string
  draft: AutomationDraft
  note?: string
}

export function AutomationsPage() {
  const dispatch = useAppDispatch()
  const scripts = useAppSelector(selectAutomations)
  const loading = useAppSelector(selectAutomationsLoading)
  const error = useAppSelector(selectAutomationsError)
  const updatingIds = useAppSelector(selectAutomationsUpdatingIds)
  const snippets = useAppSelector(selectSnippets)

  // Feature-owned automations are read-only here (their config is the source of
  // truth, managed in the feature's settings page); only user-authored ones get
  // the editable table.
  const automations = scripts.filter((script) => !isFeatureAutomation(script))
  const featureScripts = scripts.filter(isFeatureAutomation)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [invalidImport, setInvalidImport] = useState<InvalidImport | null>(null)
  const [review, setReview] = useState<ReviewState | null>(null)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [generatorOpen, setGeneratorOpen] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedNotice, setSeedNotice] = useState<string | null>(null)

  // Seed the curated examples that aren't already present (matched by name),
  // so clicking twice doesn't pile up duplicates. Each goes through the
  // normal add-automation path, so they're validated like any document.
  const handleAddExamples = async () => {
    setSeeding(true)
    setSeedNotice(null)
    try {
      const existingNames = new Set(scripts.map((script) => script.name))
      const toAdd = EXAMPLE_AUTOMATIONS.filter(
        (example) => !existingNames.has(example.name),
      )

      for (const script of toAdd) {
        await dispatch(addAutomation({ automation: script }))
      }

      const skipped = EXAMPLE_AUTOMATIONS.length - toAdd.length
      setSeedNotice(
        toAdd.length === 0
          ? "All example automations are already in your list."
          : `Added ${toAdd.length} example automation${
              toAdd.length === 1 ? "" : "s"
            }${skipped > 0 ? ` (${skipped} already present)` : ""}. Open one to see how it works; event and scheduled triggers ship disarmed.`,
      )
    } finally {
      setSeeding(false)
    }
  }

  const handleImportFile = async (file: File) => {
    const raw = await file.text()
    const prepared = prepareImportedDraft(raw)
    if (!prepared.ok) {
      setInvalidImport({
        fileName: file.name,
        errors: prepared.errors,
      })
      return
    }
    setReview({
      sourceLabel: "imported",
      draft: prepared.draft,
    })
  }

  const snippetLabel = (snippetId: string) =>
    snippets.find((snippet) => snippet.id === snippetId)?.name ??
    `${snippetId} (missing)`

  const confirmReview = async () => {
    if (!review) return
    setReviewSaving(true)
    setReviewError(null)
    try {
      const action = await dispatch(addAutomation({ automation: review.draft }))
      if (addAutomation.fulfilled.match(action)) setReview(null)
      else setReviewError(action.payload ?? "Failed to add automation")
    } finally {
      setReviewSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Automations</h1>
          <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {automations.length} saved automations — declarative scripts that
            run from the palette or on triggers you arm
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
            onClick={() => setGeneratorOpen(true)}
          >
            <WandSparkles className="h-4 w-4" />
            Generate with AI
          </Button>
          <Button
            disabled={seeding}
            type="button"
            variant="secondary"
            onClick={() => {
              void handleAddExamples()
            }}
          >
            <Sparkles className="h-4 w-4" />
            Add Examples
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
              void dispatch(loadAutomations())
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

      {seedNotice && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-fg-muted)]">
          {seedNotice}
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
              {automations.map((script) => {
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
                        {automationBlurb(script)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Switch
                        aria-label={`Toggle ${script.name}`}
                        checked={script.enabled}
                        disabled={updating}
                        onCheckedChange={(checked) => {
                          void dispatch(
                            updateAutomation({
                              id: script.id,
                              automation: {
                                ...toDraft(script),
                                enabled: checked,
                              },
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
                          onClick={() => downloadAutomationExport(script)}
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
                            void dispatch(deleteAutomation({ id: script.id }))
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
        {automations.length === 0 && (
          <div className="p-8 text-center text-sm text-[var(--color-fg-muted)]">
            {loading
              ? "Loading automations…"
              : "No automations yet. Create one or import a .monocle-automation.json file."}
          </div>
        )}
      </Panel>

      {featureScripts.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Managed by features</h2>
            <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
              Automations contributed by features. They run on their triggers
              but are read-only here — manage them in the feature's settings.
            </div>
          </div>
          <Panel className="divide-y divide-[var(--color-border)]">
            {featureScripts.map((script) => {
              const Icon = getIconComponent(script.icon ?? "") ?? Workflow
              return (
                <div
                  key={script.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4 shrink-0 text-[var(--color-fg-muted)]" />
                      <span className="truncate">{script.name}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-sm text-[var(--color-fg-muted)]">
                      {automationBlurb(script)}
                    </div>
                  </div>
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/features/${script.owner?.featureId ?? ""}`}>
                      Manage in settings
                    </Link>
                  </Button>
                </div>
              )
            })}
          </Panel>
        </section>
      )}

      <Dialog
        open={invalidImport !== null}
        onOpenChange={(open) => !open && setInvalidImport(null)}
      >
        <DialogContent>
          {invalidImport ? (
            <>
              <DialogTitle className="text-base font-semibold">
                Could not import {invalidImport.fileName}
              </DialogTitle>
              <DialogDescription className="text-sm text-[var(--color-fg-muted)]">
                The file is not a valid Monocle automation.
              </DialogDescription>
              <ul className="grid max-h-60 gap-1 overflow-y-auto text-xs text-[var(--color-error-fg)] options-scrollbar">
                {invalidImport.errors.map((message) => (
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
          ) : null}
        </DialogContent>
      </Dialog>

      <GenerateAutomationDialog
        open={generatorOpen}
        onOpenChange={setGeneratorOpen}
        onGenerated={(generated) => {
          setReview({
            sourceLabel: "AI-generated",
            draft: generated.draft,
            note: generated.note,
          })
        }}
      />

      <AutomationReviewDialog
        draft={review?.draft ?? null}
        error={reviewError}
        note={review?.note}
        open={review !== null}
        saving={reviewSaving}
        snippetLabel={snippetLabel}
        sourceLabel={review?.sourceLabel ?? "imported"}
        summary={review ? summarizeAutomation(review.draft) : null}
        onConfirm={() => void confirmReview()}
        onBack={
          review?.sourceLabel === "AI-generated"
            ? () => {
                setReview(null)
                setReviewError(null)
                setGeneratorOpen(true)
              }
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) {
            setReview(null)
            setReviewError(null)
          }
        }}
      />
    </div>
  )
}
