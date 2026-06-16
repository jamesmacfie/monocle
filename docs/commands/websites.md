# Website (Contextual) Commands

Website commands are built-in contextual commands scoped to a particular site via `urlRules`. They live in `background/commands/websites/` and are aggregated by `background/commands/websites/index.ts` into `websiteCommands`, which `background/commands/source.ts` (`loadAllCommands`) merges into the global command set like any other category. Today there is exactly one built-in website command: a GitHub prototype that surfaces contextual repo/PR/issue actions only on GitHub pages.

This is a prototype, not a plugin system. Website commands are ordinary command arrays with `urlRules`, loaded through the normal command source; there is no plugin registry, lifecycle, enablement policy, or plugin-owned hooks. This is also distinct from the page-owned `window.Monocle` site SDK, which lets the current page register non-privileged session commands at runtime. See [../site-sdk.md](../site-sdk.md).

## Summary

| Command | Id | Node type | Scope | Purpose |
| --- | --- | --- | --- | --- |
| GitHub Actions | `github-actions` | `group` | GitHub domains (`*://github.com/*`, `*://*.github.com/*`) | Contextual repo/PR/issue commands for the current page |

Registration:

```ts
// background/commands/websites/index.ts
export const websiteCommands = [githubCommands]
export { githubCommands }
```

---

## GitHub Actions

Source: `background/commands/websites/github/`, exported as `githubCommands` (`GroupCommandNode`) from its `index.ts`. Id `github-actions`, icon `Github`, color `gray`, keywords `github`, `repository`, `pull request`, `issue`.

The implementation is split into focused modules: `parse.ts` (`parseGithubPage`, `GithubPageDetails`, reserved-slug guard, `repoUrl` helper), `common.ts` (`createGithubLinkCommand` and `createGithubSubGroup` factories), `navigation.ts` (the **Go to** sub-group plus PR/issue nav), `search.ts` (the **Search** sub-group), `lists.ts` (the **My GitHub** sub-group), `create.ts` (the **Create** sub-group), `workflows.ts` (the Toggle Star DOM workflow), and `index.ts` (assembles the group and re-exports `parseGithubPage`). All URL-based commands are pure navigation built on `focusOrGoToUrl`; only Toggle Star uses a DOM workflow. No GitHub API, auth token, or extra permissions are involved.

### Scoping via `urlRules`

The group is gated to GitHub domains:

```ts
const GITHUB_DOMAIN_ALLOW_LIST = ["*://github.com/*", "*://*.github.com/*"]
// ...
urlRules: { allowUrls: GITHUB_DOMAIN_ALLOW_LIST }
```

Because root and child command lists are filtered against the current page URL by the shared background query path (`background/commands/query.ts`, `filterCommandsByUrl`), `github-actions` only appears when the active tab's URL matches one of these patterns. On any non-GitHub page it is hidden. For the matching mechanics, see [../url-filtering.md](../url-filtering.md).

### Dynamic name

The group `name` is an async function of the page context. When the current URL parses as a GitHub repo it reads `GitHub: <owner>/<repo>`; otherwise it falls back to `GitHub Actions`:

```ts
name: async (context) => {
  const details = parseGithubPage(context?.url)
  return details ? `GitHub: ${details.owner}/${details.repo}` : "GitHub Actions"
}
```

### URL parsing (`parseGithubPage`)

The exported `parseGithubPage(url?)` helper turns a URL into a `GithubPageDetails` object or `null`. It is deliberately host-agnostic (it parses the pathname, not the hostname), so it works for `github.com` and enterprise hosts alike.

```ts
export type GithubPageDetails = {
  owner: string
  repo: string
  type: "repo" | "pull" | "issue"
  number?: string
}
```

Parsing rules:

| Path shape | Result |
| --- | --- |
| `/owner/repo` (and deeper repo subpages) | `{ owner, repo, type: "repo" }` |
| `/owner/repo/pull/<n>...` | `{ owner, repo, type: "pull", number: "<n>" }` |
| `/owner/repo/issues/<n>` | `{ owner, repo, type: "issue", number: "<n>" }` |
| Fewer than 2 path segments (e.g. `/owner`) | `null` |
| First segment in the reserved top-level slug set | `null` |
| Unparseable URL | `null` |

The reserved-slug guard (`RESERVED_TOP_LEVEL_SLUGS`) rejects GitHub's own top-level routes so they are not mistaken for an `owner` - e.g. `settings`, `search`, `enterprises`, `marketplace`, `notifications`, `pulls`, `orgs`, `topics`, `trending`, and others. Pull/issue numbers must be all-digits (`/^\d+$/`).

Test coverage: `background/commands/websites/github.test.ts` verifies repo pages, PR pages including subpages (`/pull/42/files`), issue pages, rejection of reserved slugs (`/settings/profile`, `/enterprises/acme`, `/search?q=...`), rejection of a single-segment path (`/acme`) and non-URLs, and enterprise-style hosts (`https://github.company.test/acme/widgets/issues/99`). It also asserts the group's assembled children for repo/pull/issue/unsupported pages and the exact navigation URLs each sub-group produces (mocking `focusOrGoToUrl` and resolving each action/search result).

### Children

The group's `children(context)` reparse the current URL:

- If parsing returns `null`, it returns a single NoOp/display row (`createNoOpCommand("github-no-actions", ...)`) explaining the page is unsupported, rather than an alert. This follows the empty-state convention.
- Otherwise it includes four sub-groups (**Go to**, **Search**, **My GitHub**, **Create**) on every parsed page, prepends **Toggle Star** only on repo-level pages (`details.type === "repo"`), and appends PR/issue navigation actions depending on `details.type`.

Each sub-group is built from the parsed `GithubPageDetails` (the owner/repo are baked in at construction time via `createGithubSubGroup`, so the sub-group's own `children` ignore context). Sub-groups set `enableDeepSearch: true` so their leaf action/submit descendants flatten into deep search.

#### Toggle Star

`createToggleStarCommand` builds an `action` (id `github-toggle-star`, icon `Star`, color `yellow`, `actionLabel: "Toggle"`). On execute it runs `toggleStarWorkflow` - a one-step `click` workflow targeting the CSS selector `.starring-container button` (`strategy: "css"`, `index: 0`, with `scrollIntoView`/`ensureVisible`). Execution goes through the shared workflow path: `resolveWorkflowTargetTabId`, a `monocle-ui-toggle` message to close the overlay, a 200 ms delay, then `executeWorkflowOnTargetTab`; success/failure are reported as targeted `monocle-toast` messages.

This is best-effort DOM automation, not a GitHub API integration. The `.starring-container button` selector is brittle and can break if GitHub changes its markup. See [../workflow-automation.md](../workflow-automation.md) for the full content-step vocabulary the executor supports (`toggleStarWorkflow` itself uses only a single `click` step).

Toggle Star is only offered on repo-level pages (`details.type === "repo"`), not on pull-request or issue detail pages, because the repo overview header that hosts the star button is not rendered there. This scoping is done by conditional inclusion in `children()` using the already-parsed page type, not via `urlRules` - glob patterns cannot express "the repo root but not its subpages" (the `*` wildcard matches across `/`).

#### Sub-groups (URL navigation)

All four sub-groups appear on any valid repo page. Their leaf commands are built by `createGithubLinkCommand`, which produces an `action` that calls `focusOrGoToUrl(url)` (focus an existing matching tab or navigate the active tab) and reports a toast.

- **Go to** (`github-goto`, `navigation.ts`): repo-tab links built from `repoUrl(details)` - Code, Issues (`/issues`), Pull Requests (`/pulls`), Actions (`/actions`), Releases (`/releases`), Branches (`/branches`), Commits (`/commits`), Wiki (`/wiki`), Discussions (`/discussions`), Insights (`/pulse`), Security (`/security`), Settings (`/settings`), and Find a file (`/find/HEAD`). Leaf ids are `github-goto-<tab>`.
- **Search** (`github-search`, `search.ts`): `search`-type nodes whose `getResults(_, query)` return a single navigation result for a non-empty (trimmed) query and `[]` for blank input. The result's dynamic id (`<id>-result`) sets `allowCustomKeybinding: false`. Queries are `encodeURIComponent`-encoded. Targets: code in repo (`/search?q=<query> repo:owner/repo&type=code`), issues in repo (`/owner/repo/issues?q=`), pull requests in repo (`/owner/repo/pulls?q=`), and all-GitHub code search (`/search?q=&type=code`).
- **My GitHub** (`github-my`, `lists.ts`): filtered lists using `@me`/global URLs that need no username - My open pull requests (`/pulls`), PRs awaiting my review, PRs assigned to me, My open issues (`/issues`), Issues assigned to me, My notifications (`/notifications`), and My PRs in this repo (`/owner/repo/pulls?q=is:open is:pr author:@me`).
- **Create** (`github-create`, `create.ts`): quick-create pages for the current repo - New issue (`/issues/new/choose`), New pull request (`/compare`), New release (`/releases/new`), New discussion (`/discussions/new`).

#### PR/issue navigation

For `type: "pull"`, `createPullRequestNavigationCommands` adds actions (each `id` prefixed `github-nav-pr-`): Conversation, Commits, Checks, Files Changed, and Code (back to the repo). For `type: "issue"`, `createIssueNavigationCommands` adds Conversation and Code. Both require a parsed `number` and are skipped otherwise. These are appended after the four sub-groups.

| Page type | Children |
| --- | --- |
| repo | Toggle Star, Go to, Search, My GitHub, Create |
| pull | Go to, Search, My GitHub, Create, Conversation, Commits, Checks, Files Changed, Code |
| issue | Go to, Search, My GitHub, Create, Conversation, Code |
| unparseable GitHub page | single "No GitHub actions available" NoOp row |

Catalog sections not yet built (file/blob actions, open-in-github.dev/vscode.dev, username-scoped "My profile/repos/stars" via reading the page's `<meta name="user-login">`, more page-button workflows, and clipboard-dependent "copy" commands) are tracked in the implementation plan, not here.

---

## Prototype status and open design question

`websiteCommands` is loaded by the normal command source and the GitHub group is in the right conceptual place, but it remains a single command array with `urlRules` rather than a first-class plugin registry. Before broadening website commands, the project must decide whether they are simply URL-filtered command arrays or a registry with plugin metadata, activation/enablement policy, settings scope, and plugin-owned hooks. Relevant constraints today:

- User URL rules are keyed per command id. Website plugins that generate many dynamic command ids could fragment settings. The GitHub group itself uses stable ids, and `loadUserConfigurableCommands()` includes `...websiteCommands`, so the GitHub group is configurable in the Manage Allow/Deny List surfaces.
- The star workflow depends on GitHub DOM selectors and should be treated as best-effort.
- GitHub URL parsing relies on a hand-maintained reserved-slug list; GitHub routing changes can require updates.

`urlRules` is the current command-visibility layer and a reasonable foundation for contextual commands, but it is not the plugin model. The site SDK is now the first runtime page-owned command source, but it is session-only and non-privileged rather than a packaged plugin registry. Treat all three concepts as distinct: built-in website commands, page-owned SDK registrations, and any future installable plugin system.

---

## Related docs

- [../url-filtering.md](../url-filtering.md) - `urlRules` allow/deny matching that scopes the GitHub group.
- [../site-sdk.md](../site-sdk.md) - page-owned `window.Monocle` commands.
- [../workflow-automation.md](../workflow-automation.md) - the workflow executor used by Toggle Star and what is implemented.
- [../command-types.md](../command-types.md) - `group` and `action` node behavior, dynamic children, and NoOp rows.
- [../execution-and-actions.md](../execution-and-actions.md) - action labels and execution flow.
- [../authoring-commands.md](../authoring-commands.md) - adding a command category and registration.
