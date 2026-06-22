# Command execution

> **Status: extension side implemented (v2).** A paired app can run a command
> on the active tab via `commands/execute`, gated by a global **Allow execution**
> opt-in (off by default) plus the bridge policy and per-command `external`
> config. Built: the `external` field + widened `CommandExecutor`/`CommandResult`
> (`shared/types/commands.ts`), the delivery seam
> (`background/commands/clipboardDelivery.ts` + `executeResolvedCommand`'s
> `delivery` option), the bridge policy (`runCommandPolicy.ts` `executionMode`),
> the orchestration (`background/features/nativeMessaging/execute.ts`), the
> `commands:execute` scope + `commands/execute` method, and the settings toggle.
> The copy family returns its value; representative focus-and-act / deny
> annotations are applied (default-allow covers the rest). The native host that
> carries these requests is now in-repo at `apps/bridge` (macOS M0+M1; see
> [bridge-app-prd.md](./bridge-app-prd.md)), though the real
> browser→relay→daemon→execute round-trip is not yet manually exercised. Below is
> the design as built.

Listing the active tab's commands is only useful if the app can also run them.
Execution is a larger blast radius than reading, so it is a **separately granted**
capability (`commands:execute`, see
[authentication-and-security.md](./authentication-and-security.md)) gated by both
a baseline policy and a per-command opt-out.

The core problem: a command's `execute()` is a side-effecting function that today
returns nothing and assumes it runs because a human is looking at the browser.
The bridge breaks both assumptions — the human is looking at Raycast, and for
"copy"-style commands the *result* is what the user wants, not a browser
side-effect. So execution needs three things: an opt-out, a focus model, and a
result channel.

---

## The execute contract today

```ts
// shared/types/commands.ts
export type CommandExecutor = (
  context?: Browser.Context,
  values?: Record<string, string>,
) => void | Promise<void>
```

`monocle-command-execute` → `executeCommand` → `executeResolvedCommand`
(`background/commands/execution.ts`) resolves the node, checks permissions, and
calls `command.execute(context, values)`. It **returns void** — a command cannot
hand a value back to the caller.

Commands find their target tab via `getActiveTab()` /
`queryTabs({ active: true, currentWindow: true })`
(`background/utils/browserTabs.ts`) or via `context.url`. A bridge request has
**no sender tab**, but `getActiveTab()` returns the browser's active tab
regardless of which OS app is focused, so existing commands still resolve a
target. `context.url`/`title` are filled from that active tab. Incognito windows
are excluded.

---

## Three execution shapes

Every executable command falls into one of three shapes, declared per command:

| Shape | When | Bridge behavior |
| --- | --- | --- |
| **focus-and-act** | The user wants to *see* the result: open a history item, switch to an open tab, restore a session, open a bookmark. (~17 commands.) | After a successful `execute`, the bridge raises the browser via `chrome.windows.update(currentWindow, { focused: true })`. |
| **silent side-effect** | State change with nothing to look at: close tab, toggle mute/pin, clear browsing data, toggle theme, change a setting. (~36 commands.) | Runs in the background; the browser stays where it is, Raycast keeps focus. This is the default. |
| **data-returning** | Produces a value the user wants in the app: copy URL / title / page-as-markdown, generate UUID, read selection. (~26 commands; overlaps the others because a copy also "acts".) | `execute` returns a value; the bridge sends it back to the app. See [the result channel](#the-result-channel). |

Why these are *declared*, not derived: nothing in the current schema distinguishes
"raises the browser" from "silent", and `chrome.tabs.update({active:true})` for a
same-window switch activates a tab without bringing the browser app forward. The
declaration makes the intent explicit and the focus behavior reliable.

---

## Per-command `external` config

A new optional field on `CommandNodeBase` (beside `permissions` / `urlRules`, so
any node type can carry it; `confirmAction` by contrast is action/submit-only):

```ts
external?: {
  // Opt-out. undefined → the bridge policy decides (default-allow for safe
  // commands). false → the command is BOTH hidden from bridge suggestions
  // (suggestions/get-for-active-tab + search) AND refused by commands/execute
  // (`forbidden`). true → opt a normally-denied command in.
  allowed?: boolean
  // Default false. true → bridge raises the browser window after a successful
  // execute (the focus-and-act shape).
  focusBrowser?: boolean
  // Default "none". "value" → execute returns data the bridge forwards to the
  // app (the data-returning shape).
  result?: "none" | "value"
}
```

`external.allowed` is the user-facing opt-out boolean: commands are reachable by
default (subject to the policy below), and an author sets `allowed: false` to
withhold one. A **user-facing** per-command opt-out — mirroring how `hidden` and
`urlRules` are stored per command in `monocle-settings` — is a planned
fast-follow, not part of this design.

---

## The bridge execution policy

Reuses the model of `background/automations/runCommandPolicy.ts`, which bounds
programmatic (non-human) command invocation. That module denies, for every run:
`confirmAction` commands, `automation-*` (recursion), `debug-workflow`, and
non-existent targets; and restricts non-manual (trigger) runs to a curated
`NON_MANUAL_RUN_COMMAND_ALLOWLIST`. Its verdict shape is
`{ allowed: true } | { allowed: false; reason: string }`.

The bridge policy applies the same **baseline default-deny**:

- `confirmAction: true` → denied (no in-browser confirmation path from the app;
  see below).
- `automation-*` → denied (no recursion into automations).
- debug / testing tools (`debug-workflow`) → denied.
- missing required `permissions`, or `supportedBrowsers` not matching the running
  browser → denied (the normal dispatch path already enforces permissions).

Everything else is **default-allow** — the opt-out posture. On top of the
baseline:

- `external.allowed: false` → force-denied even if the baseline would allow.
- `external.allowed: true` → opts a baseline-denied command back in (rare; use
  deliberately).

Implement either as a sibling `bridgePolicy` returning the same verdict shape, or
by extending `checkRunCommandPolicy` with an
`executionMode: "manual" | "automation" | "bridge"` parameter. A bridge run is
human-initiated (a gesture in the app), so it is closer to a manual run than a
trigger run — it is **not** subject to the non-manual allowlist, only the
universal deny rules plus the `external` overrides.

---

## The result channel

Widen the executor return type (back-compatible):

```ts
export type CommandResult = { value: string; contentType?: string }
export type CommandExecutor = (
  context?: Browser.Context,
  values?: Record<string, string>,
) => void | CommandResult | Promise<void | CommandResult>
```

Existing executors return `undefined` → no result; the palette and keybinding
paths are unaffected. For a command declaring `external.result: "value"`, the
bridge takes the returned `CommandResult` and returns it in the
`commands/execute` response (see [protocol.md](./protocol.md)).

### Clipboard reconciliation (the real fix for "copy page as markdown")

Today, copy commands deliver their value by messaging the active tab's content
script:

```text
execute → sendTabMessage(tabId, { type: "monocle-clipboard-write", message })
       → CopyToClipboardListener → useCopyToClipboard → navigator.clipboard.writeText
```

`navigator.clipboard.writeText` needs a **focused document**, so this is
unreliable when the browser is backgrounded behind Raycast — and even on success
it writes the *browser's* clipboard, not the app's. The user wants the markdown
**in Raycast**.

So data commands **produce and return** their value, with clipboard *delivery* as
a separate concern:

- The command's `execute` returns `{ value }`.
- The **palette/keybinding path** still performs the active-tab clipboard write
  (a shared delivery helper), preserving today's behavior.
- The **bridge path** takes the returned `value` and **skips** the clipboard
  write entirely.

No command body learns it is being called by the bridge — the branch lives in the
execution path, keyed off the caller, not in `execute`. This is a build-pass
refactor of the `copy*` family (e.g.
`background/commands/browser/urlNavigationAndCopy.ts`,
`background/commands/tools/copyUuidV4.ts`).

---

## Catalog → config mapping

Representative commands and the `external` config they would carry. (Counts are
approximate; the build pass annotates each command.)

| Category | Example commands | Shape | `external` |
| --- | --- | --- | --- |
| Browser — open/goto | open history item, open bookmark, goto open tab, recently-closed, restore session | focus-and-act | `{ focusBrowser: true }` |
| Browser — tab/window mutate | close tab, close others, move tab, toggle mute/pin, reload, go back/forward | silent | (default) |
| Browser — data/page | copy URL, copy title+URL (as markdown), search-selection, focus-first-input | data-returning | `{ result: "value" }` |
| Browser — destructive | clear browsing data | silent, **policy-gated** | `confirmAction` if set → denied |
| Tools | copy UUID, URL as QR (modal), inspect element fonts | data-returning | `{ result: "value" }` |
| UI | toggle theme, clear favorites | silent | (default) |
| UI — opens palette/options | manage allow/deny list, open settings | opens UI | `{ allowed: false }` (no app-side palette to host them) |
| New-tab | clock / new-tab-only toggles | n/a | `{ allowed: false }` (new-tab context only) |
| Features | focus-mode start/stop, tab-group restore | silent / focus-and-act | per command |
| Automations | generated `automation-*` rows | — | **policy-denied** (recursion) |
| Debug | `debug-workflow` | — | **policy-denied** |

---

## `confirmAction` and incognito

- **`confirmAction` commands stay denied.** There is no way to surface and resolve
  the confirmation from Raycast in v2. A future option is to route the
  confirmation through a **surface modal** in the browser (the user confirms in
  the browser before the command runs) — deferred.
- **Incognito / private windows are excluded**, consistent with v1.

---

## Related docs

- [protocol.md](./protocol.md) — the `commands/execute` method and result shape.
- [authentication-and-security.md](./authentication-and-security.md) — the
  `commands:execute` scope.
- [architecture.md](./architecture.md) — active-tab resolution and the no-sender
  constraint.
- [../command-schema.md](../command-schema.md) — the `CommandNode` reference the
  `external` field would extend.
- [../automations.md](../automations.md) — the `runCommand` policy this reuses.
