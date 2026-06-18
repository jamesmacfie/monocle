# Execution

> Backed by the implemented `commands/execute` method in
> `apps/extension/background/features/nativeMessaging/execute.ts`. Design and
> policy details live in
> [`../native-messaging/execution.md`](../native-messaging/execution.md).

## The call

```jsonc
// request
{ "v":1, "id":"…", "method":"commands/execute", "params": { "id":"copy-title-and-url-as-markdown" } }
// success
{ "ran": true, "focused": true, "value": "[Example](https://example.com/)", "contentType": "text/markdown" }
```

`commands/execute` resolves the command by `id` against the **active tab** (no `path`, no form
values in v1). The result is:

```ts
type ExecuteResult = {
  ran: true            // always true on success
  focused?: boolean    // true if the command declared focusBrowser and the window was raised
  value?: string       // present only for data-returning commands (external.result === "value")
  contentType?: string // optional MIME hint for value, e.g. "text/plain", "text/markdown"
}
```

## Two gates before Run is even offered

Execution is opt-in on the extension side. Probe `meta/info` before enabling Run actions:

```jsonc
// meta/info result
{ "protocolVersions":[1], "scopes":["suggestions:read","commands:execute"],
  "bridgeEnabled": true, "executionEnabled": false, "browser": {...} }
```

- `bridgeEnabled` must be true (the feature is on).
- **`executionEnabled`** reflects the global *Allow command execution* opt-in. If it's `false`, every
  `commands/execute` call returns `execution_disabled` regardless of the token's scope.

When `executionEnabled` is false, still render rows, but make the Run action a no-op that toasts
"Enable *Allow command execution* in Monocle's settings to run commands from Raycast" (and/or hide
it). See [bridge-and-extension-prerequisites.md](./bridge-and-extension-prerequisites.md).

## Result handling by shape

The extension annotates commands with `external.focusBrowser` / `external.result`. The same call
covers three shapes; branch on the response:

| Response | Command shape | Raycast handling |
|----------|---------------|------------------|
| `value` present | **data-returning** (copy URL, copy title+URL, generate UUID, QR text) | `Clipboard.copy(value)` + `showHUD("Copied")` (or render `value` in a Detail). The bridge does **not** write the browser clipboard — you own delivery. |
| `focused:true` | **focus-and-act** (open history entry, restore session, switch tab) | Browser was raised; usually `closeMainWindow()` so the user lands in the browser. |
| `ran:true` only | **silent side-effect** (close tab, toggle mute, reload) | `showToast(Success, "Done")`; stay in Raycast. |

```tsx
async function runCommand(id: string) {
  const token = await getToken();
  const res = await bridgeRequest<ExecuteResult>("commands/execute", { id }, token!);
  if (!res.ok) return showToast({ style: Toast.Style.Failure, title: executeErrorTitle(res.error.code) });

  const r = res.result;
  if (r.value) {
    await Clipboard.copy(r.value);
    await showHUD("Copied to clipboard");
  } else if (r.focused) {
    await closeMainWindow();       // user wants to see the browser
  } else {
    await showToast({ style: Toast.Style.Success, title: "Done" });
  }
}
```

> **Clipboard nuance.** For copy-family commands the *value* is what the user wants. The extension's
> bridge path returns the value instead of writing the browser's clipboard (which is unreliable when
> the browser is backgrounded). So Raycast must do the `Clipboard.copy(value)` itself. The browser
> palette path still writes the clipboard as before — that branch lives in the extension, invisible
> to you.

## Error codes (execute-specific)

All branch on `error.code`:

| `code` | Cause | Handling |
|--------|-------|----------|
| `execution_disabled` | Global opt-in off | Toast: enable *Allow command execution* in Monocle |
| `forbidden` | Command opted out (`external.allowed:false`), is `confirmAction`, a `submit` without opt-in, wrong platform, missing permission, generated-action id, or denied by the bridge policy | Toast: "Not available from Raycast"; consider hiding the Run action |
| `not_found` | Id doesn't resolve on the active tab | Refresh the list (stale id) |
| `no_active_tab` | No active tab / incognito | Toast: switch to a normal tab |
| `forbidden_scope` | Token lacks `commands:execute` | Re-pair |
| `unauthorized` | Token invalid/revoked | Clear token, prompt to pair |
| `execution_failed` | Command threw | Toast + offer retry |

## What is NOT executable (v1)

- **`group` / `search` containers** — these are navigation, not execution. Selecting them drills in
  ([nested-navigation.md](./nested-navigation.md)). A `search` node *with* an executable action can
  run, but treat the type as the routing signal and let `forbidden` cover edge cases.
- **`submit` (form) commands** — denied unless the command explicitly opted in, because the wire
  carries no form values in v1. Surface `forbidden` gracefully.
- **`confirmAction` commands** (e.g. clear browsing data) — denied; there's no in-browser
  confirmation path from Raycast yet.
- **`display` rows** — informational; no action.

These are policy decisions enforced in `execute.ts`; the client's job is to route by `type` and turn
a `forbidden` into a calm "not available here" rather than an error.
