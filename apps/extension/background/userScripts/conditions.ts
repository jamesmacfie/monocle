// Architecture: background layer. Condition evaluation for user-script
// `branch`/`while` steps. Var conditions resolve engine-side against the
// run's value bag (after interpolation); element and URL conditions are
// answered by the content executor through short probe workflows supplied
// by the engine (a `wait` step for existence/visibility, `getText` for text
// reads) so element semantics match action steps exactly — one selector
// engine, no parallel DOM code path. Numeric comparisons fail loudly on
// non-numeric input rather than coercing to NaN-quiet false.
import type {
  UserScriptComparisonOperator,
  UserScriptCondition,
} from "../../shared/types"
import type {
  Selector,
  Step,
  WorkflowResult,
} from "../../shared/types/workflow"
import {
  interpolateField,
  type UserScriptPageContext,
  type UserScriptValueBag,
} from "./interpolate"

// How long an element probe polls before concluding the element is absent.
// Short by design: conditions describe the current page state, not a wait.
const PROBE_TIMEOUT_MS = 300

export type ConditionEnv = {
  values: UserScriptValueBag
  pageContext: UserScriptPageContext
  // Runs probe steps on the run's pinned tab via the workflow executor.
  runProbe: (steps: Step[]) => Promise<WorkflowResult>
}

/** Applies one comparison operator. Exported for direct unit testing. */
export const compareValues = (
  left: string,
  operator: UserScriptComparisonOperator,
  right: string,
): boolean => {
  switch (operator) {
    case "equals":
      return left === right
    case "equalsIgnoreCase":
      return left.toLowerCase() === right.toLowerCase()
    case "notEquals":
      return left !== right
    case "contains":
      return left.includes(right)
    case "notContains":
      return !left.includes(right)
    case "startsWith":
      return left.startsWith(right)
    case "endsWith":
      return left.endsWith(right)
    case "greaterThan":
    case "lessThan": {
      const leftNumber = Number(left)
      const rightNumber = Number(right)
      if (
        left.trim() === "" ||
        right.trim() === "" ||
        Number.isNaN(leftNumber) ||
        Number.isNaN(rightNumber)
      ) {
        throw new Error(
          `Numeric comparison needs numbers; got "${left}" and "${right}"`,
        )
      }
      return operator === "greaterThan"
        ? leftNumber > rightNumber
        : leftNumber < rightNumber
    }
  }
}

const probeSelectorState = async (
  env: ConditionEnv,
  selector: Selector,
  state: "attached" | "visible",
): Promise<boolean> => {
  const result = await env.runProbe([
    {
      op: "wait",
      timeoutMs: PROBE_TIMEOUT_MS,
      for: { selector, state },
    },
  ])
  return result.success
}

const probeElementText = async (
  env: ConditionEnv,
  selector: Selector,
): Promise<string | null> => {
  const result = await env.runProbe([
    {
      op: "getText",
      from: selector,
      toVar: "__monocleProbe",
    },
  ])

  if (!result.success) {
    return null
  }

  return result.vars?.__monocleProbe ?? ""
}

/**
 * Evaluates a condition tree. Element/URL questions round-trip to the
 * content executor; var questions resolve locally. Throws on numeric
 * comparison errors (the run fails loudly).
 */
export const evaluateCondition = async (
  condition: UserScriptCondition,
  env: ConditionEnv,
): Promise<boolean> => {
  switch (condition.kind) {
    case "elementExists":
      return await probeSelectorState(env, condition.selector, "attached")
    case "elementVisible":
      return await probeSelectorState(env, condition.selector, "visible")
    case "elementText": {
      const text = await probeElementText(env, condition.selector)
      if (text === null) {
        // Missing element: text comparisons are false rather than fatal so
        // branches can probe optional UI.
        return false
      }
      return compareValues(
        text,
        condition.operator,
        interpolateField(condition.value, env.values, env.pageContext),
      )
    }
    case "urlIncludes": {
      const result = await env.runProbe([
        {
          op: "wait",
          timeoutMs: 0,
          for: {
            urlIncludes: interpolateField(
              condition.value,
              env.values,
              env.pageContext,
            ),
          },
        },
      ])
      return result.success
    }
    case "varCompare":
      return compareValues(
        env.values[condition.name] ?? "",
        condition.operator,
        interpolateField(condition.value, env.values, env.pageContext),
      )
    case "varMatches": {
      // Pattern length and validity are schema-enforced; compiled without
      // user-supplied flags.
      const regex = new RegExp(condition.pattern)
      return regex.test(env.values[condition.name] ?? "")
    }
    case "not":
      return !(await evaluateCondition(condition.of, env))
    case "allOf": {
      for (const child of condition.of) {
        if (!(await evaluateCondition(child, env))) {
          return false
        }
      }
      return true
    }
    case "anyOf": {
      for (const child of condition.of) {
        if (await evaluateCondition(child, env)) {
          return true
        }
      }
      return false
    }
  }
}
