# Suggestions and navigation

> The DTO is defined in `packages/native-bridge-protocol/src/wire.ts`
> (`ExternalSuggestion`), re-exported from
> `apps/extension/shared/types/nativeMessaging.ts`, projected by
> `apps/extension/background/features/nativeMessaging/externalSuggestion.ts`, and
> imported locally through `apps/raycast/src/lib/types.ts`. Nested navigation is
> backed by `suggestions/get-children` and the palette's
> `getCommandPageCommands` (extension `…/nativeMessaging/suggestions.ts`).

This doc covers rendering the active-tab command **tree** as Raycast `List`
items: the `ExternalSuggestion` → `List.Item` mapping, `type`-driven action
routing, icon mapping, and recursive drill-in via `suggestions/get-children`.

## The `ExternalSuggestion` DTO

The only shape that crosses the wire (UI-only fields like actions, weights,
modifier labels, and execution payloads are dropped on the extension side):

```ts
type ExternalSuggestion = {
  id: string
  type: "action" | "submit" | "group" | "search" | "display" | "calculation"
  title: string              // breadcrumb name arrays are pre-joined with " › "
  subtitle?: string          // from the command description
  icon?: string              // a Lucide icon name (e.g. "Copy") OR an http(s) URL; svg icons omitted
  iconType?: "lucide" | "url" // additive v1 metadata; old clients can ignore it
  keywords?: string[]
  requiresPermission?: string[]
  confirmAction?: boolean    // true → destructive; client must confirm and send `confirmed:true`
}
```

## Where suggestions come from

All bridge calls are routed to one connected browser (`target = instance.id`)
and authed with that browser's own token — see [architecture.md](./architecture.md)
and [pairing.md](./pairing.md) for the per-browser model.

| List state | Method | Result key |
|------------|--------|-----------|
| Root, empty search | `suggestions/get-for-active-tab` `{ limit?, includeFavorites? }` | `{ url, title, suggestions }` |
| Root, search text | `suggestions/search-active-tab` `{ query, limit? }` | `{ url, title, query, suggestions }` |
| Inside a group/search node | `suggestions/get-children` `{ path, query?, limit? }` | `{ url, title, path, suggestions }` |

The root view (`src/components/BrowserCommands.tsx`) queries the empty state on
mount and switches to search on keystrokes:

```tsx
const res = query.trim()
  ? await bridgeRequest("suggestions/search-active-tab", { query, limit: 50 }, token, target)
  : await bridgeRequest("suggestions/get-for-active-tab", { limit: 50, includeFavorites: true }, token, target);
```

```tsx
<List
  isLoading={phase === "loading"}
  filtering={false}                 // the server already filtered/scored — don't double-filter
  throttle
  onSearchTextChange={setQuery}
  searchBarPlaceholder={`Search ${instance.name}'s active-tab Monocle commands`}
>
  {items.map((s) => (
    <CommandRow key={s.id} s={s} parentPath={[]} target={target} executionEnabled={executionEnabled} />
  ))}
</List>
```

> `filtering={false}` is important: Monocle scores and filters server-side.
> Raycast's built-in fuzzy filter would re-filter the already-scored set and hide
> good matches. `throttle` debounces the per-keystroke `search-active-tab` calls.

The **active tab is resolved server-side** — Raycast never sends a URL. The
suggestions you get are always for whatever tab is frontmost in the connected
browser at request time.

## `type`-driven action routing

The `type` field is the routing key for what selecting a row does — the single
most important mapping. It lives in `src/components/CommandRow.tsx`:

| `type` | What it is | Raycast row behavior |
|--------|-----------|----------------------|
| `action` | Executable command | Primary `Action`: Run via `commands/execute` ([execution.md](./execution.md)) |
| `submit` | Form command | Same as `action` (routed to Run); the bridge returns `forbidden` unless the command opted in. Surface `forbidden` gracefully |
| `group` | Container of children | Primary `Action.Push`: drill into a nested `CommandList` |
| `search` | Search-backed page | Primary `Action.Push`: drill in; the child view forwards its search text as `query` |
| `display` | Static, non-executable row | Render it; no primary action (returns `null` actions) |
| `calculation` | Inline calc result | Primary `Action`: `Clipboard.copy(title)` + `showHUD` (no execute) |

```tsx
function CommandRow({ s, parentPath, target, executionEnabled }) {
  return (
    <List.Item
      title={s.title}
      subtitle={s.subtitle}
      icon={iconFor(s)}                  // see icon mapping below
      keywords={s.keywords}
      accessories={accessoriesFor(s)}    // group/search → a type tag accessory
      actions={<CommandActions s={s} parentPath={parentPath} target={target} executionEnabled={executionEnabled} />}
    />
  );
}
```

For `action`/`submit` rows, `CommandRow` also honors `confirmAction`: it shows a
`confirmAlert` and passes `confirmed` to `runCommand` so the bridge accepts the
destructive command (see [execution.md](./execution.md)).

## Accessories

- `requiresPermission` → the DTO carries it so a client can surface a permission
  hint. (It does not block execution; the extension enforces permissions and
  returns `forbidden` if missing.)
- `group`/`search` show their `type` as an accessory so drill-in rows read as
  navigable (`accessoriesFor` in `CommandRow.tsx`).

## Icon mapping

`icon` is either a **Lucide icon name** (e.g. `"Copy"`, `"Bookmark"`,
`"History"`) or an **http(s) URL** (favicons, remote images). `iconType` says
which one it is. SVG icons are omitted by the extension, so `icon` is never
inline markup.

Strategy (`src/lib/icons.ts`, `iconFor`):

1. If `iconType === "url"` (or a legacy string matches an `http(s)://` URL),
   render `{ source: icon, fallback }`.
2. Else treat it as a Lucide name (`raycastIconForLucideName`): normalize legacy
   lower/kebab-case strings, try an exact Raycast `Icon` enum match, then fall
   back to the Monocle-specific `lucideAliases` table.
3. Unknown or absent icons use a semantic fallback based on suggestion `type`
   (`fallbackByType`: `Folder` for groups, `MagnifyingGlass` for search pages,
   `Calculator` for calculations, etc.) instead of a generic circle.

> The alias table is intentionally based on Monocle's closed Lucide catalog, not
> Raycast's whole icon set. When adding a new Monocle icon name, check whether
> Raycast has an exact enum member first; add an alias only when the two sets use
> different names.

## Nested navigation

Monocle commands are a tree, not a flat list. A `group` or `search` node (e.g.
`History`, `Bookmarks`) has children, which may themselves be groups (drill
further) or actions (execute). Selecting `History` does **not** execute and dump
a list — it is a node you **navigate into**, and its children might be
time-period groups (`Last hour`, `Today`, …) you drill into again before reaching
executable entries.

Raycast models this with a **navigation stack** (`Action.Push` / `useNavigation`):
each group/search row pushes a new `List` view (`src/components/CommandList.tsx`)
for the next level.

### The `path` model

`suggestions/get-children` takes a `path`: the breadcrumb of command **ids** from
root to the node being entered, e.g. `["history"]`, then `["history", "today"]`.
The result echoes the `path` and returns that node's children as
`ExternalSuggestion[]` — children that are themselves groups carry
`type:"group"`/`"search"`, so you nest by **appending the entered node's id to
`path`** (`CommandRow` pushes `path={[...parentPath, s.id]}`).

```jsonc
// request
{ "v":1, "id":"…", "method":"suggestions/get-children", "params": { "path": ["history"], "limit": 50 } }
// result
{ "url":"…", "title":"…", "path":["history"],
  "suggestions":[
    { "id":"today",  "type":"group",  "title":"Today" },
    { "id":"clear",  "type":"action", "title":"Clear browsing data" }
  ] }
```

- `path` is 1..20 ids. The 20-deep cap is enforced server-side; in practice trees
  are shallow.
- **`not_found`**: a `path` that does not resolve to a real group/search page
  (stale id, a node that is no longer a container). `CommandList` shows a toast
  and `pop()`s the view.
- **Real but empty page**: resolves fine but has no children → `suggestions: []`.
  Render a `List.EmptyView` ("Nothing here"), do **not** treat as an error.
- The child resolver reuses the palette's
  `getCommandPageCommands(context, path, query)`, so dynamic / contextual children
  and permission inheritance behave exactly as in the browser palette.

### Root vs nested

| Level | Method | Search box |
|-------|--------|-----------|
| Root | `get-for-active-tab` (empty) / `search-active-tab` (query) | scoped to the whole active-tab catalog |
| Any node below root | `get-children` `{ path, query? }` | scoped to that node's children |

So the root view (`BrowserCommands`) and the nested views (`CommandList`) use
**different** methods, but map results identically through `CommandRow`.

### `group` vs `search` child pages

Both push a child `List`, but the search box behaves differently
(`CommandList.tsx` keys off `isSearchPage`):

- **`group`** — a static-ish container. `filtering={true}` lets Raycast's own
  list filtering handle the search box on the already-fetched children;
  `query` is omitted from the fetch.
- **`search`** — a dynamic, query-backed page. The search-box text is forwarded
  as the `query` param to `get-children` with `filtering={false}` (the server
  does the matching) and `throttle`. This mirrors how the palette's `search`-type
  pages re-query the background per keystroke.

You can tell which to do from the entered node's `type` (`group` vs `search`) at
push time.

### Recursive component

A single recursive `CommandList` parameterized by `path` handles every level
below root. Each pushed group/search child renders another `CommandList` with
`path` extended by that child's id:

```tsx
// src/components/CommandList.tsx (shape)
const res = await bridgeRequest(
  "suggestions/get-children",
  { path, query: isSearchPage ? query : undefined, limit: 50 },
  token,
  target,
);
// res.ok → setItems(res.result.suggestions)
// not_found → toast + pop(); unauthorized/forbidden_scope → clearToken(target)

return (
  <List isLoading={loading} filtering={!isSearchPage} throttle={isSearchPage}
        onSearchTextChange={isSearchPage ? setQuery : undefined}>
    <List.EmptyView title={loading ? "Loading…" : "Nothing here"} />
    {items.map((s) => (
      <CommandRow key={s.id} s={s} parentPath={path} target={target} executionEnabled={executionEnabled} />
    ))}
  </List>
);
```

Each push appends `s.id` to `path`, so `["history"]` → `["history","today"]` → …
naturally. Raycast manages the back stack (Escape pops), giving the same
drill-in/-out feel as the palette without your own breadcrumb state.

### Execution from a nested page

`commands/execute` resolves the command by `id` against the active tab — it does
**not** take a `path`. So an `action`/`submit` row's Run action works identically
at any depth: send `{ id: s.id }` (plus `confirmed` if `confirmAction`). See
[execution.md](./execution.md).

## Empty / error states

- **No active tab / incognito** (`no_active_tab`): `List.EmptyView` — "Switch to
  a normal browser tab and try again."
- **Not paired** (no token for that browser) or **`unauthorized`**:
  `List.EmptyView` with a "Pair Monocle" action ([pairing.md](./pairing.md)).
- **Bridge off / no browser** (`not_enabled`): `List.EmptyView` — "Open your
  browser and enable the Monocle bridge", with a retry.
- **Site-SDK gap:** page-owned `window.Monocle` commands never appear over the
  bridge. If a user expects a page-specific command they see in the palette, it
  legitimately won't be here (v1 gap).
