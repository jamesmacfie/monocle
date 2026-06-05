import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import type { CommandNode, SubmitCommandNode } from "../../../shared/types"
import { clearAllSettings, getCommandSettings } from "../settings"
import { manageAllowList } from "./manageAllowList"
import { manageDenyList } from "./manageDenyList"

const normalContext = {
  url: "https://example.com/page",
  title: "Example",
  modifierKey: null,
}

const installChromeStubs = () => {
  vi.stubGlobal("browser", fakeBrowser)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
      lastError: null,
    },
    tabs: {
      query: vi.fn((_queryInfo: object, callback?: Function) => {
        callback?.([])
        return Promise.resolve([])
      }),
    },
  })
}

const getSubmitCommand = async (
  group: Extract<CommandNode, { type: "group" }>,
  commandId: string,
  submitId: string,
): Promise<SubmitCommandNode> => {
  const commandGroups = await group.children(normalContext)
  const commandGroup = commandGroups.find(
    (command) => command.id === `${commandId}-${submitId}-group`,
  ) as Extract<CommandNode, { type: "group" }>
  const children = await commandGroup.children(normalContext)

  return children.find(
    (command) => command.type === "submit",
  ) as SubmitCommandNode
}

beforeEach(async () => {
  fakeBrowser.reset()
  installChromeStubs()
  await clearAllSettings()
})

describe("URL-rule management commands", () => {
  it("validates and persists allow-list patterns", async () => {
    const saveAllow = await getSubmitCommand(manageAllowList, "uuidv4", "allow")

    await saveAllow.execute(normalContext, {
      "allow-patterns": "*://*.example.com/*",
    })

    await expect(getCommandSettings("uuidv4")).resolves.toEqual({
      urlRules: {
        allowUrls: ["*://*.example.com/*"],
      },
    })

    await expect(
      saveAllow.execute(normalContext, {
        "allow-patterns": "ftp://example.com/*",
      }),
    ).rejects.toThrow("Invalid pattern")
  })

  it("validates and persists deny-list patterns", async () => {
    const saveDeny = await getSubmitCommand(manageDenyList, "uuidv4", "deny")

    await saveDeny.execute(normalContext, {
      "deny-patterns": "*://blocked.example.com/*",
    })

    await expect(getCommandSettings("uuidv4")).resolves.toEqual({
      urlRules: {
        denyUrls: ["*://blocked.example.com/*"],
      },
    })

    await expect(
      saveDeny.execute(normalContext, {
        "deny-patterns": "ftp://example.com/*",
      }),
    ).rejects.toThrow("Invalid pattern")
  })
})
