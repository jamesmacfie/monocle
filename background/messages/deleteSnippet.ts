import type {
  DeleteSnippetMessage,
  DeleteSnippetResponse,
} from "../../shared/types"
import { invalidateSearchIndex } from "../commands/searchIndex"
import { removeCommandSettings } from "../commands/settings"
import { deleteSnippet as removeSnippet } from "../commands/snippets"
import { refreshKeybindingRegistry } from "../keybindings/registry"
import { createMessageHandler } from "../utils/messages"

const handleDeleteSnippet = async (
  message: DeleteSnippetMessage,
): Promise<DeleteSnippetResponse> => {
  const deleted = await removeSnippet(message.id)

  if (deleted) {
    // Drop the dangling per-command settings (keybinding, hidden, urlRules)
    // for the deleted snippet's command id, and rebuild the keybinding
    // registry: monocle-snippets changes don't trigger the monocle-settings
    // storage invalidation, so without this an orphaned binding could keep
    // firing until the registry TTL expires.
    await removeCommandSettings(`snippet-${message.id}`)
    await refreshKeybindingRegistry()
  }

  invalidateSearchIndex()
  return { deleted }
}

export const deleteSnippet = createMessageHandler(
  handleDeleteSnippet,
  "Failed to delete snippet",
)
