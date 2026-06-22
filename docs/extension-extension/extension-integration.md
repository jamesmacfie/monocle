# Monocle integration

> **Status: implemented (v1).** See [README.md](./README.md) for status + the two v1 divergences (schema reuse, trimmed protocol).

The concrete wiring inside the Monocle extension: the new folders, the feature
module + settings page, the external-message handler, manifest changes, and the
files to touch. It assumes the [provider refactor](./provider-refactor.md) has
landed.

## New folders and files

```text
background/commands/externalProvider/   # shared engine (from the refactor)
background/commands/extensionSdk/
  index.ts        # load approved peers' cached trees → externalProvider
  registry.ts     # DURABLE registry: cached trees keyed by extId + revision
  adapter.ts      # ExternalProviderAdapter: idPrefix "extension:", invoke transport
  transport.ts    # invokeExtension(extId, request) over chrome.runtime.connect
background/features/extensionRegistry/
  index.ts        # FeatureModule: settings page, handleAction, init
  handler.ts      # initExtensionMessaging / handleExternalMessage (onMessageExternal + onConnectExternal)
  store.ts        # durable approved allowlist + transient pending state
  types.ts        # ExternalExtensionsConfig, ApprovedPeer, Zod schema + defaults
  commands.ts     # enable/disable palette commands
shared/types/externalCommands.ts        # shared declarative schema (from the refactor)
```

## The external-message handler

The existing internal handler (`createCrossBrowserMessageHandler` in
`background/utils/runtime.ts`) **rejects every external sender** — that is correct
and must stay. The new feature adds a **separate, deliberately external** handler
registered on the external events:

```ts
// background/features/extensionRegistry/handler.ts  (sketch — initExtensionMessaging)
getBrowserAPI().runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  // 1. validate envelope (ExtRequestSchema)
  // 2. announce  → record pending (any sender.id)         [unauthenticated]
  // 3. everything else → require sender.id ∈ approved allowlist, else `unauthorized`
  // 4. dispatch: register / dispose   (v1 trims ping/pong and a separate update)
})

getBrowserAPI().runtime.onConnectExternal.addListener((port) => {
  // only approved ids; this port carries the invoke RPC replies.
  // Monocle is the initiator of `invoke`; the peer answers here.
})
```

Notes:

- This handler is the authoritative allowlist enforcement point on **both**
  browsers (Firefox has no `externally_connectable` — see
  [registration-and-trust.md](./registration-and-trust.md)).
- `announce` is the one method accepted from any id; it only writes a pending
  entry to `monocle-feature-state`.
- The handler is gated by the master `enabled` flag in the feature config — when
  the feature is off, even `announce` is dropped.
- Registered from `background/index.ts` startup (alongside `initFeatures`,
  `initSurfaces`), not lazily, so a peer that announces early is not missed.

## The transport (Monocle → peer)

`invokeExtension(extId, request)` in `extensionSdk/transport.ts`:

```ts
// opens a port, sends one invoke, waits for the matching id, times out at 3s
const port = getBrowserAPI().runtime.connect(extId, { name: "monocle-ext" })
port.postMessage({ v: 1, id, kind: "invoke", request })
// resolve on port.onMessage where msg.id === id; reject on onDisconnect/timeout
```

This is the `adapter.invoke` the shared `externalProvider` engine calls — the
analogue of the site SDK's `invokeSiteSdk` (`sendTabMessage`), over a
cross-extension port instead of a tab message. Returned command lists are
re-validated by the engine before conversion.

## The feature module (Extensions settings page)

A `FeatureModule<ExternalExtensionsConfig>` (`background/features/extensionRegistry/`),
following the `nativeMessaging` feature precedent but simpler (no pairing/crypto):

```ts
export const extensionRegistryFeature: FeatureModule<ExternalExtensionsConfig> = {
  id: "external-extensions",
  name: "Extensions",
  description: "Let other browser extensions add commands to Monocle",
  icon: { type: "lucide", name: "Puzzle" },
  commands: () => [ /* enable / disable */ ],
  settings: {
    configSchema: externalExtensionsConfigSchema,   // Zod
    defaults: { enabled: false, approved: [] },
    schema: { sections: [
      { title: "External extensions", fields: [
        { id: "enabled", label: "Allow other extensions to add commands", type: "switch" },
        { id: "pending", label: "Requesting access", type: "record-list",
          emptyText: "No extensions are requesting access.",
          itemActions: [ { id: "approve", label: "Approve", style: "primary" },
                         { id: "dismiss", label: "Dismiss" } ] },
        { id: "approved", label: "Approved extensions", type: "record-list",
          emptyText: "No approved extensions.",
          itemActions: [ { id: "revoke", label: "Revoke", style: "danger" } ] },
      ]},
    ]},
    lists: async (config) => ({
      pending: (await getPendingPeers()).map(p => ({
        id: p.extId, label: p.name, sublabel: `Claimed by ${p.extId}` })),
      approved: config.approved.map(p => ({
        id: p.extId, label: p.name,
        sublabel: p.lastSeenAt ? `Last seen ${new Date(p.lastSeenAt).toLocaleString()}` : "Never seen" })),
    }),
    handleAction: async (actionId, { payload }) => {
      const extId = typeof payload?.itemId === "string" ? payload.itemId : ""
      if (actionId === "approve") await approvePeer(extId)
      if (actionId === "dismiss") await dismissPending(extId)
      if (actionId === "revoke")  await revokePeer(extId)   // + drop tree, prune settings, clear surfaces
    },
    onConfigChange: async (config) => { /* if disabled: drop all trees + surfaces */ },
  },
  init: () => { /* nothing durable to re-arm; pending is transient */ },
}
```

Register it in `background/features/index.ts`'s `features` array. The options
Features page and `/features/external-extensions` route then render it
automatically via the existing `SchemaForm` (`options/components/SchemaForm.tsx`)
and `FeatureSettingsPage.tsx` — no new options-page code.

The `pending`/`approved` `record-list` fields reuse the mechanism the native
bridge uses for its paired-client list (per-row actions dispatched with a scalar
`payload.itemId` to `handleAction`).

### Approval modal (optional)

If you want a confirming dialog rather than a bare button, push a `modal` Surface
owned by the feature (the same primitive the bridge pairing prompt uses) and
render `<SurfaceHost kinds={["modal"]} />` on the feature settings page — exactly
how `FeatureSettingsPage.tsx` conditionally mounts it for `native-messaging`.

## Command loading

`background/commands/source.ts` gains an `extensionSdk` source in
`loadAllCommands`, mirroring the existing `siteSdk` source — but **without** a
per-request sender, because the durable registry does not need one:

```ts
// source.ts (sketch)
const extensionCommands = loadExtensionSdkCommands()   // reads durable registry → externalProvider
// merged like the other categories; converts via commandsToSuggestions as usual
```

Every `register`/`update`/`dispose`/`revoke` calls `invalidateSearchIndex()`,
exactly as `monocle-site-sdk-sync` does.

## Settings reuse (no new per-command storage)

External command ids (`extension:<extId>:…`) are plain strings, so the existing
per-command settings in `background/commands/settings.ts` work unchanged —
keybindings (Keyboard page), URL rules (Manage Allow/Deny List, Hide-from-Domain),
and hidden state (hide-on-site / global-hide), all keyed by id.
(`allowCustomKeybinding` is forced false at *registration* so the peer can't claim
one; the user assigning one later is fine.) On revoke/GC, prune these orphaned
entries using the existing settings prune path.

## Manifest changes (`wxt.config.ts`)

- **Chrome**: add `externally_connectable`. Because peer ids may not be known
  ahead of time, this is broad (`{ "ids": ["*"] }`) with the authoritative check
  in the handler — or, if a curated set is preferred, a configurable id list.
  Document the store-review implication (broad `externally_connectable` may draw
  reviewer questions — cross-link [../store-submission.md](../store-submission.md)).
- **Firefox**: no `externally_connectable` key exists; nothing to add. The
  handler-side allowlist is the only gate.
- **Optional permissions**: `management` (Chrome) for eager uninstall GC —
  requested at feature-enable time via the existing
  `permissions.request()` grant flow (the same `PERMISSIONS_ON_ENABLE` pattern
  `FeatureSettingsPage.tsx` uses for `native-messaging`'s `nativeMessaging`+`tabs`).
  `tabs` if invoke contexts need active-tab url/title beyond `activeTab`.

## Files touched (summary)

| File | Change |
| --- | --- |
| `shared/types/externalCommands.ts` | New — shared declarative schema (refactor) |
| `background/commands/externalProvider/*` | New — shared conversion engine (refactor) |
| `background/commands/siteSdk/*` | Edited — delegate to engine via a site adapter (refactor) |
| `background/commands/extensionSdk/*` | New — durable registry, adapter, transport |
| `background/commands/source.ts` | Edited — load the extensionSdk source |
| `background/features/extensionRegistry/*` | New — feature module + settings + commands + `handler.ts` (onMessageExternal/onConnectExternal) + `store.ts` (allowlist + pending) |
| `background/features/index.ts` | Edited — register the feature |
| `background/index.ts` | Edited — `initExtensionMessaging()` at startup |
| `wxt.config.ts` | Edited — `externally_connectable` (Chrome), optional `management` |
| `shared/types/index.ts` | Edited — barrel exports for the new types |

The feature is `hiddenFromFeaturesPage`; rather than the generic Features page it
surfaces on the bespoke **Integrations** options page (`options/pages/IntegrationsPage.tsx`)
as a second `INTEGRATION_PROVIDERS` entry (`options/integrations/providers.ts`,
`id: "external-extensions"`, `requestsNeedCode: false` → a plain Approve, no code),
beside the native bridge. It reuses the existing `monocle-feature-config-update` /
`monocle-feature-action-execute` paths. No new message types in the *internal*
protocol (`shared/types/messaging.ts`) — the external protocol is its own envelope.

## Related docs

- [../features.md](../features.md) — the feature-module registry and stores.
- [../surfaces.md](../surfaces.md) — the modal approval surface and owner routing.
- [../messaging.md](../messaging.md) — the internal protocol the external handler
  sits beside.
- [../permissions.md](../permissions.md) — the optional-permission grant flow.
- [../settings.md](../settings.md) — per-command settings storage and prune.
</content>
