# Tool Commands

Tool commands are general-purpose utilities that are not tied to a browser API surface. They live in `background/commands/tools/` and are aggregated by `background/commands/tools/index.ts` into the exported `toolCommands` array, which `background/commands/source.ts` (`loadAllCommands`) merges into the global command set for both palette modes. There are six tool commands today: a UUID generator, a workflow debug command, the snippet pair (create + insert), the QR-code command, and the font inspector.

> Arithmetic used to be a `calculator` group command here. It has been replaced by inline **calculations** — type `1 + 89` at the palette root and the answer appears under the search input; Enter copies it. See [../calculations.md](../calculations.md).

## Summary

| Command | Id | Node type | Purpose | Notes |
| --- | --- | --- | --- | --- |
| Copy UUID v4 | `uuidv4` | `action` | Generate a v4 UUID and copy it to the clipboard | Uses the `uuid` package |
| Debug Workflow | `debug-workflow` | `action` | Run a fixed click workflow against the active page | Exercises the workflow execution path; see [../workflow-automation.md](../workflow-automation.md) |
| Create Snippet | `create-snippet` | `group` | Form (name + multi-line body) that saves a reusable text snippet | Persists to the `monocle-snippets` storage key; body uses the `textarea` form field |
| Insert Snippet | `insert-snippet` | `group` | List saved snippets; selecting one inserts its body at the page caret | Cmd-enter copies instead; falls back to clipboard + toast when no input is focused |
| Website URL as QR code | `url-as-qr-code` | `action` | Show a QR code for the current page in a modal surface | First command to trigger a [Surface](../surfaces.md); QR generated background-side as SVG |
| Inspect element fonts | `inspect-element-fonts` | `action` | Pick an element and copy a clean one-line font summary | First command to use the `picker` surface + command-owner `surface-action` routing; copies via the content clipboard path |

All six are registered in `background/commands/tools/index.ts`:

```ts
export const toolCommands = [
  copyUuidV4,
  debugWorkflow,
  createSnippet,
  insertSnippet,
  urlAsQrCode,
  inspectElementFonts,
]
```

---

## Copy UUID v4

Source: `background/commands/tools/copyUuidV4.ts`, exported as `copyUuidV4` (`ActionCommandNode`).

A single-shot `action`. On execute it generates a UUID with `uuidv4()` from the `uuid` package, then, if an active tab exists, sends a `monocle-copyToClipboard` message with the UUID followed by a success `monocle-toast` reading `"UUID copied to clipboard"`. If there is no active tab the command silently does nothing (clipboard writes go through the content script). No permissions, no form, no modifier behavior.

```ts
export const copyUuidV4: ActionCommandNode = {
  id: "uuidv4",
  type: "action",
  name: "Copy UUID v4",
  icon: { type: "lucide", name: "Copy" },
  color: "teal",
  execute: async () => {
    const uuid = uuidv4()
    const activeTab = await getActiveTab()
    if (activeTab?.id) {
      await sendTabMessage(activeTab.id, { type: "monocle-copyToClipboard", message: uuid })
      await sendTabMessage(activeTab.id, { type: "monocle-toast", level: "success", message: "UUID copied to clipboard" })
    }
  },
}
```

---

## Debug Workflow

Source: `background/commands/tools/debugWorkflow.ts`, exported as `debugWorkflow` (`ActionCommandNode`). Id `debug-workflow`, name `"Debug Workflow - Click Submit Button"`, `actionLabel: "Run Debug Test"`.

This command exists to exercise the end-to-end workflow execution path against a real page. On execute it:

1. Resolves the target tab with `resolveWorkflowTargetTabId({ context })` (from `background/workflows/execution.ts`).
2. Sends `toggle-ui` to that tab to close the palette overlay, then waits 200 ms.
3. Builds a fixed `Workflow` with a single `click` step targeting the first element matched by text selector `"Submit"` (`strategy: "text"`, `exact: false`, `index: 0`) with `targeting.scrollIntoView` and `targeting.ensureVisible` set.
4. Runs it via `executeWorkflowOnTargetTab({ tabId, workflow, context })`.
5. On success sends a success `monocle-toast` (`"Debug workflow clicked the first Submit target"`); on failure throws and surfaces the error as a targeted error toast, falling back to `showToast` if no tab id is available.

This is the only workflow surface that ships as a first-class command; it only exercises the implemented `click` step. The `test-inputs.html` fixture page at the repo root provides a Submit button to test against. For the workflow type model versus what the executor actually supports, see [../workflow-automation.md](../workflow-automation.md).

Test coverage: `background/commands/tools/debugWorkflow.test.ts` stubs Chrome tabs and asserts the message sequence is exactly `toggle-ui` -> `execute-workflow-content` -> `monocle-toast`, that all messages target the resolved (non-active) tab whose URL matched the context, and that a failing `WorkflowResult` produces a targeted error toast containing the underlying error string.

---

## Website URL as QR code

Source: `background/commands/tools/urlAsQrCode.ts`, exported as `urlAsQrCode` (`ActionCommandNode`). Id `url-as-qr-code`, icon `QrCode`.

This is the **first command that triggers a [Surface](../surfaces.md)** — the pattern for rendering command output as page UI instead of executing-and-closing. On execute it:

1. Reads `context.url`; if it is not an `http(s)` page (new tab, `chrome://`, `about:`), it sends a `"No page URL to encode"` warning toast and returns.
2. Generates the QR as an **SVG data URL** synchronously via `background/utils/qr.ts` (`qrCodeSvgDataUrl`, built on the zero-dependency `qrcode-generator` library). SVG is required because the MV3 service worker has no DOM/canvas; the library is imported only here, so it stays in the background bundle.
3. Wraps it in an `image` `ContentBlock`, validated by `validateContentBlocks` (fail-quiet, like the calculation path).
4. `upsertSurface`s a `modal` surface under owner `command:url-as-qr-code`, URL-gated (`allowUrls: [context.url]`) to the page it was triggered on. The generic `SurfaceHost` renders the modal over the page; the user dismisses it (✕ / backdrop / Escape), which posts a `surface-action { actionId: "dismiss" }` that removes it.

There is no copy step — the QR appears in the modal to scan directly. Owner ids prefixed `command:` are per-session, so `initSurfaces` clears any stale QR modal on a fresh browser start.

Test coverage: QR generation in `background/utils/qr.test.ts` (svg+xml data URL, valid `image` block, scales with data length); the modal kind + dismiss in `shared/components/SurfaceHost.dom.test.tsx`; store `command:` cleanup + `ownerId` stamping in `background/surfaces.test.ts`; and `surface-action` message validation in `shared/types/feature-validation.test.ts`.

---

## Inspect element fonts

Source: `background/commands/tools/inspectElementFonts.ts`, exported as `inspectElementFonts` (`ActionCommandNode`). Id `inspect-element-fonts`, icon `TextSearch`. A "what font is this" command (the WhatFont pattern), and the **first command to consume the `picker` surface** and **command-owner `surface-action` routing**.

The flow spans the two surface mechanisms it introduced (see [../surfaces.md](../surfaces.md)):

1. On execute it reads `context.url`; non-`http(s)` pages get a `"Font inspection only works on web pages"` warning toast and it returns (pick-mode needs a content script + `SurfaceHost`).
2. Otherwise it `upsertSurface`s a `picker` surface under owner `command:inspect-element-fonts`, URL-gated to the page and `targetTabId`-scoped to the active tab. Its `content.css` lists the `font-*` properties to capture (`font-family`, `font-size`, `font-weight`, `font-style`, `line-height`, `color`).
3. When the user clicks an element, content (`content/picker/selector.ts`) reads `window.getComputedStyle` for those properties and posts a `surface-action { actionId: "element-picked", selection }` where `selection.css` is the computed map.
4. `background/messages/surfaceAction.ts` routes the `command:` owner to the handler the command registered via `registerCommandSurfaceActionHandler` (`background/commands/surfaceActionHandlers.ts`). The handler clears the picker (`removeSurface`), formats the captured `css` into a clean one-line summary — `family · size[/line-height] · weight[ italic] · hex-color`, e.g. `Stuff Text · 28px/32px · 500 · #6D00C6` (mirroring WhatFont: the family is resolved to its primary face, the color is hex, and default/`normal` values are dropped) — and, because the MV3 service worker has no clipboard, sends that same string as both `monocle-copyToClipboard` and a success `monocle-toast` to the tab, reusing the existing content clipboard path. A pick that reported no usable font styles gets a warning toast instead.

Owner ids prefixed `command:` are per-session, so a stale picker is cleared by `initSurfaces` on browser start.

Test coverage: `background/commands/tools/inspectElementFonts.test.ts` (execute pushes the picker with the font `css` request; non-web pages warn; the handler copies + toasts the compact summary — primary family, `size/line-height`, hex color, dropped `normal`s, italic noted — and warns when no css was captured); command-owner routing in `background/messages/surfaceAction.test.ts`; computed-style capture in `content/picker/PickerSurface.dom.test.tsx`; and `PickedElement.css` / picker `content.css` validation in `shared/types/validation.test.ts` + `background/surfaces.test.ts`.

---

## Snippets

Source: `background/commands/tools/snippets.ts`, exporting `createSnippet` and `insertSnippet` (both `group` nodes). Snippet data is owned by `background/commands/snippets.ts` and persisted under the independent `monocle-snippets` storage key (`Snippet { id, name, body, createdAt, updatedAt }`, ids from `crypto.randomUUID()`); like favorites and usage, it survives `clearAllSettings`. The options Snippets page (`options/pages/SnippetsPage.tsx`) manages the same data through the `get-snippets` / `add-snippet` / `update-snippet` / `delete-snippet` messages and the `snippets` Redux slice.

### Create Snippet (`create-snippet`)

A form group (`enableDeepSearch: false`) with two `input` rows plus a `submit` row:

| Child id | Field id | Field type | Notes |
| --- | --- | --- | --- |
| `create-snippet-name` | `name` | `text` | Required |
| `create-snippet-body` | `body` | `textarea` | Required; first user of the multi-line `textarea` form field |
| `create-snippet-execute` | n/a | `submit` | `actionLabel: "Save Snippet"`; persists via `addSnippet` and toasts |

### Insert Snippet (`insert-snippet`)

A dynamic group (`enableDeepSearch: true`, so snippets are findable from root search; `settingsCatalog.includeChildren: true`, so snippet rows are manageable from the options pages). `children` maps each saved snippet to an `action` node (`snippet-<id>` — ids are stable UUIDs, so custom settings are durable); an empty list renders a NoOp row (excluded from the catalog).

### Snippet placeholders

Snippet bodies support `{token}` placeholders, interpolated **background-side at insert time** (`shared/utils/snippet-placeholders.ts`) so the inserted text, the cmd-copy path, and the clipboard fallback all carry the same result. Unknown tokens and invalid date formats pass through untouched, so literal braces are safe.

| Token | Resolves to |
| --- | --- |
| `{date:FORMAT}` / `{time:FORMAT}` / `{datetime:FORMAT}` | Any [date-fns format string](https://date-fns.org/docs/format), e.g. `{date:yyyy-MM-dd}` (note: `MM` is months, `mm` is minutes) |
| `{date}` / `{time}` / `{datetime}` | Shorthand defaults (`PP` / `p` / `PPp`) |
| `{timestamp}` | Unix epoch milliseconds at insert time |
| `{url}` / `{title}` | The active page's URL / title from the execution context |
| `{domain}` / `{path}` | Hostname / pathname parsed from the page URL (empty when unparseable) |
| `{uuid}` | Random v4 UUID per insertion |
| `{i}` | Per-snippet incrementing counter, persisted as `insertCounter` on the snippet (`monocle-snippets`); bumped once per insertion that uses it, so multiple `{i}` in one body render the same value |

Snippet actions accept **custom keyboard shortcuts** with a constraint: `keybindingRequirements: { requireNonShiftModifier: true }` — every stroke must include cmd/ctrl/alt, because insertion shortcuts must fire while an editable element is focused and the content event filter only forwards modifier combos from editables (see [../keybindings.md](../keybindings.md)). Both capture UIs hint and enforce this; deleting a snippet removes its dangling command settings and refreshes the keybinding registry (`background/messages/deleteSnippet.ts`).

On execute, the action re-reads the snippet from storage, interpolates placeholders (below), and sends `monocle-insertText` with the resolved text to the active tab. `InsertTextListener` (`shared/components/Listeners/InsertTextListener.tsx`, mounted in both palette modes) tracks the page's last-focused editable element (capture-phase `focusin`, ignoring Monocle's own UI) and inserts at its caret via `execCommand("insertText")` with a native-setter splice fallback, responding `{ inserted }`. When nothing was inserted (nothing focused, element detached, or the new-tab page) the executor falls back to `monocle-copyToClipboard` plus an explanatory toast. Cmd-enter copies to the clipboard directly.

Test coverage: `background/commands/snippets.test.ts` (CRUD round-trip, unknown-id behavior, concurrent-add storage-lock serialization), snippet message schema cases in `shared/types/validation.test.ts`, keybinding-requirement enforcement in `shared/utils/keybinding-requirements.test.ts`, `background/messages/updateCommandSetting.test.ts`, `updateCommandKeybindings.test.ts`, and `checkKeybindingConflict.test.ts`, catalog rows in `background/commands/settingsCatalog.test.ts`, and delete-cleanup in `background/messages/deleteSnippet.test.ts`.

---

## Related docs

- [../command-types.md](../command-types.md) - the `group`, `action`, `submit`, and `search` node types used here.
- [../command-schema.md](../command-schema.md) - `FormField` variants (`text`, `textarea`, `select`, `multi`, `switch`) used by these commands.
- [../calculations.md](../calculations.md) - inline calculations, which replaced the old calculator command.
- [../execution-and-actions.md](../execution-and-actions.md) - Enter vs cmd-Enter, action labels, and `executionPayload`.
- [../workflow-automation.md](../workflow-automation.md) - what the workflow executor actually supports (relevant to Debug Workflow).
- [../authoring-commands.md](../authoring-commands.md) - registering a command into a category index.
