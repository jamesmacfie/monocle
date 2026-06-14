import type { Unit } from "mathjs"
import { evaluate, formatUnit, typeOf } from "../mathInstance"
import type { CalculationProvider } from "../types"

// Light aliasing for common informal unit names mathjs doesn't accept (e.g.
// "1 mile in kms"). Applied as whole-word replacements only inside a
// conversion query, so they never touch ordinary text. Kept deliberately small.
const UNIT_ALIASES: Record<string, string> = {
  kms: "km",
  kgs: "kg",
  lbs: "lb",
  hrs: "hr",
  secs: "s",
}

const applyAliases = (query: string): string =>
  query.replace(/[a-z]+/gi, (word) => UNIT_ALIASES[word.toLowerCase()] ?? word)

export const unitsProvider: CalculationProvider = {
  id: "units",
  name: "Units",
  priority: 90,
  parse(query) {
    const trimmed = query.trim()
    // Only attempt conversions of the shape "<expr> in|to <unit>".
    if (!/\s(in|to)\s/i.test(trimmed)) {
      return null
    }

    let result: unknown
    try {
      result = evaluate(applyAliases(trimmed))
    } catch {
      return null
    }

    if (!result || typeOf(result) !== "Unit") {
      return null
    }

    const value = formatUnit(result as Unit)
    // Show the source side ("1 mile") mapped to the formatted target ("1.6 km").
    const source = trimmed.replace(/\s(in|to)\s.*$/i, "").trim()
    return {
      content: [{ type: "keyValue", rows: [{ label: source, value }] }],
      copyValue: value,
      icon: { type: "lucide", name: "ArrowRight" },
    }
  },
}
