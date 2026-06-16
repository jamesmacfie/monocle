import type { AddSnippetMessage, AddSnippetResponse } from "../../shared/types"
import { invalidateSearchIndex } from "../commands/searchIndex"
import { addSnippet as createSnippet } from "../commands/snippets"
import { createMessageHandler } from "../utils/messages"

const handleAddSnippet = async (
  message: AddSnippetMessage,
): Promise<AddSnippetResponse> => {
  const snippet = await createSnippet({
    name: message.name.trim(),
    body: message.body,
  })

  // Snippets surface as deep-search children of insert-snippet.
  invalidateSearchIndex()
  return { snippet }
}

export const addSnippet = createMessageHandler(
  handleAddSnippet,
  "Failed to add snippet",
)
