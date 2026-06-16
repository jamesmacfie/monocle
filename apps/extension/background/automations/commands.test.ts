// Architecture: background tests. Command generation
// (background/automations/commands.ts): the Automations group's children —
// runnable rows for manual-trigger scripts, parameter forms, display rows
// for event-only scripts, exclusion of disabled scripts, durable command
// ids, urlRules passthrough, and keybinding requirements for typing
// scripts.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { GroupCommandNode } from "../../shared/types"
import { automationsGroup } from "./commands"
import { addAutomation } from "./storage"

const installBrowserStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
    },
  })
}

beforeEach(() => {
  fakeBrowser.reset()
  installBrowserStubs()
})

const context = { url: "https://dev.example.com", title: "", modifierKey: null }

const children = async () =>
  await (automationsGroup as GroupCommandNode).children(context)

describe("automation command generation", () => {
  it("shows a no-op row when no scripts exist", async () => {
    const nodes = await children()
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe("display")
  })

  it("maps manual-trigger scripts to durable runnable rows", async () => {
    const script = await addAutomation({
      schemaVersion: 1,
      name: "Dev login",
      enabled: true,
      urlRules: { allowUrls: ["dev.example.com"] },
      triggers: [{ type: "manual" }],
      steps: [
        {
          op: "fill",
          target: { strategy: "css", value: "#user" },
          text: "x",
        },
      ],
    })

    const nodes = await children()
    expect(nodes).toHaveLength(1)
    const node = nodes[0]

    expect(node).toMatchObject({
      type: "action",
      id: `automation-${script.id}`,
      name: "Dev login",
      urlRules: { allowUrls: ["dev.example.com"] },
    })
    // The script fills an input, so custom shortcuts must carry a
    // non-shift modifier (they fire while an editable element is focused).
    expect(node).toMatchObject({
      keybindingRequirements: { requireNonShiftModifier: true },
    })
  })

  it("renders manual triggers with parameters as a form group", async () => {
    await addAutomation({
      schemaVersion: 1,
      name: "Search env",
      enabled: true,
      triggers: [
        {
          type: "manual",
          parameters: [{ id: "query", label: "Query", type: "text" }],
        },
      ],
      steps: [
        {
          op: "openUrl",
          url: "https://example.com/?q={{params.query}}",
        },
      ],
    })

    const nodes = await children()
    expect(nodes[0].type).toBe("group")

    const formChildren = await (nodes[0] as GroupCommandNode).children(context)
    expect(formChildren.map((child) => child.type)).toEqual(["input", "submit"])
  })

  it("shows event-only scripts as display rows and hides disabled scripts", async () => {
    await addAutomation({
      schemaVersion: 1,
      name: "Auto-dismiss banner",
      enabled: true,
      triggers: [
        {
          type: "elementAppears",
          selector: { strategy: "css", value: ".banner" },
        },
      ],
      steps: [{ op: "click", target: { strategy: "css", value: ".banner" } }],
    })
    await addAutomation({
      schemaVersion: 1,
      name: "Disabled one",
      enabled: false,
      triggers: [{ type: "manual" }],
      steps: [{ op: "wait", for: { timeMs: 1 } }],
    })

    const nodes = await children()
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      type: "display",
      name: "Auto-dismiss banner",
    })
  })
})
