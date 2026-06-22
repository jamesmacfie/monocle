# Features (Feature-Module Registry)

> **Status: implemented (first feature: Focus Mode).** The registry, the
> `monocle-feature-config` / `monocle-feature-state` stores, the generic
> `monocle-features-get` / `monocle-feature-config-update` / `monocle-feature-action-execute` messages,
> the options Features pages, and page UI via the generic
> [Surfaces primitive](./surfaces.md) are all live. Focus Mode is the first
> consumer ([focus-mode.md](./focus-mode.md)); the registry now also hosts Tab
> Groups, Element Hider, the Native Bridge (native-messaging), and the Extension
> Registry.

Monocle's command model is built for one-shot palette actions: a `CommandNode`
is background-owned, the UI receives `Suggestion`s, and per-command persistence
is limited to `CommandSettings` (`keybinding` / `hidden` / `urlRules`). A
**feature** contributes several palette commands, owns a **typed config +
settings page**, keeps **runtime state**, and renders **its own
content/new-tab UI**. The Feature-module registry is the composition layer for
those capabilities.

Rule of thumb: **a command that needs a rich settings page or persistent
runtime state is a feature, not a command.** Authoring a one-shot action stays
in [authoring-commands.md](./authoring-commands.md).

---

## What a feature owns

A `FeatureModule` (background-only — it holds functions and a Zod schema, so it
never crosses into shared UI types) is defined in `background/features/types.ts`:

```ts
type FeatureModule<TConfig> = {
  id: string                 // stable, kebab-case (e.g. "focus-mode")
  name: string
  description?: string
  icon?: CommandIcon
  // Palette contribution. Sync so it composes into the sync command loader;
  // runtime state shows through async name/description resolvers, not here.
  commands: (context: Browser.Context) => CommandNode[]
  // Declarative settings page (optional).
  settings?: {
    schema: FeatureSettingsSchema          // sections of FormField + actions
    configSchema: ZodType<TConfig>         // validates config at the boundary
    defaults: TConfig
    // Project derived display rows for `record-list` fields, keyed by field id
    // (raw config shape ≠ a row's {id,label,sublabel}). Optional.
    lists?: (config: TConfig) => Record<string, RecordListItem[]> | Promise<…>
    // ctx carries an optional `payload` (record-list row data: itemId/childId/
    // value/scalars) so one handler serves both global and per-row actions.
    handleAction?: (actionId, ctx) => Promise<void> | void
    // Called after a validated config is persisted, so the feature can react
    // (e.g. re-project surfaces). Focus Mode uses this to re-evaluate its
    // blocklist live. Optional.
    onConfigChange?: (config: TConfig) => Promise<void> | void
  }
  // Startup lifecycle: re-arm alarms / listeners after a SW restart.
  init?: () => void | Promise<void>
  // Read-only automations PROJECTED from this feature's config (optional). They
  // flow through the shared automation engine/trigger system — see below.
  automations?: (config: TConfig) => Automation[] | Promise<Automation[]>
}
```

The UI never sees a `FeatureModule`. The background projects it to a
**`FeatureDescriptor`** (data only) defined in `shared/types/feature.ts`:

```ts
type FeatureSettingsSchema = {
  sections: Array<{ title?: string; description?: string; fields: FormField[] }>
  actions?: Array<{ id: string; label: string; style?: "default" | "primary" | "danger" }>
}

type FeatureDescriptor = {
  id: string
  name: string
  description?: string
  icon?: CommandIcon
  schema?: FeatureSettingsSchema
  config: Record<string, unknown>   // persisted config merged over defaults
  lists?: Record<string, RecordListItem[]>  // derived rows for record-list fields
  hasSettings: boolean
  hiddenFromFeaturesPage?: boolean   // managed on a bespoke page instead (e.g. Integrations)
}
```

A feature may set `hiddenFromFeaturesPage: true` (mirrored onto the descriptor)
when its UI lives on a **bespoke** settings page rather than the generic Features
list. The Native Bridge does this — its pending requests, code entry, connected
apps, and enable/allow-execution toggles render on the **Integrations** page
(`options/pages/IntegrationsPage.tsx`, driven by `options/integrations/providers.ts`),
reusing the same `monocle-feature-config-update` / `monocle-feature-action-execute`
messages. The module still registers commands/config/lifecycle normally; only the
generic Features page skips it. See
[settings-page.md](./settings-page.md) and [native-messaging/](./native-messaging/).

`FeatureSettingsSchema` **reuses the existing `FormField` union**
(`shared/types/ui.ts`) — `text-list`, `switch`, `number`, `text`, `select`, …
— rather than inventing a second field vocabulary. A blocklist is a `text-list`
field with URL `validation`. (The palette's `CommandItem/*` renderers are
CMDK list items and are *not* reusable on the options form, so the options page
ships its own `SchemaForm` renderer — see below.)

### `record-list` — a managed list of feature-owned records

For features that manage a growing list of records (Tab Groups' saved
collections), the `record-list` `FormField` variant renders that list with
**per-row action buttons** — something flat fields + global `actions` can't
express. It is the one field type whose data is *not* draft-edited:

- Rows come from `descriptor.lists[field.id]` (projected by `settings.lists`),
  not from `config[field.id]` — so the stored shape (`{ id, name, tabs, … }`)
  stays independent of the row shape (`{ id, label, sublabel, children? }`).
- The field declares `itemActions` (group-row buttons) and optional
  `childActions` (per-child buttons; rows with `children` expand). An action
  with `editLabel: true` opens an inline editor and dispatches with
  `payload.value` (e.g. Rename); others dispatch immediately.
- Each button fires `monocle-feature-action-execute` with a `payload` identifying the
  row — `{ itemId }` for a group, `{ itemId, childId }` for a child, plus
  `value`/scalars. The feature's `handleAction` reads `ctx.payload` and mutates
  config (delete/rename/pin) or does runtime work (restore). The handler returns
  the **re-projected descriptor** so `SchemaForm` refreshes rows without a full
  reload. `record-list` config values are preserved verbatim through Save (they
  are owned by row actions, not the draft).

Tab Groups (`background/features/tabGroups/`) is the first consumer; see
[commands/features.md](./commands/features.md).

### Feature-owned automations

A feature can contribute **page-load (and other-trigger) behavior** without any
new runtime: the optional `automations(config)` hook **projects** read-only
`Automation` documents from the feature's config, and they flow through the
existing automation engine and trigger system (see
[automations.md](./automations.md)).

- **Projected, never stored.** The hook recomputes from current config on every
  read; the config is the single source of truth. (This mirrors how Focus Mode
  projects *surfaces* rather than persisting them.) The merge happens in
  `background/automations/registry.ts` (`getAllAutomations` / `getAutomationById`),
  which the engine, trigger engine, alarm sync, and options listing read from.
  The automation storage mutators are untouched — feature documents never enter
  `monocle-automations`, and `addAutomation` rejects a feature-owned draft.
- **Tagged + deterministic.** Each projected doc carries
  `owner: { kind: "feature", featureId }` and a stable id
  (`featureAutomationId(featureId, key)` → `feature:<id>:<key>`, which cannot
  collide with the UUIDs of stored user docs). Each must validate against
  `AutomationSchema`.
- **Read-only in the UI.** The Automations options page partitions on
  `isFeatureAutomation` and lists feature automations under "Managed by features"
  with a link back to the feature's settings — no edit/delete/toggle. They are
  also **excluded from palette command generation** (the feature owns its own
  commands).
- Element Hider (`background/features/elementHider/`,
  [element-hider.md](./element-hider.md)) is the first consumer: it projects one
  `elementAppears` automation per saved rule, scoped by the rule's URL pattern,
  whose single step `hideElement`s the selector.

---

## Three stores, three lifecycles

Feature data is kept deliberately separate from command settings so the
lifecycles never bleed into each other:

| Store | Owner | Holds | Lifecycle |
| --- | --- | --- | --- |
| `monocle-settings` → `commands[id]` | `background/commands/settings.ts` | per-command `keybinding`/`hidden`/`urlRules` | **unchanged by features** |
| `monocle-feature-config` | `background/features/config.ts` | durable user config per feature (e.g. the blocklist) | exported/synced; survives forever |
| `monocle-feature-state` | `background/features/state.ts` | runtime state per feature (e.g. the active focus session) | transient; cleared when the session ends |

This is the central data-model decision: durable user config (you'd export it)
must not live in the same blob as transient runtime state (a running session).
Config is keyed by feature id and **replace-whole** on write (the settings page
is its single writer, so no merge-branch complexity like `urlRules` needs).
Both stores use `withStorageLock` (`background/utils/storageMutex.ts`).

---

## The multi-runtime split (be honest about it)

A feature spans runtimes, and the registry is explicit about which runtime owns
what:

- **Background** is the source of truth: `background/features/` holds the
  registry, the two stores, command contribution, config validation, runtime
  state, and lifecycle (`init`). Feature-specific runtime queries are plain
  background messages — the registry is *not* a message router.
- **Content / new-tab UI** is rendered through shared, generic primitives, not
  per-feature components. A feature that needs page UI pushes declarative
  [surfaces](./surfaces.md) (overlays/badges) into the background-owned surfaces
  store; the one generic `SurfaceHost` (mounted in the closed content shadow
  root and on the new tab) renders them. A feature does not ship its own content
  React components — Focus Mode has zero content/new-tab code.

This keeps the background-ownership contract intact: features produce data
(commands, config, surfaces); shared hosts render it.

---

## Data flow

**Command contribution.** `background/commands/source.ts` adds
`getFeatureCommands(context)` to the loaded entries under a new `features`
category, alongside the existing static category arrays. Existing commands are
untouched — the registry is **additive**.

**Settings page.**

1. Options app dispatches `loadFeatures` → `monocle-features-get` →
   `getFeatureDescriptors()` projects each feature (schema + config merged over
   defaults).
2. `options/components/SchemaForm.tsx` renders the schema with options-page
   primitives (one control per `FormField` variant) and renders `actions` as
   buttons.
3. Save dispatches `updateFeatureConfig` → `monocle-feature-config-update` → the handler
   validates the payload against the feature's `configSchema` and persists
   (replace-whole), then calls the feature's optional `onConfigChange(config)`
   so it can react to the new config (Focus Mode re-projects its surfaces here
   so blocklist edits take effect live). An action button dispatches
   `executeFeatureAction` → `monocle-feature-action-execute` → `handleAction`.
4. `OptionsApp` re-hydrates on `storage.onChanged` for `monocle-feature-config`.

Because the settings page loads from the **feature descriptor** (not a resolved
command), it is reachable even when the feature's commands are URL-filtered or
hidden.

**Configure command.** Features expose a "Configure {name}" command via the
shared helper `createConfigureFeatureCommand(featureId, name)`
(`background/features/configureCommand.ts`), which opens the options page at
`#/features/<id>`. It's a shared helper rather than registry magic so a feature's
palette surface stays explicit and greppable.

---

## Messages

Generic feature messages (router: `background/messages/index.ts`; types in
`shared/types/messaging.ts`; Zod in `shared/types/validation.ts`):

| Message | Direction | Payload | Response |
| --- | --- | --- | --- |
| `monocle-features-get` | UI → bg | — | `{ features: FeatureDescriptor[] }` |
| `monocle-feature-config-update` | UI → bg | `{ featureId, config }` | `{ success, config }` |
| `monocle-feature-action-execute` | UI → bg | `{ featureId, actionId, context?, payload? }` | `{ success, feature? }` |

`payload` (scalar map) carries `record-list` row data (`itemId`/`childId`/
`value`/…). The response includes the **re-projected `feature`** descriptor so a
row action's effect on config (and its derived `lists`) shows in the UI without
a reload.

A feature that needs page UI pushes [surfaces](./surfaces.md) into the surfaces
store rather than defining its own messages — the generic `monocle-surfaces-get` query
and `monocle-surfaces-changed` broadcast cover rendering. A feature adds a
bespoke message only when it has genuinely feature-specific runtime state to
expose; such messages live with the feature, not in the registry contract.

---

## Adding a feature

1. Create `background/features/<id>/` with an `index.ts` exporting a
   `FeatureModule`. Put runtime logic in sibling files.
2. Register it in the `features` array in `background/features/index.ts`.
3. If it has settings, define `schema` (FormField sections + actions),
   `configSchema` (Zod), and `defaults`; add a `createConfigureFeatureCommand`
   entry to its `commands()`.
4. Add `init()` if it needs alarms/listeners. The feature owns its own
   `chrome.alarms.onAlarm` listener inside `init()` (filtering by its
   `feature:<id>:…` alarm names) — `background/index.ts` only calls
   `initFeatures()` and does not route per-feature alarms. See
   `background/features/focus/session.ts` (`initFocusSession`).
5. For page UI, push [surfaces](./surfaces.md) from the feature's lifecycle
   (e.g. `setOwnerSurfaces(<id>, …)` on state change) — don't add content/new-tab
   components.
6. Land schema + message + handler + tests together (lockstep), and document the
   feature in its own `docs/<feature>.md`.

---

## Known risks / notes

- `SchemaForm` is new options-page code (palette field renderers can't be
  reused). Grow it lockstep — implement only the `FormField` variants a shipped
  feature uses.
- The registry owns commands/config/state/lifecycle; resist turning it into a
  message router or a cross-runtime renderer.
- Runtime state must not be written into `monocle-feature-config`. Use
  `monocle-feature-state`.
- A full first-class plugin system (third-party features, dynamic registration)
  is explicitly *not* built; the registry is a static array validated by real
  consumers first. Promote to dynamic registration only when a second/third
  feature proves the shape.

## Related docs

- [focus-mode.md](./focus-mode.md) — the first feature.
- [surfaces.md](./surfaces.md) — the declarative overlay/badge primitive features
  render page UI through.
- [settings.md](./settings.md) / [settings-page.md](./settings-page.md) — command
  settings (distinct from feature config) and the options page.
- [command-schema.md](./command-schema.md) — the `FormField` union reused by
  feature settings schemas.
- [messaging.md](./messaging.md) — the full message catalog.
- [architecture.md](./architecture.md) — runtime modes and ownership boundaries.
