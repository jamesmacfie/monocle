// Architecture: background tests. Covers the Extensions command group
// (background/commands/extensions/) — listing/filtering, per-extension action
// pages, the enable/disable toggle, bulk enable/disable, and the apps-only
// Launch action. Drives the dynamic group `children()` and action `execute()`
// directly against a stubbed chrome.management, mirroring the browser-command
// test pattern. See docs/commands/extensions.md.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type {
  ActionCommandNode,
  Browser,
  GroupCommandNode,
} from "../../../shared/types"
import { getChildrenCommands } from "../../messages/getChildrenCommands"
import type { ManagedExtension } from "../../utils/browserManagement"
import { extensionsCommands } from "./index"

const context: Browser.Context = { url: "", title: "", modifierKey: null }

let extensions: ManagedExtension[]
let setEnabled: ReturnType<typeof vi.fn>
let createTab: ReturnType<typeof vi.fn>
let launchApp: ReturnType<typeof vi.fn>

const installStubs = () => {
  setEnabled = vi.fn((id: string, enabled: boolean, cb?: () => void) => {
    const target = extensions.find((extension) => extension.id === id)
    if (target) {
      target.enabled = enabled
    }
    cb?.()
  })
  createTab = vi.fn((_props: unknown, cb?: (tab: unknown) => void) =>
    cb?.({ id: 2 }),
  )
  launchApp = vi.fn((_id: string, cb?: () => void) => cb?.())

  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: { id: "monocle-test", lastError: null },
    // Permission gating treats the browser as authoritative; the "management"
    // permission is granted for these tests.
    permissions: { contains: vi.fn(async () => true) },
    management: {
      getAll: (cb: (items: ManagedExtension[]) => void) => cb(extensions),
      getSelf: (cb: (item: ManagedExtension) => void) =>
        cb(extensions.find((extension) => extension.id === "self")!),
      get: (id: string, cb: (item?: ManagedExtension) => void) =>
        cb(extensions.find((extension) => extension.id === id)),
      setEnabled,
      uninstall: vi.fn((_id: string, _opts: unknown, cb?: () => void) =>
        cb?.(),
      ),
      launchApp,
    },
    tabs: {
      query: (_q: unknown, cb: (tabs: unknown[]) => void) =>
        cb([{ id: 1, active: true }]),
      sendMessage: vi.fn((_id: number, _msg: unknown, cb?: () => void) =>
        cb?.(),
      ),
      create: createTab,
    },
  })
}

beforeEach(() => {
  fakeBrowser.reset()
  extensions = [
    {
      id: "aaa",
      name: "Alpha",
      enabled: true,
      type: "extension",
      version: "1.0",
      mayDisable: true,
      optionsUrl: "chrome-extension://aaa/options.html",
    },
    {
      id: "bbb",
      name: "Beta",
      enabled: false,
      type: "extension",
      version: "2.0",
      mayDisable: true,
    },
    {
      id: "ccc",
      name: "Gamma App",
      enabled: true,
      type: "hosted_app",
      version: "3.0",
      mayDisable: true,
    },
    {
      id: "ddd",
      name: "Policy Ext",
      enabled: true,
      type: "extension",
      version: "4.0",
      mayDisable: false,
    },
    {
      id: "theme1",
      name: "Dark Theme",
      enabled: true,
      type: "theme",
      version: "1.0",
      mayDisable: true,
    },
    {
      id: "self",
      name: "Monocle",
      enabled: true,
      type: "extension",
      version: "0.1",
      mayDisable: true,
    },
  ]
  installStubs()
})

const rootGroup = () => extensionsCommands[0] as GroupCommandNode

const childIds = async (): Promise<string[]> =>
  (await rootGroup().children(context)).map((command) => command.id)

const actionsFor = async (
  extensionId: string,
): Promise<ActionCommandNode[]> => {
  const children = await rootGroup().children(context)
  const group = children.find(
    (command) => command.id === `extension-${extensionId}`,
  ) as GroupCommandNode
  return (await group.children(context)) as ActionCommandNode[]
}

describe("extensions command group", () => {
  it("lists manageable extensions (excluding self and themes) after the bulk actions", async () => {
    const ids = await childIds()

    expect(ids.slice(0, 2)).toEqual([
      "extensions-enable-all",
      "extensions-disable-all",
    ])
    // Sorted by name: Alpha, Beta, Gamma App, Policy Ext.
    expect(ids.slice(2)).toEqual([
      "extension-aaa",
      "extension-bbb",
      "extension-ccc",
      "extension-ddd",
    ])
    expect(ids).not.toContain("extension-self") // Monocle itself
    expect(ids).not.toContain("extension-theme1") // themes excluded
  })

  it("shows an empty-state row when no other extensions are installed", async () => {
    extensions = extensions.filter((extension) => extension.id === "self")
    installStubs()

    const children = await rootGroup().children(context)
    expect(children).toHaveLength(1)
    expect(children[0].id).toBe("no-extensions")
    expect(children[0].type).toBe("display")
  })

  it("offers Enable for a disabled extension and toggles it on", async () => {
    const actions = await actionsFor("bbb")
    const toggle = actions.find(
      (action) => action.id === "extension-bbb-toggle",
    )

    expect(toggle?.name).toBe("Enable")
    await toggle?.execute?.(context)
    expect(setEnabled).toHaveBeenCalledWith("bbb", true, expect.any(Function))
  })

  it("offers Disable for an enabled extension and toggles it off", async () => {
    const actions = await actionsFor("aaa")
    const toggle = actions.find(
      (action) => action.id === "extension-aaa-toggle",
    )

    expect(toggle?.name).toBe("Disable")
    await toggle?.execute?.(context)
    expect(setEnabled).toHaveBeenCalledWith("aaa", false, expect.any(Function))
  })

  it("omits the toggle for extensions that cannot be disabled", async () => {
    const ids = (await actionsFor("ddd")).map((action) => action.id)
    expect(ids).not.toContain("extension-ddd-toggle")
  })

  it("offers Launch only for apps", async () => {
    const appIds = (await actionsFor("ccc")).map((action) => action.id)
    const extIds = (await actionsFor("aaa")).map((action) => action.id)
    expect(appIds).toContain("extension-ccc-launch")
    expect(extIds).not.toContain("extension-aaa-launch")
  })

  it("offers Open options only when the extension declares an options page", async () => {
    const withOptions = (await actionsFor("aaa")).map((action) => action.id)
    const withoutOptions = (await actionsFor("bbb")).map((action) => action.id)
    expect(withOptions).toContain("extension-aaa-options")
    expect(withoutOptions).not.toContain("extension-bbb-options")
  })

  it("uninstall opens the extension's Chrome page (direct uninstall needs a user gesture)", async () => {
    const uninstall = (await actionsFor("aaa")).find(
      (action) => action.id === "extension-aaa-uninstall",
    )
    await uninstall?.execute?.(context)
    expect(createTab).toHaveBeenCalledWith(
      { url: "chrome://extensions/?id=aaa", active: true },
      expect.any(Function),
    )
  })

  it("keeps the palette open after a toggle so the label can refresh in place", async () => {
    const toggle = (await actionsFor("bbb")).find(
      (action) => action.id === "extension-bbb-toggle",
    )
    expect(toggle?.remainOpenOnSelect).toBe(true)
  })

  it("enable-all turns on every toggleable, currently-disabled extension", async () => {
    const enableAll = (await rootGroup().children(context)).find(
      (command) => command.id === "extensions-enable-all",
    ) as ActionCommandNode

    await enableAll.execute?.(context)

    // Beta (disabled, mayDisable) flips on; Policy Ext (mayDisable: false) and
    // already-enabled ones are left alone.
    expect(setEnabled).toHaveBeenCalledWith("bbb", true, expect.any(Function))
    expect(setEnabled).not.toHaveBeenCalledWith(
      "ddd",
      expect.anything(),
      expect.any(Function),
    )
    expect(setEnabled).not.toHaveBeenCalledWith(
      "aaa",
      true,
      expect.any(Function),
    )
  })

  it("opens the options page in a new tab", async () => {
    const options = (await actionsFor("aaa")).find(
      (action) => action.id === "extension-aaa-options",
    )
    await options?.execute?.(context)
    expect(createTab).toHaveBeenCalledWith(
      { url: "chrome-extension://aaa/options.html", active: true },
      expect.any(Function),
    )
  })
})

// Drives the real get-children-commands handler to prove the two-level dynamic
// group navigation (Extensions -> one extension -> its actions) resolves and
// opens a page — the regression guard for "the extension group won't open".
describe("extensions nested group navigation", () => {
  const context: Browser.Context = {
    url: "https://example.com",
    title: "Example",
    modifierKey: null,
  }

  it("opening Extensions from root returns the per-extension groups and opens a page", async () => {
    const response = (await getChildrenCommands(
      {
        type: "get-children-commands",
        id: "extensions",
        parentPath: [],
        context,
      },
      undefined,
    )) as { openPage?: boolean; children?: Array<{ id: string }> }

    expect(response.openPage).toBe(true)
    const ids = (response.children ?? []).map(
      (child: { id: string }) => child.id,
    )
    expect(ids).toContain("extension-aaa")
  })

  it("opening an extension group returns its action sub-commands and opens a page", async () => {
    const response = (await getChildrenCommands(
      {
        type: "get-children-commands",
        id: "extension-aaa",
        parentPath: ["extensions"],
        context,
      },
      undefined,
    )) as { openPage?: boolean; children?: Array<{ id: string }> }

    expect(response.openPage).toBe(true)
    const ids = (response.children ?? []).map(
      (child: { id: string }) => child.id,
    )
    expect(ids).toContain("extension-aaa-toggle")
    expect(ids).toContain("extension-aaa-uninstall")
  })
})
