import { describe, expect, it } from "vitest"
import {
  appendUrlRuleChain,
  mergePermissions,
  reverseBreadcrumb,
  toUrlRuleChainLink,
} from "./traversal"

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
})
