# Tool Commands

Tool commands are general-purpose utilities that are not tied to a browser API surface. They live in `background/commands/tools/` and are aggregated by `background/commands/tools/index.ts` into the exported `toolCommands` array, which `background/commands/source.ts` (`loadAllCommands`) merges into the global command set for both palette modes. There are four tool commands today: a UUID generator, a workflow debug command, and the snippet pair (create + insert).

> Arithmetic used to be a `calculator` group command here. It has been replaced by inline **calculations** — type `1 + 89` at the palette root and the answer appears under the search input; Enter copies it. See [../calculations.md](../calculations.md).

## Summary

| Command | Id | Node type | Purpose | Notes |
| --- | --- | --- | --- | --- |
| Copy UUID v4 | `uuidv4` | `action` | Generate a v4 UUID and copy it to the clipboard | Uses the `uuid` package |
| Debug Workflow | `debug-workflow` | `action` | Run a fixed click workflow against the active page | Exercises the workflow execution path; see [../workflow-automation.md](../workflow-automation.md) |
| Create Snippet | `create-snippet` | `group` | Form (name + multi-line body) that saves a reusable text snippet | Persists to the `monocle-snippets` storage key; body uses the `textarea` form field |
| Insert Snippet | `insert-snippet` | `group` | List saved snippets; selecting one inserts its body at the page caret | Cmd-enter copies instead; falls back to clipboard + toast when no input is focused |

All four are registered in `background/commands/tools/index.ts`:

```ts
export const toolCommands = [
  copyUuidV4,
  debugWorkflow,
  createSnippet,
  insertSnippet,
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
