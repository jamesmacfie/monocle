import { defineConfig } from "wxt"

const externalHosts = [
  "https://api.unsplash.com/*",
  "https://icons.duckduckgo.com/*",
]

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
      "48": "images/extension_48.png",
    },
    action: {
      default_icon: {
        "48": "images/extension_48.png",
      },
      default_title: "Toggle Monocle Command Palette",
    },
    author: "James Macfie",
    browser_specific_settings: {
      gecko: {
        id: "ff@monocle.com",
      },
    },
    permissions:
      browser === "firefox"
        ? ["activeTab", "storage", "contextualIdentities", "scripting"]
        : ["scripting", "activeTab", "storage"],
    content_security_policy: {
      extension_pages: getExtensionPagesCsp(command),
    },
    host_permissions: externalHosts,
    optional_permissions: [...baseOptionalPermissions],
    ...(shouldDeclareActionShortcut(browser, command)
      ? actionShortcutCommand
      : {}),
  }),
})
