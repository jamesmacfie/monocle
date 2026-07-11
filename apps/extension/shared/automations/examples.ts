// Architecture: shared automation data. The curated example automations
// seeded by the "Add Example Automations" button on the Automations list
// page (options/pages/AutomationsPage.tsx). Each entry is a plain
// AutomationDraft saved through the normal add-automation message, so the
// shared schema validates them like any user-authored document
// (examples.test.ts locks that in). Together they exercise every trigger
// type and most of the step vocabulary, doubling as living documentation of
// what automations can do. Event and scheduled triggers ship DISARMED —
// matching the import trust posture — so seeding examples never starts
// non-gesture execution; descriptions tell the user to scope and arm them
// in the editor.
import type { AutomationDraft } from "../types/automationValidation"

export const EXAMPLE_AUTOMATIONS: AutomationDraft[] = [
  // elementAppears + branch/else + click + toast
  {
    schemaVersion: 1,
    name: "Example: Dismiss cookie banner",
    description:
      "Clicks an “Accept all” button when one exists. Arm the element trigger (and scope it with URL rules) to dismiss banners automatically.",
    icon: "Cookie",
    color: "amber",
    enabled: true,
    triggers: [
      { type: "manual" },
      {
        type: "elementAppears",
        selector: { strategy: "text", value: "Accept all" },
        disarmed: true,
      },
    ],
    steps: [
      {
        op: "branch",
        if: {
          kind: "elementExists",
          selector: { strategy: "text", value: "Accept all" },
        },
        then: [
          { op: "click", target: { strategy: "text", value: "Accept all" } },
          { op: "toast", level: "success", message: "Cookie banner dismissed" },
        ],
        else: [
          { op: "toast", level: "info", message: "No cookie banner found" },
        ],
      },
    ],
  },

  // getText + runtime vars + setVariable + transforms + clipboardWrite +
  // stage-3 placeholders
  {
    schemaVersion: 1,
    name: "Example: Copy heading and URL",
    description:
      "Reads the page's main heading and copies “Heading — URL” to the clipboard.",
    icon: "Copy",
    color: "blue",
    enabled: true,
    triggers: [{ type: "manual" }],
    vars: {
      heading: { kind: "runtime" },
      summary: { kind: "runtime" },
    },
    steps: [
      // Read the heading only when one exists, so the run never aborts on a
      // headingless page — the else arm falls back to the title placeholder.
      {
        op: "branch",
        if: {
          kind: "elementExists",
          selector: { strategy: "css", value: "h1" },
        },
        then: [
          {
            op: "getText",
            from: { strategy: "css", value: "h1" },
            toVar: "heading",
          },
        ],
        else: [{ op: "setVariable", name: "heading", value: "{title}" }],
      },
      {
        op: "setVariable",
        name: "summary",
        value: "{{heading | trim}} — {url}",
      },
      { op: "clipboardWrite", text: "{{summary}}" },
      {
        op: "toast",
        level: "success",
        message: "Copied: {{summary | slice:0:60}}",
      },
    ],
  },

  // manual parameters + openUrl + encodeUriComponent + {domain} placeholder
  {
    schemaVersion: 1,
    name: "Example: Search this site",
    description:
      "Prompts for a query, then opens a Google search limited to the current site.",
    icon: "Search",
    color: "green",
    enabled: true,
    triggers: [
      {
        type: "manual",
        parameters: [
          {
            id: "query",
            label: "Search for",
            type: "text",
            placeholder: "What are you looking for?",
            required: true,
          },
        ],
      },
    ],
    steps: [
      {
        op: "openUrl",
        url: "https://www.google.com/search?q=site:{domain}+{{params.query | encodeUriComponent}}",
        disposition: "newTab",
      },
    ],
  },

  // manual parameters + branch + fill + submit
  {
    schemaVersion: 1,
    name: "Example: Fill and submit search",
    description:
      "Prompts for text, fills the page's search box, and submits its form.",
    icon: "Send",
    color: "lightBlue",
    enabled: true,
    triggers: [
      {
        type: "manual",
        parameters: [
          { id: "query", label: "Search text", type: "text", required: true },
        ],
      },
    ],
    steps: [
      {
        op: "branch",
        if: {
          kind: "elementExists",
          selector: { strategy: "css", value: 'input[type="search"]' },
        },
        then: [
          {
            op: "fill",
            target: { strategy: "css", value: 'input[type="search"]' },
            text: "{{params.query}}",
          },
          {
            op: "submit",
            target: { strategy: "css", value: 'input[type="search"]' },
          },
        ],
        else: [
          { op: "toast", level: "info", message: "No search box on this page" },
        ],
      },
    ],
  },

  // urlMatch trigger + branch + focus
  {
    schemaVersion: 1,
    name: "Example: Focus search on arrival",
    description:
      "Puts the cursor in the page's search box. Arm the page trigger and scope it to sites where you always search first.",
    icon: "TextCursorInput",
    color: "teal",
    enabled: true,
    triggers: [
      { type: "manual" },
      { type: "urlMatch", on: ["load", "spa"], disarmed: true },
    ],
    steps: [
      {
        op: "branch",
        if: {
          kind: "elementExists",
          selector: {
            strategy: "css",
            value: 'input[type="search"], input[name="q"]',
          },
        },
        then: [
          {
            op: "focus",
            target: {
              strategy: "css",
              value: 'input[type="search"], input[name="q"]',
            },
          },
        ],
        else: [
          { op: "toast", level: "info", message: "No search box on this page" },
        ],
      },
    ],
  },

  // hideElement (reversible) + injectCss + toast
  {
    schemaVersion: 1,
    name: "Example: Declutter this page",
    description:
      "Hides sidebars and narrows the main column for reading. Reload the page to restore it.",
    icon: "EyeOff",
    color: "purple",
    enabled: true,
    triggers: [{ type: "manual" }],
    steps: [
      // Narrowing the column always applies; hiding sidebars is guarded so a
      // page without one doesn't abort the run before the toast.
      {
        op: "injectCss",
        css: "main, article { max-width: 72ch; margin-left: auto; margin-right: auto; }",
      },
      {
        op: "branch",
        if: {
          kind: "elementExists",
          selector: { strategy: "css", value: 'aside, [role="complementary"]' },
        },
        then: [
          {
            op: "hideElement",
            target: {
              strategy: "css",
              value: 'aside, [role="complementary"]',
            },
            all: true,
          },
        ],
      },
      {
        op: "toast",
        level: "success",
        message: "Decluttered — reload to restore",
      },
    ],
  },

  // forEach over elements (body steps pinned to the current match)
  {
    schemaVersion: 1,
    name: "Example: Check every checkbox",
    description:
      "Loops over every checkbox on the page and checks it (great on the test-inputs fixture page).",
    icon: "ListChecks",
    color: "green",
    enabled: true,
    triggers: [{ type: "manual" }],
    steps: [
      {
        op: "forEach",
        over: {
          elements: { strategy: "css", value: 'input[type="checkbox"]' },
        },
        maxIterations: 50,
        steps: [
          {
            op: "check",
            target: { strategy: "css", value: 'input[type="checkbox"]' },
          },
        ],
      },
      { op: "toast", level: "success", message: "Checked every checkbox" },
    ],
  },

  // while loop with a hard cap + click + wait
  {
    schemaVersion: 1,
    name: "Example: Click “Load more” until done",
    description:
      "Keeps clicking a “Load more” button (up to 10 times) until it disappears.",
    icon: "ArrowDownToLine",
    color: "indigo",
    enabled: true,
    triggers: [{ type: "manual" }],
    steps: [
      {
        op: "while",
        condition: {
          kind: "elementExists",
          selector: { strategy: "text", value: "Load more" },
        },
        maxIterations: 10,
        steps: [
          { op: "click", target: { strategy: "text", value: "Load more" } },
          { op: "wait", for: { timeMs: 800 } },
        ],
      },
      { op: "toast", level: "success", message: "Nothing more to load" },
    ],
  },

  // interval trigger + runCommand (allowlisted for non-manual runs)
  {
    schemaVersion: 1,
    name: "Example: Reload dashboard periodically",
    description:
      "Reloads the current tab. Arm the interval trigger and add an allow URL rule for your dashboard before relying on it.",
    icon: "RefreshCw",
    color: "orange",
    enabled: true,
    triggers: [
      { type: "manual" },
      { type: "interval", everyMinutes: 30, disarmed: true },
    ],
    steps: [{ op: "runCommand", commandId: "reload-current-tab" }],
  },

  // schedule + onStartup triggers + multiple openUrl
  {
    schemaVersion: 1,
    name: "Example: Open morning tabs",
    description:
      "Opens your calendar and mail in new tabs. Arm the schedule (09:00) or startup trigger to make it routine.",
    icon: "Sun",
    color: "yellow",
    enabled: true,
    triggers: [
      { type: "manual" },
      { type: "schedule", at: "09:00", disarmed: true },
      { type: "onStartup", disarmed: true },
    ],
    steps: [
      {
        op: "openUrl",
        url: "https://calendar.google.com",
        disposition: "newTab",
      },
      { op: "openUrl", url: "https://mail.google.com", disposition: "newTab" },
      { op: "toast", level: "success", message: "Morning tabs opened" },
    ],
  },

  // elementText condition + anyOf combinator + runCommand
  {
    schemaVersion: 1,
    name: "Example: Back away from dead pages",
    description:
      "If the page heading says 404 or “Page not found”, goes back to the previous page.",
    icon: "ArrowLeft",
    color: "red",
    enabled: true,
    triggers: [
      { type: "manual" },
      { type: "urlMatch", on: ["load"], disarmed: true },
    ],
    steps: [
      {
        op: "branch",
        if: {
          kind: "anyOf",
          of: [
            {
              kind: "elementText",
              selector: { strategy: "css", value: "h1" },
              operator: "contains",
              value: "404",
            },
            {
              kind: "elementText",
              selector: { strategy: "css", value: "h1" },
              operator: "contains",
              value: "Page not found",
            },
          ],
        },
        then: [
          { op: "toast", level: "error", message: "Dead page — going back" },
          { op: "runCommand", commandId: "go-back" },
        ],
        else: [{ op: "toast", level: "info", message: "This page looks fine" }],
      },
    ],
  },
]
