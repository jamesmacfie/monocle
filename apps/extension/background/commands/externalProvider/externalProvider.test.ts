import { describe, expect, it, vi } from "vitest"
import type {
  ActionCommandNode,
  ExternalCommand,
  ExternalRegistration,
  GroupCommandNode,
} from "../../../shared/types"
import { createExternalRootCommands } from "./index"
import type { ExternalProviderAdapter } from "./types"

// A fake entry + adapter so the shared engine is exercised independently of any
// real transport (the site SDK and extensionSdk are the production adapters).
type FakeEntry = { scope: string }

const makeAdapter = (
  invoke = vi.fn(async () => undefined as ExternalCommand[] | undefined),
): ExternalProviderAdapter<FakeEntry> => ({
  idPrefix: "test:",
  scopeId: (entry) => entry.scope,
  invoke,
  fallbackContext: () => ({ url: "", title: "", modifierKey: null }),
  ownerGroup: () => ({
    publicId: "__g",
    name: "Group",
    description: "desc",
    icon: { type: "lucide", name: "Box" },
    color: "gray",
    keywords: ["g"],
  }),
})

const registration = (commands: ExternalCommand[]): ExternalRegistration => ({
  id: "reg1",
  namespace: "ns",
  commands,
})

describe("externalProvider engine", () => {
  it("groups commands under the per-owner group with encoded ids", () => {
    const adapter = makeAdapter()
    const nodes = createExternalRootCommands(adapter, { scope: "s1" }, [
      registration([
        {
          id: "act",
          name: "Act",
          type: "action",
          execute: { callbackId: "c" },
        },
        { id: "disp", name: "Disp", type: "display" },
      ]),
    ])

    expect(nodes).toHaveLength(1)
    const group = nodes[0] as GroupCommandNode
    expect(group.type).toBe("group")
    expect(group.id).toBe("test:s1:reg1:__g")
  })

  it("converts all six node types and encodes child ids with the group path", async () => {
    const adapter = makeAdapter()
    const nodes = createExternalRootCommands(adapter, { scope: "s1" }, [
      registration([
        { id: "a", name: "A", type: "action", execute: { callbackId: "ca" } },
        { id: "s", name: "S", type: "submit", execute: { callbackId: "cs" } },
        {
          id: "g",
          name: "G",
          type: "group",
          children: { type: "static", commands: [] },
        },
        {
          id: "sr",
          name: "Sr",
          type: "search",
          getResults: { callbackId: "cr" },
        },
        {
          id: "i",
          name: "I",
          type: "input",
          field: { id: "f", label: "F", type: "text" },
        },
        { id: "d", name: "D", type: "display" },
      ]),
    ])

    const group = nodes[0] as GroupCommandNode
    const children = await group.children({
      url: "",
      title: "",
      modifierKey: null,
    })
    expect(children.map((c) => c.type)).toEqual([
      "action",
      "submit",
      "group",
      "search",
      "input",
      "display",
    ])
    // Child ids carry the group public path.
    expect(children[0].id).toBe("test:s1:reg1:__g.a")
    // External commands never claim global keybindings at registration.
    expect((children[0] as ActionCommandNode).allowCustomKeybinding).toBe(false)
  })

  it("routes action execute through the adapter's invoke transport", async () => {
    const invoke = vi.fn(async () => undefined)
    const adapter = makeAdapter(invoke)
    const nodes = createExternalRootCommands(adapter, { scope: "s1" }, [
      registration([
        { id: "a", name: "A", type: "action", execute: { callbackId: "cb" } },
      ]),
    ])
    const group = nodes[0] as GroupCommandNode
    const [action] = (await group.children({
      url: "u",
      title: "t",
      modifierKey: null,
    })) as ActionCommandNode[]

    await action.execute?.({ url: "u", title: "t", modifierKey: null }, {})
    expect(invoke).toHaveBeenCalledWith(
      { scope: "s1" },
      expect.objectContaining({
        type: "execute",
        callbackId: "cb",
        commandId: "a",
      }),
    )
  })

  it("resolves callback group children through invoke", async () => {
    const invoke = vi.fn(async () => [
      { id: "dyn", name: "Dyn", type: "display" } as ExternalCommand,
    ])
    const adapter = makeAdapter(invoke)
    const nodes = createExternalRootCommands(adapter, { scope: "s1" }, [
      registration([
        {
          id: "g",
          name: "G",
          type: "group",
          children: { type: "callback", callback: { callbackId: "kids" } },
        },
      ]),
    ])
    const group = nodes[0] as GroupCommandNode
    const [callbackGroup] = (await group.children({
      url: "",
      title: "",
      modifierKey: null,
    })) as GroupCommandNode[]

    const dynamic = await callbackGroup.children({
      url: "",
      title: "",
      modifierKey: null,
    })
    expect(invoke).toHaveBeenCalledWith(
      { scope: "s1" },
      expect.objectContaining({ type: "children", callbackId: "kids" }),
    )
    expect(dynamic[0].id).toBe("test:s1:reg1:__g.g.dyn")
  })

  it("honours partitionRoot: root commands emit before the group", () => {
    const adapter: ExternalProviderAdapter<FakeEntry> = {
      ...makeAdapter(),
      partitionRoot: (commands) => ({
        root: commands.filter((c) => c.placement === "root"),
        grouped: commands.filter((c) => c.placement !== "root"),
      }),
    }
    const nodes = createExternalRootCommands(adapter, { scope: "s1" }, [
      registration([
        {
          id: "top",
          name: "Top",
          type: "action",
          placement: "root",
          execute: { callbackId: "c" },
        },
        { id: "inner", name: "Inner", type: "display" },
      ]),
    ])

    expect(nodes).toHaveLength(2)
    expect(nodes[0].id).toBe("test:s1:reg1:top") // root-placed, no group path
    expect(nodes[1].id).toBe("test:s1:reg1:__g") // generated group
  })
})
