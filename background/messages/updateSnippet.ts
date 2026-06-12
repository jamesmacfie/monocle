import type {
  UpdateSnippetMessage,
  UpdateSnippetResponse,
} from "../../shared/types"
import { invalidateSearchIndex } from "../commands/searchIndex"
import { updateSnippet as applySnippetUpdate } from "../commands/snippets"
import { invalidateKeybindingEntriesCache } from "../keybindings/source"
import { createMessageHandler } from "../utils/messages"

const handleUpdateSnippet = async (
  message: UpdateSnippetMessage,
): Promise<UpdateSnippetResponse> => {
  const snippet = await applySnippetUpdate(message.id, {
    ...(message.name !== undefined ? { name: message.name.trim() } : {}),
    ...(message.body !== undefined ? { body: message.body } : {}),
  })

  invalidateSearchIndex()
  if (snippet && message.name !== undefined) {
    // Keybinding conflict messages surface the cached entry name; a rename
    // only needs the cheap entries-cache invalidation, not a full rebuild.
    invalidateKeybindingEntriesCache()
  }
  return { snippet: snippet ?? null }
}

export const updateSnippet = createMessageHandler(
  handleUpdateSnippet,
  "Failed to update snippet",
)
