# URL Filtering And Website Plugins Fix Plan

## Current Data Flow

Command-defined `urlRules` and user-persisted command settings are filtered by
`background/utils/urlFilter.ts`. Root commands are filtered in
`background/commands/index.ts`, and child commands are filtered in
`background/messages/getChildrenCommands.ts`.

Generated "Hide from Domain" actions write deny patterns to command settings.
Manual allow and deny management commands update URL rule settings through
inline `text-list` inputs.

Website commands currently live in `background/commands/websites/`. GitHub
commands are tracked and exported as `websiteCommands`, but they are not
registered into the main command loader.

## Boundaries And Contracts

- URL filtering is a command visibility and execution guard, not yet a full
  plugin system.
- Command-defined rules and user-defined rules must have explicit precedence.
  User deny wins over user allow, command deny, and command allow.
- Filtering must apply to root lists, child lists, deep search, favorites,
  direct execution, and keybinding execution.
- Website commands need an explicit registration and activation policy before
  being surfaced.
- User URL rules are keyed by command id; dynamic or generated ids must be
  handled carefully to avoid fragmented settings.

## Confirmed Gaps

- GitHub website commands are tracked and exported but unregistered.
- URL filtering applies to root and child list generation, but direct recursive
  execution lookup does not re-filter descendants.
- Keybinding execution can reach command execution by id and must also respect
  URL filtering.
- Favorite expansion can resolve child commands with an empty URL context and
  does not consistently apply child URL filters.
- Allow/deny management uses context-free `allCommands`, excluding new-tab-only
  commands and unregistered website commands.
- GitHub URL parsing uses a reserved top-level slug list and GitHub automation
  depends on brittle DOM selectors.

## Required Fixes

- Choose the website command model before registering GitHub commands:
  - Minimal model: website commands are ordinary command arrays with `urlRules`.
  - First-class model: website commands have registry metadata, activation
    policy, settings scope, and optional plugin-owned hooks.
- Register website commands only after the model is explicit and tested.
- Ensure URL filtering is enforced in command lookup and execution, not just UI
  list generation.
- Ensure deep-search and favorite expansion use the same filtered command source
  as root and child command lists.
- Replace context-free management command sources with a context-aware or
  all-source command registry that can include new-tab and website commands
  when user-configurable.
- Keep GitHub toggle-star automation best-effort with clear failure reporting.
  Do not present it as a stable GitHub API integration.
- Add focused tests for pattern parsing, pattern matching, rule precedence, and
  generated domain patterns before expanding the pattern language.

## Required Tests

- Unit tests for `extractDomain`, generated domain patterns, wildcard matching,
  localhost/IP patterns, invalid patterns, and command/user precedence.
- Tests proving deny wins over allow across user and command rule sources.
- Tests for root filtering, child filtering, deep-search filtering, favorite
  filtering, direct `execute-command`, and keybinding execution.
- Tests for Manage Allow List and Manage Deny List preserving sibling command
  settings.
- Tests for GitHub URL parsing across repo, pull request, issue, reserved slug,
  unsupported page, and enterprise-style edge cases.
- Manual checks after website registration on GitHub repo, PR, issue, and
  unsupported GitHub pages.

## Acceptance Gates

- `pnpm run tsc`
- `pnpm run fmt:check`
- `pnpm run build`
- `pnpm run build:firefox`
- New URL filter, settings-management, command-execution, and GitHub parsing
  tests pass.
- Manual smoke: hide a command from the current domain, verify it disappears
  from root and child/deep-search paths, attempt direct execution by id, remove
  the deny rule, and verify the command returns.
