import type { CommandNode } from "../../../shared/types/"
import {
  interpolateSnippetBody,
  snippetBodyUsesCounter,
} from "../../../shared/utils/snippet-placeholders"
import {
  getActiveTab,
  sendErrorToastToActiveTab,
  sendSuccessToastToActiveTab,
  sendTabMessage,
} from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"
import {
  addSnippet,
  getSnippet,
  getSnippets,
  incrementSnippetCounter,
} from "../snippets"

// Form for creating a snippet from the palette. Persisted via the
// background-owned `monocle-snippets` storage module.
export const createSnippet: CommandNode = {
  type: "group",
  id: "create-snippet",
  name: "Create Snippet",
  description: "Save a reusable text snippet",
  icon: { type: "lucide", name: "FilePlus" },
  color: "teal",
  keywords: ["snippet", "text", "template", "save"],
  // Form fields must not leak into root search.
  enableDeepSearch: false,
  children: async () => [
    {
      type: "input",
      id: "create-snippet-name",
      name: "Name",
      field: {
        id: "name",
        label: "Name",
        type: "text",
        placeholder: "Snippet name",
        required: true,
        validation: { type: "string", minLength: 1 },
      },
    },
    {
      type: "input",
      id: "create-snippet-body",
      name: "Body",
      field: {
        id: "body",
        label: "Body",
        type: "textarea",
        placeholder:
          "Snippet text… supports {date:yyyy-MM-dd}, {url}, {title}, {i} and more",
        required: true,
        validation: { type: "string", minLength: 1 },
      },
    },
    {
      type: "submit",
      id: "create-snippet-execute",
      name: "Save Snippet",
      actionLabel: "Save Snippet",
      execute: async (_context, values) => {
        const name = values?.name?.trim() || ""
        const body = values?.body || ""

        if (!name || !body.trim()) {
          await sendErrorToastToActiveTab("Snippet needs a name and a body")
          return
        }

        await addSnippet({ name, body })
        await sendSuccessToastToActiveTab(`Saved snippet "${name}"`)
      },
    },
  ],
}

// Dynamic list of saved snippets. Selecting one inserts its body at the
// caret of the page's last-focused editable element; the content listener
// reports whether it inserted, and we fall back to a clipboard copy.
export const insertSnippet: CommandNode = {
  type: "group",
  id: "insert-snippet",
  name: "Insert Snippet",
  description: "Insert a saved snippet where the cursor is",
  icon: { type: "lucide", name: "Clipboard" },
  color: "teal",
  keywords: ["snippet", "paste", "text", "template"],
  enableDeepSearch: true,
  // Snippet ids are stable UUIDs, so child rows are durable enough for the
  // settings catalog (keyboard page management, favorites, hide).
  settingsCatalog: { includeChildren: true },
  children: async () => {
    const snippets = await getSnippets()

    if (snippets.length === 0) {
      return [
        createNoOpCommand(
          "no-snippets",
          "No snippets yet",
          "Use Create Snippet to add one",
        ),
      ]
    }

    return snippets.map(
      (snippet): CommandNode => ({
        type: "action",
        id: `snippet-${snippet.id}`,
        name: snippet.name,
        description:
          snippet.body.length > 100
            ? `${snippet.body.slice(0, 100)}…`
            : snippet.body,
        icon: { type: "lucide", name: "FileText" },
        color: "teal",
        actionLabel: "Insert",
        modifierActionLabel: {
          cmd: "Copy to Clipboard",
        },
        // Custom shortcuts must fire while an editable element is focused
        // (insert-at-cursor is the point), and the content event filter only
        // forwards editable-element keystrokes that carry cmd/ctrl/alt.
        keybindingRequirements: { requireNonShiftModifier: true },
        execute: async (context) => {
          const activeTab = await getActiveTab()
          if (!activeTab) {
            console.error("No active tab to insert snippet into")
            return
          }

          // Re-read at execute time: the captured node can be stale against
          // storage (registry/search-index TTL), and the {i} counter is
          // persisted there.
          const current = (await getSnippet(snippet.id)) ?? snippet
          const counter = snippetBodyUsesCounter(current.body)
            ? await incrementSnippetCounter(current.id)
            : undefined
          const { text } = interpolateSnippetBody(current.body, {
            url: context?.url,
            title: context?.title,
            counter,
          })

          const copyToClipboard = async () => {
            await sendTabMessage(activeTab.id, {
              type: "monocle-copyToClipboard",
              message: text,
            })
          }

          try {
            if (context?.modifierKey === "cmd") {
              await copyToClipboard()
              await sendSuccessToastToActiveTab(
                `Copied "${snippet.name}" to clipboard`,
              )
              return
            }

            const response = await sendTabMessage(activeTab.id, {
              type: "monocle-insertText",
              text,
            })

            if (!response?.inserted) {
              // Nothing focused on the page (or the new-tab page): fall
              // back to the clipboard so the snippet is still usable.
              await copyToClipboard()
              await sendSuccessToastToActiveTab(
                "No input focused — copied snippet to clipboard",
              )
            }
          } catch (error) {
            console.error(`Failed to insert snippet "${snippet.name}"`, error)
            await sendErrorToastToActiveTab("Failed to insert snippet")
          }
        },
      }),
    )
  },
}
