# Peer author guide

> **Status: implemented (v1).** See [README.md](./README.md). This guide
> describes the developer experience for a *third-party* extension that wants to
> add commands to Monocle, once the feature ships. The APIs below are the
> proposed shapes from [protocol.md](./protocol.md) and
> [command-schema.md](./command-schema.md).

## The model in one paragraph

Your extension declares a tree of commands as **plain data** and sends it to
Monocle. Monocle hosts those commands in its palette. When the user runs one,
Monocle messages your background worker with the command's `callbackId`, and your
code does the work — inside your own extension, with your own permissions.
Monocle never runs your code; you never run inside Monocle.

## Step 1 — get Monocle's id and announce

```js
// your background service worker
const MONOCLE_ID = "<monocle-extension-id>"   // published by Monocle

chrome.runtime.sendMessage(MONOCLE_ID, {
  v: 1, id: crypto.randomUUID(), kind: "announce",
  params: { manifest: { name: "Acme Tools", icon: { type: "lucide", name: "Wrench" } } },
}, (reply) => {
  if (reply?.result?.status === "approved") register()
  // else: ask the user to approve you in Monocle → Settings → Extensions
})
```

The `announce` is unauthenticated — it makes your extension show up in Monocle's
**Settings → Extensions** list as "requesting access". The user approves you
there (they see your declared name **and your extension id**). Until then,
`register` is rejected.

## Step 2 — register a command tree

```js
function register() {
  chrome.runtime.sendMessage(MONOCLE_ID, {
    v: 1, id: crypto.randomUUID(), kind: "register",
    params: { registrations: [{
      id: "acme",
      namespace: "acme",
      name: "Acme Tools",
      icon: { type: "lucide", name: "Wrench" },
      commands: [
        { type: "action", id: "say-hi", name: "Acme: Say hi",
          icon: { type: "lucide", name: "Hand" },
          execute: { callbackId: "say-hi" } },

        { type: "group", id: "widgets", name: "Acme widgets",
          children: { type: "static", commands: [
            { type: "action", id: "widget-a", name: "Open widget A",
              execute: { callbackId: "widget-a" } },
          ]}},

        { type: "search", id: "find-doc", name: "Acme: find a doc",
          getResults: { callbackId: "find-doc" } },
      ],
    }]},
  })
}
```

`callbackId` is **your** opaque handle for the function to run — Monocle stores
the string and hands it back to you on invoke. Functions never cross the wire.

## Step 3 — answer invokes

Monocle resolves dynamic children/search and runs commands by opening a port to
you (this wakes your worker if it was idle):

```js
chrome.runtime.onConnectExternal.addListener((port) => {
  if (port.sender.id !== MONOCLE_ID) return        // only talk to Monocle
  port.onMessage.addListener(async (msg) => {
    if (msg.kind !== "invoke") return
    const { type, callbackId, commandId, context, values, search, id } = msg.request ?? msg

    try {
      if (type === "execute") {
        await runCallback(callbackId, { context, values })
        port.postMessage({ v: 1, id, ok: true })             // fire-and-forget
        // or, to return a value: { ok:true, result:{ value, contentType:"text/plain" } }
      }
      if (type === "search") {
        const commands = await searchCallback(callbackId, search)
        port.postMessage({ v: 1, id, ok: true, commands })   // a fresh ExternalCommand[]
      }
      if (type === "children") {
        const commands = await childrenCallback(callbackId, context)
        port.postMessage({ v: 1, id, ok: true, commands })
      }
    } catch (e) {
      port.postMessage({ v: 1, id, ok: false, error: { code: "internal", message: String(e) } })
    }
  })
})
```

Reply within ~3 seconds or Monocle abandons the invoke (the user sees an empty
results row or an error toast). Returned command lists are re-validated, so the
same schema rules apply to dynamic results.

## Step 4 — update or withdraw

- **Update**: send `register` again (or `update`) with the new tree — it replaces
  your previous one wholesale. Monocle tracks a revision for you.
- **Withdraw**: send `dispose` to remove your commands without losing approval.

## What you can and can't do

| You can | You can't |
| --- | --- |
| Add action/submit/group/search/input/display commands | Add features or automations |
| Group commands; nest up to 5 deep; ≤100 commands/registration | Claim a Monocle keybinding (the *user* may assign one) |
| Resolve search/children dynamically | Request a Monocle/browser permission through a command |
| Return a value from a command (opt-in) | Run code inside Monocle, or read Monocle's other commands |
| Show your name/icon on your commands | Spoof another extension's id (the browser verifies it) |

Everything your command *does* runs in your extension with your permissions —
Monocle just routes the user's intent to you.

## Cross-browser notes

- **Chrome**: Monocle must list your id (or `*`) in its `externally_connectable`,
  and you message Monocle by its id. Standard cross-extension messaging.
- **Firefox**: there is no `externally_connectable`; you still message Monocle by
  its id and Monocle authorises you by id in its handler. Same code on your side.

## A note on shared types

There is not yet a published type package for these shapes — Monocle keeps them
in `shared/types/externalCommands.ts`. If you want types, copy the relevant
declarations or generate them from the schema. A `@monocle/*` protocol package is
a future option once there is a second real consumer.
</content>
