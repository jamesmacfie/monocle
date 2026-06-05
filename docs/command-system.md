# Command System

## Current Status

Status: working with review notes.

The core command model is implemented and buildable. Commands are defined as
typed `CommandNode` values in `shared/types/commands.ts`, loaded in the
background script, filtered by context, transformed into UI-facing
`Suggestion` values, and executed through message handlers.

The system supports action, submit, group, search, input, and display nodes. It
also supports favorites, usage-ranked suggestions, generated action menus,
modifier actions, custom keybinding actions, URL-hide actions, and deep search
for selected command groups.

## How It Is Hooked Together

- Source commands live under `background/commands/`, grouped into browser,
  tools, UI, website, Firefox-only, and new-tab command modules.
- `background/commands/source.ts` owns command loading and browser/context
  source selection.
- `background/commands/query.ts` owns context normalization, URL filtering,
  favorites, ranking, command pages, inherited permissions, and direct lookup.
- `background/commands/index.ts` is now a compatibility facade plus suggestion
  conversion and execution dispatch.
- `shared/types/commands.ts` defines the background-facing command contract.
  `shared/types/ui.ts` defines the suggestion shapes consumed by the React UI.
- `background/messages/getCommands.ts` returns root favorites, suggestions, and
  deep-search items to the UI.
- `background/messages/getChildrenCommands.ts` resolves group and search
  children for nested pages.
- `background/messages/executeCommand.ts` delegates execution to
  `executeCommand` in the command module.
- `commandsToSuggestions` adds generated actions for primary execution,
  modifier execution, favorite toggling, hiding from the current domain, and
  custom keybinding management.
- Favorites are persisted separately in `background/commands/favorites.ts`.
  Usage ranking is handled in `background/commands/usage.ts`.
- Deep search is flattened in `background/messages/getDeepSearchCommands.ts`
  for groups with `enableDeepSearch`.

The main data flow is:

1. UI sends `get-commands` with the current page context.
2. Background loads command nodes and filters them.
3. Background converts command nodes into suggestions.
4. UI renders suggestions through CMDK.
5. UI sends `execute-command` with command id and form values.
6. Background resolves the command and runs its executor.

## Test Coverage

Automated test coverage: narrow but present.

Build checks that currently touch this feature:

- `pnpm run tsc` validates command and suggestion types.
- `pnpm run fmt:check` validates formatting/lint rules.
- `pnpm test` includes focused command-system coverage in
  `background/commands/command-system.test.ts`.
- `pnpm run build` validates bundling through WXT.

The current command-system tests cover context-aware loading, usage ranking,
`doNotAddToRecents`, generated actions across root/child/search/deep-search
scopes, deep search with favorites, favorited child context, and URL-filtered
execution. Broader UI/component and browser integration coverage is still
missing.

## Manual Test Checklist

- Load the extension with `pnpm run dev`.
- Open the palette on a normal webpage with `Cmd+Shift+K`.
- Confirm root suggestions render and commands can be searched.
- Open a group command such as bookmarks, downloads, history, open tabs, or
  calculator.
- Confirm nested navigation opens a child page and Escape navigates back.
- Favorite a command from the action menu and confirm it appears under
  Favorites after refresh.
- Remove the favorite and confirm it disappears.
- Execute an action command and confirm the palette closes when expected.
- Execute an action with `remainOpenOnSelect` and confirm the palette stays
  open.
- Search for a command inside a deep-search-enabled group, such as open tabs or
  recently closed, and confirm the nested item can execute from root search.
- Try a command that requires missing permissions and confirm the UI offers a
  permission path instead of silently failing.

## Code Review Notes

- `background/commands/index.ts` still owns suggestion conversion, generated
  action handling, execution dispatch, and settings side effects. Keep moving
  unrelated loading/query responsibilities into focused modules rather than
  growing this facade again.
- The command model is mostly well-shaped. `CommandNode` keeps command authors
  close to a single abstraction, and `Suggestion` protects the UI from
  background-only execution functions.
- The action menu generation is centralized, which is good, but it also means
  every command inherits actions such as favorite and hide-from-domain. That is
  convenient but should be audited for commands where those actions do not make
  sense.
- Deep search only processes action and submit children. Input and display rows
  are intentionally skipped, but this should be kept explicit in future docs or
  tests so form-like command groups are not expected to flatten cleanly.
- `allCommands` is exported from `loadAllCommands()` without context, so
  context-only command groups such as new-tab commands are not always visible
  to settings/keybinding management surfaces.
