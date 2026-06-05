# Command System Fix Plan

## Current Data Flow

Command definitions originate in `background/commands/` as `CommandNode`
values. `background/commands/index.ts` loads the root command set, adds
context-gated commands, applies browser compatibility, applies URL filtering,
finds favorites, ranks suggestions with usage data, and converts commands into
UI-facing `Suggestion` values.

Content and new-tab UIs request commands through `get-commands`, request
children through `get-children-commands`, and execute by sending
`execute-command`. The background resolves a command id, checks permissions on
the resolved node, normalizes form values, runs the executor, and returns
success or an error response.

## Boundaries And Contracts

- Background owns executable command behavior. UI must receive `Suggestion`
  data, not executable functions.
- `CommandNode` is the authoring model; `Suggestion` is the UI/rendering model.
- Command loading must be context-aware for new-tab and future website commands.
- URL filtering must be honored for any command visibility and execution path.
- Usage ranking must be backed by execution events, not just stored ranking
  infrastructure.
- Generated actions such as favorite, reset keybinding, hide from domain,
  primary execution, and modifier execution must work for root, child, and
  deep-search suggestions.

## Confirmed Gaps

- Usage ranking is incomplete. `getCommands` sorts by `getRankedCommandIds`,
  but `recordCommandUsage` has no callers, and `executeCommand` ignores the
  `_parentNames` value passed from the UI.
- Generated action execution is root-biased. `executeCommand` rebuilds only the
  root suggestion list when looking up an action's `executionContext`; child and
  deep-search action rows can fail except for the hard-coded
  `toggle-favorite-*` shortcut.
- Deep search can disappear for favorited deep-search groups because
  `getCommands` removes favorites from `cmdSuggestions`, and
  `flattenDeepSearchCommands` receives only `cmdSuggestions`.
- Favorited child lookup uses a blank context with empty `url` and `title`.
  Context-derived labels and URL-filtered child commands can be resolved
  incorrectly.
- `findCommand` recursively walks children without applying URL filtering or
  inherited permissions during direct execution.
## Required Fixes

- Add a single command-source service or small set of helpers around
  `loadAllCommands`, filtering, favorite expansion, deep-search expansion, and
  lookup. Keep `background/commands/index.ts` as a compatibility facade while
  moving responsibilities into smaller units.
- Record successful executable command usage in the background execution path.
  Respect `doNotAddToRecents` for submit commands before recording usage.
- Preserve and store `parentNames` when recording nested/deep-search command
  usage.
- Resolve generated actions against the same command scope that produced them.
  The execution path must support generated actions from root suggestions,
  child pages, dynamic search results, and deep-search rows.
- Build deep-search items from the filtered full command set before favorites
  are removed from suggestions.
- Use the real incoming context when resolving favorited nested commands, and
  apply URL filtering to children during favorite expansion.
- Make direct id lookup execution enforce URL filtering and inherited parent
  permissions, or require generated dynamic children to carry the permissions
  and URL rules needed for safe execution.

## Required Tests

- Unit tests for command loading by context: normal page, new-tab context,
  Firefox context, and future website/contextual command context.
- Unit tests proving command execution records usage and ranked suggestions
  change after repeated execution.
- Tests proving `doNotAddToRecents` submit commands do not write usage data.
- Tests for generated actions on root commands, nested child commands, dynamic
  search results, and deep-search rows.
- Tests proving favoriting `open-tabs` or `bookmarks` does not remove their
  deep-search descendants from root search.
- Tests for favorited child commands whose names or URL rules depend on the
  current context.
- Tests proving URL-denied commands cannot be executed directly by id or
  through keybindings.

## Acceptance Gates

- `pnpm run tsc`
- `pnpm run fmt:check`
- `pnpm run build`
- `pnpm run build:firefox`
- New command-system unit tests pass.
- Manual smoke: open palette, execute a root command, execute a nested command,
  favorite/unfavorite a nested command, run deep search, and verify usage-ranked
  ordering changes after repeated command execution.
