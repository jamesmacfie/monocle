# Suggestions and mapping

> The DTO is defined in `packages/native-bridge-protocol/src/wire.ts`,
> re-exported from `apps/extension/shared/types/nativeMessaging.ts`, projected
> by `apps/extension/background/features/nativeMessaging/externalSuggestion.ts`,
> and imported locally through `apps/raycast/src/lib/types.ts`.

## The `ExternalSuggestion` DTO

The only shape that crosses the wire (UI-only fields like actions, weights, modifier labels, and
execution payloads are dropped on the extension side):

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
}
```

## Where suggestions come from

| List state | Method | Result key |
|------------|--------|-----------|
| Root, empty search | `suggestions/get-for-active-tab` `{ limit?, includeFavorites? }` | `{ url, title, suggestions }` |
| Root, search text | `suggestions/search-active-tab` `{ query, limit? }` | `{ url, title, query, suggestions }` |
| Inside a group/search node | `suggestions/get-children` `{ path, query?, limit? }` | `{ url, title, path, suggestions }` (see [nested-navigation.md](./nested-navigation.md)) |

At the root, query the empty state on mount and switch to search on keystrokes:

```tsx
// src/search-monocle.tsx (root, sketch)
import { List } from "@raycast/api";
import { useEffect, useState } from "react";
import { bridgeRequest } from "./lib/bridge";
import { getToken } from "./lib/auth";

export default function SearchMonocle() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ExternalSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const token = await getToken();
      // ...if no token, render an EmptyView with a Pair action (see pairing.md)...
      const res = query.trim()
        ? await bridgeRequest("suggestions/search-active-tab", { query, limit: 50 }, token!)
        : await bridgeRequest("suggestions/get-for-active-tab", { limit: 50, includeFavorites: true }, token!);
      // ...map res.ok ? res.result.suggestions : handle error code (protocol-client.md)...
      setLoading(false);
    })();
  }, [query]);

  return (
    <List
      isLoading={loading}
      filtering={false}                 // the server already filtered/scored — don't double-filter
      throttle
      onSearchTextChange={setQuery}
      searchBarPlaceholder="Search the active tab's Monocle commands"
    >
      {/* map items → CommandItem (below) */}
    </List>
  );
}
```

> `filtering={false}` is important: Monocle scores and filters server-side. Raycast's built-in
> fuzzy filter would re-filter the already-scored set and hide good matches. `throttle` debounces
> the per-keystroke `search-active-tab` calls.

## `type`-driven action routing

The `type` field is the routing key for what selecting a row does. This is the single most important
mapping in the extension:

| `type` | What it is | Raycast row behavior |
|--------|-----------|----------------------|
| `action` | Executable command | Primary `Action`: execute via `commands/execute` ([execution.md](./execution.md)) |
| `submit` | Form command | Execute **only if** the command opted in; otherwise the bridge returns `forbidden`. Treat like `action`, surface `forbidden` gracefully |
| `group` | Container of children | Primary `Action.Push`: drill in ([nested-navigation.md](./nested-navigation.md)) |
| `search` | Search-backed page | Primary `Action.Push`: drill in; the child view forwards its search text as `query` |
| `display` | Static, non-executable row | Render it; no primary action (info only) |
| `calculation` | Inline calc result | Primary `Action`: `Clipboard.copy(title)` + HUD (no execute) |

```tsx
function CommandItem({ s }: { s: ExternalSuggestion }) {
  return (
    <List.Item
      title={s.title}
      subtitle={s.subtitle}
      icon={iconFor(s)}                      // see icon mapping below
      keywords={s.keywords}
      accessories={accessoriesFor(s)}        // e.g. permission badge, type tag
      actions={actionsFor(s)}                // routed by s.type (table above)
    />
  );
}
```

## Accessories

- `requiresPermission` → a permission accessory/tooltip so the user knows a command may prompt for a
  browser permission. (It does not block execution; the extension enforces permissions and returns
  `forbidden` if missing.)
- Optionally show the `type` (`group`/`search`) as an accessory so drill-in rows read as navigable
  (Raycast also conventionally shows a `→`/submenu affordance via the push action).

## Icon mapping

`icon` is either a **Lucide icon name** (e.g. `"Copy"`, `"Bookmark"`, `"History"`) or an
**http(s) URL** (favicons, remote images). `iconType` says which one it is. SVG icons are omitted by
the extension, so `icon` is never inline markup.

Strategy (`src/lib/icons.ts`):

1. If `iconType === "url"` (or a legacy string looks like a URL), render `{ source: icon, fallback }`.
2. Else treat it as a Lucide name. Normalize legacy lower/kebab-case strings, try an exact Raycast
   `Icon` enum match, then fall back to the Monocle-specific alias table.
3. Unknown or absent icons use a semantic fallback based on suggestion `type` (`Folder` for groups,
   `MagnifyingGlass` for search pages, `Calculator` for calculations, etc.) instead of a generic
   circle.

```ts
import { Icon, type Image } from "@raycast/api";

export function iconFor(s: ExternalSuggestion): Image.ImageLike {
  const fallback = fallbackByType[s.type];
  if (!s.icon) return fallback;
  if (s.iconType === "url") return { source: s.icon, fallback };
  return raycastIconForLucideName(s.icon) ?? fallback;
}
```

> The alias table is intentionally based on Monocle's closed Lucide catalog, not Raycast's whole icon
> set. When adding a new Monocle icon name, check whether Raycast has an exact enum member first; add
> an alias only when the two sets use different names.

## Empty / error states

- **No active tab / incognito** (`no_active_tab`): `List.EmptyView` — "Switch to a normal browser
  tab and try again."
- **Not paired** (no token) or **`unauthorized`**: `List.EmptyView` with a "Pair Monocle" action
  ([pairing.md](./pairing.md)).
- **Bridge off / no browser** (`not_enabled`): `List.EmptyView` — "Open your browser and enable the
  Monocle bridge", with a retry.
- **Site-SDK gap:** page-owned `window.Monocle` commands never appear over the bridge. If a user
  expects a page-specific command they see in the palette, it legitimately won't be here (v1 gap).
