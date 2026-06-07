import { configureStore } from "@reduxjs/toolkit"
import { describe, expect, it, vi } from "vitest"
import type { Suggestion } from "../../../shared/types"
import type { ThunkApi } from "../index"
import navigationReducer, {
  addPage,
  getInitialStateWithCommands,
  navigateBack,
  navigateToCommand,
  type Page,
  refreshCurrentPage,
  searchCurrentPage,
  setFormValue,
  updateSearchValue,
} from "./navigation.slice"

function createStore(sendMessage: ThunkApi["sendMessage"] = async () => ({})) {
  return configureStore({
    reducer: { navigation: navigationReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: {
          extraArgument: { sendMessage } satisfies ThunkApi,
        },
      }),
    preloadedState: {
      navigation: getInitialStateWithCommands({
        favorites: [],
        suggestions: [],
      }),
    },
  })
}

function actionSuggestion(id: string, name = id): Suggestion {
  return {
    id,
    name,
    type: "action",
    actionLabel: "Run",
  }
}

function searchPage(overrides: Partial<Page> = {}): Page {
  return {
    id: "web-search",
    parentPath: ["web-search"],
    parent: {
      id: "web-search",
      name: "Web Search",
      type: "search",
      actionLabel: "Search",
    },
    commands: { favorites: [], suggestions: [] },
    searchValue: "",
    formValues: {},
    dynamicChildren: true,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
}

describe("navigation reducer", () => {
  it("pushes child pages, preserves previous search state, and navigates back", async () => {
    const childInput: Suggestion = {
      id: "query-input",
      name: "Query",
      type: "input",
      inputField: {
        id: "query",
        label: "Query",
        type: "text",
        defaultValue: "default query",
      },
    }
    const sendMessage = vi.fn(async () => ({
      openPage: true,
      dynamicChildren: false,
      children: [childInput],
    }))
    const store = createStore(sendMessage)

    store.dispatch(updateSearchValue("tool"))
    await store.dispatch(
      navigateToCommand({
        id: "tools",
        currentPage: store.getState().navigation.pages.at(-1)!,
      }),
    )

    expect(store.getState().navigation.pages).toHaveLength(2)
    expect(store.getState().navigation.pages[0].searchValue).toBe("tool")
    expect(store.getState().navigation.pages[1]).toMatchObject({
      id: "tools",
      searchValue: "",
      parentPath: ["tools"],
      formValues: { query: "default query" },
    })

    store.dispatch(navigateBack())

    expect(store.getState().navigation.pages).toHaveLength(1)
    expect(store.getState().navigation.pages[0].searchValue).toBe("tool")
  })

  it("updates inline form values on the current page", () => {
    const store = createStore()

    store.dispatch(addPage(searchPage()))
    store.dispatch(setFormValue({ fieldId: "query", value: "widgets" }))
    store.dispatch(setFormValue({ fieldId: "tags", value: ["one", "two"] }))

    expect(store.getState().navigation.pages.at(-1)?.formValues).toEqual({
      query: "widgets",
      tags: ["one", "two"],
    })
  })

  it("clears dynamic search children when search is emptied", () => {
    const store = createStore()

    store.dispatch(
      addPage(
        searchPage({
          searchValue: "widgets",
          commands: {
            favorites: [],
            suggestions: [actionSuggestion("stale-result")],
          },
        }),
      ),
    )

    store.dispatch(updateSearchValue(""))

    expect(store.getState().navigation.pages.at(-1)?.commands).toEqual({
      favorites: [],
      suggestions: [],
    })
  })

  it("does not let older dynamic search refresh responses overwrite newer results", async () => {
    const first = deferred<{ children: Suggestion[] }>()
    const second = deferred<{ children: Suggestion[] }>()
    const sendMessage = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const store = createStore(sendMessage)

    store.dispatch(addPage(searchPage()))

    store.dispatch(updateSearchValue("w"))
    const firstRefresh = store.dispatch(
      refreshCurrentPage({
        currentPage: store.getState().navigation.pages.at(-1)!,
      }),
    )

    store.dispatch(updateSearchValue("wi"))
    const secondRefresh = store.dispatch(
      refreshCurrentPage({
        currentPage: store.getState().navigation.pages.at(-1)!,
      }),
    )

    second.resolve({ children: [actionSuggestion("new-result")] })
    await secondRefresh

    expect(
      store.getState().navigation.pages.at(-1)?.commands.suggestions,
    ).toEqual([actionSuggestion("new-result")])

    first.resolve({ children: [actionSuggestion("old-result")] })
    await firstRefresh

    expect(
      store.getState().navigation.pages.at(-1)?.commands.suggestions,
    ).toEqual([actionSuggestion("new-result")])
  })

  it("applies search results only for the current query and drops stale responses", async () => {
    const first = deferred<{
      results: Suggestion[]
      seq: number
      query: string
    }>()
    const second = deferred<{
      results: Suggestion[]
      seq: number
      query: string
    }>()
    const sendMessage = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const store = createStore(sendMessage)

    store.dispatch(updateSearchValue("ta"))
    const firstSearch = store.dispatch(
      searchCurrentPage({
        pageId: "root",
        parentPath: [],
        query: "ta",
        seq: 1,
      }),
    )

    store.dispatch(updateSearchValue("tab"))
    const secondSearch = store.dispatch(
      searchCurrentPage({
        pageId: "root",
        parentPath: [],
        query: "tab",
        seq: 2,
      }),
    )

    second.resolve({
      results: [actionSuggestion("new-result")],
      seq: 2,
      query: "tab",
    })
    await secondSearch

    expect(store.getState().navigation.pages.at(-1)?.searchResults).toEqual([
      actionSuggestion("new-result"),
    ])
    expect(store.getState().navigation.pages.at(-1)?.searchLoading).toBe(false)

    // The slower first response is stale on both axes: lower seq and a query
    // the user has typed past
    first.resolve({
      results: [actionSuggestion("old-result")],
      seq: 1,
      query: "ta",
    })
    await firstSearch

    expect(store.getState().navigation.pages.at(-1)?.searchResults).toEqual([
      actionSuggestion("new-result"),
    ])
  })

  it("clears search results when the query is emptied", () => {
    const store = createStore()

    store.dispatch(updateSearchValue("tab"))
    store.dispatch(
      searchCurrentPage.fulfilled(
        { results: [actionSuggestion("a-result")], seq: 1, query: "tab" },
        "request-1",
        { pageId: "root", parentPath: [], query: "tab", seq: 1 },
      ),
    )

    expect(store.getState().navigation.pages.at(-1)?.searchResults).toEqual([
      actionSuggestion("a-result"),
    ])

    store.dispatch(updateSearchValue(""))

    expect(
      store.getState().navigation.pages.at(-1)?.searchResults,
    ).toBeUndefined()
  })
})
