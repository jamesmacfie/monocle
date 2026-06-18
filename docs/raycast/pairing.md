# Pairing

> **Status: design-only.** The pairing protocol is implemented in
> `apps/extension/background/features/nativeMessaging/pairing.ts`. Threat model:
> [`../native-messaging/authentication-and-security.md`](../native-messaging/authentication-and-security.md).

## The model

Bluetooth-style: the confirmation code travels **extension → human → app**, never extension → app
directly. The browser shows a 6-digit code in a modal; the user reads it and types it into Raycast;
Raycast exchanges it for a bearer token. This proves the person driving Raycast can see the browser.

```
Raycast: pair/request {client:{name:"Raycast", instanceId}}  ──▶  extension
                                                                    │ generates 6-digit code,
                                                                    │ stores its hash + 60s expiry,
                                                                    │ shows a MODAL in the browser:
                                                                    │   ┌──────────────────────┐
                                                                    │   │  Pair "Raycast"       │
                                                                    │   │  Enter this code…     │
                                                                    │   │       # 481920        │  (60s countdown)
                                                                    │   └──────────────────────┘
Raycast ◀── {pairingId, expiresInSeconds:60} ──────────────────────┘
   │
   │ user reads code from browser, types it into a Raycast Form
   ▼
Raycast: pair/submit-code {pairingId, code:"481920"}  ──────────▶  extension
                                                                    │ constant-time compares hashes,
                                                                    │ mints a token, stores its HASH
Raycast ◀── {token:"<64-hex>", scopes:["suggestions:read","commands:execute"]} ─┘  (plaintext ONCE)
   │
   ▼ store token in LocalStorage
```

Key facts (from `pairing.ts`):

- **Code:** 6 digits, CSPRNG, shown as a large markdown heading in a `modal` surface on the active
  tab. **TTL 60 seconds**, `expiresInSeconds` returned to the client for a countdown.
- **Attempt cap:** 5 wrong submissions clears the pending pairing → further attempts get
  `pairing_rejected`.
- **Token:** 64-hex, returned **exactly once**, stored hashed (SHA-256) in the extension. It grants
  **both** scopes (`suggestions:read`, `commands:execute`).
- **Re-pairing the same `instanceId` replaces** the prior client record (the extension dedupes by
  `instanceId`). So re-pairing is safe and idempotent per instance.
- **No refresh.** A lost/revoked token means pairing again. There is no renew endpoint.
- **Current UI constraint:** the built extension shows the pairing code through the generic
  `SurfaceHost`. It appears on normal pages that have the content overlay, and on Monocle-owned
  pages such as the new tab. It does **not** currently open a fallback pairing page for `chrome://*`,
  the Chrome Web Store, add-on galleries, discarded tabs, or any page without a host. If pairing
  starts but no code is visible, the user should switch to a normal tab or Monocle new tab and
  restart pairing. A dedicated extension-page fallback would be a Monocle extension enhancement, not
  Raycast client work.

## The `instanceId`

A stable per-installation id. Generate it once and persist it in `LocalStorage`; reuse it forever so
re-pairing replaces the same client record (rather than piling up duplicates in the extension's
paired-clients list).

```ts
// src/lib/auth.ts
import { LocalStorage } from "@raycast/api";
import { randomUUID } from "node:crypto";

const INSTANCE_KEY = "monocle.instanceId";
const TOKEN_KEY = "monocle.token";

export async function getInstanceId(): Promise<string> {
  let id = await LocalStorage.getItem<string>(INSTANCE_KEY);
  if (!id) {
    id = randomUUID();
    await LocalStorage.setItem(INSTANCE_KEY, id);
  }
  return id;
}

export const getToken = () => LocalStorage.getItem<string>(TOKEN_KEY);
export const setToken = (t: string) => LocalStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => LocalStorage.removeItem(TOKEN_KEY);
```

## The `Pair Monocle` command

A `view`-mode `Form`. The flow:

1. On mount, fire `pair/request` with the client identity. Show the returned `pairingId` window in
   the UI ("a code is showing in your browser — enter it below", with the 60s countdown).
2. Render a single text field for the 6-digit code.
3. On submit, call `pair/submit-code`. On `{ok:true}`, store the token and pop with a success toast.
   On error, map the code (below) and let the user retry / restart.

```tsx
// src/pair-monocle.tsx (sketch)
import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { bridgeRequest } from "./lib/bridge";
import { getInstanceId, setToken } from "./lib/auth";

export default function PairMonocle() {
  const { pop } = useNavigation();
  const pairingId = useRef<string | null>(null);
  const [status, setStatus] = useState("Requesting a pairing code…");

  useEffect(() => {
    (async () => {
      const res = await bridgeRequest<{ pairingId: string; expiresInSeconds: number }>(
        "pair/request",
        { client: { name: "Raycast", instanceId: await getInstanceId() } },
      );
      if (res.ok) {
        pairingId.current = res.result.pairingId;
        setStatus(`A code is showing in your browser. Enter it within ${res.result.expiresInSeconds}s.`);
      } else if (res.error.code === "not_enabled") {
        setStatus("The bridge is off or no browser is connected. Enable it in Monocle and reopen.");
      } else {
        setStatus(`Could not start pairing (${res.error.code}).`);
      }
    })();
  }, []);

  async function onSubmit({ code }: { code: string }) {
    if (!pairingId.current) return;
    const res = await bridgeRequest<{ token: string; scopes: string[] }>(
      "pair/submit-code",
      { pairingId: pairingId.current, code: code.trim() },
    );
    if (res.ok) {
      await setToken(res.result.token);
      await showToast({ style: Toast.Style.Success, title: "Paired with Monocle" });
      pop();
    } else {
      await showToast({ style: Toast.Style.Failure, title: pairingErrorTitle(res.error.code) });
    }
  }

  return (
    <Form
      actions={<ActionPanel><Action.SubmitForm title="Pair" onSubmit={onSubmit} /></ActionPanel>}
    >
      <Form.Description text={status} />
      <Form.TextField id="code" title="Pairing code" placeholder="6-digit code from the browser" />
    </Form>
  );
}

function pairingErrorTitle(code: string) {
  switch (code) {
    case "pairing_expired": return "Code expired — restart pairing";
    case "pairing_rejected": return "Wrong code (or too many attempts) — restart pairing";
    case "not_enabled": return "Bridge is off / no browser connected";
    default: return "Pairing failed";
  }
}
```

## Re-pair triggers

The `Search Monocle` command should route to pairing whenever it sees:

- No token in `LocalStorage` (never paired) → show a `List.EmptyView` with a "Pair Monocle" action.
- An `unauthorized` / `forbidden_scope` from any authed call (token revoked in the extension, or the
  extension reinstalled) → `clearToken()` and prompt to pair again.

## Revocation

Revocation happens **in the extension** (its settings page lists paired clients with per-row
Revoke). Raycast cannot revoke remotely; it discovers a revoked token by getting `unauthorized` and
then prompts the user to re-pair. Because re-pairing dedupes by `instanceId`, the user ends up with a
single fresh client record.

## Why the token lives in `LocalStorage`, not preferences

Raycast documents password preferences and `LocalStorage` as stored in its local encrypted database.
The bridge token is minted internally during pairing, so it should not be a visible/user-editable
preference value. Store it in `LocalStorage`; keep preferences for user-tunable non-secrets such as
`port`/`host`. The `instanceId` is derived state, also not something a user should hand-edit. See
[settings-and-storage.md](./settings-and-storage.md).
