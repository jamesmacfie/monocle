import { evaluate, formatNumber } from "../mathInstance"
import type { CalculationProvider } from "../types"

// Only treat a query as arithmetic when it actually contains an operator or a
// function call, so bare numbers and words ("5", "gmail") are not echoed back
// as "5 = 5". Unit conversions (handled by the Units provider) produce a Unit,
// not a number, so they fall through here even if they reach evaluate.
const looksLikeExpression = (query: string): boolean =>
  /[+\-*/^%]/.test(query) || /[a-z]\w*\s*\(/i.test(query)

export const mathProvider: CalculationProvider = {
  id: "math",
  name: "Math",
  priority: 100,
  parse(query) {
    const trimmed = query.trim()
    if (!trimmed || !looksLikeExpression(trimmed)) {
      return null
    }

    let result: unknown
    try {
      result = evaluate(trimmed)
    } catch {
      return null
    }

    if (typeof result !== "number" || !Number.isFinite(result)) {
      return null
    }

    const value = formatNumber(result)
    return {
      content: [{ type: "keyValue", rows: [{ label: trimmed, value }] }],
      copyValue: value,
      icon: { type: "lucide", name: "Calculator" },
    }
  },
}
