const RESERVED_TOP_LEVEL_SLUGS = new Set<string>([
  "about",
  "account",
  "apps",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "enterprises",
  "events",
  "explore",
  "features",
  "login",
  "logout",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "repositories",
  "search",
  "security",
  "settings",
  "site",
  "sponsors",
  "stars",
  "topics",
  "trending",
  "users",
])

export type GithubPageDetails = {
  owner: string
  repo: string
  type: "repo" | "pull" | "issue"
  number?: string
}

export const parseGithubPage = (url?: string): GithubPageDetails | null => {
  if (!url) {
    return null
  }

  try {
    const { pathname } = new URL(url)
    const segments = pathname.split("/").filter(Boolean)

    if (segments.length < 2) {
      return null
    }

    const [owner, repo, resource, identifier] = segments

    if (!owner || !repo) {
      return null
    }

    if (RESERVED_TOP_LEVEL_SLUGS.has(owner.toLowerCase())) {
      return null
    }

    // Pull requests (e.g., /owner/repo/pull/123/...)
    if (resource === "pull" && identifier && /^\d+$/.test(identifier)) {
      return {
        owner,
        repo,
        type: "pull",
        number: identifier,
      }
    }

    // Issues (e.g., /owner/repo/issues/123)
    if (resource === "issues" && identifier && /^\d+$/.test(identifier)) {
      return {
        owner,
        repo,
        type: "issue",
        number: identifier,
      }
    }

    return {
      owner,
      repo,
      type: "repo",
    }
  } catch (error) {
    console.error("[GitHub Commands] Failed to parse GitHub URL", {
      url,
      error,
    })
    return null
  }
}

/** Canonical https://github.com base for a repo, used by all link builders. */
export const repoUrl = ({ owner, repo }: GithubPageDetails): string =>
  `https://github.com/${owner}/${repo}`
