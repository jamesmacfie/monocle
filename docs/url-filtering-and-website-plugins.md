# URL Filtering And Website Plugins

## Current Status

Status: partial.

Command-level URL filtering is implemented. Commands can declare `urlRules`,
users can persist allow/deny URL rules per command, and root/child command lists
are filtered by the current page URL.

The intended website-plugin direction has started. `websiteCommands` is loaded
with the normal command source, but the model is still just command arrays with
URL rules rather than a first-class plugin registry.

## How It Is Hooked Together

- `shared/types/commands.ts` defines `UrlRules` and adds `urlRules` to
  `CommandNodeBase`.
- `background/utils/urlFilter.ts` implements domain extraction, pattern
  creation, pattern validation, wildcard matching, and command filtering.
- `background/commands/source.ts` loads `websiteCommands` with the rest of the
  command source.
- `background/commands/query.ts` loads command settings and calls
  `filterCommandsByUrl` for root and child commands.
- `background/messages/getChildrenCommands.ts` also filters child commands
  before converting them into suggestions.
- `commandsToSuggestions` adds a generated Hide from Domain action when a
  current URL exists.
- Hide from Domain stores a deny pattern through command settings.
- `background/commands/ui/manageAllowList.ts` and
  `background/commands/ui/manageDenyList.ts` expose manual URL rule editing.
- `background/commands/websites/github.ts` defines in-progress contextual
  GitHub commands with a GitHub-only allow list.

The intended GitHub command flow is:

1. `github-actions` appears only on GitHub URLs.
2. Its name resolves from the current repository URL.
3. It parses repo, pull request, and issue pages.
4. It generates navigation commands for PR/issue subpages.
5. It can run a workflow to click the GitHub star button.

## Test Coverage

Automated test coverage: missing.

Build checks that currently touch this feature:

- `pnpm run tsc` validates the URL rule types and the untracked GitHub command
  code.
- `pnpm run fmt:check` validates formatting/lint.
- `pnpm run build` validates bundle compilation.

There are no tests for pattern matching, precedence between command/user
allow/deny rules, generated domain patterns, child filtering, or GitHub URL
parsing.

## Manual Test Checklist

- On `https://github.com/...`, confirm the GitHub command appears only on
  matching GitHub URLs.
- On a non-GitHub page, confirm the GitHub command is hidden.
- Use Hide from Domain on a visible command and confirm it disappears on the
  current domain after refresh.
- Use Manage Command Deny List to remove the deny pattern and confirm the
  command returns.
- Add an allow list for a command and confirm it only appears on matching URLs.
- Add both allow and deny rules and confirm deny wins.
- Test wildcard patterns such as `*://*.github.com/*` and local patterns such
  as `*://localhost:3000/*`.
- Test `github-actions` on repo, PR, issue, and unsupported GitHub pages.
- Test GitHub PR navigation commands and toggle-star workflow on a safe
  repository.

## Code Review Notes

- The URL filtering system is a useful foundation for contextual commands, but
  it is not a plugin registry. It has no plugin metadata, lifecycle, enablement,
  hook contract, or isolation boundary.
- Treat `urlRules` as the current command visibility layer. A future plugin
  model can build on it, but should not be confused with it.
- The GitHub prototype is in the right conceptual location and is loaded by the
  command source, but broader website/plugin additions still need a deliberate
  registration and enablement policy.
- GitHub URL parsing uses a reserved top-level slug list. This is practical, but
  should be covered by tests because GitHub routing changes and edge cases can
  be subtle.
- The star workflow depends on GitHub DOM selectors such as
  `.starring-container button`. That selector is brittle and should be treated
  as best-effort automation, not a stable API.
- User URL rules are stored per command id. If future website plugins generate
  many dynamic command ids, settings management can become fragmented.
- The next implementation pass should decide whether website plugins are just
  command arrays with `urlRules` or a first-class registry with metadata,
  activation conditions, and plugin-owned hooks.
