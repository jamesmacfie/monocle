# Manifest (`package.json`)

The Raycast manifest is a superset of npm's `package.json`. The current manifest
lives at `apps/raycast/package.json`. Field reference:
<https://developers.raycast.com/information/manifest>.

## Current manifest shape

```jsonc
{
  "$schema": "https://www.raycast.com/schemas/extension.json",
  "name": "monocle",
  "title": "Monocle",
  "description": "Search and run the active browser tab's Monocle commands from Raycast.",
  "icon": "monocle-icon.png",            // assets/monocle-icon.png
  "author": "james_macfie",
  "categories": ["Productivity", "Web"],
  "license": "MIT",
  "platforms": ["macOS"],
  "commands": [
    {
      "name": "search-monocle",          // → src/search-monocle.tsx
      "title": "Search Monocle",
      "subtitle": "Active browser tab",
      "description": "List and run the active tab's Monocle commands.",
      "mode": "view"
    },
    {
      "name": "pair-monocle",            // → src/pair-monocle.tsx
      "title": "Pair Monocle",
      "subtitle": "Connect to the browser",
      "description": "Pair Raycast with a running Monocle browser via the native bridge.",
      "mode": "view"
    }
  ],
  "preferences": [
    {
      "name": "port",
      "type": "textfield",
      "required": false,
      "title": "Bridge port",
      "description": "Loopback port the Monocle Bridge listens on. Leave blank to auto-discover from ~/.monocle/bridge.json (default 8765).",
      "default": "8765"
    },
    {
      "name": "host",
      "type": "textfield",
      "required": false,
      "title": "Bridge host",
      "description": "Loopback host. Almost always 127.0.0.1.",
      "default": "127.0.0.1"
    }
  ],
  "dependencies": {
    "@raycast/api": "^1.99.0",
    "@raycast/utils": "^1.19.0"
  },
  "scripts": {
    "dev": "ray develop",
    "build": "ray build",
    "lint": "ray lint",
    "fix-lint": "ray lint --fix"
  }
}
```

## Field notes

**Commands.** Two `view`-mode commands:

- `search-monocle` — the main `List` view. Renders active-tab suggestions, drills into groups,
  executes. See [suggestions-and-mapping.md](./suggestions-and-mapping.md),
  [nested-navigation.md](./nested-navigation.md), [execution.md](./execution.md).
- `pair-monocle` — a `Form` view that runs the pairing handshake. See [pairing.md](./pairing.md).

`mode` is `"view"` for both (they render UI). `name` maps 1:1 to the entry file in `src/`.

**Preferences (extension-level).** `port` and `host` are user-editable, non-secret connection
settings. They are inherited by every command. Read them with
`getPreferenceValues<Prefs>()`; the app keeps a small local `Prefs` type in
`src/lib/types.ts` so bare TypeScript checks work without relying on generated
Raycast env types. See [settings-and-storage.md](./settings-and-storage.md).

> The **token and `instanceId` are NOT preferences.** Secrets and derived ids belong in
> `LocalStorage` (encrypted, not user-editable, never logged), not in plain-text preferences. See
> [settings-and-storage.md](./settings-and-storage.md).

**Icon.** A PNG in `assets/`, referenced by filename. This is the *extension*
icon shown in Raycast; per-row icons come from suggestion data — see icon
mapping.

**Distribution.** Since we are dev-mode only, the Store-required fields (screenshots, strict
categories, `ray lint` passing clean) are not gates. Keep `ray lint` roughly clean anyway so the
build stays healthy; a future Store submission would add an icon/screenshot/review pass.

## Command-vs-extension preferences

Commands automatically inherit extension preferences and may override an entry with the same
`name`. We keep `port`/`host` at the extension level so both commands share one connection config.
