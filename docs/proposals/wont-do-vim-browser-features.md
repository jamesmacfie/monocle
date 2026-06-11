# Features We Will Not Build

Status: No-go decisions for the current Vim-style shortcut direction.

## Rationale

Monocle is a command palette with browser commands, contextual commands, and
select content-side helpers. It is not intended to become a full Vim browser
emulation layer. The Vim template should include browser-command shortcuts that
fit Monocle's architecture and omit features that require a separate mode
system, hint engine, native host, or broad page mutation model.

## No-Go Features

| Feature | Decision |
| --- | --- |
| Link discovery and hint modes | Do not build. A robust hint engine needs page-wide target discovery, overlay rendering, target ranking, many action variants, iframe handling, and site-specific exceptions. |
| Extended image/link hint actions | Do not build. Copying, saving, deleting, opening, or external-tooling arbitrary hinted elements belongs to a hint subsystem, which is out of scope. |
| Quickmarks, marks, and jump marks | Do not build. These require a new storage model, mark namespace, modeful multi-key capture, and page-position tracking. |
| Command/input/ex mode | Do not build. Monocle's palette is the command surface; an ex interpreter would duplicate and bypass the command model. |
| Repeat last command | Do not build. Repeatability needs command idempotency metadata, safety rules, form-value replay, and permission/context revalidation. |
| Direct shortcut bindings for generated modifier actions | Do not build. Generated modifier actions are an action-menu implementation detail. Add explicit wrapper commands for selected high-value behavior such as hard reload instead. |
| Homepage commands and homepage settings | Do not build. Browser homepage behavior is outside Monocle's command model and would introduce another settings domain. |
| Prefix counts | Do not build. Count prefixes require a different key parser, delayed execution model, command repeat metadata, and confirmation policy. |
| Visual mode and text selection editing | Do not build. Selection-mode state and text-object editing are a separate content-side mode system. |
| Page text transformations | Do not build. ROT13, jumble, and similar page mutations are novelty page-editing commands, not core browser operations. |
| Native-messenger actions | Do not build. Edit-in-editor, shell commands, and external players require a native host and a larger security/release story. |
| Destructive close shortcuts | Do not build under the Vim template. Confirmation-required commands intentionally do not participate in global keybindings. |

## Implication For Templates

The Vim keyboard template should omit these rows entirely. If users ask why a
familiar Vimium or Tridactyl binding is missing, link to this document rather
than adding a disabled template row.

## Success Criteria

- The Vim template contains only ready rows and pending rows tied to actionable
  proposals.
- No-go features are not represented as planned work in proposal docs.
- Future docs that mention these features link back here unless the product
  direction explicitly changes.
