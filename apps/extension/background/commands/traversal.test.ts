import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Browser, CommandNode, GroupCommandNode } from "../../shared/types"
import {
  appendUrlRuleChain,
  mergePermissions,
  reverseBreadcrumb,
  shouldDeepSearchGroup,
  toUrlRuleChainLink,
  walkCommandTree,
} from "./traversal"

const context: Browser.Context = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
}

const action = (id: string): CommandNode => ({
  type: "action",
  id,
  name: id,
  execute: vi.fn(),
})

beforeEach(() => {
  vi.stubGlobal("chrome", {
    permissions: { contains: vi.fn(async () => true) },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("command traversal helpers", () => {
  it("merges inherited and own permissions without duplicates", () => {
    expect(mergePermissions(["tabs", "bookmarks"], ["tabs"])).toEqual([
      "tabs",
      "bookmarks",
    ])
  })

  it("builds URL-rule chain links from command-like objects", () => {
    const command = {
      id: "docs",
      urlRules: { allowUrls: ["*://docs.example/*"] },
    }

    expect(toUrlRuleChainLink(command)).toEqual(command)
    expect(appendUrlRuleChain([{ id: "root" }], command)).toEqual([
      { id: "root" },
      command,
    ])
  })

  it("reverses breadcrumbs without mutating the original path", () => {
    const path = ["Root", "Child"]

    expect(reverseBreadcrumb(path)).toEqual(["Child", "Root"])
    expect(path).toEqual(["Root", "Child"])
  })

  it.each([
    [true, false, true],
    [true, true, true],
    [false, false, false],
    [false, true, false],
    [undefined, false, false],
    [undefined, true, true],
  ] as const)(
    "resolves deep-search flag %s with inherited=%s",
    (enableDeepSearch, inherited, expected) => {
      const group = {
        type: "group",
        id: "group",
        name: "Group",
        children: async () => [],
        enableDeepSearch,
      } satisfies GroupCommandNode

      expect(shouldDeepSearchGroup(group, inherited)).toBe(expected)
    },
  )
})

describe("walkCommandTree", () => {
  it("blocks descent when an inherited permission is missing", async () => {
    vi.stubGlobal("chrome", {
      permissions: { contains: vi.fn(async () => false) },
    })
    const children = vi.fn(async () => [action("child")])
    const visited: string[] = []

    await walkCommandTree(
      [
        {
          type: "group",
          id: "group",
          name: "Group",
          permissions: ["tabs"],
          children,
        },
      ],
      {
        context,
        commandSettings: {},
        visit: ({ command }) => {
          visited.push(command.id)
        },
      },
    )

    expect(visited).toEqual(["group"])
    expect(children).not.toHaveBeenCalled()
  })

  it("isolates a failing group and continues with siblings", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const visited: string[] = []

    await walkCommandTree(
      [
        {
          type: "group",
          id: "broken",
          name: "Broken",
          children: async () => {
            throw new Error("no children")
          },
        },
        action("sibling"),
      ],
      {
        context,
        commandSettings: {},
        visit: ({ command }) => {
          visited.push(command.id)
        },
      },
    )

    expect(visited).toEqual(["broken", "sibling"])
  })

  it("short-circuits the whole walk when a visitor returns stop", async () => {
    const visited: string[] = []

    await walkCommandTree([action("first"), action("second")], {
      context,
      commandSettings: {},
      visit: ({ command }) => {
        visited.push(command.id)
        return "stop"
      },
    })

    expect(visited).toEqual(["first"])
  })

  it("threads immediate-parent-first breadcrumbs and filters children", async () => {
    const visits: Array<{
      id: string
      parentNames: string[]
      parentIds: string[]
    }> = []

    await walkCommandTree(
      [
        {
          type: "group",
          id: "root",
          name: "Root",
          children: async () => [
            {
              type: "group",
              id: "nested",
              name: "Nested",
              children: async () => [action("visible"), action("hidden")],
            },
          ],
        },
      ],
      {
        context,
        commandSettings: { hidden: { hidden: true } },
        visit: ({ command, parentNames, parentIds }) => {
          visits.push({ id: command.id, parentNames, parentIds })
        },
      },
    )

    expect(visits).toContainEqual({
      id: "visible",
      parentNames: ["Nested", "Root"],
      parentIds: ["nested", "root"],
    })
    expect(visits.some(({ id }) => id === "hidden")).toBe(false)
  })

  it("supports deep-search-gated descent", async () => {
    const visited: string[] = []

    await walkCommandTree(
      [
        {
          type: "group",
          id: "disabled",
          name: "Disabled",
          children: async () => [action("not-visited")],
        },
        {
          type: "group",
          id: "enabled",
          name: "Enabled",
          enableDeepSearch: true,
          children: async () => [action("visited")],
        },
      ],
      {
        context,
        commandSettings: {},
        visit: ({ command }) => {
          visited.push(command.id)
        },
        shouldDescend: ({ deepSearchEnabled }) => deepSearchEnabled,
      },
    )

    expect(visited).toEqual(["disabled", "enabled", "visited"])
  })
})
