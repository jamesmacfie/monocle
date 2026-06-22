# Extension-to-Extension Commands

> **Status: implemented (v1).** The feature is built: the shared external-command
> provider, the `extensionSdk` adapter + durable registry, the cross-extension
> protocol + `onMessageExternal` handler, and the `external-extensions` feature
> module managed on the **Integrations** settings page. CLAUDE.md owns the
> authoritative status. Two intentional divergences from this spec, taken for v1:
>
> - **Schema reuse, not relocation.** The declarative schema was NOT physically
>   moved out of `shared/types/siteSdk.ts`; instead `shared/types/externalCommands.ts`
>   re-exports it under transport-neutral `External*` names. The valuable dedup —
>   one conversion **engine** (`background/commands/externalProvider/`) — landed;
>   relocating the 660-line schema file (and risking the site SDK's public types)
>   was deemed churn without benefit. A future physical move is a pure rename.
> - **Trimmed protocol.** v1 ships `announce` / `register` / `dispose` only — no
>   `ping`/`pong`, no separate `update` (a re-`register` replaces whole), and
>   `execute` is fire-and-forget (the data-returning `CommandResult` channel is
>   deferred). Dead-owner GC is manual (Revoke); `management.onUninstalled` GC is
>   deferred. All were "v1/roadmap" here already.

The **extension-to-extension** feature lets a *peer browser extension* register
its own commands into Monocle's command palette. Once the user approves the peer
on an **Extensions** settings page, the peer's commands behave like any other
Monocle command: they appear in the palette, can be given keybindings, hidden on
specific sites, filtered by URL rules, and favorited. When the user runs one,
Monocle tells the peer extension "the user picked your command `<id>`", and the
peer does the work inside its own sandbox.

## Intent — and how it differs from the native bridge

It looks mechanically similar to the [native-messaging bridge](../native-messaging/README.md)
(both involve an external party and an approval handshake) but the **direction of
data flow is reversed**, and that difference drives every design decision:

| | Native bridge | Extension-to-extension |
| --- | --- | --- |
| Who is external | A desktop app (Raycast) | Another browser extension |
| Direction | External app **reads** Monocle's suggestions / **runs** Monocle's commands | Peer extension **contributes** its own commands into Monocle |
| Transport | Native messaging host + loopback HTTP (MV3 can't listen) | **Native cross-extension messaging** — `onConnectExternal` / `onMessageExternal`. No host needed; both sides are extensions. |
| Identity | Per-client bearer token from a pairing code | The **browser-verified extension id** is the identity |
| Trust gate | Pairing code → hashed token | **User approval** on a settings page (no code, no token) |
| Command ownership | Monocle owns the commands | The **peer** owns the commands; Monocle hosts them |

The native bridge had to invent a transport and a token because a desktop app has
no browser-verified identity and MV3 can't accept inbound connections. Neither
constraint applies here: two extensions talk directly through a browser-native
channel, and the browser already authenticates the sender's extension id. So this
feature is **simpler** than the bridge on the transport and auth axes, and
**richer** on the command-modeling axis.

## This is the site SDK, promoted

The hard part — turning an untrusted, externally-owned declarative command tree
into background-owned `CommandNode`s, and round-tripping `execute` / `children` /
`search` back to the owner — **already exists** as the site SDK
(`background/commands/siteSdk/`, see [../site-sdk.md](../site-sdk.md)), which does
this for page-world `window.Monocle` declarations.

A peer extension is the same shape with three differences:

1. **Transport** — cross-extension messaging instead of the content bridge.
2. **Identity & durability** — a user-approved extension id, persisted across
   restarts, instead of a per-tab session scope.
3. **Trust** — an explicit approval gate, instead of "any page may register
   session-only commands."

Because the conversion engine and the declarative schema are transport-agnostic,
the shared layer both build on is **extracted**, not copied. See
[provider-refactor.md](./provider-refactor.md).

## Scope

In scope for v1:

- A peer may register **`action`, `submit`, `group`, `search`, `input`, and
  `display`** commands (the same node subset the site SDK accepts). Groups and
  search resolve their children/results lazily via RPC back to the peer.
- **Not** features, automations, keybindings-it-declares-itself, or permissions.
  A peer cannot make Monocle do privileged work; "execute" is an outbound
  notification to the peer, which acts within its own sandbox.
- Durable registration: an approved peer's command **tree** is cached by Monocle
  so the palette can render it even while the peer's MV3 worker is asleep. The
  worker is woken only to resolve `search` / `group` children and to `execute`.
- Approval-only trust: the browser-verified extension id is the identity; the
  user approves it on an Extensions settings page.

Out of scope for v1:

- Per-request tokens or signed requests (id-trust is enough for v1).
- Peers contributing features or automations.
- Cross-extension conflict resolution beyond namespacing + provenance labeling.
- Extracting the protocol types into a published `@monocle/*` package.

## Reading order

1. [architecture.md](./architecture.md) — the moving parts, the
   shared-provider layering, MV3 lifecycle, durability, and data-flow diagrams.
2. [provider-refactor.md](./provider-refactor.md) — the refactor that extracts a
   shared external-command provider out of the site SDK so both features share
   one engine. Read this before the integration doc.
3. [protocol.md](./protocol.md) — the cross-extension wire contract: announce,
   register, update/dispose, and the invoke RPC.
4. [command-schema.md](./command-schema.md) — what a peer may declare, the caps,
   and `extension:<extId>:…` id namespacing.
5. [registration-and-trust.md](./registration-and-trust.md) — discovery,
   approval, the durable allowlist, dead-owner GC, and the security/threat model
   (including the Firefox `externally_connectable` gap).
6. [extension-integration.md](./extension-integration.md) — concrete Monocle
   wiring: the provider folder, the feature module + settings page, manifest
   changes, the `onConnectExternal` handler, and the files to touch.
7. [author-guide.md](./author-guide.md) — how a third-party developer builds a
   peer extension, with a worked example.

## Related docs

- [../site-sdk.md](../site-sdk.md) — the page-world SDK this feature generalises.
- [../site-sdk-security.md](../site-sdk-security.md) — the containment model the
  shared provider inherits.
- [../command-schema.md](../command-schema.md) — the `CommandNode` model these
  declarations convert into.
- [../features.md](../features.md) — the feature-module registry the Extensions
  settings page is built on.
- [../surfaces.md](../surfaces.md) — the `modal` surface used for the approval
  prompt.
- [../messaging.md](../messaging.md) — the in-extension message protocol; the
  external handler deliberately sits beside the internal-only one.
- [../permissions.md](../permissions.md) — optional-permission grant flow for
  `externally_connectable` / `tabs`.
- [../native-messaging/README.md](../native-messaging/README.md) — the sibling
  feature whose feature-module + pairing structure this mirrors (but simplifies).
</content>
