// Architecture: background layer. Stages 2 and 3 of the user-script
// interpolation pipeline, plus the value-resolution pass that feeds stage 1
// (shared/utils/user-script-template.ts). Runs in the engine BEFORE steps
// are lowered and sent to the content script: snippet resolution and {i}
// counter persistence are background-owned, secrets round-trip once, and
// the content executor never learns templating. Resolution order per
// interpolatable field: {{...}} expansion (declared vars, trigger.*,
// params.*, inline snippet:<id> refs, loop scope) -> snippet placeholder
// expansion ({date:...}, {url}, ...) with the run's page context.
import type { UserScript } from "../../shared/types"
import {
  interpolateSnippetBody,
  snippetBodyUsesCounter,
} from "../../shared/utils/snippet-placeholders"
import {
  collectInlineSnippetReferences,
  interpolatableStrings,
} from "../../shared/utils/user-script-introspection"
import { expandTemplate } from "../../shared/utils/user-script-template"
import { getSnippet, incrementSnippetCounter } from "../commands/snippets"

export { interpolatableStrings }

export type UserScriptPageContext = {
  url?: string
  title?: string
}

/**
 * The mutable value bag for one run: declared vars, trigger/param
 * namespaces, resolved snippet refs, and runtime values written by
 * getText/setVariable as the run progresses.
 */
export type UserScriptValueBag = Record<string, string>

/**
 * Expands one interpolatable field: stage-1 {{...}} templates against the
 * value bag, then stage-3 snippet placeholders with the page context.
 * Unknown {{refs}} expand to "" (the builder warns at save time).
 */
export const interpolateField = (
  text: string,
  values: UserScriptValueBag,
  pageContext: UserScriptPageContext,
): string => {
  const expanded = expandTemplate(text, values).text
  return interpolateSnippetBody(expanded, {
    url: pageContext.url,
    title: pageContext.title,
  }).text
}

/**
 * Resolves one snippet into its interpolated body, bumping its persisted
 * {i} counter only when the body uses it — identical semantics to palette
 * insertion (background/commands/tools/snippets.ts), drawing from the same
 * counter sequence. Throws when the snippet no longer exists: a dangling
 * reference fails the run loudly rather than silently filling "".
 */
const resolveSnippetValue = async (
  snippetId: string,
  pageContext: UserScriptPageContext,
  reference: string,
): Promise<string> => {
  const snippet = await getSnippet(snippetId)
  if (!snippet) {
    throw new Error(`Snippet not found for ${reference}`)
  }

  const counter = snippetBodyUsesCounter(snippet.body)
    ? await incrementSnippetCounter(snippet.id)
    : undefined

  return interpolateSnippetBody(snippet.body, {
    url: pageContext.url,
    title: pageContext.title,
    counter,
  }).text
}

/**
 * Builds the initial value bag for a run: declared vars (literals, snippet
 * refs resolved + interpolated, runtime vars empty), the {{trigger.*}}
 * namespace, {{params.*}} from prompt-before-run values, and any inline
 * {{snippet:<id>}} references found in the script's interpolatable fields.
 */
export const buildInitialValueBag = async (
  script: UserScript,
  input: {
    pageContext: UserScriptPageContext
    trigger: { type: string; url?: string; matchedText?: string }
    paramValues?: Record<string, string>
  },
): Promise<UserScriptValueBag> => {
  const values: UserScriptValueBag = {}

  for (const [name, def] of Object.entries(script.vars ?? {})) {
    if (def.kind === "literal") {
      values[name] = def.value
    } else if (def.kind === "snippet") {
      values[name] = await resolveSnippetValue(
        def.snippetId,
        input.pageContext,
        `variable "${name}"`,
      )
    } else {
      values[name] = ""
    }
  }

  values["trigger.type"] = input.trigger.type
  values["trigger.url"] = input.trigger.url ?? input.pageContext.url ?? ""
  if (input.trigger.matchedText !== undefined) {
    values["trigger.matchedText"] = input.trigger.matchedText.slice(0, 500)
  }

  for (const [key, value] of Object.entries(input.paramValues ?? {})) {
    values[`params.${key}`] = value
  }

  // Inline {{snippet:<id>}} references resolve once per run, before any
  // step executes, so a snippet used twice renders identically.
  for (const snippetId of collectInlineSnippetReferences(script.steps)) {
    const reference = `snippet:${snippetId}`
    values[reference] = await resolveSnippetValue(
      snippetId,
      input.pageContext,
      `inline reference {{${reference}}}`,
    )
  }

  return values
}
