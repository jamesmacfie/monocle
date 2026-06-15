# URL Filtering (Allow / Deny Lists)

Monocle can hide or show individual commands based on the URL of the page the
palette is opened on. Each command may carry `urlRules` (allow/deny pattern
lists), and users can persist their own allow/deny rules per command through the
settings layer. Before suggestions are built, the background filters every
command source against the current page URL using the matcher in
`background/utils/urlFilter.ts`. The same filter also enforces the global
`CommandSettings.hidden` flag before any URL-rule checks. This is the command
visibility layer today — it is not yet a plugin system. This document describes
the rule shape, the exact matching and precedence semantics, where filtering
runs, and the management surfaces (Hide Command, Hide from Domain, Manage Allow
List, Manage Deny List).

## The `UrlRules` shape

`UrlRules` is defined in `shared/types/commands.ts` and attached to every
command via `CommandNodeBase.urlRules`:

```ts
export interface UrlRules {
  allowUrls?: string[]
  denyUrls?: string[]
}
```

Both lists are optional arrays of pattern strings. The same shape is reused for
user-persisted rules through `CommandSettings.urlRules` in
`shared/types/settings.ts`, and updates flow through the partial type
`CommandUrlRulesSetting = Partial<NonNullable<CommandSettings["urlRules"]>>`.
The page-world SDK accepts the same shape on public commands after validation
in `shared/types/siteSdk.ts`.

| Field | Type | Meaning |
| --- | --- | --- |
| `allowUrls` | `string[]?` | If present and non-empty, the command is shown **only** on URLs matching one of these patterns. |
| `denyUrls` | `string[]?` | If present and non-empty, the command is **hidden** on URLs matching one of these patterns. |

A command with no `urlRules` at all (and no user rules) is always shown — there
is no implicit allow list.

## Pattern syntax and matching semantics

Matching is implemented by `matchesUrlPattern(url, patterns)` in
`background/utils/urlFilter.ts`, which converts each pattern to a case-insensitive
regular expression via the internal `patternToRegex` helper and tests the URL
against it. A URL matches a list if it matches **any** pattern in the list.

The conversion rules, in order:

1. The pattern is trimmed.
2. Regex special characters (`. + ? ^ $ { } ( ) | [ ] \`) are escaped, leaving
   `*` intact.
3. A `*.` segment (a wildcard immediately followed by a dot) becomes an
   **optional** subdomain group `(?:[^/]+\.)?`. This is the key behavior: `*.`
   matches the bare domain **and** any subdomain.
4. Any remaining `*` becomes `.*` (greedy match).
5. If the pattern does not start with `.*` and does not contain `://`, a
   protocol prefix `.*://` is prepended (so a bare `example.com` matches any
   protocol).
6. If the pattern does not already contain `/.*` and does not end in `.*`, an
   optional path suffix `(/.*)?` is appended.
7. The whole thing is anchored with `^...$` and compiled with the `i`
   (case-insensitive) flag.

Implications:

- **Case sensitivity:** matching is case-insensitive (the regex uses `i`).
- **Protocol:** `*://` matches any protocol; an explicit `http`/`https`
  prefix matches only that protocol; a bare host pattern matches any protocol.
- **Subdomains:** `*.github.com` matches `github.com`, `api.github.com`, and
  `www.github.com`, but not `notgithub.com` (the optional-subdomain group ends
  at a `.`, so it cannot match a host that merely *ends with* `github.com`).
- **Paths:** a pattern ending at the host implicitly allows any path; `/*`
  explicitly matches any path.
- **Ports:** ports are part of the host segment and must be matched literally
  (e.g. `*://localhost:3000/*` does not match `localhost:3001`).

### Example patterns

| Pattern | Matches | Does not match |
| --- | --- | --- |
| `*://*.github.com/*` | `https://github.com/a/b`, `https://api.github.com/...` | `https://notgithub.com/...` |
| `*://*.example.com/*` | `https://app.example.com/page`, `https://example.com/` | `https://other.test/page` |
| `*://blocked.example.com/*` | `https://blocked.example.com/page` | `https://app.example.com/page` |
| `github.com` | any protocol + any path on `github.com` (and subdomains via the optional-subdomain rule only if written `*.github.com`) | — |
| `https://example.com/*` | `https://example.com/anything` | `http://example.com/...` (protocol differs) |
| `*://localhost:3000/*` | `http://localhost:3000/settings` | `http://localhost:3001/settings` |
| `*://127.0.0.1:5173/*` | `http://127.0.0.1:5173/settings` | other ports/hosts |
| `*://[::1]:3000/*` | IPv6 loopback on port 3000 | — |

These examples are taken from `background/utils/urlFilter.test.ts`.

### Non-HTTP pages and missing URLs

There is no special handling for `about:`, `chrome://`, or other non-HTTP
schemes inside the matcher — they are matched literally by the regex like any
other URL string. The important guard is upstream: when the current URL is empty
(`""`), `filterCommandsByUrl` skips URL-rule matching but still removes commands
with `CommandSettings.hidden === true`. This is how new-tab mode keeps
allow-listed commands visible while still respecting global hides. See
[new-tab-and-theme.md](./new-tab-and-theme.md).

## Precedence: command rules vs user rules

`shouldShowCommand` (private in `urlFilter.ts`) decides visibility for one
command against the current URL and that command's persisted user settings.
Precedence, highest first:

1. **Global hidden flag** — if `CommandSettings.hidden === true`, hide before
   considering the URL or any rules.
2. **Empty URL guard** — if there is no current URL, show unless hidden. This
   guard lives in the callers (`filterCommandsByUrl` and `isCommandVisibleForUrl`),
   which short-circuit before invoking `shouldShowCommand`; the rule-based steps
   below only run once a URL is present.
3. **User deny list** — if the URL matches any user `denyUrls`, hide. (Highest priority; cannot be overridden.)
4. **User allow list** — if the user has a non-empty `allowUrls`, the command is shown **only** if the URL matches it, and command-defined rules below are ignored.
5. **Command deny list** — if the URL matches any command `denyUrls`, hide.
6. **Command allow list** — if the command has a non-empty `allowUrls`, show only if the URL matches it.
7. **Default** — no rules apply: show.

Behavioral consequences, all covered by tests in `urlFilter.test.ts`:

- A user **allow** rule overrides a command **deny** rule. Example: a command
  denies `*://blocked.example.com/*`, but the user allow-lists that same URL —
  the command appears there.
- A user **deny** rule beats everything, including a user allow rule for the
  same URL (deny is checked first and returns immediately).
- Within command rules alone, command **deny** wins over command **allow**
  (deny is checked before allow).
- An empty array is treated as "no list" (the `length > 0` guards), so saving an
  empty list does not lock a command to nothing — it simply removes the
  constraint.

`filterCommandsByUrl(commands, currentUrl, allUserSettings)` looks up each
command's persisted settings by `command.id` from the `allUserSettings` map and
applies `shouldShowCommand`. If `currentUrl` is empty it still filters hidden
commands, then treats all non-hidden commands as visible.

## Where filtering is applied

All command-loading paths funnel through `filterForContext` in
`background/commands/query.ts`, which loads all command settings and calls
`filterCommandsByUrl(commands, context.url || "", commandSettings)`. It is
invoked for:

- Root command loading (`getFilteredRootCommands`).
- Child command resolution for groups and dynamic search pages, inside
  `getCommandPageCommands` and the favorites/deep-search builders.
- The page resolution used by the `get-children-commands` message handler
  (`background/messages/getChildrenCommands.ts` calls `getCommandPageCommands`,
  which filters before converting to suggestions).

Because filtering is centralized here, it also guards favorites, deep-search
descendants, direct command execution, keybinding registry snapshots, and
keybinding conflict checks — anything that resolves through the shared query
path. See
[search-and-ranking.md](./search-and-ranking.md) and
[execution-and-actions.md](./execution-and-actions.md).

## Hide Command (generated action)

The suggestion builder in `background/commands/suggestions.ts` attaches a generated
**Hide Command** action to durable/configurable command rows. Its suggestion id
is `hide-command-${command.id}` and it carries an `executionContext` of type
`hideCommand` with the target command id.

When invoked, the `hideCommand` branch in `executeGeneratedAction`
(`background/commands/execution.ts`) writes
`commands[targetCommandId].hidden = true`, refreshes the keybinding registry,
and invalidates the search index. There is no generated unhide action because
hidden rows disappear from the palette; unhide happens through the options
Commands page.

## Hide from Domain (generated action)

When a current page URL exists (and the context is not new-tab), the suggestion
builder in `background/commands/suggestions.ts` attaches a generated **Hide from
{domain}** action to each command. Its suggestion id is
`hide-from-domain-${command.id}` and it carries an `executionContext` of type
`hideDomain` with the target command id and the extracted domain.

When invoked, the `hideDomain` branch in `executeGeneratedAction`
(`background/commands/execution.ts`):

1. Returns early if there is no URL or the context is new-tab.
2. Extracts the domain via `extractDomain(context.url)`
   (`hostname` plus `:port` if present).
3. Builds a deny pattern with `createUrlPatternForDomain(domain)`:
   - Regular domains → `*://*.${domain}/*` (covers subdomains).
   - `localhost`, `0.0.0.0`, IPv4, and IPv6 hosts → `*://${domain}/*`
     (no subdomain wildcard).
4. Appends that pattern to the command's **user** `denyUrls` (deduped) via
   `updateCommandUrlRules`.

The action is marked `remainOpenOnSelect: true` so the palette refreshes and the
command disappears from the current domain. The action id is parsed back into a
`hideDomain` `GeneratedCommandAction` by `parseGeneratedCommandAction` in
`background/commands/generatedActions.ts`.

## Managing rules through the palette

Two group commands let users view and edit per-command rules directly:

- **Manage Command Allow List** — `manage-allow-list`
  (`background/commands/ui/manageAllowList.ts`).
- **Manage Command Deny List** — `manage-deny-list`
  (`background/commands/ui/manageDenyList.ts`).

Each lists every command from `loadUserConfigurableCommands()` (browser, tool,
website, new-tab, theme, clear-favorites, and Firefox-specific commands; the
manage commands themselves are not included) as a child group. Opening a
command's group shows:

- An `input` node of field type `text-list`, pre-populated from the command's
  current persisted `allowUrls` / `denyUrls`.
- A `submit` node ("Save Allow List" / "Save Deny List") with
  `remainOpenOnSelect: true`.

On submit, the raw field value is split on commas, trimmed, and empty entries
dropped. Each remaining pattern is checked with `validateUrlPattern`; the first
invalid pattern throws `Invalid pattern "<p>": <reason>` and aborts the save.
Valid patterns are persisted via `updateCommandUrlRules(commandId, { allowUrls
})` or `{ denyUrls }`; an empty result writes `undefined` for that list. A
success toast is shown and the palette refreshes.

### Pattern validation

`validateUrlPattern(pattern)` (in `urlFilter.ts`) returns `true` or an error
message string:

| Condition | Result |
| --- | --- |
| Empty / whitespace-only | `"Pattern cannot be empty"` |
| Contains whitespace | `"Pattern cannot contain whitespace"` |
| Has `://` but malformed | `"Pattern protocol is invalid"` |
| Protocol not `http`/`https`/`*` | `"Pattern protocol must be http, https, or *"` |
| Empty host | `"Pattern host cannot be empty"` |
| Otherwise un-compilable | `"Invalid pattern format"` |
| Valid | `true` |

The same validation is used for both lists. Valid examples include
`*://*.github.com/*`, `github.com`, `*.github.com/*`, `http://localhost:3000/*`,
and `*://[::1]:3000/*`.

The `update-command-setting` message also validates the `urlRules` value with a
strict Zod schema (`UrlRulesSettingValueSchema` in `shared/types/validation.ts`)
that accepts only `allowUrls` and `denyUrls` string arrays. See
[messaging.md](./messaging.md) and [settings.md](./settings.md).

## Persistence and the shallow-merge hazard

User rules live under `monocle-settings -> commands[commandId].urlRules` in
`chrome.storage.local`. Writes go through `updateCommandUrlRules` ->
`updateCommandSettings` -> `mergeCommandSettings` in
`background/commands/settings.ts`.

`mergeCommandSettings` shallow-merges command settings, but when the partial
includes `urlRules` it spreads the existing and incoming rule objects together:

```ts
if ("urlRules" in partialSettings) {
  mergedSettings.urlRules =
    partialSettings.urlRules === undefined
      ? undefined
      : { ...existingSettings.urlRules, ...partialSettings.urlRules }
}
```

This one-level merge is what lets the allow-list editor update `allowUrls`
without clobbering a previously saved `denyUrls`, and vice versa. The hazard:
the merge is only **one level deep**. Because `allowUrls`/`denyUrls` are arrays,
passing a new array for a key fully **replaces** that array — it does not merge
element-wise. Callers that want to add a single pattern (as Hide from Domain
does) must read the existing list, append, and write the full array back. After
merging, `pruneCommandSettings`/`pruneUrlRules` drop empty rule objects so that
clearing both lists removes `urlRules` (and an empty command-settings object is
deleted entirely).

If you add code that updates nested `urlRules` state, always pass the complete
list you intend to persist, and never assume the merge will combine arrays.

## Website commands: current status

Website-specific commands (the GitHub contextual prototype in
`background/commands/websites/`) are currently just ordinary command arrays that
declare `urlRules` allow lists so they only appear on matching sites.
`websiteCommands` is loaded with the rest of the command source — there is no
plugin registry, lifecycle, enablement policy, or plugin-owned hooks. See
[commands/websites.md](./commands/websites.md) for the GitHub prototype.

Page-owned SDK commands are a separate mechanism. They may also declare
`urlRules`, and generated Hide from Domain rules still work, but their
registrations are scoped to the current tab/document/origin and are not loaded
from `background/commands/websites/`. See [site-sdk.md](./site-sdk.md).

**Open design question:** whether website commands should remain command arrays
filtered by `urlRules`, or become a first-class plugin registry with metadata,
activation policy, scoped settings, and plugin hooks. Treat `urlRules` as the
current visibility layer that a future plugin model could build on, not as the
plugin system itself. One concrete risk: user URL rules are keyed by command id,
so a plugin that generates many dynamic command ids could fragment settings
storage. SDK command ids are internally prefixed with a `site:` origin and
registration path, so stable public ids matter if a site wants user URL-rule
settings to keep applying across reloads.

## Known issues / review notes

- `urlRules` is a visibility layer only; it is not a plugin registry. Do not
  conflate the two.
- The GitHub prototype's automation (e.g. clicking the star button) relies on
  brittle DOM selectors and is best-effort, not a stable API integration. See
  [commands/websites.md](./commands/websites.md).
- GitHub URL parsing uses a reserved top-level slug list that can require updates
  when GitHub routing changes.
- Non-HTTP schemes are matched literally; rely on the empty-URL URL-rule
  shortcut (new-tab) rather than scheme-specific handling. Hidden still applies
  with an empty URL.

## Manual test checklist

- On `https://github.com/...`, confirm a GitHub-allow-listed command appears,
  and confirm it is hidden on a non-GitHub page.
- Use **Hide from Domain** on a visible command; after refresh it should be gone
  on the current domain. Then remove the deny pattern via **Manage Command Deny
  List** and confirm it returns.
- Use **Hide Command** on a visible durable command; confirm it disappears from
  root suggestions, search, child pages, and keybindings, then unhide it from
  Settings.
- Add an allow list for a command and confirm it appears only on matching URLs.
- Add both allow and deny rules for the same command and confirm deny wins
  within command rules; add a user allow rule over a command deny and confirm
  the user allow wins; add a user deny over a user allow and confirm deny wins.
- Test wildcard subdomain patterns (`*://*.github.com/*`) and local patterns
  (`*://localhost:3000/*`, including a non-matching port).
- Confirm allow-listed commands still appear in new-tab mode while globally
  hidden commands remain hidden.
- Enter an invalid pattern (e.g. `ftp://example.com/*`) in a manage list and
  confirm the save is rejected with an error.

## Related docs

- [command-schema.md](./command-schema.md) — `urlRules` field on `CommandNode`.
- [settings.md](./settings.md) — settings storage shape and merge behavior.
- [permissions.md](./permissions.md) — the parallel grant/check flow.
- [execution-and-actions.md](./execution-and-actions.md) — generated actions and execution.
- [search-and-ranking.md](./search-and-ranking.md) — favorites and deep search filtering.
- [new-tab-and-theme.md](./new-tab-and-theme.md) — new-tab context and empty-URL behavior.
- [messaging.md](./messaging.md) — `update-command-setting` and child-command messages.
- [commands/websites.md](./commands/websites.md) — GitHub website-command prototype.
