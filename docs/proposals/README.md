# Proposals

This directory contains future-design proposals for Monocle. These docs are not
verified current behavior. When a proposal is implemented, update the relevant
feature docs outside this directory and keep the proposal only as historical
context or remove it.

## Active proposals

_None right now._

## Decision records

- [Features we will not build](./wont-do-vim-browser-features.md) — consolidated
  no-go decisions for broad Vim-browser features that do not fit Monocle.

## Shipped (proposals removed)

The Vim-style shortcut proposals have all landed; their proposal docs were
removed once implemented (per the rules below). Verified behavior now lives in
the feature docs:

- Open command pages from keybindings (`keybindingBehavior`) → see
  [../keybindings.md](../keybindings.md) and [../command-schema.md](../command-schema.md).
- Keyboard shortcut templates (Default/Vim picker) → see
  [../keybindings.md](../keybindings.md).
- Vim-style browser/tab shortcuts, page scroll shortcuts, and URL
  navigation/copy commands → see [../commands/browser.md](../commands/browser.md).

## Proposal rules

- Keep proposals explicit about what is future design, not shipped behavior.
- Link dependent proposals instead of duplicating the same design in multiple
  files.
- When a proposal lands in code, update the verified docs first, then adjust or
  archive the proposal.
