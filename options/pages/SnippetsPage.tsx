import { FileText, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  addSnippet,
  deleteSnippet,
  loadSnippets,
  selectSnippets,
  selectSnippetsError,
  selectSnippetsLoading,
  selectSnippetsUpdatingIds,
  updateSnippet,
} from "../../shared/store/slices/snippets.slice"
import type { Snippet } from "../../shared/types"
import { SNIPPET_PLACEHOLDERS_HINT } from "../../shared/utils/snippet-placeholders"
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Panel,
  Textarea,
} from "../components/ui"

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

const previewBody = (body: string) => {
  const flattened = body.replace(/\s+/g, " ").trim()
  return flattened.length > 120 ? `${flattened.slice(0, 120)}…` : flattened
}

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; snippet: Snippet }

export function SnippetsPage() {
  const dispatch = useAppDispatch()
  const snippets = useAppSelector(selectSnippets)
  const loading = useAppSelector(selectSnippetsLoading)
  const error = useAppSelector(selectSnippetsError)
  const updatingIds = useAppSelector(selectSnippetsUpdatingIds)

  const [editor, setEditor] = useState<EditorState>({ mode: "closed" })
  const [name, setName] = useState("")
  const [body, setBody] = useState("")

  useEffect(() => {
    dispatch(loadSnippets())
  }, [dispatch])

  const openCreate = () => {
    setName("")
    setBody("")
    setEditor({ mode: "create" })
  }

  const openEdit = (snippet: Snippet) => {
    setName(snippet.name)
    setBody(snippet.body)
    setEditor({ mode: "edit", snippet })
  }

  const closeEditor = () => setEditor({ mode: "closed" })

  const canSave = name.trim().length > 0 && body.trim().length > 0

  const handleSave = () => {
    if (!canSave) {
      return
    }

    if (editor.mode === "create") {
      void dispatch(addSnippet({ name: name.trim(), body }))
    } else if (editor.mode === "edit") {
      void dispatch(
        updateSnippet({ id: editor.snippet.id, name: name.trim(), body }),
      )
    }

    closeEditor()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Snippets</h1>
          <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
            {snippets.length} saved snippets — insert them from the palette with
            Insert Snippet
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New Snippet
          </Button>
          <Button
            disabled={loading}
            type="button"
            variant="secondary"
            onClick={() => {
              void dispatch(loadSnippets())
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-fg)]">
          {error}
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto options-scrollbar">
          <table className="w-full min-w-[700px] table-fixed border-collapse">
            <colgroup>
              <col className="w-56" />
              <col />
              <col className="w-36" />
              <col className="w-28" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-fg-muted)]">
                <th className="px-4 py-3">Name</th>
                <th className="px-3 py-3">Snippet</th>
                <th className="px-3 py-3">Updated</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {snippets.map((snippet) => {
                const updating = updatingIds.includes(snippet.id)

                return (
                  <tr
                    key={snippet.id}
                    className="border-b border-[var(--color-border)] transition-colors hover:bg-[var(--color-bg-hover)]"
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4 shrink-0 text-[var(--color-fg-muted)]" />
                        <span className="truncate">{snippet.name}</span>
                      </div>
                    </td>
                    <td className="min-w-0 px-3 py-3 text-sm text-[var(--color-fg-muted)]">
                      <span className="line-clamp-2">
                        {previewBody(snippet.body)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-[var(--color-fg-muted)]">
                      {formatDate(snippet.updatedAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <Button
                          aria-label={`Edit ${snippet.name}`}
                          disabled={updating}
                          size="icon"
                          type="button"
                          variant="secondary"
                          onClick={() => openEdit(snippet)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          aria-label={`Delete ${snippet.name}`}
                          disabled={updating}
                          size="icon"
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            void dispatch(deleteSnippet({ id: snippet.id }))
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
        {snippets.length === 0 && (
          <div className="p-8 text-center text-sm text-[var(--color-fg-muted)]">
            {loading
              ? "Loading snippets…"
              : "No snippets yet. Create one here or with the Create Snippet palette command."}
          </div>
        )}
      </Panel>

      <Dialog
        open={editor.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) {
            closeEditor()
          }
        }}
      >
        <DialogContent>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {editor.mode === "edit" ? "Edit Snippet" : "New Snippet"}
              </DialogTitle>
              <DialogDescription className="text-sm text-[var(--color-fg-muted)]">
                Snippets are inserted at the cursor from the palette
              </DialogDescription>
            </div>
          </div>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Name</span>
            <Input
              value={name}
              placeholder="Snippet name"
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Body</span>
            <Textarea
              rows={8}
              value={body}
              placeholder="Snippet text…"
              onChange={(event) => setBody(event.target.value)}
            />
            <span className="text-xs text-[var(--color-fg-muted)]">
              {SNIPPET_PLACEHOLDERS_HINT}
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={!canSave} type="button" onClick={handleSave}>
              {editor.mode === "edit" ? "Save Changes" : "Create Snippet"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
