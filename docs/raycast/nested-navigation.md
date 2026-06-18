# Nested navigation

> **Status: design-only.** Backed by the `suggestions/get-children` method
> (`apps/extension/shared/types/nativeMessaging.ts`) and
> `getChildrenForActiveTab` in `apps/extension/background/features/nativeMessaging/suggestions.ts`.

## Why this exists

Monocle commands are a tree, not a flat list. A `group` or `search` node (e.g. `History`,
`Bookmarks`) has children, which may themselves be groups (drill further) or actions (execute). The
`History` example: selecting it does **not** execute and dump a list — it is a node you **navigate
into**, and its children might be time-period groups (`Last hour`, `Today`, …) that you drill into
again before reaching executable entries.

Raycast models this with a **navigation stack** (`useNavigation().push` / `Action.Push`): each
group/search row pushes a new `List` view for the next level.

## The `path` model

`suggestions/get-children` takes a `path`: the breadcrumb of command **ids** from root to the node
being entered, e.g. `["history"]`, then `["history", "today"]`. The result echoes the `path` and
returns that node's children as `ExternalSuggestion[]` — children that are themselves groups carry
`type:"group"`/`"search"`, so you nest by **appending the entered node's id to `path`**.

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

- `path` is 1..20 ids. The 20-deep cap is enforced server-side; in practice trees are shallow.
- **`not_found`**: a `path` that does not resolve to a real group/search page (stale id, a node that
  is no longer a container). Pop the view with a toast.
- **Real but empty page**: resolves fine but has no children → `suggestions: []`. Render a
  `List.EmptyView` ("Nothing here"), do **not** treat as an error.
- The child resolver reuses the palette's `getCommandPageCommands(context, path, query)`, so dynamic
  / contextual children and permission inheritance behave exactly as in the browser palette.

## Root vs nested

| Level | Method | Search box |
|-------|--------|-----------|
| Root | `get-for-active-tab` (empty) / `search-active-tab` (query) | scoped to the whole active-tab catalog |
| Any node below root | `get-children` `{ path, query? }` | scoped to that node's children |

So the root view and the nested views use **different** methods, but map results identically.

## `group` vs `search` child pages

Both push a child `List`, but the search box behaves differently:

- **`group`** — a static-ish container. Let Raycast's own list filtering handle the search box
  (`filtering` left default / `true`), or omit `query` and re-fetch. Simplest: render the children
  and let Raycast filter on title/keywords.
- **`search`** — a dynamic, query-backed page. **Forward the search-box text as the `query`** param
  to `get-children` and set `filtering={false}` (the server does the matching), with `throttle`.
  This mirrors how the palette's `search`-type pages re-query the background per keystroke.

You can tell which to do from the entered node's `type` (`group` vs `search`) at push time.

## Recursive component

A single recursive `CommandList` parameterized by `path` handles every level (root passes
`path={[]}` and special-cases the root methods, or you keep a thin root wrapper that calls the
active-tab methods and pushes `CommandList` for children):

```tsx
// src/components/CommandList.tsx (sketch)
import { Action, ActionPanel, List, useNavigation } from "@raycast/api";
import { useEffect, useState } from "react";
import { bridgeRequest } from "../lib/bridge";
import { getToken } from "../lib/auth";
import { iconFor } from "../lib/icons";

export function CommandList({ path, isSearchPage }: { path: string[]; isSearchPage: boolean }) {
  const { push } = useNavigation();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ExternalSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const token = await getToken();
      const res = await bridgeRequest<{ suggestions: ExternalSuggestion[] }>(
        "suggestions/get-children",
        { path, query: isSearchPage ? query : undefined, limit: 50 },
        token!,
      );
      if (res.ok) setItems(res.result.suggestions);
      else if (res.error.code === "not_found") { /* showToast + pop() */ }
      // else handle no_active_tab / unauthorized (protocol-client.md)
      setLoading(false);
    })();
  }, [path.join("/"), isSearchPage ? query : ""]);

  return (
    <List
      isLoading={loading}
      filtering={!isSearchPage}                       // server filters search pages
      throttle={isSearchPage}
      onSearchTextChange={isSearchPage ? setQuery : undefined}
    >
      {items.map((s) => (
        <List.Item
          key={s.id}
          title={s.title}
          subtitle={s.subtitle}
          icon={iconFor(s.icon)}
          keywords={s.keywords}
          actions={
            <ActionPanel>
              {(s.type === "group" || s.type === "search") ? (
                <Action.Push
                  title="Open"
                  target={<CommandList path={[...path, s.id]} isSearchPage={s.type === "search"} />}
                />
              ) : (
                <Action title="Run" onAction={() => {/* commands/execute — execution.md */}} />
              )}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
```

Each push appends `s.id` to `path`, so `["history"]` → `["history","today"]` → … naturally. Raycast
manages the back stack (Escape pops), so you get the same drill-in/-out feel as the palette without
managing your own breadcrumb state.

## Execution from a nested page

`commands/execute` resolves the command by `id` against the active tab — it does **not** take a
`path`. So an `action`/`submit` row's Run action works identically at any depth: send
`{ id: s.id }`. See [execution.md](./execution.md).
