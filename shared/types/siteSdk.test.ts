import { describe, expect, it } from "vitest"
import {
  validateSiteSdkCommandList,
  validateSiteSdkRegistrations,
} from "./siteSdk"

const callback = { callbackId: "callback-1" }

const action = (id = "open-panel") => ({
  id,
  type: "action",
  name: "Open Panel",
  actionLabel: "Open",
  modifierActionLabel: { shift: "Open in Sidebar" },
  execute: callback,
})

describe("site SDK schema validation", () => {
  it("accepts every rendered command type", () => {
    const validation = validateSiteSdkRegistrations([
      {
        id: "docs",
        namespace: "docs",
        name: "Docs",
        icon: { type: "lucide", name: "BookOpen" },
        commands: [
          { ...action("root-action"), placement: "root" },
          {
            id: "submit-form",
            type: "submit",
            name: "Submit Form",
            actionLabel: "Submit",
            execute: callback,
          },
          {
            id: "group",
            type: "group",
            name: "Group",
            children: {
              type: "static",
              commands: [
                {
                  id: "text-input",
                  type: "input",
                  name: "Query",
                  field: {
                    id: "query",
                    type: "text",
                    label: "Query",
                    defaultValue: "monocle",
                  },
                },
                {
                  id: "select-input",
                  type: "input",
                  name: "Mode",
                  field: {
                    id: "mode",
                    type: "select",
                    label: "Mode",
                    options: [{ value: "fast", label: "Fast" }],
                  },
                },
                {
                  id: "checkbox-input",
                  type: "input",
                  name: "Enabled",
                  field: {
                    id: "enabled",
                    type: "checkbox",
                    label: "Enabled",
                    defaultChecked: true,
                  },
                },
                {
                  id: "switch-input",
                  type: "input",
                  name: "Switch",
                  field: {
                    id: "switch",
                    type: "switch",
                    label: "Switch",
                  },
                },
                {
                  id: "multi-input",
                  type: "input",
                  name: "Tags",
                  field: {
                    id: "tags",
                    type: "multi",
                    label: "Tags",
                    options: [{ value: "one", label: "One" }],
                    defaultValue: ["one"],
                  },
                },
                {
                  id: "text-list-input",
                  type: "input",
                  name: "Items",
                  field: {
                    id: "items",
                    type: "text-list",
                    label: "Items",
                    maxItems: 3,
                  },
                },
                {
                  id: "color-input",
                  type: "input",
                  name: "Color",
                  field: {
                    id: "color",
                    type: "color",
                    label: "Color",
                    defaultValue: "#ff0000",
                  },
                },
                {
                  id: "display-row",
                  type: "display",
                  name: "Display Row",
                  color: { custom: "#334455" },
                },
              ],
            },
          },
          {
            id: "callback-group",
            type: "group",
            name: "Callback Group",
            children: { type: "callback", callback },
          },
          {
            id: "search",
            type: "search",
            name: "Search",
            actionLabel: "Open",
            execute: callback,
            getResults: callback,
          },
        ],
      },
    ])

    expect(validation.success).toBe(true)
  })

  it("accepts curated SDK icons and rejects unregistered Lucide names", () => {
    expect(
      validateSiteSdkRegistrations([
        {
          id: "icons",
          namespace: "icons",
          icon: { type: "lucide", name: "Link" },
          commands: [
            {
              ...action("create-note"),
              icon: { type: "lucide", name: "FilePlus" },
            },
          ],
        },
      ]).success,
    ).toBe(true)

    expect(
      validateSiteSdkRegistrations([
        {
          id: "unregistered-icon",
          namespace: "unregistered-icon",
          commands: [
            {
              ...action(),
              icon: { type: "lucide", name: "Workflow" },
            },
          ],
        },
      ]).success,
    ).toBe(false)
  })

  it("accepts inline svg icons and rejects unsafe svg markup", () => {
    expect(
      validateSiteSdkRegistrations([
        {
          id: "svg-icons",
          namespace: "svg-icons",
          icon: {
            type: "svg",
            svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="tomato"/></svg>',
          },
          commands: [
            {
              ...action("create-note"),
              icon: {
                type: "svg",
                svg: '<svg viewBox="0 0 16 16"><rect width="16" height="16"/></svg>',
              },
            },
          ],
        },
      ]).success,
    ).toBe(true)

    expect(
      validateSiteSdkRegistrations([
        {
          id: "svg-script",
          namespace: "svg-script",
          commands: [
            {
              ...action(),
              icon: {
                type: "svg",
                svg: "<svg><script>alert(1)</script></svg>",
              },
            },
          ],
        },
      ]).success,
    ).toBe(false)

    expect(
      validateSiteSdkRegistrations([
        {
          id: "svg-handler",
          namespace: "svg-handler",
          commands: [
            {
              ...action(),
              icon: { type: "svg", svg: '<svg onload="alert(1)"></svg>' },
            },
          ],
        },
      ]).success,
    ).toBe(false)

    expect(
      validateSiteSdkRegistrations([
        {
          id: "svg-oversize",
          namespace: "svg-oversize",
          commands: [
            {
              ...action(),
              icon: {
                type: "svg",
                svg: `<svg>${"<!-- pad -->".repeat(2000)}</svg>`,
              },
            },
          ],
        },
      ]).success,
    ).toBe(false)
  })

  it("rejects invalid ids, duplicate ids, unsupported fields, and radio fields", () => {
    expect(
      validateSiteSdkRegistrations([
        {
          id: "bad",
          namespace: "bad",
          commands: [{ ...action("bad id") }],
        },
      ]).success,
    ).toBe(false)

    expect(
      validateSiteSdkRegistrations([
        {
          id: "dupes",
          namespace: "dupes",
          commands: [
            action("same"),
            {
              id: "group",
              type: "group",
              name: "Group",
              children: {
                type: "static",
                commands: [action("same")],
              },
            },
          ],
        },
      ]).success,
    ).toBe(false)

    expect(
      validateSiteSdkRegistrations([
        {
          id: "private-fields",
          namespace: "private-fields",
          commands: [{ ...action(), permissions: ["tabs"] }],
        },
      ]).success,
    ).toBe(false)

    expect(
      validateSiteSdkRegistrations([
        {
          id: "radio",
          namespace: "radio",
          commands: [
            {
              id: "radio-input",
              type: "input",
              name: "Radio",
              field: {
                id: "choice",
                type: "radio",
                label: "Choice",
                options: [{ value: "a", label: "A" }],
              },
            },
          ],
        },
      ]).success,
    ).toBe(false)
  })

  it("rejects invalid URL rules, arbitrary colors, reserved ids, and submit modifier labels", () => {
    expect(
      validateSiteSdkRegistrations([
        {
          id: "url-rules",
          namespace: "url-rules",
          commands: [
            {
              ...action(),
              urlRules: { allowUrls: ["ftp://example.com/*"] },
            },
          ],
        },
      ]).success,
    ).toBe(false)

    expect(
      validateSiteSdkRegistrations([
        {
          id: "color",
          namespace: "color",
          commands: [{ ...action(), color: "chartreuse" }],
        },
      ]).success,
    ).toBe(false)

    expect(
      validateSiteSdkRegistrations([
        {
          id: "reserved",
          namespace: "reserved",
          commands: [action("hide-from-domain-open")],
        },
      ]).success,
    ).toBe(false)

    expect(
      validateSiteSdkRegistrations([
        {
          id: "submit",
          namespace: "submit",
          commands: [
            {
              id: "submit",
              type: "submit",
              name: "Submit",
              modifierActionLabel: { shift: "Shift Submit" },
              execute: callback,
            },
          ],
        },
      ]).success,
    ).toBe(false)
  })

  it("allows root placement only for root registration declarations", () => {
    expect(
      validateSiteSdkRegistrations([
        {
          id: "root",
          namespace: "root",
          commands: [{ ...action(), placement: "root" }],
        },
      ]).success,
    ).toBe(true)

    expect(
      validateSiteSdkCommandList([{ ...action(), placement: "root" }], {
        allowPlacement: false,
      }).success,
    ).toBe(false)
  })
})
