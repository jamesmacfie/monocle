# Pairing

> The pairing protocol is implemented in
> `apps/extension/background/features/nativeMessaging/pairing.ts`. Threat model:
> [`../native-messaging/authentication-and-security.md`](../native-messaging/authentication-and-security.md).

## The model

Bluetooth-style, **Direction B**: the confirmation code travels
**extension → app → human → browser**. Raycast **displays** the code; the user
reads it and types it on the browser's **Integrations** settings page, then
clicks **Accept**. The browser mints the token; Raycast collects it by polling.
This proves the person driving Raycast can also see the browser, and keeps
accept/reject on one settings page.

```
Raycast: pair/request {client:{name:"Raycast", instanceId}}  ──▶  extension
                                                                    │ generates 6-digit code,
                                                                    │ stores its hash + 60s expiry
                                                                    │ as a PENDING request
Raycast ◀── {pairingId, code:"481920", expiresInSeconds:60} ───────┘
   │
   │ Raycast DISPLAYS the code; user opens the browser:
   │   Monocle → Settings → Integrations
   │   ┌──────────────────────────────────┐
   │   │  Raycast — Requesting access      │
   │   │  [ 481920 ]  [Accept]  [Reject]   │   ← user types the code, Accepts
   │   └──────────────────────────────────┘
   │                                          extension constant-time compares,
   │                                          mints a token, stores its HASH,
   │                                          stashes plaintext on the pending record
   ▼ poll every ~2s
Raycast: pair/poll-status {pairingId}  ─────────────────────────▶  extension
Raycast ◀── {status:"approved", token:"<64-hex>", scopes:[…]} ─────┘  (plaintext ONCE)
   │                                          (pending → "pending" until Accept;
   ▼ store token in LocalStorage              then "approved" once, else expired/rejected)
```

Key facts (from `pairing.ts`):

- **Code:** 6 digits, CSPRNG, **returned in `pair/request`** for the app to display. **TTL 60
  seconds**, `expiresInSeconds` returned for a countdown. The human enters it on the Integrations
  page (not in Raycast).
- **Polling:** `pair/poll-status {pairingId}` returns `pending` until the user Accepts, then
  `approved` with the token **once** (the pending record is dropped on read), or `expired`/`rejected`.
- **Attempt cap:** 5 wrong Accepts in the browser clears the pending request → the app's next poll
  gets `rejected`.
- **Token:** 64-hex, delivered **exactly once** via poll, stored hashed (SHA-256) in the extension.
  It grants **both** scopes (`suggestions:read`, `commands:execute`).
- **Re-pairing the same `instanceId` replaces** the prior client record (the extension dedupes by
  `instanceId`). So re-pairing is safe and idempotent per instance.
- **No refresh.** A lost/revoked token means pairing again. There is no renew endpoint.
- **No browser-side host needed.** Direction B removed the pairing modal; the request shows on the
  Integrations settings page (a normal extension page), so there is no longer a `chrome://*` /
  no-content-host blind spot.

## The `instanceId` and per-browser tokens

The `instanceId` is a stable per-installation id. Generate it once, persist it in
`LocalStorage`, and reuse it forever so re-pairing replaces the same client record
instead of piling up duplicates in the extension's paired-clients list.

**Tokens are per-browser.** A token is minted by one browser's extension and is
only accepted there, so `auth.ts` keys tokens by browser id
(`monocle.token.<browserId>`, where `browserId` is the routing target, e.g.
`"chrome"`). The `instanceId` is shared across browsers (one installation).

```ts
// src/lib/auth.ts
import { LocalStorage } from "@raycast/api";
import { randomUUID } from "node:crypto";

const INSTANCE_KEY = "monocle.instanceId";
const LEGACY_TOKEN_KEY = "monocle.token"; // pre-multi-browser single token
const tokenKey = (browserId: string) => `monocle.token.${browserId}`;

export async function getInstanceId(): Promise<string> {
  let id = await LocalStorage.getItem<string>(INSTANCE_KEY);
  if (!id) {
    id = randomUUID();
    await LocalStorage.setItem(INSTANCE_KEY, id);
  }
  return id;
}

export const getToken = (browserId: string) => LocalStorage.getItem<string>(tokenKey(browserId));
export const setToken = (browserId: string, t: string) => LocalStorage.setItem(tokenKey(browserId), t);
// Clear the token but KEEP instanceId, so re-pairing dedupes cleanly.
export const clearToken = (browserId: string) => LocalStorage.removeItem(tokenKey(browserId));
```

**Legacy migration.** `migrateLegacyToken(browserId)` is called only when exactly
one browser is connected: it claims the pre-multi-browser `monocle.token` for that
browser's keyed slot and deletes the legacy key, so existing users don't have to
re-pair.

## The `Pair Monocle` command

A `view`-mode `Detail`. The flow:

1. On mount, fire `pair/request` with the client identity. **Display the returned `code`** prominently
   ("enter this in your browser — Monocle → Settings → Integrations", with the 60s countdown).
2. Poll `pair/poll-status {pairingId}` every ~2s. On `approved`, store the token and pop with a
   success toast. On `expired`/`rejected`, stop and show why. Keep polling on `pending`.

```tsx
// src/pair-monocle.tsx (sketch)
import { Action, ActionPanel, Detail, showToast, Toast, useNavigation } from "@raycast/api";
import { useEffect, useState } from "react";
import { bridgeRequest } from "./lib/bridge";
import { getInstanceId, setToken } from "./lib/auth";

export function PairForm({ browserId }: { browserId: string }) {
  const { pop } = useNavigation();
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState("Requesting a pairing code…");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (pairingId: string) => {
      if (cancelled) return;
      const res = await bridgeRequest("pair/poll-status", { pairingId }, undefined, browserId);
      if (cancelled) return;
      if (res.ok && res.result.status === "approved") {
        await setToken(browserId, res.result.token);
        await showToast({ style: Toast.Style.Success, title: "Paired with Monocle" });
        pop();
        return;
      }
      if (res.ok && (res.result.status === "expired" || res.result.status === "rejected")) {
        setCode(null);
        setStatus(res.result.status === "expired" ? "Code expired — reopen to retry." : "Declined in the browser.");
        return;
      }
      timer = setTimeout(() => poll(pairingId), 2000); // pending / transient error
    };

    (async () => {
      const res = await bridgeRequest(
        "pair/request",
        { client: { name: "Raycast", instanceId: await getInstanceId() } },
        undefined,
        browserId,
      );
      if (cancelled) return;
      if (res.ok) {
        setCode(res.result.code);
        setStatus(`Enter this code in your browser — Monocle → Settings → Integrations — within ${res.result.expiresInSeconds}s.`);
        poll(res.result.pairingId);
      } else {
        setStatus(`Could not start pairing (${res.error.code}).`);
      }
    })();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [browserId]);

  const markdown = code ? `# Pair Monocle\n\n## \`${code}\`\n\n${status}` : `# Pair Monocle\n\n${status}`;
  return <Detail markdown={markdown} actions={<ActionPanel><Action title="Close" onAction={pop} /></ActionPanel>} />;
}
```

## Re-pair triggers

`Search Monocle` (via `BrowserCommands`/`CommandList`) routes to pairing for the
selected browser whenever it sees:

- No token in `LocalStorage` for that browser id (never paired) → a
  `List.EmptyView` with a "Pair Monocle" action (which pushes `PairForm` for that
  `browserId`).
- An `unauthorized` / `forbidden_scope` from any authed call (token revoked in the
  extension, or the extension reinstalled) → `clearToken(target)` and prompt to
  pair again.

## Revocation

Revocation happens **in the extension** (its settings page lists paired clients with per-row
Revoke). Raycast cannot revoke remotely; it discovers a revoked token by getting `unauthorized` and
then prompts the user to re-pair. Because re-pairing dedupes by `instanceId`, the user ends up with a
single fresh client record.

## Settings vs storage: what lives where

Tokens and the `instanceId` are minted/derived during pairing, so neither belongs
in user-editable preferences. They go in `LocalStorage` (per-extension, stored in
Raycast's local encrypted database, scoped to this extension, never logged).
Preferences hold user-tunable non-secrets — `port`/`host` (see
[setup.md](./setup.md)).

> Rule of thumb: **preferences for user-tunable non-secrets, `LocalStorage` for
> secrets and derived state.** Raycast has password preferences for user-entered
> secrets, but the Monocle token is minted by pairing and should not be shown or
> edited in the preferences UI.

### Storage keys

| Key | Type | Set when | Cleared when |
|-----|------|----------|--------------|
| `monocle.instanceId` | string (uuid) | First run (lazy) | Never (stable across re-pairs) |
| `monocle.token.<browserId>` | string (64-hex) | After `pair/poll-status` returns `approved` | On `unauthorized`/`forbidden_scope`, or a "Forget Pairing" action |
| `monocle.token` (legacy) | string (64-hex) | Pre-multi-browser only | Migrated to `monocle.token.<id>` and removed by `migrateLegacyToken` when one browser is connected |

`LocalStorage` values are `string | number | boolean`.

### Pointing the user at preferences

When the daemon is unreachable or the port looks wrong, open the prefs pane
directly with `openExtensionPreferences()` — offer it as a secondary `Action`
whenever you show a connection error
([testing-and-troubleshooting.md](./testing-and-troubleshooting.md)).

### A "Forget Pairing" action

`BrowserCommands` provides a secondary action that clears the selected browser's
token (`clearToken(target)`, keeping `instanceId`) so the user can re-pair. Keep
`instanceId` — re-pairing with the same id replaces the old client record in the
extension rather than accumulating stale ones.
