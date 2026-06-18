# Testing and troubleshooting

> **Status: design-only.** Manual verification — there is no automated harness for a cross-process
> bridge round-trip. Mirrors the `curl`-based test approach in
> [`../native-messaging/`](../native-messaging/README.md).

## End-to-end checklist

1. **Daemon up.** Launch the Monocle Bridge app. Confirm the loopback server:
   ```bash
   curl -s http://127.0.0.1:8765/status
   # {"ok":true,"bridge":"monocle","connected":true,"loopbackPort":8765,"portOwner":true}
   ```
   `connected:false` → the browser/relay isn't attached yet (open the browser, ensure the bridge is
   enabled in the extension).
2. **Capabilities.** `meta/info` (no auth):
   ```bash
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -d '{"v":1,"id":"m1","method":"meta/info"}'
   # bridgeEnabled:true, executionEnabled:true/false, browser:{...}
   ```
3. **Pair.** Trigger the modal, then submit the code shown in the browser:
   ```bash
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -d '{"v":1,"id":"p1","method":"pair/request","params":{"client":{"name":"Raycast","instanceId":"dev-1"}}}'
   # -> {"pairingId":"…","expiresInSeconds":60}   (browser shows a 6-digit code)

   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -d '{"v":1,"id":"p2","method":"pair/submit-code","params":{"pairingId":"…","code":"481920"}}'
   # -> {"token":"<64-hex>","scopes":["suggestions:read","commands:execute"]}
   ```
4. **List.** Use the token:
   ```bash
   TOKEN=<64-hex>
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"v":1,"id":"s1","method":"suggestions/get-for-active-tab","params":{"limit":20}}'
   ```
5. **Search.**
   ```bash
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"v":1,"id":"s2","method":"suggestions/search-active-tab","params":{"query":"copy","limit":20}}'
   ```
6. **Drill in.**
   ```bash
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"v":1,"id":"c1","method":"suggestions/get-children","params":{"path":["history"],"limit":20}}'
   ```
7. **Execute** (needs `executionEnabled:true`):
   ```bash
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"v":1,"id":"e1","method":"commands/execute","params":{"id":"copy-current-url"}}'
   # -> {"ran":true,"value":"https://…","contentType":"text/plain"}  (for a data-returning command)
   ```
8. **In Raycast.** `npm run dev` in `apps/raycast`, open "Search Monocle", verify list/search/drill/
   execute and that a copied value lands on the clipboard.

## Origin rejection (must verify)

A request carrying an `Origin` header must be rejected — confirm your client never sends one:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8765/ \
  -H 'Content-Type: application/json' -H 'Origin: https://evil.example' \
  -d '{"v":1,"id":"o1","method":"meta/info"}'
# 403
```

## Troubleshooting

| Symptom / `code` | Cause | Fix |
|------------------|-------|-----|
| `fetch` throws `ECONNREFUSED` | Daemon not running / wrong port | Launch the Bridge app; check `~/.monocle/bridge.json` `loopbackPort`; fix the `port` preference |
| `403 origin not allowed` | Client sent an `Origin` header | Remove it; use plain Node `fetch` (no `Origin` by default) |
| `400 invalid json` / `400 missing id` | Malformed body / no `id` | Always send valid JSON with a string `id` |
| `not_enabled` ("no browser connected") | Daemon up but no relay attached | Open the browser; ensure the bridge is enabled in the extension |
| `not_enabled` (from `pair/request`) | Bridge feature off | Enable it in the extension settings |
| Pairing starts but no browser code appears | Active page has no Monocle `SurfaceHost` (`chrome://*`, store/add-on page, discarded tab) | Switch to a normal tab or Monocle new tab and restart pairing |
| `unauthorized` | Token missing/invalid/revoked | Clear token, re-pair ([pairing.md](./pairing.md)) |
| `forbidden_scope` | Token lacks scope | Re-pair |
| `pairing_expired` / `pairing_rejected` | >60s, wrong code, or 5 attempts | Restart pairing |
| `no_active_tab` | No active tab / incognito | Switch to a normal browser tab |
| `execution_disabled` | Global opt-in off | Enable *Allow command execution* in the extension |
| `forbidden` (execute) | Command not external-allowed / confirm / platform / permission | Expected for some commands; surface "not available here" |
| `not_found` (execute/children) | Stale id / non-container path | Refresh list; pop the nested view |
| `internal` ("no response from extension") | 30s RPC timeout / SW asleep | Retry; the service worker reconnects |
| Empty suggestion list but tab has commands | Site-SDK gap, or `external.allowed:false` commands filtered | Expected — page-owned commands aren't bridged |

## Automated tests in the Raycast extension

Keep it light (dev-mode/private). The valuable unit to test without a live bridge is the **pure**
logic:

- `iconFor()` — name/URL/unknown → expected `Icon`/`{source}`.
- The `type` → action-routing decision.
- `resolvePort()` — preference vs discovery file vs default.

Mock `bridgeRequest` for these; the cross-process round-trip stays a manual checklist.
