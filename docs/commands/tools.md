# Tool Commands

Tool commands are general-purpose utilities that are not tied to a browser API surface. They live in `background/commands/tools/` and are aggregated by `background/commands/tools/index.ts` into the exported `toolCommands` array, which `background/commands/source.ts` (`loadAllCommands`) merges into the global command set for both palette modes. There are four tool commands today: a calculator, a UUID generator, a Google search/omnibox command, and a workflow debug command.

## Summary

| Command | Id | Node type | Purpose | Notes |
| --- | --- | --- | --- | --- |
| Calculator | `calculator` | `group` | Evaluate arithmetic expressions with formatting and optional clipboard copy | Custom recursive-descent string evaluator, not `eval` |
| Copy UUID v4 | `uuidv4` | `action` | Generate a v4 UUID and copy it to the clipboard | Uses the `uuid` package |
| Debug Workflow | `debug-workflow` | `action` | Run a fixed click workflow against the active page | Exercises the workflow execution path; see [../workflow-automation.md](../workflow-automation.md) |
| Google Search | `google-search` | `search` | Omnibox-style search with live Google autosuggest and URL detection | Fetches remote suggestions; opens results via tab navigation |

All four are registered in `background/commands/tools/index.ts`:

```ts
export const toolCommands = [calculator, copyUuidV4, debugWorkflow, googleSearch]
```

---

## Calculator

Source: `background/commands/tools/calculator.ts`, exported as `calculator`.

A `group` command. Selecting it opens a child page with four inline `input` rows plus a `submit` row:

| Child id | Field id | Field type | Default | Purpose |
| --- | --- | --- | --- | --- |
| `calculator-input` | `calculation` | `text` | (empty, placeholder `1 + 2`) | The expression to evaluate |
| `calculator-theme` | `theme` | `multi` | `["system"]` | Cosmetic theme selector (not used by the executor) |
| `calculator-precision` | `precision` | `select` | `"2"` | Decimal places: `0`, `2`, `4`, or `6` |
| `calculator-copy` | `copy` | `switch` | `false` | Copy the result to the clipboard |
| `calculator-execute` | n/a | `submit` | n/a | Runs the calculation (`actionLabel: "Calculate"`) |

The `calculation` field declares input validation `pattern: "[0-9+\\-*/\\s\\(\\)\\^\\%\\|]+"`, so the UI permits digits, the four basic operators, parentheses, whitespace, and the `^`, `%`, `|` characters.

### Expression evaluation

Evaluation does not use `eval`. The local `stringMath(eq)` helper is a small recursive parser that repeatedly:

1. Resolves innermost parentheses via the `parentheses` regex (and inserts an implicit `*` for forms like `2(3)`).
2. Applies multiplication/division (`fMulDiv`).
3. Applies addition/subtraction (`fPlusMin`), after first normalizing sign pairs such as `--` to `+`.

It loops until the expression reduces to a single numeric literal, throwing `SyntaxError("The equation is invalid.")` if a pass makes no progress. Note that despite the input `pattern` permitting `^`, `%`, and `|`, `stringMath` only understands `+ - * /` and parentheses; expressions using `^`, `%`, or `|` will not reduce and will throw.

### Result formatting, display, and copy

On submit, the executor (`execute(context, values)`):

- Reads `calculation`, `precision` (parsed to int, default `2`), `format` (defaults to `"fixed"`; there is no UI field that sets `format`, so `"scientific"` is currently unreachable from the palette), and `copy === "true"`.
- Returns early if the expression is empty.
- Computes `stringMath(expression)` and formats: `precision === 0` rounds to an integer, otherwise `result.toFixed(precision)`. (The `"scientific"` branch would use `toExponential(precision)`.)
- Resolves the active tab via `getActiveTab()` and sends a `monocle-toast` with `level: "success"` carrying the formatted result string as the display.
- Copies to the clipboard via a `monocle-copyToClipboard` tab message when either the `copy` switch is on **or** the user submitted with the cmd modifier (`context?.modifierKey === "cmd"`).
- On any thrown error (invalid expression), sends an error toast `"Invalid calculation"` and logs to the console.

All output flows through tab messages, so the calculator requires an active tab to display or copy results.

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

## Google Search

Source: `background/commands/tools/googleSearch.ts`, exported as `googleSearch` (`SearchCommandNode`). Id `google-search`, `actionLabel: "Search"`.

A `search` command: it renders a child page whose results are produced dynamically from the search box via `getResults(context, search)`. This makes it an omnibox-style command.

### Result generation (`getResults`)

For a non-empty trimmed query it builds a list of dynamic `action` children:

1. **URL detection.** `isProbablyUrl(query)` returns true when the query has no whitespace and either starts with `http(s)://` or ends in a dotted TLD (`/\.[a-z]{2,}$/i`). When true, an "Open `<query>`" action is prepended, normalizing the URL with `toHttpUrl` (prefixing `https://` if no scheme).
2. **Base search action.** Always adds a search action for the literal query, opening `https://www.google.com/search?q=<encoded>`.
3. **Remote autosuggestions.** Calls `fetchGoogleSuggestions(query)`, which GETs `https://www.google.com/complete/search?client=chrome&q=<encoded>` and parses the Chrome-style `[query, [suggestions...]]` JSON shape. Up to 8 suggestions are added as additional search actions, skipping blanks, the exact query, and case-insensitive duplicates. Network/parse failures are caught and yield an empty list (logged as a warning), so the command still works offline.

Each generated child uses a `safeIdSegment` of the query/suggestion for its id and carries `executionPayload: { dynamicUrl }`.

### Opening behavior and modifier

The open/search action executors and the top-level `googleSearch.execute` share the same navigation logic, keyed on the modifier:

| Modifier | Behavior |
| --- | --- |
| none (Enter) | Update the active tab's URL in place (`updateTab`); if there is no active tab, open a new tab |
| cmd (cmd-Enter) | Open the URL in a new tab (`createTab`) |

The action labels reflect this: open-URL actions use `actionLabel: "Open"` / `modifierActionLabel: { cmd: "Open in New Tab" }`; search actions use `actionLabel: "Search"` / `modifierActionLabel: { cmd: "Open in New Tab" }`. All generated children set `allowCustomKeybinding: false` because their ids are query-dependent and ephemeral. The top-level `execute` only acts when called with a `values.dynamicUrl` that matches `^https?://`.

---

## Related docs

- [../command-types.md](../command-types.md) - the `group`, `action`, `submit`, and `search` node types used here.
- [../command-schema.md](../command-schema.md) - `FormField` variants (`text`, `select`, `multi`, `switch`) used by the calculator.
- [../execution-and-actions.md](../execution-and-actions.md) - Enter vs cmd-Enter, action labels, and `executionPayload`.
- [../workflow-automation.md](../workflow-automation.md) - what the workflow executor actually supports (relevant to Debug Workflow).
- [../authoring-commands.md](../authoring-commands.md) - registering a command into a category index.
