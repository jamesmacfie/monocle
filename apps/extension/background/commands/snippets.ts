import type { Snippet } from "../../shared/types"
import { createStorageArea } from "../utils/storageArea"

const snippetsArea = createStorageArea<Snippet[]>({
  key: "monocle-snippets",
  defaults: () => [],
  label: "snippets",
})

export const getSnippets = async (): Promise<Snippet[]> => snippetsArea.load()

export const getSnippet = async (id: string): Promise<Snippet | undefined> => {
  const snippets = await snippetsArea.load()
  return snippets.find((snippet) => snippet.id === id)
}

export const addSnippet = async (input: {
  name: string
  body: string
}): Promise<Snippet> => {
  const now = Date.now()
  const snippet: Snippet = {
    id: crypto.randomUUID(),
    name: input.name,
    body: input.body,
    createdAt: now,
    updatedAt: now,
  }

  await snippetsArea.update((snippets) => [...snippets, snippet])
  return snippet
}

export const updateSnippet = async (
  id: string,
  updates: Partial<Pick<Snippet, "name" | "body">>,
): Promise<Snippet | undefined> => {
  let updated: Snippet | undefined
  await snippetsArea.update((snippets) => {
    const index = snippets.findIndex((snippet) => snippet.id === id)
    if (index === -1) {
      return snippets
    }

    updated = { ...snippets[index], ...updates, updatedAt: Date.now() }
    const next = [...snippets]
    next[index] = updated
    return next
  })
  return updated
}

// Bump and persist the {i} counter for a snippet, returning the value to
// render for this insertion. Unknown ids still render 1 so an insertion
// never fails over counter bookkeeping.
export const incrementSnippetCounter = async (id: string): Promise<number> => {
  let nextValue = 1
  await snippetsArea.update((snippets) => {
    const index = snippets.findIndex((snippet) => snippet.id === id)
    if (index === -1) {
      return snippets
    }

    nextValue = (snippets[index].insertCounter ?? 0) + 1
    const next = [...snippets]
    next[index] = { ...snippets[index], insertCounter: nextValue }
    return next
  })
  return nextValue
}

export const deleteSnippet = async (id: string): Promise<boolean> => {
  let deleted = false
  await snippetsArea.update((snippets) => {
    const index = snippets.findIndex((snippet) => snippet.id === id)
    if (index === -1) {
      return snippets
    }

    deleted = true
    return snippets.filter((snippet) => snippet.id !== id)
  })
  return deleted
}
