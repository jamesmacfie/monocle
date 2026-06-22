# Snippets

> **Status: implemented.** Create/insert palette commands, the `monocle-snippets`
> store, the options Snippets page, caret insertion via `monocle-text-insert`,
> custom-shortcut gating, and insert-time placeholders all work; manual
> insertion/shortcut smoke is still listed below. CLAUDE.md owns the
> authoritative feature status.

Snippets are saved pieces of reusable text that a user can insert into the
focused editable element on a page (or copy to the clipboard as a fallback).
Bodies support **insert-time placeholders** — `{date:FORMAT}`, an incrementing
`{i}` counter, and page-context tokens like `{url}` — interpolated fresh on every
insertion.

Unlike Focus Mode / Tab Groups / Element Hider, Snippets is **not** a feature
module: it is a command subsystem (storage + palette commands + an options page),
the same shape as the other `tools` commands.

## Data model

Snippets live in their own `chrome.storage.local` key, `monocle-snippets`,
separate from `monocle-settings` (storage area built via `createStorageArea` in
`background/commands/snippets.ts`):

```ts
type Snippet = {
  id: string        // crypto.randomUUID()
  name: string
  body: string
  createdAt: number
  updatedAt: number
}
```

`shared/types/snippets.ts` holds the type. The `{i}` counter is persisted per
snippet by `incrementSnippetCounter` (the caller bumps it only when the body
actually references `{i}`); an unknown id still renders `1` so an insertion never
fails over counter bookkeeping.

CRUD goes through the message handlers in `background/messages/`
(`addSnippet`, `updateSnippet`, `deleteSnippet`, `getSnippets`); the options page
mirrors the store into Redux via `storage.onChanged`
(`shared/store/slices/snippets.slice.ts`).

## Commands

See [commands/tools.md](./commands/tools.md) for the catalog. Two palette
commands (`background/commands/tools/snippets.ts`):

- **Create Snippet** (`create-snippet`) — a form group (name `input` + body
  `textarea` + `submit`) that calls `addSnippet`.
- **Insert Snippet** (`insert-snippet`) — a group listing every saved snippet;
  selecting one interpolates its body and inserts it.

## Insert-time placeholders

Interpolation happens at insert time in `interpolateSnippetBody`
(`shared/utils/snippet-placeholders.ts`), driven from the background command. The
grammar is `{name}` or `{date:FORMAT}`, where FORMAT is any
[date-fns](https://date-fns.org/docs/format) format string. Unknown tokens and
invalid date formats are left verbatim. Supported tokens:

| Token | Expands to |
| --- | --- |
| `{date:FORMAT}` | the current date/time formatted with the date-fns FORMAT string |
| `{date}` | current date |
| `{time}` | current time |
| `{datetime}` | current date + time |
| `{timestamp}` | current epoch timestamp |
| `{url}` | active tab URL |
| `{title}` | active tab title |
| `{domain}` | active tab hostname |
| `{path}` | active tab path |
| `{uuid}` | a fresh UUID |
| `{i}` | a per-snippet incrementing counter (persisted) |

`SNIPPET_PLACEHOLDERS_HINT` exports the same list as a UI hint string.

## Insertion flow

Selecting an insert action sends `monocle-text-insert { text }` to the active
tab; `shared/components/Listeners/InsertTextListener.tsx` inserts the text at the
caret of the page's last-focused editable element and responds
`{ inserted: boolean }`. When insertion fails (no editable target), the executor
falls back to `monocle-clipboard-write` plus a toast so the snippet is never
lost.

## Custom keybindings

Insert actions carry `keybindingRequirements: { requireNonShiftModifier: true }`.
Because a snippet shortcut must fire **while an editable element is focused**, the
binding must include a non-shift modifier (so it does not collide with typing).
The requirement is enforced at assignment time in both capture UIs and on persist
(`shared/utils/keybinding-requirements.ts`); see [keybindings.md](./keybindings.md).

## Options page

The **Snippets** options page (`options/pages/SnippetsPage.tsx`, route
`#/snippets`) lists, creates, edits, and deletes saved snippets, and mirrors
palette-created snippets live via `storage.onChanged`.

## Files

- `background/commands/snippets.ts` — `monocle-snippets` storage CRUD + counter.
- `background/commands/tools/snippets.ts` — the create/insert palette commands.
- `shared/utils/snippet-placeholders.ts` — placeholder grammar + interpolation.
- `shared/types/snippets.ts` — the `Snippet` type.
- `background/messages/{addSnippet,updateSnippet,deleteSnippet,getSnippets}.ts` —
  message handlers.
- `shared/components/Listeners/InsertTextListener.tsx` — caret insertion.
- `shared/store/slices/snippets.slice.ts` — the Redux mirror.
- `options/pages/SnippetsPage.tsx` — the options page.

## Manual checks

- Create a snippet from the palette; confirm it appears on the options page (and
  vice versa).
- Insert a snippet into a textarea and into a page with no editable element
  (confirm the clipboard fallback + toast).
- Insert a body using `{date:yyyy-MM-dd}`, `{url}`, `{uuid}`, and `{i}`; confirm
  each resolves and `{i}` increments across insertions.
- Assign a custom shortcut: confirm a shift-only binding is rejected and a
  modifier binding fires while an input is focused.

## Related docs

- [commands/tools.md](./commands/tools.md) — the create/insert command catalog.
- [keybindings.md](./keybindings.md) — `keybindingRequirements` and custom
  shortcuts.
- [settings-page.md](./settings-page.md) — the options Snippets page in context.
