import { describe, expect, it } from "vitest"
import { parseGithubPage } from "./github"

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
