import type {
  GetSnippetsMessage,
  GetSnippetsResponse,
} from "../../shared/types"
import { getSnippets as loadSnippets } from "../commands/snippets"
import { createMessageHandler } from "../utils/messages"

const handleGetSnippets = async (
  _message: GetSnippetsMessage,
): Promise<GetSnippetsResponse> => {
  const snippets = await loadSnippets()
  return { snippets }
}

export const getSnippets = createMessageHandler(
  handleGetSnippets,
  "Failed to get snippets",
)
