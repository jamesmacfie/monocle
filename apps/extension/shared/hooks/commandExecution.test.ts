import { describe, expect, it } from "vitest"
import type { Suggestion } from "../../shared/types"
import type { Page } from "../store/slices/navigation.slice"
import {
  buildCommandExecutionRequest,
  extractParentNames,
  getPageExecutionScope,
  shouldRefreshCommandsAfterExecution,
} from "./commandExecution"

const parent: Suggestion = {
  id: "web-search",
  name: "Web Search",
  type: "search",
  actionLabel: "Search",
}

describe("command execution request", () => {
  it("builds scoped execution for dynamic search results without reading descriptions", () => {
    const selected: Suggestion = {
      id: "web-search-q-widgets",
      name: "widgets",
      description: "https://description.example/ignored",
      executionPayload: { dynamicUrl: "https://payload.example/search" },
      type: "action",
      actionLabel: "Open",
    }
    const page: Page = {
      id: "web-search",
      parent,
      parentPath: ["web-search"],
      dynamicChildren: true,
      searchValue: "widgets",
      commands: { favorites: [], suggestions: [selected] },
      formValues: { existing: "value" },
    }

    expect(buildCommandExecutionRequest(selected, page)).toEqual({
      id: "web-search-q-widgets",
      formValues: {
        existing: "value",
        dynamicUrl: "https://payload.example/search",
      },
      shouldNavigateBack: true,
      parentNames: ["Web Search"],
      executionScope: {
        pageId: "web-search",
        parentPath: ["web-search"],
        searchValue: "widgets",
      },
    })
  })

  it("extracts deep-search parent names from array names", () => {
    const selected: Suggestion = {
      id: "open-tab-1",
      name: ["Docs", "Open Tabs", "Browser"],
      type: "action",
      actionLabel: "Open",
    }
    const root: Page = {
      id: "root",
      parentPath: [],
      searchValue: "",
      commands: { favorites: [], suggestions: [] },
    }

    expect(extractParentNames(selected, root)).toEqual(["Open Tabs", "Browser"])
  })

  it("does not attach execution scope for root commands", () => {
    const root: Page = {
      id: "root",
      parentPath: [],
      searchValue: "",
      commands: { favorites: [], suggestions: [] },
    }

    expect(getPageExecutionScope(root)).toBeUndefined()
  })

  it("refreshes command data after commands that remain open", () => {
    expect(shouldRefreshCommandsAfterExecution(false)).toBe(true)
    expect(shouldRefreshCommandsAfterExecution(true)).toBe(false)
  })
})
