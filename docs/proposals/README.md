# Proposals

This directory contains future-design proposals for Monocle. These docs are not
verified current behavior. When a proposal is implemented, update the relevant
feature docs outside this directory and keep the proposal only as historical
context or remove it.

## Vim-style shortcut proposals

- [Open command pages from keybindings](./open-command-pages-from-keybindings.md)
  — command metadata for shortcuts that open the palette at a command page or
  form instead of executing immediately.
- [Keyboard shortcut templates](./keyboard-shortcut-templates.md) — Keyboard
  settings page template picker with `Default` and `Vim` templates.
- [Vim-style browser shortcuts](./vim-style-browser-shortcuts.md) — browser and
  tab commands that can support Vim/Vimium/Tridactyl-style bindings.
- [Page scroll shortcuts](./page-scroll-shortcuts.md) — fine-grained page
  scrolling commands and keybindings.
- [URL navigation and copy commands](./url-navigation-and-copy-commands.md) —
  URL hierarchy, URL number mutation, view-source, and copy variants.
- [Features we will not build](./wont-do-vim-browser-features.md) — consolidated
  no-go decisions for broad Vim-browser features that do not fit Monocle.

## Proposal rules

- Keep proposals explicit about what is future design, not shipped behavior.
- Link dependent proposals instead of duplicating the same design in multiple
  files.
- When a proposal lands in code, update the verified docs first, then adjust or
  archive the proposal.
