# Website (Contextual) Commands

Website commands are contextual commands scoped to a particular site via `urlRules`. They live in `background/commands/websites/` and are aggregated by `background/commands/websites/index.ts` into `websiteCommands`, which `background/commands/source.ts` (`loadAllCommands`) merges into the global command set like any other category. Today there is exactly one website command: a GitHub prototype that surfaces contextual repo/PR/issue actions only on GitHub pages.

This is a prototype, not a plugin system. Website commands are ordinary command arrays with `urlRules`, loaded through the normal command source; there is no plugin registry, lifecycle, enablement policy, or plugin-owned hooks. See the open design question at the end of this doc.

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

Source: `background/commands/websites/github.ts`, exported as `githubCommands` (`GroupCommandNode`). Id `github-actions`, icon `Github`, color `gray`, keywords `github`, `repository`, `pull request`, `issue`.

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

Test coverage: `background/commands/websites/github.test.ts` verifies repo pages, PR pages including subpages (`/pull/42/files`), issue pages, rejection of reserved slugs (`/settings/profile`, `/enterprises/acme`, `/search?q=...`), rejection of a single-segment path (`/acme`) and non-URLs, and enterprise-style hosts (`https://github.company.test/acme/widgets/issues/99`).

### Children

The group's `children(context)` reparse the current URL:

- If parsing returns `null`, it returns a single NoOp/display row (`createNoOpCommand("github-no-actions", ...)`) explaining the page is unsupported, rather than an alert. This follows the empty-state convention.
- Otherwise it always includes a **Toggle Star** action, then adds navigation actions depending on `details.type`.

#### Toggle Star

`createToggleStarCommand` builds an `action` (id `github-toggle-star`, icon `Star`, color `yellow`, `actionLabel: "Toggle"`). On execute it runs `toggleStarWorkflow` - a one-step `click` workflow targeting the CSS selector `.starring-container button` (`strategy: "css"`, `index: 0`, with `scrollIntoView`/`ensureVisible`). Execution goes through the shared workflow path: `resolveWorkflowTargetTabId`, a `toggle-ui` message to close the overlay, a 200 ms delay, then `executeWorkflowOnTargetTab`; success/failure are reported as targeted `monocle-toast` messages.

This is best-effort DOM automation, not a GitHub API integration. The `.starring-container button` selector is brittle and can break if GitHub changes its markup. See [../workflow-automation.md](../workflow-automation.md) for what the executor supports (only `click` and `wait` steps are implemented).

#### Navigation commands

For `type: "pull"`, `createPullRequestNavigationCommands` adds actions (each `id` prefixed `github-nav-pr-`, icon `MoveRight`, `actionLabel: "Go"`): Conversation, Commits, Checks, Files Changed, and Code (back to the repo). For `type: "issue"`, `createIssueNavigationCommands` adds Conversation and Code. Both require a parsed `number` and are skipped otherwise. Each navigation action calls `focusOrGoToUrl(targetUrl)` (focus an existing matching tab or navigate) and reports a toast. Repo-type pages get only the Toggle Star action.

| Page type | Children |
| --- | --- |
| repo | Toggle Star |
| pull | Toggle Star, Conversation, Commits, Checks, Files Changed, Code |
| issue | Toggle Star, Conversation, Code |
| unparseable GitHub page | single "No GitHub actions available" NoOp row |

---

## Prototype status and open design question

`websiteCommands` is loaded by the normal command source and the GitHub group is in the right conceptual place, but it remains a single command array with `urlRules` rather than a first-class plugin registry. Before broadening website commands, the project must decide whether they are simply URL-filtered command arrays or a registry with plugin metadata, activation/enablement policy, settings scope, and plugin-owned hooks. Relevant constraints today:

- User URL rules are keyed per command id. Website plugins that generate many dynamic command ids could fragment settings. The GitHub group itself uses stable ids, and `loadUserConfigurableCommands()` includes `...websiteCommands`, so the GitHub group is configurable in the Manage Allow/Deny List surfaces.
- The star workflow depends on GitHub DOM selectors and should be treated as best-effort.
- GitHub URL parsing relies on a hand-maintained reserved-slug list; GitHub routing changes can require updates.

`urlRules` is the current command-visibility layer and a reasonable foundation for contextual commands, but it is not the plugin model. Treat the two as distinct.

---

## Related docs

- [../url-filtering.md](../url-filtering.md) - `urlRules` allow/deny matching that scopes the GitHub group.
- [../workflow-automation.md](../workflow-automation.md) - the workflow executor used by Toggle Star and what is implemented.
- [../command-types.md](../command-types.md) - `group` and `action` node behavior, dynamic children, and NoOp rows.
- [../execution-and-actions.md](../execution-and-actions.md) - action labels and execution flow.
- [../authoring-commands.md](../authoring-commands.md) - adding a command category and registration.
