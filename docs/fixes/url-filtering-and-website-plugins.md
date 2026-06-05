# URL Filtering And Website Plugins Fix Plan

## Current Data Flow

Command-defined `urlRules` and user-persisted command settings are filtered by
`background/utils/urlFilter.ts`. Root and child command filtering now flows
through `background/commands/query.ts`.

Generated "Hide from Domain" actions write deny patterns to command settings.
Manual allow and deny management commands update URL rule settings through
inline `text-list` inputs.

Website commands currently live in `background/commands/websites/`. GitHub
commands are tracked, exported as `websiteCommands`, and loaded by
`background/commands/source.ts`.

## Boundaries And Contracts

- URL filtering is a command visibility and execution guard, not yet a full
  plugin system.
- Command-defined rules and user-defined rules must have explicit precedence.
  User deny wins over user allow, command deny, and command allow.
- Filtering must apply to root lists, child lists, deep search, favorites,
  direct execution, and keybinding execution.
- Website commands still need an explicit activation and enablement policy
  before the model is expanded beyond URL-filtered command arrays.
- User URL rules are keyed by command id; dynamic or generated ids must be
  handled carefully to avoid fragmented settings.

## Confirmed Gaps

- The website command model is still not a first-class registry with metadata,
  activation policy, settings scope, or plugin-owned hooks.
- Allow/deny management uses context-free `allCommands`, excluding new-tab-only
  commands.
- GitHub URL parsing uses a reserved top-level slug list and GitHub automation
  depends on brittle DOM selectors.

## Required Fixes

- Choose the website command model before broadening GitHub commands:
  - Minimal model: website commands are ordinary command arrays with `urlRules`.
  - First-class model: website commands have registry metadata, activation
    policy, settings scope, and optional plugin-owned hooks.
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
