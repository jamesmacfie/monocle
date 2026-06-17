import { defineConfig } from "wxt"

const externalHosts = [
  "https://api.unsplash.com/*",
  "https://icons.duckduckgo.com/*",
]

export const optionalHostPermissions = ["http://*/*", "https://*/*"] as const

const remoteConnectSources = [
  "https://api.unsplash.com",
  "https://icons.duckduckgo.com",
]

const baseOptionalPermissions = [
  "bookmarks",
  "browsingData",
  "cookies",
  "downloads",
  "history",
  "sessions",
  "tabs",
  // "management" powers the Extensions command group
  // (background/commands/extensions/). Optional + requested on demand because
  // it is a high-scrutiny permission (it can disable/uninstall other
  // extensions).
  "management",
] as const

const actionShortcutCommand = {
  commands: {
    _execute_action: {
      suggested_key: {
        default: "Ctrl+Shift+K",
        mac: "Command+Shift+K",
      },
      description: "Toggle command palette",
    },
  },
} as const

function getExtensionPagesCsp(command: string): string {
  const connectSrc = ["'self'", ...remoteConnectSources]

  if (command === "serve") {
    return [
      "script-src 'self' http://localhost:*",
      "object-src 'none'",
      `connect-src ${[
        ...connectSrc,
        "http://localhost:*",
        "ws://localhost:*",
      ].join(" ")}`,
    ].join("; ")
  }

  return [
    "script-src 'self'",
    "object-src 'none'",
    `connect-src ${connectSrc.join(" ")}`,
  ].join("; ")
}

function shouldDeclareActionShortcut(
  browser: string,
  command: string,
): boolean {
  return browser !== "firefox" || command !== "serve"
}

export default defineConfig({
  imports: false,
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  targetBrowsers: ["chrome", "firefox"],
  vite: () => ({
    envPrefix: ["WXT_", "VITE_", "EXTENSION_PUBLIC_"],
  }),
  hooks: {
    "build:manifestGenerated": (wxt, manifest) => {
      if (
        wxt.config.browser === "firefox" &&
        wxt.config.manifestVersion === 3
      ) {
        if (typeof manifest.content_security_policy === "object") {
          delete manifest.content_security_policy.sandbox
        }

        manifest.web_accessible_resources?.forEach((resource) => {
          if (typeof resource === "object") {
            delete resource.use_dynamic_url
          }
        })
      }
    },
  },
  manifest: ({ browser, command }) => ({
    version: "0.0.1",
    name: "Monocle - Command Palette for the Web",
    description:
      "A browser extension that adds a command palette interface to any webpage, similar to VS Code's Command Palette or macOS Spotlight.",
    icons: {
      "16": "images/extension_16.png",
      "32": "images/extension_32.png",
      "48": "images/extension_48.png",
      "128": "images/extension_128.png",
    },
    action: {
      default_icon: {
        "16": "images/extension_16.png",
        "32": "images/extension_32.png",
        "48": "images/extension_48.png",
        "128": "images/extension_128.png",
      },
      default_title: "Toggle Monocle Command Palette",
    },
    author: "James Macfie",
    browser_specific_settings: {
      gecko: {
        id: "ff@monocle.com",
      },
    },
    // "alarms" powers scheduled automation triggers
    // (background/automations/alarms.ts).
    permissions:
      browser === "firefox"
        ? [
            "activeTab",
            "alarms",
            "storage",
            "contextualIdentities",
            "scripting",
          ]
        : ["scripting", "activeTab", "alarms", "storage"],
    content_security_policy: {
      extension_pages: getExtensionPagesCsp(command),
    },
    host_permissions: externalHosts,
    optional_host_permissions: [...optionalHostPermissions],
    // "tabGroups" powers the native Chrome tab-group commands
    // (background/features/tabGroups/nativeCommands.ts). Chrome-only: Firefox
    // has no chrome.tabGroups API, and declaring an unknown optional permission
    // there trips the build, so it is appended for non-Firefox targets only.
    optional_permissions:
      browser === "firefox"
        ? [...baseOptionalPermissions]
        : [...baseOptionalPermissions, "tabGroups"],
    ...(shouldDeclareActionShortcut(browser, command)
      ? actionShortcutCommand
      : {}),
  }),
})
