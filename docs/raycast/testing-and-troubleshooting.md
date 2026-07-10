# Testing and troubleshooting

> Manual verification — there is no automated harness for a cross-process
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
2. **Which browsers are connected.** `GET /instances` (daemon-local, no auth):
   ```bash
   curl -s http://127.0.0.1:8765/instances
   # {"instances":[{"id":"chrome","name":"Google Chrome","extensionVersion":"…"}]}
   ```
   The `id` is the routing target. With **0** browsers there's nothing to talk to;
   with **≥2** every authed/RPC call below must set `-H "X-Monocle-Target: <id>"`
   (omit it and the daemon returns `bad_request`). With exactly **1**, the header
   is optional. Set `TARGET=chrome` and add `-H "X-Monocle-Target: $TARGET"` to the
   calls below when ≥2 browsers are connected.
3. **Capabilities.** `meta/info` (no auth):
   ```bash
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -H "X-Monocle-Target: $TARGET" \
     -d '{"v":1,"id":"m1","method":"meta/info"}'
   # bridgeEnabled:true, executionEnabled:true/false, browser:{...}
   ```
4. **Pair (Direction B).** Request a code, type it on the browser's *Settings →
   Integrations* page and Accept, then poll until approved:
   ```bash
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -H "X-Monocle-Target: $TARGET" \
     -d '{"v":1,"id":"p1","method":"pair/request","params":{"client":{"name":"Raycast","instanceId":"dev-1"}}}'
   # -> {"pairingId":"…","code":"481920","expiresInSeconds":60}
   #    (type 481920 on the Integrations page and click Accept, within 60s)

   # poll every ~2s until status:"approved" (pending until you Accept; else expired/rejected):
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -H "X-Monocle-Target: $TARGET" \
     -d '{"v":1,"id":"p2","method":"pair/poll-status","params":{"pairingId":"…"}}'
   # -> {"status":"approved","token":"<64-hex>","scopes":["suggestions:read","commands:execute"]}
   #    (token delivered ONCE; the next poll returns rejected)
   ```
5. **List.** Use the token (tokens are per-browser):
   ```bash
   TOKEN=<64-hex>
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -H "Authorization: Bearer $TOKEN" -H "X-Monocle-Target: $TARGET" \
     -d '{"v":1,"id":"s1","method":"suggestions/get-for-active-tab","params":{"limit":20}}'
   ```
6. **Search.**
   ```bash
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -H "Authorization: Bearer $TOKEN" -H "X-Monocle-Target: $TARGET" \
     -d '{"v":1,"id":"s2","method":"suggestions/search-active-tab","params":{"query":"copy","limit":20}}'
   ```
7. **Drill in.**
   ```bash
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -H "Authorization: Bearer $TOKEN" -H "X-Monocle-Target: $TARGET" \
     -d '{"v":1,"id":"c1","method":"suggestions/get-children","params":{"path":["history"],"limit":20}}'
   ```
8. **Execute** (needs `executionEnabled:true`):
   ```bash
   curl -s http://127.0.0.1:8765/ -H 'Content-Type: application/json' \
     -H "Authorization: Bearer $TOKEN" -H "X-Monocle-Target: $TARGET" \
     -d '{"v":1,"id":"e1","method":"commands/execute","params":{"id":"copy-current-url"}}'
   # -> {"ran":true,"value":"https://…","contentType":"text/plain"}  (for a data-returning command)
   ```
9. **In Raycast.** Run `pnpm run dev:raycast` from the repo root, open "Search
   Monocle", verify the browser picker appears when ≥2 browsers are connected (and
   is skipped for one), then list/search/drill/execute and that a copied value
   lands on the clipboard.

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
| `not_enabled` ("no browser connected") | Daemon up but no relay attached, or `X-Monocle-Target` names a browser that isn't connected | Open the browser / enable the bridge; or `GET /instances` and target a live id |
| `not_enabled` (from `pair/request`) | Bridge feature off | Enable it in the extension settings |
| `bad_request` ("specify a target browser") | ≥2 browsers connected and `X-Monocle-Target` unset | `GET /instances`, pick an id, set the header (the client shows a picker) |
| `pair/poll-status` returns `expired`/`rejected` | Code TTL (60s) elapsed, or 5 wrong Accepts / a Reject in the browser | Restart pairing (request a fresh code) |
| `unauthorized` | Token missing/invalid/revoked | Clear that browser's token, re-pair ([pairing.md](./pairing.md)) |
| `forbidden_scope` | Token lacks scope | Re-pair |
| `no_active_tab` | No active tab / incognito | Switch to a normal browser tab |
| `execution_disabled` | Global opt-in off | Enable *Allow command execution* in the extension |
| `forbidden` (execute) | Command not external-allowed / confirm / platform / permission | Expected for some commands; surface "not available here" |
| `not_found` (execute/children) | Stale id / non-container path | Refresh list; pop the nested view |
| `internal` ("no response from extension") | 30s RPC timeout / SW asleep | Retry; the service worker reconnects |
| Empty suggestion list but tab has commands | Site-SDK gap, or `external.allowed:false` commands filtered | Expected — page-owned commands aren't bridged |

## Automated tests in the Raycast extension

Keep it light (dev-mode/private). The valuable thing to test without a live bridge is the **pure**
logic:

- `iconFor()` — name/URL/unknown → expected `Icon`/`{source}`.
- The `type` → action-routing decision.
- `resolvePort()` — preference vs discovery file vs default.

Mock `bridgeRequest` for these; the cross-process round-trip stays a manual checklist.
