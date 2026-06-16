import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  Browser,
  CommandNode,
  GroupCommandNode,
  SearchCommandNode,
} from "../../../shared/types"

const { focusSpy } = vi.hoisted(() => ({ focusSpy: vi.fn() }))

vi.mock("../../utils/browser", () => ({
  focusOrGoToUrl: focusSpy,
  sendSuccessToastToActiveTab: vi.fn(),
  sendErrorToastToActiveTab: vi.fn(),
  sendTabMessage: vi.fn(),
}))

import { githubCommands, parseGithubPage } from "./github"

const context = (url: string): Browser.Context => ({
  url,
  title: "",
  modifierKey: null,
})

const childrenOf = async (
  node: CommandNode,
  ctx: Browser.Context,
): Promise<CommandNode[]> => {
  if (node.type !== "group") {
    throw new Error(`Expected group, got ${node.type}`)
  }
  return (node as GroupCommandNode).children(ctx)
}

const findById = (nodes: CommandNode[], id: string): CommandNode => {
  const node = nodes.find((n) => n.id === id)
  if (!node) {
    throw new Error(`No command with id ${id}`)
  }
  return node
}

/** Resolve the URL an action navigates to by executing it against the spy. */
const urlFor = async (node: CommandNode): Promise<string> => {
  if (node.type !== "action") {
    throw new Error(`Expected action, got ${node.type}`)
  }
  focusSpy.mockClear()
  await node.execute(context("https://github.com/acme/widgets"))
  expect(focusSpy).toHaveBeenCalledTimes(1)
  return focusSpy.mock.calls[0][0] as string
}

describe("parseGithubPage", () => {
  it("parses repository pages", () => {
    expect(parseGithubPage("https://github.com/acme/widgets")).toEqual({
      owner: "acme",
      repo: "widgets",
      type: "repo",
    })
  })

  it("parses pull request pages and subpages", () => {
    expect(
      parseGithubPage("https://github.com/acme/widgets/pull/42/files"),
    ).toEqual({
      owner: "acme",
      repo: "widgets",
      type: "pull",
      number: "42",
    })
  })

  it("parses issue pages", () => {
    expect(
      parseGithubPage("https://github.com/acme/widgets/issues/17"),
    ).toEqual({
      owner: "acme",
      repo: "widgets",
      type: "issue",
      number: "17",
    })
  })

  it("rejects reserved top-level GitHub slugs and unsupported pages", () => {
    expect(parseGithubPage("https://github.com/settings/profile")).toBeNull()
    expect(parseGithubPage("https://github.com/enterprises/acme")).toBeNull()
    expect(parseGithubPage("https://github.com/search?q=monocle")).toBeNull()
    expect(parseGithubPage("https://github.com/acme")).toBeNull()
    expect(parseGithubPage("not a url")).toBeNull()
  })

  it("parses enterprise-style GitHub repository paths without assuming github.com", () => {
    expect(
      parseGithubPage("https://github.company.test/acme/widgets/issues/99"),
    ).toEqual({
      owner: "acme",
      repo: "widgets",
      type: "issue",
      number: "99",
    })
  })
})

describe("githubCommands group", () => {
  const repoCtx = context("https://github.com/acme/widgets")

  it("offers the star action and four sub-groups on a repo page", async () => {
    const top = await childrenOf(githubCommands, repoCtx)
    expect(top.map((c) => c.id)).toEqual([
      "github-toggle-star",
      "github-goto",
      "github-search",
      "github-my",
      "github-create",
    ])
  })

  it("adds pull-request navigation and hides Toggle Star on a pull page", async () => {
    const top = await childrenOf(
      githubCommands,
      context("https://github.com/acme/widgets/pull/42/files"),
    )
    const ids = top.map((c) => c.id)
    expect(ids).toContain("github-nav-pr-files")
    expect(ids).toContain("github-nav-pr-checks")
    // The repo star button is absent on PR detail pages.
    expect(ids).not.toContain("github-toggle-star")
  })

  it("adds issue navigation and hides Toggle Star on an issue page", async () => {
    const top = await childrenOf(
      githubCommands,
      context("https://github.com/acme/widgets/issues/17"),
    )
    const ids = top.map((c) => c.id)
    expect(ids).toContain("github-nav-issue-conversation")
    expect(ids).not.toContain("github-toggle-star")
  })

  it("shows a no-op row on unsupported pages", async () => {
    const top = await childrenOf(
      githubCommands,
      context("https://example.com/page"),
    )
    expect(top).toHaveLength(1)
    expect(top[0].id).toBe("github-no-actions")
    expect(top[0].type).toBe("display")
  })
})

describe("github Go to navigation", () => {
  const repoCtx = context("https://github.com/acme/widgets")

  it("builds repo-tab URLs from the current repo", async () => {
    const top = await childrenOf(githubCommands, repoCtx)
    const goTo = await childrenOf(findById(top, "github-goto"), repoCtx)

    expect(await urlFor(findById(goTo, "github-goto-code"))).toBe(
      "https://github.com/acme/widgets",
    )
    expect(await urlFor(findById(goTo, "github-goto-issues"))).toBe(
      "https://github.com/acme/widgets/issues",
    )
    expect(await urlFor(findById(goTo, "github-goto-insights"))).toBe(
      "https://github.com/acme/widgets/pulse",
    )
    expect(await urlFor(findById(goTo, "github-goto-find-file"))).toBe(
      "https://github.com/acme/widgets/find/HEAD",
    )
  })
})

describe("github search", () => {
  const repoCtx = context("https://github.com/acme/widgets")

  const searchNode = async (id: string): Promise<SearchCommandNode> => {
    const top = await childrenOf(githubCommands, repoCtx)
    const group = await childrenOf(findById(top, "github-search"), repoCtx)
    const node = findById(group, id)
    if (node.type !== "search") {
      throw new Error(`Expected search node, got ${node.type}`)
    }
    return node
  }

  it("returns no results for a blank query", async () => {
    const node = await searchNode("github-search-repo-code")
    expect(await node.getResults(repoCtx, "   ")).toEqual([])
  })

  it("scopes a repo code search to the current repo", async () => {
    const node = await searchNode("github-search-repo-code")
    const results = await node.getResults(repoCtx, "useEffect")
    expect(results).toHaveLength(1)
    expect(await urlFor(results[0])).toBe(
      `https://github.com/search?q=${encodeURIComponent(
        "useEffect repo:acme/widgets",
      )}&type=code`,
    )
  })

  it("targets the repo issues list for an issue search", async () => {
    const node = await searchNode("github-search-repo-issues")
    const results = await node.getResults(repoCtx, "flaky test")
    expect(await urlFor(results[0])).toBe(
      `https://github.com/acme/widgets/issues?q=${encodeURIComponent("flaky test")}`,
    )
  })
})

describe("github My GitHub lists", () => {
  const repoCtx = context("https://github.com/acme/widgets")

  it("builds @me filtered list URLs", async () => {
    const top = await childrenOf(githubCommands, repoCtx)
    const my = await childrenOf(findById(top, "github-my"), repoCtx)

    expect(await urlFor(findById(my, "github-my-prs"))).toBe(
      "https://github.com/pulls",
    )
    expect(await urlFor(findById(my, "github-my-review-requests"))).toBe(
      `https://github.com/pulls?q=${encodeURIComponent(
        "is:open is:pr review-requested:@me",
      )}`,
    )
    expect(await urlFor(findById(my, "github-my-prs-in-repo"))).toBe(
      `https://github.com/acme/widgets/pulls?q=${encodeURIComponent(
        "is:open is:pr author:@me",
      )}`,
    )
  })
})

describe("github create", () => {
  const repoCtx = context("https://github.com/acme/widgets")

  it("builds quick-create URLs for the current repo", async () => {
    const top = await childrenOf(githubCommands, repoCtx)
    const create = await childrenOf(findById(top, "github-create"), repoCtx)

    expect(await urlFor(findById(create, "github-create-issue"))).toBe(
      "https://github.com/acme/widgets/issues/new/choose",
    )
    expect(await urlFor(findById(create, "github-create-pr"))).toBe(
      "https://github.com/acme/widgets/compare",
    )
  })
})

beforeEach(() => {
  focusSpy.mockReset()
})
