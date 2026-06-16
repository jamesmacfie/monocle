import { all, create, type Unit } from "mathjs"

// A single mathjs instance shared by the Math and Units providers. Lives in the
// background bundle only (providers run inside handleSearchCommands) — it is
// never injected into pages.
const math = create(all)

// Capture the real evaluator BEFORE hardening. The math.import() below replaces
// the functions that can mutate global state or recurse (import, createUnit,
// evaluate, parse, simplify, derivative) with throwing stubs, per mathjs'
// documented injection-safety guidance — so an expression can never nest
// evaluate()/import()/createUnit(). Because that override also replaces the
// top-level math.evaluate API, we keep a reference to the original here. Nested
// evaluate/import *inside* an expression still resolve to the disabled stubs.
const realEvaluate = math.evaluate.bind(math)

const disabled = () => {
  throw new Error("disabled")
}

math.import(
  {
    import: disabled,
    createUnit: disabled,
    evaluate: disabled,
    parse: disabled,
    simplify: disabled,
    derivative: disabled,
  },
  { override: true },
)

// Evaluate an expression. Throws on unparseable input (the caller treats a
// throw as "did not parse").
export const evaluate = (expression: string): unknown =>
  realEvaluate(expression)

// mathjs' runtime type tag ("number", "Unit", "Complex", ...).
export const typeOf = (value: unknown): string =>
  math.typeOf(value as Parameters<typeof math.typeOf>[0])

// Formats a numeric result, collapsing floating-point artifacts (0.1 + 0.2 ->
// "0.3") and avoiding scientific notation for everyday magnitudes.
export const formatNumber = (value: number): string =>
  math.format(value, { precision: 12 }).replace(/^\+/, "")

// Formats a unit result (e.g. "1.6093 km").
export const formatUnit = (value: Unit): string =>
  math.format(value, { precision: 5 })
