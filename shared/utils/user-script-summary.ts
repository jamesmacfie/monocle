// Architecture: shared/ utility layer. Builds the human-readable summary of
// a user-script document — the import-safety surface (docs/user-scripts.md):
// before an imported document is saved, every URL pattern, trigger, op
// class, snippet reference, opened URL, and invoked command is enumerated so
// the user reviews exactly what the automation can do. Also used by the
// options list view for scope/step blurbs. Pure (document in, strings out)
// so the options page and tests share one implementation.
import type {
  UserScript,
  UserScriptStep,
  UserScriptTrigger,
} from "../types/userScripts"

export type UserScriptSummary = {
  // "Runs on *.dev.example.com · never on …" (empty scope = every page)
  scope: string
  // One line per trigger, e.g. "when you run it (manual)"
  triggers: string[]
  // Op-class counts, e.g. "fills 2 fields", "clicks 2 elements"
  actions: string[]
  // Referenced snippet ids (vars + insertSnippet + inline refs are the
  // callers' to resolve into names)
  snippetIds: string[]
  // Interpolated URL templates the script navigates to or opens
  openedUrls: string[]
  // Command ids invoked via runCommand
  runCommandIds: string[]
  usesClipboard: boolean
}

const TRIGGER_LABELS: Record<UserScriptTrigger["type"], string> = {
  manual: "when you run it (manual)",
  urlMatch: "automatically when a matching page opens",
  elementAppears: "automatically when an element appears",
  interval: "on a repeating interval",
  schedule: "on a daily schedule",
  onStartup: "when the browser starts",
}

const OP_LABELS: Record<string, [singular: string, plural: string]> = {
  click: ["clicks 1 element", "clicks {n} elements"],
  fill: ["fills 1 field", "fills {n} fields"],
  type: ["types into 1 field", "types into {n} fields"],
  key: ["sends 1 key combo", "sends {n} key combos"],
  select: ["picks 1 dropdown option", "picks {n} dropdown options"],
  check: ["checks 1 checkbox", "checks {n} checkboxes"],
  uncheck: ["unchecks 1 checkbox", "unchecks {n} checkboxes"],
  submit: ["submits 1 form", "submits {n} forms"],
  focus: ["moves focus", "moves focus {n} times"],
  blur: ["clears focus", "clears focus {n} times"],
  hover: ["hovers 1 element", "hovers {n} elements"],
  scroll: ["scrolls the page", "scrolls {n} times"],
  wait: ["waits for the page", "waits {n} times"],
  getText: ["reads text from the page", "reads text {n} times"],
  removeElement: ["removes 1 element", "removes {n} elements"],
  hideElement: ["hides 1 element", "hides {n} elements"],
  injectCss: ["restyles the page", "injects CSS {n} times"],
  toast: ["shows 1 notification", "shows {n} notifications"],
  setVariable: ["sets 1 variable", "sets {n} variables"],
  insertSnippet: ["inserts 1 snippet", "inserts {n} snippets"],
  navigate: ["navigates this tab", "navigates {n} times"],
  openUrl: ["opens 1 URL", "opens {n} URLs"],
  clipboardWrite: [
    "writes to the clipboard",
    "writes to the clipboard {n} times",
  ],
  runCommand: ["runs 1 Monocle command", "runs {n} Monocle commands"],
  branch: ["has 1 condition", "has {n} conditions"],
  forEach: ["loops over elements", "has {n} loops"],
  while: ["loops while a condition holds", "has {n} loops"],
}

const walkSteps = (
  steps: UserScriptStep[],
  visit: (step: UserScriptStep) => void,
): void => {
  for (const step of steps) {
    visit(step)
    if (step.op === "branch") {
      walkSteps(step.then, visit)
      if (step.else) {
        walkSteps(step.else, visit)
      }
    } else if (step.op === "forEach" || step.op === "while") {
      walkSteps(step.steps, visit)
    }
  }
}

const INLINE_SNIPPET_REF = /\{\{\s*snippet:([\w-]+)/g

/** Builds the full review summary for a document. */
export const summarizeUserScript = (
  script: Pick<UserScript, "urlRules" | "triggers" | "steps" | "vars">,
): UserScriptSummary => {
  const allow = script.urlRules?.allowUrls ?? []
  const deny = script.urlRules?.denyUrls ?? []
  const scopeParts: string[] = []
  scopeParts.push(
    allow.length > 0 ? `Runs on ${allow.join(", ")}` : "Runs on every page",
  )
  if (deny.length > 0) {
    scopeParts.push(`never on ${deny.join(", ")}`)
  }

  const opCounts = new Map<string, number>()
  const snippetIds = new Set<string>()
  const openedUrls: string[] = []
  const runCommandIds: string[] = []
  let usesClipboard = false

  for (const def of Object.values(script.vars ?? {})) {
    if (def.kind === "snippet") {
      snippetIds.add(def.snippetId)
    }
  }

  walkSteps(script.steps, (step) => {
    opCounts.set(step.op, (opCounts.get(step.op) ?? 0) + 1)

    if (step.op === "insertSnippet") {
      snippetIds.add(step.snippetId)
    }
    if (step.op === "navigate" || step.op === "openUrl") {
      openedUrls.push(step.url)
    }
    if (step.op === "runCommand") {
      runCommandIds.push(step.commandId)
    }
    if (step.op === "clipboardWrite") {
      usesClipboard = true
    }
    if (
      step.op === "fill" ||
      step.op === "toast" ||
      step.op === "setVariable"
    ) {
      const text =
        step.op === "fill"
          ? step.text
          : step.op === "toast"
            ? step.message
            : step.value
      for (const match of text.matchAll(INLINE_SNIPPET_REF)) {
        snippetIds.add(match[1])
      }
    }
  })

  const actions: string[] = []
  for (const [op, count] of opCounts) {
    const labels = OP_LABELS[op]
    if (!labels) {
      actions.push(`${op} ×${count}`)
      continue
    }
    actions.push(
      count === 1 ? labels[0] : labels[1].replace("{n}", String(count)),
    )
  }

  return {
    scope: scopeParts.join(" · "),
    triggers: script.triggers.map(
      (trigger) => TRIGGER_LABELS[trigger.type] ?? trigger.type,
    ),
    actions,
    snippetIds: [...snippetIds],
    openedUrls,
    runCommandIds,
    usesClipboard,
  }
}

/** One-line digest for list rows: "3 steps · manual · dev.example.com". */
export const userScriptBlurb = (
  script: Pick<UserScript, "urlRules" | "triggers" | "steps">,
): string => {
  let stepCount = 0
  walkSteps(script.steps, () => {
    stepCount += 1
  })

  const triggerTypes = [...new Set(script.triggers.map((t) => t.type))].join(
    ", ",
  )
  const allow = script.urlRules?.allowUrls ?? []
  const scope =
    allow.length > 0 ? allow[0] + (allow.length > 1 ? "…" : "") : "all pages"

  return `${stepCount} step${stepCount === 1 ? "" : "s"} · ${triggerTypes} · ${scope}`
}
