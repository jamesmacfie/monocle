import type {
  DeleteSnippetMessage,
  DeleteSnippetResponse,
} from "../../shared/types"
import { invalidateSearchIndex } from "../commands/searchIndex"
import { deleteSnippet as removeSnippet } from "../commands/snippets"
import { createMessageHandler } from "../utils/messages"

const handleDeleteSnippet = async (
  message: DeleteSnippetMessage,
): Promise<DeleteSnippetResponse> => {
  const deleted = await removeSnippet(message.id)

  invalidateSearchIndex()
  return { deleted }
}

export const deleteSnippet = createMessageHandler(
  handleDeleteSnippet,
  "Failed to delete snippet",
)
