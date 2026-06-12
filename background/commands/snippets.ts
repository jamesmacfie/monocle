import type { Snippet } from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { withStorageLock } from "../utils/storageMutex"

const STORAGE_KEY = "monocle-snippets"

// Load snippets from storage
const loadSnippets = async (): Promise<Snippet[]> => {
  try {
    const result = (await getBrowserAPI().storage.local.get(
      STORAGE_KEY,
    )) as Record<string, Snippet[] | undefined>
    return result[STORAGE_KEY] || []
  } catch (error) {
    console.error("Failed to load snippets:", error)
    return []
  }
}

// Save snippets to storage
const saveSnippets = async (snippets: Snippet[]): Promise<void> => {
  try {
    await getBrowserAPI().storage.local.set({
      [STORAGE_KEY]: snippets,
    })
  } catch (error) {
    console.error("Failed to save snippets:", error)
  }
}

export const getSnippets = async (): Promise<Snippet[]> => {
  return loadSnippets()
}

export const getSnippet = async (id: string): Promise<Snippet | undefined> => {
  const snippets = await loadSnippets()
  return snippets.find((snippet) => snippet.id === id)
}

export const addSnippet = async (input: {
  name: string
  body: string
}): Promise<Snippet> =>
  withStorageLock(STORAGE_KEY, async () => {
    const snippets = await loadSnippets()
    const now = Date.now()
    const snippet: Snippet = {
      id: crypto.randomUUID(),
      name: input.name,
      body: input.body,
      createdAt: now,
      updatedAt: now,
    }

    snippets.push(snippet)
    await saveSnippets(snippets)
    return snippet
  })

export const updateSnippet = async (
  id: string,
  updates: Partial<Pick<Snippet, "name" | "body">>,
): Promise<Snippet | undefined> =>
  withStorageLock(STORAGE_KEY, async () => {
    const snippets = await loadSnippets()
    const index = snippets.findIndex((snippet) => snippet.id === id)

    if (index === -1) {
      return undefined
    }

    const updated: Snippet = {
      ...snippets[index],
      ...updates,
      updatedAt: Date.now(),
    }

    snippets[index] = updated
    await saveSnippets(snippets)
    return updated
  })

export const deleteSnippet = async (id: string): Promise<boolean> =>
  withStorageLock(STORAGE_KEY, async () => {
    const snippets = await loadSnippets()
    const index = snippets.findIndex((snippet) => snippet.id === id)

    if (index === -1) {
      return false
    }

    snippets.splice(index, 1)
    await saveSnippets(snippets)
    return true
  })
