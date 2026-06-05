# Monocle Feature Baseline

This folder is a feature-level baseline for Monocle as it exists now. It is
docs-only: it records the current architecture, test state, manual verification
steps, and review findings without changing runtime code.

## Current Status

| Feature | Status | Notes |
| --- | --- | --- |
| Command system | Working with review notes | Core `CommandNode` to `Suggestion` pipeline is buildable and used by both palette modes. |
| Palette UI and navigation | Working with review notes | Content overlay and new-tab mode share the same command palette and Redux navigation stack. |
| Browser commands | Working with unknowns | Many commands are wired; permission-dependent commands need manual checks in Chrome and Firefox. |
| Keybindings | Partial | Global capture, sequences, and custom keybindings exist, but registry coverage is uneven. |
| Permissions and settings | Working with review notes | Optional permission flow and persisted command settings exist; some settings flows need manual validation. |
| URL filtering and website plugins | Partial | `urlRules` is implemented, but the GitHub/contextual command prototype is unregistered. |
| Workflow automation | Partial | Click workflows are implemented; wait is a no-op and most typed operations are unsupported. |
| New tab and theme | Working with unknowns | New-tab commands and theme state are wired, but visual/manual coverage is needed. |

## Build And Test Baseline

Last verified in this baseline pass:

- `npm run tsc` passes.
- `npm run fmt:check` passes.
- `npm run build` passes for the Chrome target.
- `npm test` is not a useful gate: it is currently a placeholder that exits with failure.
- No conventional test files were found through the usual `*.test.*`, `*.spec.*`, `tests`, or `__tests__` patterns.

The Chrome build emits dependency freshness warnings for browser data packages,
but no extension build errors.

## Dirty Worktree Note

Before this docs pass, the repo already contained untracked paths:

- `.codex/`
- `background/commands/websites/`

The website command directory is treated as intentional in-progress work. It
contains the GitHub contextual command prototype and is reviewed in
[URL Filtering And Website Plugins](./url-filtering-and-website-plugins.md).

## Feature Docs

- [Command System](./command-system.md)
- [Palette UI And Navigation](./palette-ui-and-navigation.md)
- [Browser Commands](./browser-commands.md)
- [Keybindings](./keybindings.md)
- [Permissions And Settings](./permissions-and-settings.md)
- [URL Filtering And Website Plugins](./url-filtering-and-website-plugins.md)
- [Workflow Automation](./workflow-automation.md)
- [New Tab And Theme](./new-tab-and-theme.md)

## Cross-Cutting Review Findings

- GitHub contextual commands exist in `background/commands/websites/`, but
  `websiteCommands` is not imported into `background/commands/index.ts`, so the
  feature is currently unregistered.
- URL filtering is real and persisted through command settings, but it is a
  command-level filtering mechanism rather than a plugin registry.
- Workflow automation has a broad type model, but the content executor only
  meaningfully implements `click`; `wait` returns success without checking a
  condition.
- Dynamic search should be reviewed before relying on it. The search branch in
  `background/messages/getChildrenCommands.ts` requires `getAllCommandSettings`
  from `../commands`, but that function is exported from `../commands/settings`.
- The keybinding registry does not load every command source uniformly. Browser,
  tool, Firefox, and deep-search commands are registered, while UI/new-tab and
  website commands need explicit review.
- Automated coverage is effectively absent. Manual test lists in these docs are
  the current safety net until a real test harness is added.

