# Provider refactor: a shared external-command provider

> **Status: proposed — not built.** See [README.md](./README.md). This doc
> describes a refactor of existing, working code (the site SDK). The refactor is
> a prerequisite for the extension-to-extension feature and must land as a
> self-contained, behavior-preserving change *before* the new feature is built.

## Why refactor instead of copy

The site SDK already does the hard part of this feature. Look at what
`background/commands/siteSdk/commands.ts` actually contains:

- `convertCommand` — the per-node-type conversion (action/submit/group/search/
  input/display) from a declarative command into a background-owned `CommandNode`.
- `toInternalCommandId` — id encoding (`<prefix>:<scopeHash>:<registrationId>:<path>`).
- `validateCallbackCommands` — re-validation of untrusted callback-returned
  children/results.
- `invokeSiteSdk` — the **only** transport-specific piece (it calls
  `sendTabMessage(scope.tabId, …)`).

And `shared/types/siteSdk.ts` contains the declarative schema
(`SiteSdkCommand` union, `FormField` subset, icon/color/url validation, the
`CallbackRefSchema`, and the tree-level caps check `visitCommands` —
depth/count/duplicate/reserved).

Of all that, **only `invokeSiteSdk` and the scope/origin specifics are
site-specific.** The extension feature needs the exact same conversion, the exact
same schema, the exact same caps, and the exact same callback re-validation — it
just round-trips to a peer extension instead of a page. Copying it would create
two near-identical codebases to keep in sync (this is the "directional-twin
dedup" already flagged as deferred tech debt). So we extract.

## Target shape

### 1. `shared/types/externalCommands.ts` (extracted schema)

Move the declarative command model out of `siteSdk.ts`:

- `ExternalCommand` union (action/submit/group/search/input/display) — today's
  `SiteSdkCommand` with the site-specific `placement` field pulled out as an
  adapter-supplied extension (see below).
- `ExternalCommandBase`, the `FormField` subset (`ExternalCommandFormField`), the
  icon/color/url/keyword/execution-payload schemas, and `CallbackRefSchema`.
- `validateExternalCommandList(input, options)` and the tree-walker
  `visitCommands` (depth/count/duplicate/reserved id checks) — verbatim, with the
  caps (`MAX_COMMANDS`, `MAX_DEPTH`) as parameters so each adapter can keep its
  own limits.
- The reserved-id check stays shared (it guards against colliding with Monocle's
  generated-action prefixes/suffixes — `GENERATED_ACTION_PREFIXES/SUFFIXES`).

`placement` ("root" vs grouped) is a site-SDK concept. Keep it adapter-specific:
the shared schema accepts an optional, adapter-declared extra-fields object, or
the site adapter extends the base with `placement` in its own thin schema. Either
way the shared core does not hard-code `placement`.

`shared/types/siteSdk.ts` then **re-exports** the shared types under its existing
`SiteSdk*` names (or is updated to import them) so nothing else in the codebase
breaks. The site SDK's public surface (`window.Monocle` types) is unchanged.

### 2. `background/commands/externalProvider/` (extracted engine)

A new folder holding the transport-agnostic conversion:

```text
externalProvider/
  index.ts        // createExternalRootCommands(entry, adapter)
  convert.ts      // convertCommand + per-type branches (was siteSdk/commands.ts core)
  ids.ts          // id encoding/decoding, isExternalCommandId(prefix)
  types.ts        // ExternalProviderAdapter, ExternalRegistryEntry
```

The engine is parameterised over an **adapter**:

```ts
// background/commands/externalProvider/types.ts
type ExternalProviderAdapter = {
  // Owner-id prefix, e.g. "site:" or "extension:".
  idPrefix: string
  // Stable scope token baked into ids (origin hash for sites, extId for peers).
  scopeId: (entry: ExternalRegistryEntry) => string
  // The transport seam — the ONLY behavioral difference between site/extension.
  invoke: (
    entry: ExternalRegistryEntry,
    request: ExternalInvokeRequest,
  ) => Promise<ExternalCommand[] | undefined>
  // Default Browser.Context to synthesize when one is absent (site: scope url;
  // extension: active-tab context or a neutral context).
  fallbackContext: (entry: ExternalRegistryEntry) => Browser.Context
  // Optional: how to place root-vs-grouped commands (site uses `placement`).
  partitionRoot?: (commands: ExternalCommand[]) => {
    root: ExternalCommand[]
    grouped: ExternalCommand[]
  }
}
```

`convertCommand` becomes the same code that exists today, but every
`invokeSiteSdk(context.scope, …)` call becomes `adapter.invoke(entry, …)`, and
every `context.scope.url/title` fallback becomes
`adapter.fallbackContext(entry)`. The returned-command re-validation
(`validateCallbackCommands` → `validateExternalCommandList`) is shared.

### 3. `siteSdk` becomes a thin adapter

`background/commands/siteSdk/` keeps only what is genuinely site-specific:

- `scope.ts` — deriving the tab/document/origin scope from a message sender
  (unchanged).
- `registry.ts` — the **session** registry keyed by scope (unchanged).
- A new small `adapter.ts` supplying `ExternalProviderAdapter`:
  - `idPrefix: "site:"`
  - `scopeId: (entry) => hashSiteSdkOrigin(entry.scope.origin)`
  - `invoke: (entry, request) => invokeSiteSdk(entry.scope, request)` (the
    existing `sendTabMessage` round-trip)
  - `fallbackContext: (entry) => ({ url: entry.scope.url, title: entry.scope.title, modifierKey: null })`
  - `partitionRoot` implementing today's `placement === "root"` split.
- `createSiteSdkRootCommands` becomes a one-liner delegating to
  `createExternalRootCommands(entry, siteAdapter)`.

`isSiteSdkCommandId` stays as `isExternalCommandId("site:")`.

### 4. `extensionSdk` is the new adapter

`background/commands/extensionSdk/` (the new feature) supplies the other adapter:

- `idPrefix: "extension:"`
- `scopeId: (entry) => entry.extId`
- `invoke: (entry, request) => invokeExtension(entry.extId, request)` — the
  cross-extension `chrome.runtime.connect(extId)` round-trip.
- `fallbackContext` — the active tab's context, or a neutral
  `{url:"", title:"", modifierKey:null}` when none.
- no `partitionRoot` (extensions don't use `placement`; everything lives under a
  generated per-peer group, or a peer may flag root placement — a v1 decision
  documented in [command-schema.md](./command-schema.md)).

Plus its **durable** registry and the settings feature module — see
[extension-integration.md](./extension-integration.md).

## What stays identical (and therefore must not regress)

- The six node-type branches and which fields each preserves.
- `allowCustomKeybinding: false` forced on all converted commands (external
  commands must not claim global keybindings at registration; the *user* can
  still assign one later through settings, keyed by id).
- `settingsCatalog.configurable: false`.
- Callback-returned lists re-validated with `allowPlacement: false`.
- The generated per-owner group (`createSiteGroupCommand` → a generalised
  `createOwnerGroupCommand`) for commands not placed at root.

## Migration path (lockstep, behavior-preserving)

This refactor touches working, shipped code, so it lands as **one self-contained
change that preserves site-SDK behavior**, before any extension feature work:

1. Extract `shared/types/externalCommands.ts`; make `siteSdk.ts` re-export from
   it. Run the existing `siteSdk.test.ts` — it must pass unchanged.
2. Extract `background/commands/externalProvider/`; rewrite `siteSdk/commands.ts`
   to build a `siteAdapter` and delegate. `siteSdk.test.ts` passes unchanged.
3. Add provider-level tests in `externalProvider/` (a fake adapter exercising
   each node type + callback re-validation), so the shared engine has its own
   coverage independent of the site transport.
4. **Only then** build `extensionSdk` as a second adapter (its own tests).

Test parity is the acceptance bar for steps 1–2: the refactor is correct iff the
full existing suite (`pnpm test`) is green with no test edits beyond import-path
moves. This matches Monocle's lockstep invariant for shared-vocabulary changes
(schema + engine + tests land together).

## Files touched by the refactor

- New: `shared/types/externalCommands.ts`,
  `background/commands/externalProvider/{index,convert,ids,types}.ts` (+ tests).
- Edited: `shared/types/siteSdk.ts` (re-export/import the shared schema),
  `background/commands/siteSdk/commands.ts` (delegate to the engine via an
  adapter), `shared/types/index.ts` (barrel exports).
- Unchanged behavior: `background/commands/siteSdk/{scope,registry,index}.ts`,
  the content bridge, and `entrypoints/site-sdk.content.ts`.

## Risk: don't over-abstract

The adapter has exactly five members and they map 1:1 to the only real
differences (prefix, scope token, transport, fallback context, root placement).
Resist adding adapter hooks "for later" — a peer that needs a genuinely new
capability is a schema change in the shared layer, not an adapter knob. The goal
is dedup, not a plugin framework.
</content>
