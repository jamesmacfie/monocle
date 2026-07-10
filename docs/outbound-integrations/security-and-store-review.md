# Security and Store-Review Posture

> **Status: source controls implemented; external listing/privacy disclosures
> remain release gates.** Firefox consent documentation was re-checked on
> 2026-07-11. Re-check all store rules immediately before submitting a build.

## Security objective

An imported Automation and the page it runs on are both potentially hostile.
Neither may turn Monocle into an arbitrary cross-origin proxy or cause data to
leave the browser without a reviewable local document, explicit destination
grant, and applicable browser data consent.

The system is not trying to prevent a trusted user from configuring a powerful
request. It is trying to make the authority static, inspectable, narrowly
granted, non-secret in logs, and impossible for the page to expand.

## Assets and trust boundaries

| Asset | Risk | Required control |
| --- | --- | --- |
| Current page URL/title | Browsing activity can identify private work | Send only when a local Automation explicitly references it; disclose destination and data class. |
| Extracted page text | May contain private source code, messages, or account data | Static local steps, import review, endpoint grant, consent, no logs. |
| Snippet-backed credentials | Stored unencrypted in local extension storage | Resolve only in background; recommend low-stakes integration tokens; never log/export plaintext unless the user authored a literal. |
| HTTP destination | Could be an attacker-controlled exfiltration endpoint | Static URL, HTTPS/loopback policy, concrete host grant, redirects refused. |
| Local IDE listener | Any local process or webpage may attempt to call it | Bind loopback, require a random bearer token, no permissive CORS, validate method/path/body. |
| HTTP response | Untrusted remote data may be large or shaped as code | Stream cap, JSON parse only, explicit scalar mappings, no HTML/step/selector interpretation. |
| Surface action | A forged id could invoke privileged steps | Browser-derived sender tab/URL, active-surface verification, document re-read, action lookup. |
| Native subscriber | A paired client may receive browsing data | New opt-in scope, explicit client target, revocation, live authenticated SSE only. |

## Page-to-background containment

The webpage never sends a request URL, headers, body, action steps, or native
client id. An inline surface click carries only extension-generated identifiers.
The background then:

1. derives the sender tab and URL from `MessageSender`;
2. proves the surface/action is visible for that tab and URL;
3. re-reads the locally stored Automation;
4. resolves the fixed action and endpoint from that document;
5. checks browser host/data permissions; and
6. executes with credentials omitted unless the document explicitly supplies
   its own integration header.

This avoids the cross-origin-fetch anti-pattern where a content message asks a
privileged background worker to fetch an arbitrary page-supplied URL. Chrome's
own network-request guidance warns against that shape:
[Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

## Request hardening

The normative HTTP controls are in [http-request-step.md](./http-request-step.md):

- exact loopback HTTP or remote HTTPS only;
- no URL credentials or fragments;
- static destination/method/header names;
- no cookies, referrer, redirects, caching, or automatic retries;
- forbidden browser-controlled headers;
- 64 KiB request/response caps and 30-second maximum timeout;
- private-window refusal; and
- explicit scalar response mappings.

An imported document may name an attacker endpoint, but importing does not
grant that origin. Non-manual triggers are still disarmed, and the user sees the
destination again when granting host access.

## Secret handling

Header values and JSON string values may reference snippets. This reuses the
existing warning: snippets are local convenience storage, not encrypted secret
storage. Recommend a dedicated, revocable, least-privilege IDE/webhook token—not
a primary account password or long-lived cloud credential.

Never include any of these values in:

- console logging;
- Automation run errors;
- step outcomes;
- import summaries;
- surface content;
- native event metadata; or
- analytics/telemetry (Monocle currently has none).

Import review lists custom header **names**, not values. Literal header/body
values remain in the exported Automation because the user authored them; the
editor must warn about that before save/export and recommend snippet references.

## Local IDE endpoint requirements

A compliant IDE receiver:

- binds only `127.0.0.1`, `::1`, or a local-domain socket behind its own loopback
  adapter—not `0.0.0.0`;
- exposes a dedicated path, not a general RPC endpoint;
- requires a CSPRNG bearer token of at least 32 random bytes;
- does not enable wildcard CORS;
- rejects browser preflight/origin traffic not explicitly intended for the
  extension;
- accepts only `application/json` and enforces a body limit at or below 64 KiB;
- validates a fixed event-name and payload schema; and
- returns a small JSON response without secrets.

Bearer authentication is necessary even on loopback because other local
processes can reach the port. No-CORS alone prevents a webpage from reading a
response but does not prevent every form of blind request.

## Chrome Web Store

### Permissions and network behavior

Chrome permits cross-origin fetch from an extension service worker when the
extension has host permission. Host permissions should remain optional and be
requested for one concrete destination scheme+host pattern:

- [Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions)

The extension-page CSP applies to the background worker, so `connect-src` must
explicitly admit the planned HTTPS/loopback destinations:
[Extension content security policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).

The feature introduces no new named Chrome permission because broad optional
HTTP(S) host patterns already exist at `b43f2ac`. It does turn that broad
declaration into an actual arbitrary user-destination network feature, so the
dashboard justification must say so plainly.

Host-permission match patterns do not provide a shared Chrome/Firefox way to
restrict the grant to one port or path. The grant UI must disclose that a
configured loopback endpoint such as `http://127.0.0.1:43121/path` requests
`http://127.0.0.1/*`, while Monocle's static URL validation continues to pin
the request itself to the configured port and path.

### User-data disclosure

Chrome requires dashboard and privacy-policy disclosures to match behavior and
requires secure handling of user data. Its FAQ also describes user-specified
protocol clients and exempts same-machine extension/native-program traffic from
the encryption requirement:

- [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/)
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Troubleshooting secure-transmission violations](https://developer.chrome.com/docs/webstore/troubleshooting/)

That supports loopback HTTP for an IDE but is not a reason to hide the flow.
The listing, dashboard, in-product grant UI, and privacy policy should all state:

> User-authored Automations can send values selected by the user—including the
> current page URL or extracted page content—to an endpoint the user configures
> and grants. Monocle does not operate those endpoints or receive the data sent
> to them.

The Automation editor/import review is the prominent in-product disclosure.
The endpoint-grant button is the affirmative capability gesture. Automatic
triggers remain off after import and cannot prompt for access.

### Remote-code declaration

Continue answering “No remote code.” HTTP responses are parsed as bounded JSON
data, and only explicitly mapped scalars enter a locally authored document's
existing value bag. Responses cannot contain steps, selectors, command ids,
markup, or scripts. The full behavior remains discernible from packaged code
and the local Automation document.

## Firefox AMO

Firefox 140+ has built-in consent for data collection/transmission. Mozilla's
definition includes handling outside the add-on or local browser, including
local native applications:

- [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Data-consent best practices](https://extensionworkshop.com/documentation/develop/best-practices-for-collecting-user-data-consents/)
- [`browser_specific_settings`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)

Use Firefox 140 as the minimum supported version for the outbound feature so
the implementation does not split into built-in and custom legacy consent
flows. Before release, confirm that raising `strict_min_version` to `140.0`
matches product support expectations; if it does not, STOP and design the
required legacy consent UI rather than silently transmitting on older Firefox.

### Manifest draft

The capability can transmit URLs, page content, the user's action, explicitly
supplied integration credentials, identifying literal/snippet values, and the
already-existing native-bridge search query. Declare:

```jsonc
"browser_specific_settings": {
  "gecko": {
    "id": "ff@monocle.com",
    "strict_min_version": "140.0",
    "data_collection_permissions": {
      "required": ["none"],
      "optional": [
        "authenticationInfo",
        "browsingActivity",
        "personallyIdentifyingInfo",
        "searchTerms",
        "websiteActivity",
        "websiteContent"
      ]
    }
  }
}
```

Request the outbound set when the user clicks “Grant endpoint access” on
Firefox. If consent is denied or later revoked, `httpRequest` fails before
fetching. Enabling the Native Bridge separately requests only the categories it
actually transmits (`browsingActivity` and `searchTerms`).

The existing `docs/store-submission.md` maps active-tab URL/title to
`websiteActivity`; correct that to `browsingActivity`. `websiteActivity` is the
interaction/action category, not the URL history category.

This category list is a reasoned draft, not legal advice. The release owner must
verify the current Mozilla taxonomy and the exact data referenced by the
shipping example before submission. Removing a category is allowed only when
the code makes transmitting that category impossible—not because the example
happens not to use it.

## Reviewer-note changes

Add a dedicated “Outbound Automations” section to both store submissions:

1. Automations are locally stored, strict-schema data interpreted by bundled
   code; there is still no arbitrary JavaScript.
2. Inline controls are rendered by a bundled component in a closed shadow root;
   no page/remote markup is accepted.
3. A click sends only ids to the background; the endpoint is re-read from the
   local document and checked against a concrete optional host grant.
4. Remote destinations require HTTPS; plaintext is exact-loopback only.
5. Fetches omit cookies/referrer, reject redirects, and cap both directions.
6. Imported automatic triggers are disarmed and import review lists outbound
   destinations before save.
7. Response JSON is bounded data mapped to named scalar variables; it never
   supplies executable definitions.
8. Native event delivery is not part of the HTTP release.

`docs/store-submission.md` now describes the effective network surface as the
two required external hosts plus user-selected HTTPS/exact-loopback Automation
destinations behind concrete optional grants.

## Release gates

Do not ship until all are true:

- [ ] Chrome and Firefox packaged manifests show the intended CSP and no broader
  remote HTTP source.
- [ ] A fresh profile must explicitly grant the destination before fetch.
- [ ] Firefox denial/revocation blocks the request before network activity.
- [ ] Incognito/private tabs are refused.
- [ ] Logs and run results contain no request/response values.
- [ ] Import review exposes every nested destination and custom header name.
- [ ] Chrome dashboard, listing, privacy policy, and reviewer notes agree.
- [ ] Firefox categories and minimum version have current-policy sign-off.
- [ ] The local IDE example uses authentication and no permissive CORS.
- [ ] Remote-code declaration remains “No,” with reviewer explanation above.
