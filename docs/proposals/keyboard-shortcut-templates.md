# Keyboard Shortcut Templates

Status: Proposal.

## Problem

The Keyboard settings page lets users edit shortcuts one command at a time. A
user who wants a coherent Vim-style layout has to discover commands, assign
bindings manually, and avoid collisions by hand. We need a template flow that
previews a complete shortcut set before saving and makes clear which rows are
available now, which require proposed features, and which existing custom
bindings would be affected.

## Proposed Design

Add a `Use Template` button to the Keyboard settings page header. Selecting it
opens a modal with:

- A left side panel listing templates.
- A main panel showing the selected template's command rows.
- A footer with `Override custom keybindings` above `Cancel` and `Save`.

Initial templates:

| Template | Purpose |
| --- | --- |
| `Default` | Restore Monocle's built-in defaults by clearing custom keybindings. |
| `Vim` | Apply the Vim/Vimium/Tridactyl-inspired shortcut set described by these proposals. |

The Vim template must show enabled and pending rows:

- Enabled rows are commands that exist today or are implemented by actionable
  missing-feature proposals.
- Pending rows are disabled in the preview, link to the proposal that enables
  them, and are never saved until their dependency exists.
- No-go features are omitted from the template and referenced through
  [Features we will not build](./wont-do-vim-browser-features.md).

## Template Model

Use static templates keyed by id.

```ts
type KeybindingTemplate = {
  id: "default" | "vim"
  name: string
  description: string
  rows: KeybindingTemplateRow[]
}

type KeybindingTemplateRow = {
  commandId: string
  keybinding?: string
  status: "enabled" | "pending"
  dependency?: string
}
```

`Default` may be generated from the settings catalog rather than enumerated: it
means "remove custom keybindings so default keybindings apply again."

`Vim` is static and should contain ready rows plus pending rows linked to:

- [Open command pages from keybindings](./open-command-pages-from-keybindings.md)
- [Vim-style browser shortcuts](./vim-style-browser-shortcuts.md)
- [Page scroll shortcuts](./page-scroll-shortcuts.md)
- [URL navigation and copy commands](./url-navigation-and-copy-commands.md)

## Preview Behavior

Each row should show:

- Command identity and category.
- Current keybinding.
- Template keybinding.
- Current source: custom, default, or unbound.
- Status: enabled, pending, skipped because custom binding is protected, or
  conflict.
- Dependency link for pending rows.

Commands with custom keybindings must be visible. With `Override custom
keybindings` unchecked, those rows are marked as kept and are not changed on
save. With the checkbox checked, those rows are changed by the template.

## Save Behavior

- `Override custom keybindings` unchecked:
  - Do not change commands that currently have `settings.keybinding`.
  - Apply enabled Vim rows only to commands without custom bindings.
  - For `Default`, only clear keybindings for commands selected by the template
    that do not have custom bindings, which means no-op for most custom rows.
- `Override custom keybindings` checked:
  - Vim overwrites custom keybindings for enabled rows.
  - Default clears custom keybindings so built-in defaults return.
- Pending rows are preview-only and never included in the save payload.
- Save should use the existing command keybinding update path so validation,
  conflict handling, and registry refresh stay centralized.

## Initial Vim Template Rows

Ready rows can include existing commands:

| Command | Keybinding |
| --- | --- |
| Go Back | `<shift-h>` |
| Go Forward | `<shift-l>` |
| Reload current tab | `r` |
| Open new tab | `t` |
| Duplicate current tab | `y, t` |
| Reopen Last Closed Tab | `<shift-x>` |
| Move tab left | `<shift-,>, <shift-,>` |
| Move tab right | `<shift-.>, <shift-.>` |
| Move this tab to a new window | `<shift-w>` |
| Pin / Unpin current tab | `<alt-p>` |
| Mute / Unmute current tab | `<alt-m>` |
| Scroll to top | `g, g` |
| Scroll to bottom | `<shift-g>` |
| Toggle Reader Mode | `g, r` |

Pending rows should include Add Bookmark, tab next/previous/first/last, audible
tab, hard reload, stop load, line/page/horizontal scrolling, URL hierarchy,
URL-number mutation, view source, clipboard URL open, and top-level copy
variants. Each pending row must link to the proposal that owns the capability.

## Success Criteria

- Users can preview Default and Vim before saving.
- Users can see which template rows would modify custom keybindings.
- Saving with override unchecked preserves custom keybindings.
- Saving with override checked applies enabled template rows and never saves
  pending rows.
- The Vim template links every pending row to an actionable proposal.

## Tests

- Component test for template modal template switching and row rendering.
- Save test with override unchecked preserves custom keybindings.
- Save test with override checked updates custom keybindings for Vim.
- Save test for Default clears custom keybindings when override is checked.
- Pending-row test verifies disabled rows are not included in save requests.
