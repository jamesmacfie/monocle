# Commands: Automations

The Automations category (`background/userScripts/commands.ts`, registered in
`background/commands/source.ts` under category id `automations`) exposes user
scripts in the palette. Full feature behavior lives in
[user-scripts.md](../user-scripts.md); this catalog covers just the rows.

| Command | Id | Type | Behavior |
| --- | --- | --- | --- |
| Automations | `user-scripts` | `group` (deep search, `settingsCatalog.includeChildren`) | Lists stored scripts as child rows (below). Empty state is a display row pointing at Create Automation. |
| Create Automation | `create-user-script` | `action` | Opens the options builder at `#/automations/new`. |
| Manage Automations | `manage-user-scripts` | `action` | Opens the options list at `#/automations`. |

## Generated child rows

Each stored script maps to a durable child of the Automations group:

- **Manual-trigger scripts** → `action` nodes with id `userscript-<uuid>`,
  `actionLabel: "Run Automation"`, cmd-modifier **Edit in Options**, the
  script's own icon/color/urlRules, and
  `keybindingRequirements: { requireNonShiftModifier: true }` when any step
  types into the page (`fill`/`type`/`insertSnippet`).
- **Manual triggers with parameters** → a `group` of `input` nodes plus a
  `submit` ("Run Automation"), the create-snippet form shape; values land in
  interpolation as `{{params.<id>}}`.
- **Enabled event-only scripts** → `display` rows ("Runs automatically —
  manage it in Options").
- **Disabled scripts** → no palette row (still listed in the options page).

Because ids are stable UUIDs, child rows are durable: favorites, hide,
keybindings (keyboard settings page), and per-command URL-rule overrides all
attach through the normal `CommandSettings` machinery.

## Manual checks

- Run a script row from both palette modes; confirm the engine targets the
  page tab (and refuses the new-tab page).
- Assign a shortcut to a typing script: capture must require a non-shift
  modifier and the binding must fire while an input is focused.
- Cmd-enter on a script row opens the options editor for that script.
