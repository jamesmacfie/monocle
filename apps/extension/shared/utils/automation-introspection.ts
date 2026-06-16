import type { AutomationCondition, AutomationStep } from "../types"
import { collectTemplateReferences } from "./automation-template"

export const collectConditionInterpolatableValues = (
  condition: AutomationCondition,
): string[] => {
  const values: string[] = []
  const walk = (current: AutomationCondition): void => {
    if (current.kind === "elementText" || current.kind === "varCompare") {
      values.push(current.value)
      return
    }
    if (current.kind === "not") {
      walk(current.of)
      return
    }
    if (current.kind === "allOf" || current.kind === "anyOf") {
      current.of.forEach(walk)
    }
  }
  walk(condition)
  return values
}

export const interpolatableStrings = (step: AutomationStep): string[] => {
  switch (step.op) {
    case "fill":
      return [step.text]
    case "setVariable":
      return [step.value]
    case "toast":
      return [step.message]
    case "navigate":
    case "openUrl":
      return [step.url]
    case "clipboardWrite":
      return [step.text]
    case "showSurface": {
      const values: string[] = []
      if (step.content.title !== undefined) {
        values.push(step.content.title)
      }
      if (step.content.text !== undefined) {
        values.push(step.content.text)
      }
      return values
    }
    case "branch":
      return collectConditionInterpolatableValues(step.if)
    case "while":
      return collectConditionInterpolatableValues(step.condition)
    default:
      return []
  }
}

export const walkAutomationSteps = (
  steps: AutomationStep[],
  visit: (step: AutomationStep) => void,
): void => {
  for (const step of steps) {
    visit(step)
    if (step.op === "branch") {
      walkAutomationSteps(step.then, visit)
      if (step.else) {
        walkAutomationSteps(step.else, visit)
      }
    } else if (step.op === "forEach" || step.op === "while") {
      walkAutomationSteps(step.steps, visit)
    }
  }
}

export const collectInlineSnippetReferences = (
  steps: AutomationStep[],
): string[] => {
  const references = new Set<string>()
  walkAutomationSteps(steps, (step) => {
    for (const text of interpolatableStrings(step)) {
      for (const reference of collectTemplateReferences(text)) {
        if (reference.startsWith("snippet:")) {
          references.add(reference.slice("snippet:".length))
        }
      }
    }
  })
  return [...references]
}
