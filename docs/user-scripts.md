# User Scripts (Automations)

User scripts are **user-defined commands**: stored, declarative documents describing ordered sequences of steps — fill this field (with a snippet's value), click that button, check an element exists first, remove or restyle elements, open a URL, run another Monocle command — scoped to sites with `urlRules`, runnable from the palette or a custom keybinding, and optionally fired by page events or schedules.

A script is **always data, never code**. Documents are persisted locally, validated against a strict shared schema at every boundary, and interpreted entirely by bundled extension logic. There is no `eval`, no `new Function`, no remote step definitions, and no arbitrary-JS step (deliberately — see [Store posture](#store-posture)). User-facing copy calls the feature **Automations**; code and ids use the userScripts/`userscript-` naming.

## Status at a glance

| Area | Status |
| --- | --- |
| Document schema + validation (`shared/types/userScripts.ts`, `shared/types/userScriptValidation.ts`) | Implemented, with caps |
| Storage (`background/userScripts/storage.ts`, `monocle-userscripts` key) | Implemented |
| Engine: interpolation, segmentation, lowering, control flow (`background/userScripts/engine.ts`) | Implemented |
| Palette commands (`background/userScripts/commands.ts`, "Automations" group) | Implemented |
| Manual trigger (+ prompt-before-run parameters) | Implemented |
| Page-event triggers: `urlMatch` (load + best-effort SPA), `elementAppears` | Implemented (`background/userScripts/triggerEngine.ts`, `content/userScriptTriggers.ts`) |
| Scheduled triggers: `interval`, `schedule`, `onStartup` (`chrome.alarms`) | Implemented (`background/userScripts/alarms.ts`) |
| Options builder, import/export with review summary (`options/pages/UserScriptsPage.tsx`) | Implemented |
| Arbitrary-JS step (`runJs`) | **Not implemented, by decision** — see Store posture |

## The document

```jsonc
{
  "id": "9f8e7d6c-…",            // crypto.randomUUID(); command id suffix
  "schemaVersion": 1,
  "name": "Dev login",
  "icon": "LogIn",                // lucide names only
  "color": "teal",                // preset ColorName only
  "enabled": true,
  "urlRules": { "allowUrls": ["dev.example.com"] },
  "triggers": [{ "type": "manual" }],
  "vars": {
    "user": { "kind": "snippet", "snippetId": "a1b2…" },
    "pass": { "kind": "snippet", "snippetId": "c3d4…" }
  },
  "steps": [
    { "op": "fill", "target": { "strategy": "css", "value": "#username" }, "text": "{{user}}" },
    { "op": "fill", "target": { "strategy": "css", "value": "#password" }, "text": "{{pass}}" },
    { "op": "click", "target": { "strategy": "text", "value": "Sign in" } }
  ]
}
```

Key design decisions:

- **Keybindings/hidden/favorites are not stored on the document.** The generated command id (`userscript-<uuid>`) participates in the existing `CommandSettings`/favorites machinery, exactly like snippet rows. Exporting a script does not export its keybinding.
- **Constrained presentation**: lucide icon names and preset colors only — documents are importable data, so the SVG/URL icon sanitization surface is avoided entirely.
- **`urlRules` does double duty**: one field scopes both the palette row and trigger eligibility, evaluated by the standard URL-rule engine and precedence ([url-filtering.md](./url-filtering.md)). User per-command deny rules and `hidden` also silence triggers.
- **Linear document, not a node graph**: control flow is nested child arrays (`branch.then[]`, `forEach.steps[]`), capped at depth 3.

### Validation caps

Enforced by the shared Zod schema at save, import, and the message boundary; the engine re-checks structural caps at run time (defense in depth against storage tampering). Violations are rejected loudly with field-level errors, never coerced.

| Limit | Value |
| --- | --- |
| Scripts stored | 200 |
| Steps per script (counting nested) | 100 |
| Control-flow nesting depth | 3 |
| Loop iterations | default 50, hard max 1000 |
| Triggers per script | 5, at most one of each non-manual type |
| Declared vars | 50 |
| Name length | 1–100 |
| General string fields | ≤ 2000 |
| `injectCss` body | ≤ 10000 |
| Regex pattern (`varMatches`) | ≤ 200, no user-supplied flags, must compile |

Navigation steps (`navigate`, `openUrl` with `currentTab`) are rejected inside branches/loops — navigation destroys the content context and segment-splitting mid-control-flow is a complexity cliff. Flat scripts can navigate.

`schemaVersion` is the migration anchor: storage migrates old versions forward on read and **drops** documents from a newer version with an error rather than misinterpreting them.

## Triggers

| Trigger | Fires | Notes |
| --- | --- | --- |
| `manual` | Palette selection / keybinding | Optional `parameters[]` (constrained text/textarea/select fields) render as a form; values land as `{{params.<id>}}` |
| `urlMatch` | Matching page load and/or SPA navigation | No pattern field — the script's `urlRules` are the pattern. `on: ["load","spa"]`, `oncePerPage` (default true), `delayMs` |
| `elementAppears` | Selector first matches on an allowed page | Shared MutationObserver, per-trigger throttle (floor 250ms), `oncePerPage` |
| `interval` | Every N minutes (`chrome.alarms`) | |
| `schedule` | Daily at HH:MM local (`chrome.alarms`, self re-arming) | |
| `onStartup` | Browser start | |

Rules for every trigger: non-manual triggers never fire on `urlRules`-denied pages, non-http(s) pages, or the new-tab page; **imported scripts arrive with non-manual triggers disarmed** until the user reviews and arms them; a disabled script arms nothing.

Page-trigger flow is **pull-based** (no extra permissions): the content service (`content/userScriptTriggers.ts`) reports its URL via `get-user-script-triggers`, receives the armed specs for that URL, and reports fires via `user-script-trigger-fired`. The background **re-validates everything** on fire — script existence, enablement, armed state, and URL eligibility against the *sender's actual URL* (a page cannot claim a different URL) — before the engine runs. Content never receives steps and executes nothing on its own.

SPA detection is best-effort and content-side (popstate/hashchange plus a 1s href poll), avoiding the `webNavigation` install-time permission. `oncePerPage` bookkeeping is per document and, for SPA fires, per virtual location.

Scheduled triggers re-register on `runtime.onInstalled`/`onStartup` and on every store change. A scheduled run targets the first open tab the script's allow rules match (active tab when unscoped); with no eligible tab it is skipped with a log. Matching tab URLs requires the optional `tabs` permission — without it, scoped scheduled scripts skip and say why. The `alarms` permission is declared in `wxt.config.ts`.

The `{{trigger.*}}` namespace delivers fire context into interpolation: `{{trigger.type}}`, `{{trigger.url}}`, and (elementAppears only) `{{trigger.matchedText}}` capped at 500 chars.

## Steps

Two tiers, one rule: **content steps are workflow steps** (the full implemented vocabulary in [workflow-automation.md](./workflow-automation.md), reused verbatim and lowered 1:1); **engine steps** run in the background between content segments.

Engine steps:

| Op | Purpose |
| --- | --- |
| `setVariable` | Set a runtime variable (value interpolated) |
| `insertSnippet` | No target: insert at the page's last-focused editable via `monocle-insertText` with clipboard fallback (identical to the palette command, same `{i}` counter sequence). With target: fill with the interpolated snippet body |
| `toast` | Tab-scoped `monocle-toast` |
| `navigate` | `tabs.update` on the run's pinned tab, then wait (bounded) for load complete |
| `openUrl` | `currentTab` / `newTab` (default) / `newWindow` |
| `clipboardWrite` | Tab-scoped `monocle-copyToClipboard` |
| `runCommand` | Invoke a Monocle command, policy-gated (below) |
| `showSurface` | Push a declarative [surface](./surfaces.md) (overlay/badge) under owner `userscript:<id>`; `content.title`/`content.text` interpolated, `urlMatch` is not |
| `hideSurface` | Remove one of this script's surfaces by `surfaceId` |
| `branch` | If/else over a condition |
| `forEach` | Loop over element matches or a variable's lines |
| `while` | Loop while a condition holds (always capped) |

### Conditions

`elementExists`, `elementVisible`, `elementText` (with comparison operator), `urlIncludes`, `varCompare`, `varMatches` (bounded regex), and the combinators `not`/`allOf`/`anyOf`. Element/URL questions are answered by the content executor through short probe workflows (a `wait` with a 300ms budget, `getText` for text reads) so element semantics match action steps exactly. Numeric comparisons (`greaterThan`/`lessThan`) fail the run loudly on non-numeric input.

### Loops

- Every loop carries an iteration cap (default 50, hard max 1000), enforced by schema **and** engine.
- `forEach` over elements: each iteration, the engine probes existence of match *i*, binds `{{item}}` (the element's text; rename with `as`) and `{{index}}`, and **pins any body-step selector structurally equal to the loop selector (including `within` scopes) to index *i*** — that is how body steps act on "the current item" without selector templating.
- `forEach` over a variable iterates the variable's non-empty lines.
- Loop variables are scoped to the body and restored afterward.
- The engine additionally enforces a 5000-executed-step runaway cap per run.

### `runCommand` policy

`background/userScripts/runCommandPolicy.ts` is the single reviewable policy table, re-checked at execute time (not just save):

- Denied for **every** run: commands with `confirmAction` (a script must not bypass a confirmation), other user scripts (no recursion), `debug-workflow`, unknown ids. Permission-gated commands fail at dispatch when ungranted, as always.
- Runs started by a **non-manual trigger** are restricted to a static allowlist (navigation/tab/read-only-page-utility commands; never clear-data-class commands), so the entire non-gesture capability surface is one exported set in the source.

The command bridge is injected into the engine by `background/index.ts` at startup, keeping the userScripts ↔ commands module graph acyclic; invoked commands go through the normal dispatch (own permission checks, usage recording).

## Variables and interpolation

One ordered pipeline, applied per interpolatable field (`fill.text`, `setVariable.value`, `toast.message`, `navigate.url`/`openUrl.url`, `clipboardWrite.text`, `showSurface.content.title`/`.text`, condition `value` fields — declared in `interpolatableStrings` in `background/userScripts/interpolate.ts`). Selector values, `injectCss` bodies, and `showSurface.urlMatch` are deliberately **not** interpolatable (a selector/URL pattern is an address; interpolated addresses are unreviewable in import summaries).

1. **`{{...}}` expansion** (`shared/utils/user-script-template.ts`, pure/shared so the builder warns with run-time semantics): declared vars, `{{trigger.*}}`, `{{params.*}}`, loop scope, inline `{{snippet:<id>}}` refs, with the whitelisted pipe transforms `trim`, `upper`, `lower`, `slice:a:b`, `replace:from:to` (first, literal), `encodeUriComponent`, `length`. Unknown references expand to `""` at run and warn in the builder. `\{{` escapes a literal `{{`. The transform set is a fixed function table, not an expression language — a deliberate one-way-door refusal.
2. **Snippet resolution** (background): `vars` of kind `snippet` and inline refs re-read the snippet at run time, bump the persisted `{i}` counter only when the body uses it (one counter sequence shared with palette insertion), and interpolate the body.
3. **Snippet placeholder expansion**: `interpolateSnippetBody` with the run's page context, so `{date:...}`, `{url}`, `{domain}`, etc. work in any interpolatable field.

Interpolation runs **in the background engine before steps are sent to content** — snippet resolution and counters are background-owned, secrets round-trip once, and the executor never learns templating. Segments split after `getText` so extracted runtime vars are visible to later steps' templates.

## Engine: segments and execution

`runUserScript(scriptId, { context, invocation })` in `background/userScripts/engine.ts`:

1. **Re-reads the script by id** (generated nodes carry only the id — captured documents go stale against storage, the snippets lesson).
2. Re-checks structural caps; refuses disabled scripts.
3. Pins the target tab (`resolveWorkflowTargetTabId` semantics; trigger runs use the sender tab) and enforces the runtime limits: **one concurrent run per script per tab** (re-entrant triggers dropped, not queued) and a 5s cooldown between non-manual runs per script.
4. Builds the value bag (vars, trigger, params, inline snippet refs).
5. Walks the step list: contiguous content steps buffer into a segment, lowered (`background/userScripts/lowering.ts` — the single place the user-script→workflow mapping lives) and executed via `executeWorkflowOnTargetTab`; engine ops execute between segments; `getText` ends its segment and the returned `vars` merge into the bag.
6. Aggregates per-step outcomes (op + id + success only — payloads never echo into logs, they may hold credentials) and toasts the result unless `options.showResultToast` is false.

Execution from the palette records usage through the normal command dispatch path. Failures return `{ success: false, error, completedSteps, stepOutcomes }`; the run never throws.

## Command generation

`background/userScripts/commands.ts`, registered through `background/commands/source.ts` under the **Automations** category:

- The **Automations group** (`id: user-scripts`, deep-search enabled, `settingsCatalog.includeChildren` — script ids are stable UUIDs, the snippets durability justification). Children:
  - Manual-trigger scripts → `action` nodes: `id: userscript-<uuid>`, `urlRules` copied from the document (the existing filter pipeline scopes the row for free), `actionLabel: "Run Automation"`, cmd-modifier "Edit in Options", and `keybindingRequirements: { requireNonShiftModifier: true }` when steps type into the page (`fill`/`type`/`insertSnippet` — the snippets precedent; such shortcuts must fire inside editable elements).
  - Manual triggers with `parameters[]` → a `group` of `input` nodes plus a `submit` (the create-snippet form shape), with `keybindingBehavior: "openPaletteAtCommand"`.
  - Enabled event-only scripts → `display` rows ("Runs automatically — manage it in Options"); disabled scripts get no row.
- **Create Automation** / **Manage Automations** actions open the options builder (`#/automations`).

Because rows are durable commands, keybindings (assigned on the keyboard settings page or via row actions), favorites, hide, and per-command URL-rule overrides all work through existing machinery — none of it is reimplemented.

## Storage and messages

- `monocle-userscripts` key, `withStorageLock` CRUD, independent lifecycle from `monocle-settings` (`background/userScripts/storage.ts`). Writes re-validate the full document.
- Messages (`background/messages/userScripts.ts`, schemas in `shared/types/validation.ts`): `get-user-scripts`, `add-user-script`, `update-user-script`, `delete-user-script`, `run-user-script` (context optional — options-page test runs target the active tab), `get-user-script-triggers` (content → bg), `user-script-trigger-fired` (content → bg).
- CRUD handlers invalidate the search index and rebuild the keybinding registry; delete also removes dangling `CommandSettings` for the generated command id (the snippets housekeeping pattern).

## Options builder

`options/pages/UserScriptsPage.tsx` (+ `shared/store/slices/userScripts.slice.ts`), routes `#/automations`, `#/automations/new`, `#/automations/:id`:

- List view: name, blurb (`userScriptBlurb`), enabled toggle, edit/delete/export, import, and **Add Examples**.
- **Add Examples** (`options/pages/userScripts/examples.ts`) seeds a curated set of example automations covering every trigger type and most of the step vocabulary — saved through the normal add path (so they validate like any document, locked in by `examples.test.ts`), deduped by name, and with event/scheduled triggers shipped disarmed. They double as living documentation of what automations can do.
- Editor: metadata, scope (allow/deny patterns), trigger list with per-type fields and disarm toggles, variables (literal/snippet/runtime), and the step list — per-op form rows for the flat vocabulary, JSON editing for control-flow steps. Validates as-you-type with the identical shared schema; save is disabled with field-level errors; unknown `{{var}}` references warn.
- **Test on Active Tab** runs the script through the real engine and shows per-step outcomes — selector breakage, not vocabulary, is what defeats non-programmers.
- Import: JSON file → strip id/timestamps → validate → **non-manual triggers forced disarmed** + `source: imported` → a review dialog rendering `summarizeUserScript` (every URL pattern, trigger, op class, snippet reference, opened URL, runCommand target, clipboard use) before anything is saved. Export writes the document as JSON (keybindings excluded by design).

## Security and trust model

The attacker model inverts the site SDK's: the user is trusted, but **imported documents are not until reviewed**, and the page a script runs on is hostile (it can bait selectors, it cannot expand a script's capability). Containment:

- v1-style manual runs add zero non-gesture execution; event/scheduled triggers are the trust delta and ship with: disarmed-on-import, background re-validation of every fire, per-script cooldowns, the concurrent-run limit, throttle floors, and the non-manual `runCommand` allowlist.
- A page cannot create, modify, or trigger a script (no `pageEvent` trigger by design); the site SDK separation holds.
- **Credentials caveat, stated plainly**: snippets — including auto-login credentials — live unencrypted in `chrome.storage.local`. The options UI and docs recommend this only for low-stakes dev/test credentials; scope mitigations (pin login scripts with `allowUrls`) are real but not encryption. Fill payloads are interpolated background-side and never logged.
- Fail loudly everywhere: validation failures, unsupported ops, policy violations, and structural-cap violations all error visibly.

## Store posture

- The declarative engine is squarely in both stores' safe harbor: locally stored user configuration interpreted by bundled code. No remote step definitions ever; no eval anywhere; fixed verbs with capped nesting/loops ("configuration, not a language").
- **`runJs` is deliberately not implemented.** Firefox AMO policy restricts user-provided JS to dedicated script managers, and a JS step would change the trust model and fork the builds. The schema does not reserve or accept the op.
- Store listing language should say "automations"/"user-defined commands", not "scripting". Reviewer notes should name the interpreter files: `shared/types/userScriptValidation.ts`, `background/userScripts/engine.ts`, `content/workflow/executor.ts` (see [store-submission.md](./store-submission.md)).
- New install-time permission: `alarms` ("run user-scheduled automations"). No `webNavigation` (SPA detection is content-side); Firefox `data_collection_permissions` stays `"none"` — a script typing into a page sends user-held data to that origin at the user's direction, which the privacy policy should state in one sentence.

## Manual test checklist

- Create the dev-login example in the builder; run it from the palette and a custom keybinding (binding must require a non-shift modifier) on `test-inputs.html`.
- Parameters form: a manual trigger with a text parameter renders inputs + submit; `{{params.x}}` interpolates.
- Test-run from the options page with no related tab focused (active-tab targeting).
- Import a script JSON: review summary appears, non-manual triggers arrive disarmed; arm an `elementAppears` trigger and verify it fires once when the element appears, respects the cooldown, and never fires on a denied URL.
- urlMatch SPA: navigate within a SPA and confirm a `spa`-armed script fires on a matching virtual URL.
- Schedule: set an interval script, confirm the alarm fires and targets a matching tab (and skips with a log when none).
- Both palette modes: the Automations group renders in content overlay and new-tab mode; scripts refuse to run against the new-tab page.

## Related docs

- [Workflow automation](./workflow-automation.md) — the content vocabulary scripts lower onto.
- [Messaging](./messaging.md) — message payloads and handlers.
- [URL filtering](./url-filtering.md) — the scoping engine `urlRules` reuses.
- [Keybindings](./keybindings.md) — requirements and assignment.
- [Settings](./settings.md) / [Settings page](./settings-page.md) — CommandSettings, catalog rows, the options app.
- [Store submission](./store-submission.md) — submission impact and reviewer notes.
