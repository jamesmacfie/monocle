# Settings and storage

> **Status: design-only.** Raycast APIs: `getPreferenceValues`, `LocalStorage`,
> `openExtensionPreferences` (<https://developers.raycast.com>).

## What lives where

| Data | Where | Why |
|------|-------|-----|
| `port` | **Preference** (textfield, optional) | User-editable connection setting; non-secret. Blank → auto-discover. |
| `host` | **Preference** (textfield, optional) | Connection setting; almost always `127.0.0.1`. |
| `token` | **`LocalStorage`** (`monocle.token`) | Secret. Encrypted, not user-editable, never logged. |
| `instanceId` | **`LocalStorage`** (`monocle.instanceId`) | Derived stable id; reused so re-pairing dedupes. |

Rule of thumb: **preferences for user-tunable non-secrets, `LocalStorage` for secrets and derived
state.** Raycast has password preferences for user-entered secrets, but the Monocle token is minted
by pairing and should not be shown or edited in the preferences UI.

## Reading preferences

Raycast auto-generates the `Preferences` type from the manifest, so prefs are typed:

```ts
import { getPreferenceValues } from "@raycast/api";

const { port, host } = getPreferenceValues<Preferences>();
// port/host are strings (textfield). Empty string when unset.
```

Per-command typing (`Preferences.SearchMonocle`) also works; since `port`/`host` are extension-level
and inherited, the top-level `Preferences` is fine.

## `LocalStorage`

Per-extension, stored by Raycast in its local encrypted database, shared across this extension's
commands (not other extensions). Values are `string | number | boolean`. See `src/lib/auth.ts` in
[pairing.md](./pairing.md):

```ts
import { LocalStorage } from "@raycast/api";

await LocalStorage.setItem("monocle.token", token);
const token = await LocalStorage.getItem<string>("monocle.token");
await LocalStorage.removeItem("monocle.token");   // on unauthorized / "forget"
```

## Storage keys

| Key | Type | Set when | Cleared when |
|-----|------|----------|--------------|
| `monocle.instanceId` | string (uuid) | First run (lazy) | Never (stable across re-pairs) |
| `monocle.token` | string (64-hex) | After `pair/submit-code` succeeds | On `unauthorized`/`forbidden_scope`, or a "Forget pairing" action |

## Pointing the user at preferences

When the daemon is unreachable or the port looks wrong, open the prefs pane directly:

```ts
import { openExtensionPreferences } from "@raycast/api";
// e.g. an Action in an error EmptyView
await openExtensionPreferences();
```

Offer this as a secondary `Action` whenever you show a connection error
([testing-and-troubleshooting.md](./testing-and-troubleshooting.md)).

## A "Forget pairing" action

Provide a secondary action (in the `Search Monocle` action panel) that clears the token so the user
can re-pair against a different browser/profile:

```ts
await LocalStorage.removeItem("monocle.token");   // keep instanceId
```

Keep `instanceId` — re-pairing with the same id replaces the old client record in the extension
rather than accumulating stale ones.
