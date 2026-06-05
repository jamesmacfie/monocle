# Monocle Feature Baseline

This folder is a feature-level baseline for Monocle as it exists now. It is
docs-only: it records the current architecture, test state, manual verification
steps, and review findings without changing runtime code.

## Current Status

| Feature | Status | Notes |
| --- | --- | --- |
| Command system | Working with review notes | Core `CommandNode` to `Suggestion` pipeline is buildable, context-aware, and used by both palette modes. |
| Palette UI and navigation | Working with review notes | Content overlay and new-tab mode share the same command palette and Redux navigation stack. |
| Browser commands | Working with review notes | Permission inheritance and high-risk keybinding policy are covered by focused tests; manual Chrome/Firefox checks are still needed. |
| Keybindings | Partial | Global capture, sequences, and custom keybindings exist, but registry coverage is uneven. |
| Permissions and settings | Working with review notes | Optional permission flow and persisted command settings exist; some settings flows need manual validation. |
| URL filtering and website plugins | Partial | `urlRules` is implemented, covered by focused tests, and the GitHub/contextual command prototype remains a URL-filtered command source rather than a first-class plugin registry. |
| Workflow automation | Partial | Click workflows are implemented; wait is a no-op and most typed operations are unsupported. |
| New tab and theme | Working with unknowns | New-tab commands and theme state are wired, but visual/manual coverage is needed. |

## Build And Test Baseline

Last verified in this baseline pass:

- `pnpm run tsc` passes.
- `pnpm run fmt:check` passes.
- `pnpm test` passes with the current focused command-system, browser-command,
  URL-filtering, settings-management, and GitHub parsing Vitest coverage.
- `pnpm run build` passes for the Chrome MV3 target through WXT.
- `pnpm run build:firefox` passes for the Firefox MV3 target through WXT.

The WXT builds emit chunk-size warnings for the content and new-tab bundles and
an ineffective dynamic import warning for `settings.slice.ts`, but no extension
build errors. The Firefox build also emits WXT's `data_collection_permissions`
warning for new extensions.

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

- GitHub contextual commands exist in `background/commands/websites/` and are
  loaded by `background/commands/source.ts`, but website commands are still just
  command arrays with URL rules rather than a first-class plugin system.
- URL filtering is real, persisted through command settings, and covered by
  focused tests, but it is a command-level filtering mechanism rather than a
  plugin registry.
- Workflow automation has a broad type model, but the content executor only
  meaningfully implements `click`; `wait` returns success without checking a
  condition.
- The keybinding registry does not load every command source uniformly. Browser,
  tool, Firefox, and deep-search commands are registered, while UI/new-tab and
  website commands need explicit review.
- Automated coverage now exists for the command-system, browser-command, URL
  filtering, settings-management, and GitHub parsing background paths, but
  coverage remains narrow. Manual test lists in these docs are still needed for
  browser integration behavior.
