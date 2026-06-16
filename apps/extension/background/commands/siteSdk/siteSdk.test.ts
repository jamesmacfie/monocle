import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { Browser, SiteSdkRegistration } from "../../../shared/types"
import { commandsToSuggestions, executeCommand, getCommands } from "../index"
import { getCommandPageCommands } from "../query"
import { getSearchIndex, invalidateSearchIndex } from "../searchIndex"
import { clearAllSettings } from "../settings"
import {
  clearAllSiteSdkRegistrations,
  clearSiteSdkScopesForTab,
  createSiteSdkScopeFromSender,
  getSiteSdkCommandLoadOptions,
  loadSiteSdkCommands,
  prepareSiteSdkCommandLoadOptions,
  syncSiteSdkRegistrations,
} from "./index"

const context: Browser.Context = {
  url: "https://shop.example/products",
  title: "Shop",
  modifierKey: null,
}

const sender = {
  tab: { id: 10 },
  frameId: 0,
  documentId: "document-a",
  url: context.url,
}

const sdkCallbackRef = { callbackId: "callback-1" }

let tabMessages: Array<{ tabId: number; message: any }> = []
let nextSyncRegistrations: SiteSdkRegistration[] = []
let nextInvokeResponse: any

const installChromeStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
      getURL: () => "chrome-extension://monocle-test/",
      lastError: null,
    },
    permissions: {
      contains: vi.fn(async () => true),
    },
    tabs: {
      query: vi.fn(
        (_queryInfo: Record<string, unknown>, callback?: Function) => {
          callback?.([])
          return Promise.resolve([])
        },
      ),
      get: vi.fn((_tabId: number, callback?: Function) => {
        callback?.({ id: 10, url: context.url, title: context.title })
        return Promise.resolve({
          id: 10,
          url: context.url,
          title: context.title,
        })
      }),
      sendMessage: vi.fn((tabId: number, message: any, callback?: Function) => {
        tabMessages.push({ tabId, message })

        if (message.type === "monocle-site-sdk-sync-request") {
          const response = { registrations: nextSyncRegistrations }
          callback?.(response)
          return Promise.resolve(response)
        }

        if (message.type === "monocle-site-sdk-invoke") {
          const response =
            nextInvokeResponse ??
            (message.request?.type === "children"
              ? {
                  success: true,
                  commands: [
                    {
                      id: "dynamic-child",
                      type: "action",
                      name: "Dynamic Child",
                      execute: sdkCallbackRef,
                    },
                  ],
                }
              : message.request?.type === "search"
                ? {
                    success: true,
                    commands: [
                      {
                        id: "search-result",
                        type: "action",
                        name: "Search Result",
                        execute: sdkCallbackRef,
                      },
                    ],
                  }
                : { success: true })

          callback?.(response)
          return Promise.resolve(response)
        }

        callback?.({ success: true })
        return Promise.resolve({ success: true })
      }),
    },
    windows: {
      update: vi.fn(
        (_windowId: number, _updateInfo: object, callback?: Function) => {
          callback?.({ id: _windowId })
          return Promise.resolve({ id: _windowId })
        },
      ),
    },
  })
}

const sync = (registrations: SiteSdkRegistration[]) => {
  const scope = createSiteSdkScopeFromSender(sender, context)
  if (!scope) throw new Error("missing test SDK scope")
  syncSiteSdkRegistrations(scope, registrations)
  return {
    scope,
    siteSdk: getSiteSdkCommandLoadOptions(scope.key),
  }
}

beforeEach(async () => {
  fakeBrowser.reset()
  installChromeStubs()
  clearAllSiteSdkRegistrations()
  invalidateSearchIndex()
  await clearAllSettings()
  tabMessages = []
  nextSyncRegistrations = []
  nextInvokeResponse = undefined
})

describe("site SDK background registry and commands", () => {
  it("scopes registrations by tab document and clears all tab scopes", () => {
    const firstScope = createSiteSdkScopeFromSender(sender, context)!
    const secondScope = createSiteSdkScopeFromSender(
      { ...sender, documentId: "document-b" },
      context,
    )!

    syncSiteSdkRegistrations(firstScope, [
      {
        id: "first",
        namespace: "first",
        commands: [{ ...action("first-action"), placement: "root" }],
      },
    ])
    syncSiteSdkRegistrations(secondScope, [
      {
        id: "second",
        namespace: "second",
        commands: [{ ...action("second-action"), placement: "root" }],
      },
    ])

    expect(
      loadSiteSdkCommands(getSiteSdkCommandLoadOptions(firstScope.key)).map(
        (command) => command.name,
      ),
    ).toEqual(["Open first-action"])
    expect(
      loadSiteSdkCommands(getSiteSdkCommandLoadOptions(secondScope.key)).map(
        (command) => command.name,
      ),
    ).toEqual(["Open second-action"])

    expect(clearSiteSdkScopesForTab(10)).toBe(true)
    expect(
      loadSiteSdkCommands(getSiteSdkCommandLoadOptions(firstScope.key)),
    ).toEqual([])
  })

  it("orders root SDK commands before the generated site group and native commands", async () => {
    const { siteSdk } = sync([
      {
        id: "shop",
        namespace: "shop",
        name: "Shop Tools",
        commands: [
          { ...action("root-open"), placement: "root" },
          action("grouped-open"),
        ],
      },
    ])

    const { suggestions } = await getCommands(context, { siteSdk })
    const ids = suggestions.map((command) => command.id)

    expect(ids[0]).toContain(":root-open")
    expect(ids[1]).toContain(":__site-group")
    expect(ids.indexOf("open-new-tab")).toBeGreaterThan(1)
  })

  it("keeps favorite and hide actions while omitting keybinding actions", async () => {
    const { siteSdk } = sync([
      {
        id: "shop",
        namespace: "shop",
        commands: [{ ...action("root-open"), placement: "root" }],
      },
    ])

    const { suggestions } = await getCommands(context, { siteSdk })
    const [suggestion] = await commandsToSuggestions([suggestions[0]], context)
    const actionIds =
      "actions" in suggestion
        ? suggestion.actions?.map((item) => item.id) || []
        : []

    expect(
      actionIds.some((id: string) => id.startsWith("toggle-favorite-")),
    ).toBe(true)
    expect(
      actionIds.some((id: string) => id.startsWith("hide-from-domain-")),
    ).toBe(true)
    expect(
      actionIds.some((id: string) => id.startsWith("set-keybinding-")),
    ).toBe(false)
    expect(suggestion.keybinding).toBeUndefined()
  })

  it("applies URL filtering to SDK root commands", async () => {
    const { siteSdk } = sync([
      {
        id: "shop",
        namespace: "shop",
        commands: [
          {
            ...action("hidden-here"),
            placement: "root",
            urlRules: { denyUrls: ["*://shop.example/*"] },
          },
          { ...action("visible-here"), placement: "root" },
        ],
      },
    ])

    const denied = await getCommands(context, { siteSdk })
    expect(denied.suggestions.map((command) => command.name)).not.toContain(
      "Open hidden-here",
    )

    const allowed = await getCommands(
      { ...context, url: "https://other.example/" },
      { siteSdk },
    )
    expect(allowed.suggestions.map((command) => command.name)).toContain(
      "Open hidden-here",
    )
  })

  it("executes SDK commands through a tab-scoped callback and normalizes form values", async () => {
    const { siteSdk } = sync([
      {
        id: "shop",
        namespace: "shop",
        commands: [
          {
            id: "submit-order",
            type: "submit",
            name: "Submit Order",
            placement: "root",
            execute: sdkCallbackRef,
          },
        ],
      },
    ])
    const commandId = loadSiteSdkCommands(siteSdk)[0].id

    await executeCommand(
      commandId,
      context,
      { tags: ["fragile", "gift"], note: "hello" },
      undefined,
      undefined,
      { siteSdk },
    )

    const invoke = tabMessages.find(
      (item) => item.message.type === "monocle-site-sdk-invoke",
    )

    expect(invoke?.tabId).toBe(10)
    expect(invoke?.message.request).toMatchObject({
      type: "execute",
      callbackId: "callback-1",
      commandId: "submit-order",
      values: { tags: "fragile,gift", note: "hello" },
    })
  })

  it("resolves callback children and search results through the content bridge", async () => {
    const { siteSdk } = sync([
      {
        id: "shop",
        namespace: "shop",
        commands: [
          {
            id: "dynamic-group",
            type: "group",
            name: "Dynamic Group",
            placement: "root",
            children: { type: "callback", callback: sdkCallbackRef },
          },
          {
            id: "dynamic-search",
            type: "search",
            name: "Dynamic Search",
            placement: "root",
            getResults: sdkCallbackRef,
          },
        ],
      },
    ])
    const rootCommands = loadSiteSdkCommands(siteSdk)
    const groupId = rootCommands[0].id
    const searchId = rootCommands[1].id

    const groupPage = await getCommandPageCommands(
      context,
      [groupId],
      undefined,
      {
        siteSdk,
      },
    )
    expect(groupPage.commands[0].name).toBe("Dynamic Child")

    const searchPage = await getCommandPageCommands(
      context,
      [searchId],
      "abc",
      {
        siteSdk,
      },
    )
    expect(searchPage.commands[0].name).toBe("Search Result")
    expect(
      tabMessages.some(
        (item) =>
          item.message.request?.type === "search" &&
          item.message.request.search === "abc",
      ),
    ).toBe(true)
  })

  it("rejects callback errors from the page", async () => {
    const { siteSdk } = sync([
      {
        id: "shop",
        namespace: "shop",
        commands: [{ ...action("root-open"), placement: "root" }],
      },
    ])
    const commandId = loadSiteSdkCommands(siteSdk)[0].id
    nextInvokeResponse = { success: false, error: "callback exploded" }

    await expect(
      executeCommand(commandId, context, {}, undefined, undefined, { siteSdk }),
    ).rejects.toThrow("callback exploded")
  })

  it("resyncs registrations when the service-worker registry is cold", async () => {
    nextSyncRegistrations = [
      {
        id: "shop",
        namespace: "shop",
        commands: [{ ...action("resynced"), placement: "root" }],
      },
    ]

    const siteSdk = await prepareSiteSdkCommandLoadOptions(sender, context)

    expect(siteSdk).toBeDefined()
    expect(loadSiteSdkCommands(siteSdk).map((command) => command.name)).toEqual(
      ["Open resynced"],
    )
    expect(
      tabMessages.some(
        (item) => item.message.type === "monocle-site-sdk-sync-request",
      ),
    ).toBe(true)
  })

  it("indexes SDK root and grouped commands at native source weight by default", async () => {
    const { siteSdk } = sync([
      {
        id: "shop",
        namespace: "shop",
        commands: [
          { ...action("root-open"), placement: "root" },
          {
            id: "group",
            type: "group",
            name: "Group",
            children: {
              type: "static",
              commands: [action("deep-open")],
            },
          },
        ],
      },
    ])

    const index = await getSearchIndex(context, { siteSdk })
    const rootEntry = index.entries.find((entry) =>
      entry.id.endsWith(":root-open"),
    )
    const deepEntry = index.entries.find((entry) =>
      entry.id.endsWith(".deep-open"),
    )

    expect(rootEntry?.sourceWeight).toBe(1)
    expect(deepEntry?.sourceWeight).toBe(1)
    expect(deepEntry?.fromDeepSearch).toBe(true)
  })
})

const action = (id: string) => ({
  id,
  type: "action" as const,
  name: `Open ${id}`,
  execute: sdkCallbackRef,
})
