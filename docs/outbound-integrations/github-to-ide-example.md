# GitHub to IDE Example

> **Status: proposed; the Automation below will not validate until Phases 1–2
> are implemented.** Replace the selector and snippet id for the target GitHub
> layout and local IDE installation.

## Outcome

On a matching GitHub repository page, Monocle inserts an isolated “Open in IDE”
control into `#repository-container-header`. Clicking it:

1. reads the visible repository name;
2. POSTs the current URL, owner/name URL segments, and visible name to an
   authenticated loopback IDE endpoint;
3. maps `requestId` from the IDE's JSON response; and
4. shows a success toast.

The selector is intentionally configuration, not a claim that GitHub will keep
that DOM forever. Use **Test on Active Tab** after GitHub UI changes.

## Automation export

Create a snippet containing the IDE's dedicated bearer token and replace
`REPLACE_WITH_IDE_TOKEN_SNIPPET_ID` below with its id. Do not put the token
literal in the Automation export.

```json
{
  "format": "monocle-automation@1",
  "note": "Keybindings are not exported: shortcuts are personal command settings, not part of the automation document.",
  "script": {
    "id": "2dca4c90-85c4-43be-97ea-86db5ac9af12",
    "schemaVersion": 1,
    "name": "Open GitHub repository in IDE",
    "description": "Adds an Open in IDE control to GitHub repository headers.",
    "icon": "Code",
    "color": "purple",
    "enabled": true,
    "urlRules": {
      "allowUrls": [
        "https://github.com/*/*"
      ]
    },
    "triggers": [
      {
        "type": "urlMatch",
        "on": [
          "load",
          "spa"
        ],
        "oncePerPage": true,
        "disarmed": false
      }
    ],
    "vars": {
      "ideToken": {
        "kind": "snippet",
        "snippetId": "REPLACE_WITH_IDE_TOKEN_SNIPPET_ID"
      },
      "repositoryName": {
        "kind": "runtime"
      },
      "ideStatus": {
        "kind": "runtime"
      },
      "requestId": {
        "kind": "runtime"
      }
    },
    "steps": [
      {
        "op": "showSurface",
        "surfaceId": "github-open-in-ide",
        "kind": "inline",
        "urlMatch": {
          "allowUrls": [
            "https://github.com/*/*"
          ]
        },
        "placement": {
          "selector": "#repository-container-header",
          "index": 0,
          "position": "append"
        },
        "content": {
          "text": "Monocle IDE"
        },
        "actions": [
          {
            "id": "open-repository",
            "label": "Open in IDE",
            "icon": "Code",
            "style": "primary",
            "steps": [
              {
                "op": "getText",
                "from": {
                  "strategy": "css",
                  "value": "#repository-container-header strong[itemprop=\"name\"] a"
                },
                "toVar": "repositoryName"
              },
              {
                "op": "httpRequest",
                "method": "POST",
                "url": "http://127.0.0.1:43121/monocle/events",
                "headers": {
                  "Authorization": "Bearer {{ideToken}}"
                },
                "body": {
                  "event": "github.openRepository",
                  "source": "monocle",
                  "url": "{{trigger.url}}",
                  "owner": "{{trigger.pathSegments.0}}",
                  "repository": "{{trigger.pathSegments.1}}",
                  "visibleName": "{{repositoryName}}"
                },
                "timeoutMs": 10000,
                "response": {
                  "statusToVar": "ideStatus",
                  "json": [
                    {
                      "path": [
                        "requestId"
                      ],
                      "toVar": "requestId",
                      "required": true
                    }
                  ]
                }
              },
              {
                "op": "toast",
                "level": "success",
                "message": "Sent {{repositoryName}} to the IDE ({{requestId}})"
              }
            ]
          }
        ]
      }
    ],
    "options": {
      "showResultToast": false
    },
    "createdAt": 0,
    "updatedAt": 0,
    "source": {
      "kind": "local"
    }
  }
}
```

### Fresh-action consequence

The action run is fresh, so `trigger.url` and its URL-part accessors describe
the GitHub tab at click time. `repositoryName` starts empty and is populated by
the action's own `getText`. No values from the earlier `urlMatch` setup run are
stored in the surface.

## IDE endpoint contract

The IDE listens on exact loopback only:

```text
POST http://127.0.0.1:43121/monocle/events
Authorization: Bearer <dedicated random integration token>
Content-Type: application/json
```

Expected body:

```json
{
  "event": "github.openRepository",
  "source": "monocle",
  "url": "https://github.com/example/project",
  "owner": "example",
  "repository": "project",
  "visibleName": "project"
}
```

Success response:

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{"requestId":"ide-request-uuid"}
```

The endpoint must:

- bind `127.0.0.1` (and optionally a separately configured `::1` listener), not
  all network interfaces;
- generate and store a CSPRNG token of at least 32 random bytes;
- compare the bearer token without logging it;
- reject missing/invalid auth with 401;
- reject every method/path except this POST endpoint;
- reject bodies over 64 KiB and non-JSON content;
- validate `event === "github.openRepository"` and the payload strings;
- reject arbitrary shell commands or executable arguments;
- enqueue a typed internal IDE action; and
- return only a request id, not workspace contents or secrets.

Do not enable wildcard CORS. A browser webpage does not need access to this
endpoint. If the server handles `Origin`, deny ordinary `http(s)` origins and
authenticate every request regardless.

## Manual walkthrough

1. Start the IDE receiver and confirm it is bound only to loopback.
2. Create the token snippet and replace the placeholder id in the export.
3. Import the Automation. Confirm import review lists:
   - GitHub URL scope;
   - one inline surface action;
   - `POST http://127.0.0.1:43121/monocle/events`;
   - custom `Authorization` header name; and
   - the snippet reference without showing its value.
4. Confirm the imported URL trigger is disarmed by the import pipeline. Review
   the document, then arm it manually.
5. Click “Grant endpoint access” and grant only
   `http://127.0.0.1/*`. On Firefox, accept the displayed optional data
   categories.
6. Open two GitHub repositories in separate tabs. Confirm the control appears
   in both after the trigger runs.
7. Navigate within GitHub using SPA links. Confirm the control moves/reappears
   when the repository header is replaced.
8. Click the button in one tab. Confirm only that tab's URL/repository reaches
   the IDE, the button disables while pending, and the request-id toast appears.
9. Revoke endpoint access and click again. Confirm no network request occurs and
   Monocle reports the missing grant.
10. Return a redirect, a 500, oversized JSON, invalid JSON, a missing
    `requestId`, and an object-valued `requestId`; confirm each fails without
    logging payloads.
11. Enable the extension in a private/incognito window and repeat. Confirm the
    outbound step is refused.
12. Stop the IDE and confirm a bounded network failure with no automatic retry.

## Expected maintenance

GitHub's DOM is not a Monocle contract. When the selector stops matching, update
only the Automation configuration and example doc unless the generic inline
renderer itself is broken. Do not add GitHub-specific fallback selectors to the
renderer.

