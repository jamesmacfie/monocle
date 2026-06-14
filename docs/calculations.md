# Calculations

Inline **calculations** parse the live palette query and render a result row
*under the search input* — `1 + 89` → `90`, `1 mile in km` → `1.6093 km`,
`time in Auckland` → the current time there. The result stays in the palette's
keyboard-navigation path (arrow to it, **Enter copies** its value, arrow past it
to the command results below). Calculations are the first place Monocle renders
custom, non-list-row content inside the palette, and they do so through a shared
declarative content schema and renderer that richer Surfaces will reuse.

This doc describes verified behavior. The original design direction is
[v_next/11-calculations.md](./v_next/11-calculations.md).

## The shared content-block schema

`shared/types/content.ts` defines `ContentBlock`, a closed discriminated union —
`code`, `keyValue`, `markdown`, `image`. It is validated at the
background→UI boundary by `ContentBlockSchema` / `validateContentBlocks`
(`shared/types/contentValidation.ts`). One generic renderer,
`shared/components/ContentBlocks/` (`ContentBlocks`), turns a validated
`ContentBlock[]` into React, themed entirely through Monocle's semantic tokens
so it renders identically in the closed content shadow root and in normal
new-tab/options DOM. It is built on the shared component boundary
`shared/components/ui/` (`cn`), the seed of the shadcn/ui consolidation in
[v_next/10-shadcn.md](./v_next/10-shadcn.md).

The constraint is the same one Surfaces lives under: content is a **closed,
validated schema rendered by Monocle components — never author-supplied markup**.
A calculation cannot emit HTML; it emits blocks. In v1 the `markdown` block is
rendered as escaped plain text (no markdown parser dependency yet); blocks are
display-only and never capture focus, so a block stack hosted in a cmdk row
stays a single selectable unit.

## The provider registry

`background/calculations/` is a background-owned registry, a sibling to
`background/features/`. A provider (`CalculationProvider` in `types.ts`) is data
plus one pure function:

- `parse(query, context)` is **synchronous, local, and side-effect-free** — no
  network, no permissions, no `await`. It returns `null` when it cannot parse
  the query (the common case) and a `CalculationResult` when it can.
- `CalculationResult` separates **display value** (`content: ContentBlock[]`,
  what the user sees) from **copy value** (`copyValue: string`, what Enter puts
  on the clipboard), so a rich display never dictates a messy clipboard string.
- `priority` orders rows when several providers match.

`runCalculationProviders(query, context)` (`index.ts`) runs every provider,
drops `null`s, orders by descending priority, validates each result's content,
and maps them to ephemeral `calculation` suggestions. A query no provider parses
yields `[]` — fail-quiet by design (an invalid block array also renders nothing
rather than throwing).

### Shipped providers

| Provider | Example | Result | Engine |
| --- | --- | --- | --- |
| Math (`providers/math.ts`) | `1 + 89`, `sqrt(16)` | `keyValue` `1 + 89 → 90` | mathjs |
| Units (`providers/units.ts`) | `1 mile in km`, `5 km to miles` | `keyValue` `1 mile → 1.6093 km` | mathjs |
| Time (`providers/time.ts`) | `time in Auckland` | `keyValue` `Auckland → 3:00 PM` | `Intl.DateTimeFormat` |

- **Math** emits only when the query looks like an expression (contains an
  operator or a function call) and mathjs evaluates it to a finite number — bare
  numbers and words are not echoed back.
- **Units** runs only for the conversion shape `<expr> in|to <unit>` and emits
  only when mathjs returns a `Unit`. The query is split on the **last** `in`/`to`
  keyword (so a trailing inch `in` on the source is never mistaken for the
  keyword) and the source side is normalized so the natural height/body-weight
  notations work: a small alias pre-pass maps informal names
  (`kms`→`km`, `lbs`→`lb`, `pounds`→`lb`, `st`→`stone`, …), foot/inch symbols
  expand (`5'10"`→`5 ft 10 in`, straight and smart quotes), and adjacent
  value-unit groups are summed with `+` (`5 ft 10 in`, `6 stone 4 lb`) since
  mathjs requires it. The result row labels the source exactly as typed
  (`5'10"` → `177.8 cm`).
- **Time** matches `time in <place>` and resolves the place to an IANA zone by
  the last path segment of `Intl.supportedValuesOf("timeZone")`
  ("Auckland" → "Pacific/Auckland"), formatting the current time at parse moment.
  A live-updating clock is future work.

mathjs lives in the **background bundle only** (providers run inside
`handleSearchCommands`); it is never injected into pages. The shared instance
(`mathInstance.ts`) is hardened per mathjs' injection-safety guidance: `import`,
`createUnit`, `evaluate`, `parse`, `simplify`, and `derivative` are disabled so
an expression can never nest them. Because that override also replaces the
top-level `math.evaluate` API, the module captures the real evaluator *before*
hardening and exports it as `evaluate`.

## Wiring — no new message

Calculations ride the existing root search flow. `handleSearchCommands`
(`background/messages/searchCommands.ts`) already runs on every keystroke; on the
root (non-empty-query) path it calls `runCalculationProviders` against the raw
query and **prepends** the results to the ranked command suggestions. Child
pages have their own scoped search and never run calculations.

Calculation rows are ephemeral: they are not commands, so they are excluded from
favorites, usage ranking, and the search index — they exist only in the response
for the current query.

## The `calculation` suggestion and copy-on-select

`CalculationSuggestion` (`shared/types/ui.ts`) carries `content`, `copyValue`,
and `providerId`. The `CommandItem` dispatcher
(`shared/components/Command/CommandItem/`) renders it via `CommandItemCalculation`
inside a real cmdk `Command.Item` with a stable `value`, which keeps it in the
navigation path. `useActionLabel` shows **Copy** in the footer when a calculation
row is focused.

On select, `selectCommand` (`shared/hooks/useCommandNavigation.tsx`) branches on
`type === "calculation"`: it copies `copyValue` via `useCopyToClipboard`
(`navigator.clipboard.writeText`, a permitted action under the Enter user
gesture) and toasts success via `useToast` — **copy-and-stay**, so the palette
stays open for the user to refine the query. No command executor runs and no
executable function crosses the boundary.

## Lockstep

The `ContentBlock` schema + its Zod validation + the `ContentBlocks` renderer +
the `calculation` suggestion type + the providers land together with tests
(`background/calculations/calculations.test.ts`,
`shared/types/contentValidation.test.ts`,
`shared/components/ContentBlocks/ContentBlocks.dom.test.tsx`). Unlike the
workflow vocabulary, an unparseable query is fail-quiet — it simply yields no
row.

## Manual checks

In both the content overlay and new-tab mode:

- `1 + 89` shows `90`; arrow-down focuses the row, Enter copies `90` and toasts,
  arrow-down again moves past it into the command results.
- `5 km in miles` shows a units row; `time in Auckland` shows a time row.
- A non-matching query (e.g. `gmail`) shows no calculation row.

## Future work

- **Async providers** (live currency / FX) need a loading row updated via a push
  channel; kept out of v1 to preserve the synchronous-local `parse` contract.
- **Live-updating** results (a ticking clock).
- **Full sanitized markdown** rendering for the `markdown` block.
- Other commands emitting inline structured rows once the pattern proves out.
