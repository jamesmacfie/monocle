# Monocle Automations — authoring context for an LLM

You are generating or editing a **Monocle automation**: a declarative JSON document that runs
browser steps (click, fill, wait, read text, navigate, …) from the command palette or on a
trigger. This file is the complete contract. Produce JSON that passes validation on the first
try.

**Output rule:** when asked to create or extend an automation, reply with **only the JSON
envelope** below (no prose, no markdown fences unless asked). When extending an automation the
user pasted, return the full modified document, not a diff.

**Envelope to emit** (this is what the user pastes into Monocle → Automations → Import):

```json
{
  "format": "monocle-automation@1",
  "note": "optional human note",
  "script": { ...the document described below... }
}
```

On import Monocle strips `id`, `createdAt`, `updatedAt` (omit them), stamps imported
provenance, and **forces every non-manual trigger to `disarmed: true`** until the user arms it.
A bare `script` object (no envelope) is also accepted, but prefer the envelope.

This document is **data, not code** — there is no arbitrary JavaScript step by design. Every
object is validated by a strict schema; unknown keys or unknown `op`/`kind`/`type` values are
rejected.

---

## 1. Document shape (`script`)

Commented reference (real JSON has no comments — strip them in output):

```jsonc
{
  "schemaVersion": 1,                 // REQUIRED, always exactly 1
  "name": "string",                   // REQUIRED, 1–100 chars
  "description": "string",            // optional, ≤2000
  "icon": "Search",                   // optional, a Lucide name from a closed set (see §2)
  "color": "blue",                    // optional, closed set (see §2)
  "enabled": true,                    // REQUIRED boolean (false ⇒ no palette row, no triggers)
  "urlRules": {                       // optional — scopes BOTH the palette row and triggers
    "allowUrls": ["*://*.example.com/*"],  // ≤100 patterns, each 1–2000 chars; empty/absent ⇒ every page
    "denyUrls":  ["*://example.com/admin/*"]
  },
  "triggers": [ /* 1–5 triggers, see §3 */ ],   // REQUIRED, ≥1
  "vars": {                           // optional, ≤50 entries; see §7
    "myVar": { "kind": "runtime" }
  },
  "steps": [ /* ≥1 step, see §5–6 */ ],         // REQUIRED, ≥1
  "options": { "showResultToast": true }        // optional; default shows a success/error toast
}
```

URL patterns use `*` wildcards, e.g. `https://*.github.com/*`, `*://mail.google.com/*`.
`denyUrls` win over `allowUrls`.

---

## 2. Closed enums

- **`color`**: `red`, `green`, `blue`, `amber`, `lightBlue`, `gray`, `purple`, `orange`,
  `teal`, `pink`, `indigo`, `yellow`.
- **`icon`**: optional. Must be one of the following names exactly (an unknown name fails
  validation — pick from this list or omit `icon`):

  `Activity`, `Airplay`, `AlarmClock`, `AlertCircle`, `AlertTriangle`, `AppWindow`, `Archive`,
  `ArrowDownAZ`, `ArrowDownToLine`, `ArrowLeft`, `ArrowRight`, `ArrowRightSquare`, `ArrowUp`,
  `ArrowUpToLine`, `Award`, `BadgeCheck`, `Bell`, `BellOff`, `Bookmark`, `BookmarkX`,
  `BookOpen`, `Bot`, `Box`, `Braces`, `Brain`, `Briefcase`, `Bug`, `Building`, `Building2`,
  `Calculator`, `Calendar`, `CalendarDays`, `CalendarRange`, `Camera`, `ChartBar`,
  `ChartColumn`, `ChartLine`, `Check`, `CheckCircle`, `ChevronLeft`, `ChevronRight`,
  `CircleQuestionMark`, `CircleUser`, `Clipboard`, `ClipboardCheck`, `Clock`, `Clock1`,
  `Clock3`, `Clock6`, `Cloud`, `Code`, `Code2`, `Cog`, `Command`, `Cookie`, `Copy`, `CopyPlus`,
  `CreditCard`, `Crosshair`, `Crown`, `Database`, `Download`, `Ellipsis`, `EllipsisVertical`,
  `ExternalLink`, `Eye`, `EyeOff`, `File`, `FileArchive`, `FileAudio`, `FileCode`, `FileImage`,
  `FileJson`, `FilePlay`, `FilePlus`, `FileSearch`, `FileText`, `FileX`, `Flag`, `Folder`,
  `FolderOpen`, `Fullscreen`, `Funnel`, `Gauge`, `Gift`, `Github`, `Globe`, `Grip`, `HardDrive`,
  `Heart`, `History`, `House`, `Image`, `Inbox`, `Infinity`, `Info`, `Key`, `Keyboard`,
  `Landmark`, `Laptop`, `LifeBuoy`, `Link`, `Link2`, `List`, `ListChecks`, `ListTodo`, `Lock`,
  `LogIn`, `LogOut`, `Mail`, `MapPin`, `Maximize2`, `Menu`, `MessageCircle`, `MessageSquare`,
  `Mic`, `Minus`, `Monitor`, `Moon`, `MoveRight`, `Music`, `Navigation`, `Newspaper`, `Option`,
  `Package`, `Palette`, `PanelsTopLeft`, `Paperclip`, `Pen`, `Pencil`, `Phone`, `Pin`, `PinOff`,
  `Play`, `Plug`, `Plus`, `PlusSquare`, `Presentation`, `Printer`, `Puzzle`, `QrCode`,
  `Receipt`, `RefreshCw`, `Rocket`, `RotateCcw`, `RotateCw`, `Rss`, `Save`, `Scan`, `Search`,
  `Send`, `Settings`, `Share`, `Share2`, `Shield`, `ShieldAlert`, `ShieldX`, `ShoppingBag`,
  `ShoppingCart`, `Sparkles`, `SquareArrowOutUpRight`, `SquareAsterisk`, `SquareX`, `Star`,
  `StarOff`, `Sun`, `Table`, `Tags`, `Terminal`, `TextCursorInput`, `TextSearch`, `Ticket`,
  `Timer`, `Trash`, `Trash2`, `Upload`, `User`, `UserCheck`, `UserCog`, `Users`, `Video`,
  `Volume2`, `VolumeX`, `WandSparkles`, `Wifi`, `Workflow`, `Wrench`, `X`, `XCircle`,
  `XOctagon`, `Zap`, `ZoomIn`, `ZoomOut`.

---

## 3. Triggers (`triggers`, 1–5)

At most **one of each non-manual type** per document. `manual` may appear with others.

```jsonc
// Runs from the command palette (and optional custom keybinding).
{ "type": "manual",
  "parameters": [               // optional, ≤10 — prompts the user before running
    { "id": "query",            // variable name: ^[A-Za-z][A-Za-z0-9_]*$, exposed as {{params.query}}
      "label": "Search for",    // 1–100
      "type": "text",           // "text" | "textarea" | "select"
      "required": true,         // optional
      "placeholder": "…",       // optional ≤100
      "defaultValue": "…",      // optional ≤2000
      "options": [              // REQUIRED only for type "select"; ≤50
        { "value": "v", "label": "Label" }
      ]
    }
  ]
}

// Fires when a page in scope (urlRules) loads or navigates.
{ "type": "urlMatch",
  "on": ["load", "spa"],        // optional; default both. "load"=page load, "spa"=SPA nav
  "oncePerPage": true,          // optional, default true
  "delayMs": 0,                 // optional, 0–10000 settle delay
  "disarmed": true }            // forced true on import

// Fires when an element appears (MutationObserver).
{ "type": "elementAppears",
  "selector": { "strategy": "css", "value": "#banner" },  // REQUIRED
  "oncePerPage": true,          // optional, default true
  "throttleMs": 1000,           // optional, 250–60000 (default 1000)
  "disarmed": true }

// Repeating timer. Requires the optional `tabs` permission to target a tab.
{ "type": "interval", "everyMinutes": 30, "disarmed": true }   // 1–10080 (7 days)

// Daily at local HH:MM (24h). Requires `tabs` permission.
{ "type": "schedule", "at": "09:00", "disarmed": true }

// On browser startup. Requires `tabs` permission.
{ "type": "onStartup", "disarmed": true }
```

Notes: a `manual`-only document becomes a palette command (`+ parameters` ⇒ a small form).
Event/scheduled triggers run automatically once armed; they re-validate on every fire, have a
~5s cooldown, and obey `urlRules`. Schedules target the first open tab matching `allowUrls`
(or the active tab if unscoped).

---

## 4. Selectors

Used by content steps, conditions, and `elementAppears`. **Selectors are never interpolated**
(no `{{...}}` inside a selector value — they are addresses, not values).

```jsonc
{ "strategy": "css", "value": "button.submit", "index": 0 }   // index optional, 0-based Nth match
{ "strategy": "text", "value": "Sign in",                     // matches visible text
  "exact": false,                                             // optional; substring by default
  "within": { "strategy": "css", "value": "header" },         // optional scope
  "index": 0 }
```
`value` must be non-empty.

---

## 5. Content steps (run on the page)

All support optional `id`, `description`, `timeoutMs`, `retry`, `targeting`. Each example below
is a single step object to place in `steps`.

```jsonc
{ "op": "click", "target": SEL, "button": "left", "clickCount": 1, "modifiers": ["Meta"] }  // button/clickCount/modifiers all optional
{ "op": "fill", "target": SEL, "text": "hello {{name}}", "clear": "select-all" }   // text interpolated
{ "op": "type", "target": SEL, "keys": ["Control", "A", "hello"], "delayMs": 20 }  // keys: names or literals
{ "op": "key", "keys": ["Control", "S"] }                                          // to the active element
{ "op": "select", "target": SEL, "by": { "label": "Blue" } }                       // by value|label|index (exactly one)
{ "op": "check", "target": SEL }
{ "op": "uncheck", "target": SEL }
{ "op": "submit", "target": SEL }                                                  // SEL is the form (or inside it)
{ "op": "focus", "target": SEL }
{ "op": "blur", "target": SEL }
{ "op": "hover", "target": SEL }
{ "op": "scroll", "to": "bottom" }                            // "top"|"bottom"|"center" | {x,y} | {intoView:true}; optional "target", "behavior":"smooth"
{ "op": "wait", "for": { "timeMs": 500 } }                    // or {selector,state} | {urlIncludes} | {readyState}
{ "op": "getText", "from": SEL, "attr": "href", "toVar": "link" }  // attr optional (default textContent); toVar REQUIRED
{ "op": "removeElement", "target": SEL, "all": false }
{ "op": "hideElement", "target": SEL, "all": false }          // inline display:none !important
{ "op": "injectCss", "css": ".ad { display:none }" }          // 1–10000 chars; NOT interpolated
```
`wait.for` variants: `{ "timeMs": n }`, `{ "selector": SEL, "state": "visible" }` (state:
`attached`|`visible`|`hidden`|`detached`), `{ "urlIncludes": "text" }`, `{ "readyState":
"complete" }` (`loading`|`interactive`|`complete`).

---

## 6. Engine steps (run in the background between page segments)

```jsonc
{ "op": "setVariable", "name": "greeting", "value": "Hi {{name}}" }   // value interpolated
{ "op": "insertSnippet", "snippetId": "<snippet uuid>", "target": SEL }  // target optional (else focused field)
{ "op": "toast", "level": "info", "message": "Done {{count}}" }      // level info|success|error; message interpolated
{ "op": "navigate", "url": "https://example.com/{{slug}}" }          // navigates the run's tab; url interpolated
{ "op": "openUrl", "url": "https://example.com", "disposition": "newTab" }  // currentTab|newTab|newWindow; url interpolated
{ "op": "clipboardWrite", "text": "{{heading}} — {url}" }            // 1–10000; interpolated
{ "op": "runCommand", "commandId": "open-new-tab" }                  // policy-gated, see §10
{ "op": "showSurface", "surfaceId": "s1", "kind": "overlay",         // declarative overlay/badge
  "blocking": false,
  "urlMatch": { "allowUrls": ["*://*/*"] },                          // NOT interpolated
  "content": { "icon": "Bell", "title": "Heads up", "text": "{{msg}}", "countdownTo": 0 } }
{ "op": "hideSurface", "surfaceId": "s1" }
```

---

## 7. Variables and interpolation

Declare variables in `vars` (≤50). Names match `^[A-Za-z][A-Za-z0-9_]*$`.

```jsonc
"vars": {
  "token":   { "kind": "literal", "value": "abc123" },   // fixed string (≤2000)
  "sig":     { "kind": "snippet", "snippetId": "<uuid>" },// resolves a snippet body at run time
  "heading": { "kind": "runtime" }                        // empty until getText/setVariable fills it
}
```

**`{{...}}` templates**. Resolvable
names: declared vars; `{{trigger.type}}`, `{{trigger.url}}`, `{{trigger.matchedText}}`
(elementAppears only); `{{params.<id>}}` (manual parameters); `{{item}}` / `{{index}}` (inside
`forEach`); `{{snippet:<id>}}` (inline snippet body). **Unknown names expand to `""`.** Escape
a literal with `\{{`.

Pipe transforms (left→right), a fixed set — nothing else is allowed:
`trim`, `upper`, `lower`, `slice:start:end`, `replace:from:to` (first match, literal),
`encodeUriComponent`, `length`. Example: `{{params.query | trim | encodeUriComponent}}`.

**Interpolatable fields only:** `fill.text`, `setVariable.value`, `toast.message`,
`navigate.url`, `openUrl.url`, `clipboardWrite.text`, `showSurface.content.title`/`.text`,
and condition `value` fields. **Not interpolatable:** any selector, `injectCss.css`,
`showSurface.urlMatch`.

**Snippet placeholders** (resolved after templates, in the same interpolatable fields):
`{date:FORMAT}` (date-fns, e.g. `{date:yyyy-MM-dd}`), `{url}`, `{title}`, `{domain}`, `{path}`,
`{uuid}`, `{timestamp}`, `{i}` (a persisted counter).

---

## 8. Control flow

`branch`, `forEach`, `while` nest other steps. **Max nesting depth 3**; **≤100 steps total**
counting nested. `navigate` (and `openUrl` with `"disposition":"currentTab"`) are **forbidden
inside any branch/loop body** — navigation destroys the page context. Flat scripts may navigate.

```jsonc
{ "op": "branch",
  "if": CONDITION,                 // see §9
  "then": [ /* ≥0 steps */ ],
  "else": [ /* optional */ ] }

{ "op": "forEach",
  "over": { "elements": { "strategy": "css", "value": ".result" } },  // or { "variable": "lines" } (iterates non-empty lines)
  "as": "item",                    // optional, default "item"; also {{index}}
  "maxIterations": 50,             // optional, 1–1000 (default 50)
  "steps": [ /* ≥1 step */ ] }

{ "op": "while",
  "condition": CONDITION,
  "maxIterations": 50,             // optional, 1–1000
  "steps": [ /* ≥1 step */ ] }
```

`forEach over elements`: each iteration binds `{{item}}` to the match's text (rename via `as`)
and `{{index}}`. **Any body-step selector structurally equal to the loop selector is
auto-pinned to the current match** — that is how body steps act on "the current item" without
templating a selector.

---

## 9. Conditions (`branch.if`, `while.condition`)

```jsonc
{ "kind": "elementExists",  "selector": SEL }
{ "kind": "elementVisible", "selector": SEL }
{ "kind": "elementText",    "selector": SEL, "operator": OP, "value": "text" }   // value interpolated
{ "kind": "urlIncludes",    "value": "/checkout" }
{ "kind": "varCompare",     "name": "count", "operator": OP, "value": "3" }      // value interpolated
{ "kind": "varMatches",     "name": "email", "pattern": "^[^@]+@[^@]+$" }        // regex, ≤200 chars, must compile, no flags
{ "kind": "not",   "of": CONDITION }
{ "kind": "allOf", "of": [ CONDITION, CONDITION ] }   // 1–10
{ "kind": "anyOf", "of": [ CONDITION, CONDITION ] }   // 1–10
```

`operator` (OP) ∈ `equals`, `equalsIgnoreCase`, `notEquals`, `contains`, `notContains`,
`startsWith`, `endsWith`, `greaterThan`, `lessThan`. The numeric operators coerce both sides to
numbers and **fail the run loudly** on non-numeric input.

---

## 10. `runCommand` policy

`runCommand` invokes another Monocle command. **Always denied:** commands that require
confirmation, other automations (any `userscript-*` id), and `debug-workflow`.

For **automatic** (non-manual) triggers, `commandId` must be one of this allowlist:

```
go-back, go-forward, go-to-parent-url, go-to-root-url, reload-current-tab,
hard-reload-current-tab, scroll-to-top, scroll-to-bottom, open-new-tab,
duplicate-current-tab, focus-next-tab, focus-previous-tab, focus-first-tab,
focus-last-tab, focus-last-active-tab, toggle-pin-current-tab, toggle-mute-current-tab,
copy-current-url, copy-current-title, copy-title-and-url, copy-title-and-url-as-markdown,
focus-first-input
```

Manual runs may call any non-denied command (subject to its own permissions).

---

## 11. Worked examples (complete, valid envelopes)

**Manual with a parameter — search the web:**
```json
{
  "format": "monocle-automation@1",
  "script": {
    "schemaVersion": 1,
    "name": "Web search",
    "icon": "Search",
    "enabled": true,
    "triggers": [
      { "type": "manual", "parameters": [
        { "id": "query", "label": "Search for", "type": "text", "required": true }
      ] }
    ],
    "steps": [
      { "op": "openUrl", "url": "https://duckduckgo.com/?q={{params.query | trim | encodeUriComponent}}", "disposition": "newTab" }
    ]
  }
}
```

**elementAppears + branch — dismiss a cookie banner:**
```json
{
  "format": "monocle-automation@1",
  "script": {
    "schemaVersion": 1,
    "name": "Dismiss cookie banners",
    "icon": "EyeOff",
    "enabled": true,
    "urlRules": { "allowUrls": ["*://*/*"] },
    "triggers": [
      { "type": "elementAppears", "selector": { "strategy": "css", "value": "#onetrust-accept-btn-handler" }, "throttleMs": 1000, "disarmed": true }
    ],
    "steps": [
      { "op": "branch",
        "if": { "kind": "elementExists", "selector": { "strategy": "css", "value": "#onetrust-accept-btn-handler" } },
        "then": [ { "op": "click", "target": { "strategy": "css", "value": "#onetrust-accept-btn-handler" } } ] }
    ]
  }
}
```

**Read text → clipboard (manual):**
```json
{
  "format": "monocle-automation@1",
  "script": {
    "schemaVersion": 1,
    "name": "Copy page heading + URL",
    "icon": "Clipboard",
    "enabled": true,
    "vars": { "heading": { "kind": "runtime" } },
    "triggers": [ { "type": "manual" } ],
    "steps": [
      { "op": "getText", "from": { "strategy": "css", "value": "h1" }, "toVar": "heading" },
      { "op": "clipboardWrite", "text": "{{heading}} — {url}" },
      { "op": "toast", "level": "success", "message": "Copied" }
    ]
  }
}
```

**forEach over elements:**
```json
{
  "format": "monocle-automation@1",
  "script": {
    "schemaVersion": 1,
    "name": "List result titles",
    "enabled": true,
    "triggers": [ { "type": "manual" } ],
    "steps": [
      { "op": "forEach",
        "over": { "elements": { "strategy": "css", "value": ".result h3" } },
        "as": "title",
        "maxIterations": 25,
        "steps": [ { "op": "toast", "message": "{{index}}: {{title}}" } ] }
    ]
  }
}
```

**Scheduled reminder (arms disarmed; needs `tabs` permission):**
```json
{
  "format": "monocle-automation@1",
  "script": {
    "schemaVersion": 1,
    "name": "Standup reminder",
    "icon": "AlarmClock",
    "enabled": true,
    "triggers": [ { "type": "schedule", "at": "09:25", "disarmed": true } ],
    "steps": [ { "op": "toast", "level": "info", "message": "Standup in 5 minutes" } ]
  }
}
```

---

## 12. What fails validation (avoid these)

- Unknown `op`, `kind`, or trigger `type`, or **any extra/misspelled key** — every object is
  `.strict()`. Only the documented fields are allowed.
- Missing a required field: `schemaVersion` (must be `1`), `name`, `enabled`, `triggers`
  (≥1), `steps` (≥1).
- Empty selector `value`, empty `name`, empty `getText.toVar`, empty `toast.message`.
- `schedule.at` not matching `HH:MM` (00:00–23:59); `varMatches.pattern` that doesn't compile.
- More than 5 triggers, or **two triggers of the same non-manual type**.
- More than 100 steps (counting nested), or control-flow nested deeper than 3 levels.
- `navigate`, or `openUrl` with `"disposition":"currentTab"`, **inside a branch/loop body**.
- Putting `{{...}}` inside a selector, `injectCss.css`, or `showSurface.urlMatch` (ignored at
  best; these are not interpolated).
- `forEach.steps` / `while.steps` empty (need ≥1), or `maxIterations` outside 1–1000.
- `allOf`/`anyOf` with 0 entries (need 1–10).
- `runCommand` to a confirm-gated command, another automation, `debug-workflow`, or (for
  automatic triggers) any id outside the §10 allowlist.
- Strings over their caps: `name`/labels >100, most strings >2000, `injectCss`/`clipboardWrite`
  >10000, regex >200.
- Variable names not matching `^[A-Za-z][A-Za-z0-9_]*$`.
- Using an `icon`/`color` outside the closed sets in §2.
```
