# URL Filtering And Website Plugins

## Current Status

Status: partial.

Command-level URL filtering is implemented. Commands can declare `urlRules`,
users can persist allow/deny URL rules per command, and root/child command lists
are filtered by the current page URL. Filtering also guards favorites, deep
search descendants, direct command execution, and keybinding execution through
the shared background query path.

The current website-command model is intentionally minimal. `websiteCommands`
is loaded with the normal command source, and website commands are ordinary
command arrays with URL rules rather than a first-class plugin registry.

## How It Is Hooked Together

- `shared/types/commands.ts` defines `UrlRules` and adds `urlRules` to
  `CommandNodeBase`.
- `background/utils/urlFilter.ts` implements domain extraction, pattern
  creation, pattern validation, wildcard matching, and command filtering.
- `background/commands/source.ts` loads `websiteCommands` with the rest of the
  command source.
- `background/commands/query.ts` loads command settings and calls
  `filterCommandsByUrl` for root, child, search, favorite, direct execution,
  and keybinding execution paths.
- `background/messages/getChildrenCommands.ts` also filters child commands
  before converting them into suggestions.
- `commandsToSuggestions` adds a generated Hide from Domain action when a
  current URL exists.
- Hide from Domain stores a deny pattern through command settings.
- `background/commands/userConfigurableCommands.ts` provides the all-source
  registry used by settings-management surfaces. It includes browser, tool,
  website, new-tab, theme, clear-favorites, and platform-specific Firefox
  commands, but not the allow/deny management commands themselves.
- `background/commands/ui/manageAllowList.ts` and
  `background/commands/ui/manageDenyList.ts` expose manual URL rule editing.
- `background/commands/websites/github.ts` defines in-progress contextual
  GitHub commands with a GitHub-only allow list.

The intended GitHub command flow is:

1. `github-actions` appears only on GitHub URLs.
2. Its name resolves from the current repository URL.
3. It parses repo, pull request, and issue pages.
4. It generates navigation commands for PR/issue subpages.
5. It can run best-effort page automation to click the GitHub star button.
   This is DOM automation, not a stable GitHub API integration.

## Test Coverage

Automated test coverage: focused coverage exists.

Current automated coverage includes:

- `background/utils/urlFilter.test.ts`: domain extraction, generated domain
  patterns, wildcard matching, localhost/IP patterns, invalid patterns, and
  command/user precedence.
- `background/commands/command-system.test.ts`: root filtering, child
  filtering, deep-search filtering, favorite filtering, direct
  `execute-command`, keybinding execution, generated Hide from Domain writes,
  and allow/deny management preserving sibling command settings.
- `background/commands/websites/github.test.ts`: GitHub repo, pull request,
  issue, reserved slug, unsupported page, and enterprise-style URL parsing.

Build checks last run for this feature:

- `pnpm run fmt:check` passes.
- `pnpm run tsc` passes.
- `pnpm test` passes.
- `pnpm run build` passes for Chrome MV3.
- `pnpm run build:firefox` passes for Firefox MV3.

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
  it is not a plugin registry. The current pass deliberately keeps website
  commands as URL-filtered command arrays.
- Treat `urlRules` as the current command visibility layer. A future plugin
  model can build on it, but should not be confused with it.
- The GitHub prototype is in the right conceptual location and is loaded by the
  command source, but broader website/plugin additions still need a deliberate
  registration and enablement policy.
- GitHub URL parsing uses a reserved top-level slug list. This is practical and
  now covered by focused parser tests, but GitHub routing changes can still
  require updates.
- The star workflow depends on GitHub DOM selectors such as
  `.starring-container button`. That selector is brittle and should be treated
  as best-effort automation, not a stable API.
- User URL rules are stored per command id. If future website plugins generate
  many dynamic command ids, settings management can become fragmented.
- Introduce a first-class website plugin registry only when broader website
  commands need plugin metadata, lifecycle, enablement policy, settings scope,
  or plugin-owned hooks.
