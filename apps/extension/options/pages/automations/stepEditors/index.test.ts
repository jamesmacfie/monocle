import { describe, expect, it } from "vitest"
import { AutomationStepSchema } from "../../../../shared/types/automationValidation"
import {
  createDefaultStepRow,
  FORM_OPS,
  STEP_EDITORS,
  STEP_OP_OPTIONS,
} from "."

describe("automation step editor registry", () => {
  it("creates a matching default for every option and valid JSON defaults", () => {
    for (const { op } of STEP_OP_OPTIONS) {
      const row = createDefaultStepRow(op)
      if (row.kind === "form") {
        expect(row.step.op).toBe(op)
        continue
      }

      expect(row.parsed, `${op} should produce a parsed step`).not.toBeNull()
      expect(row.parsed?.op).toBe(op)
      expect(
        AutomationStepSchema.safeParse(row.parsed).success,
        `${op} should produce a schema-valid default step`,
      ).toBe(true)
    }
  })

  it("derives every form option from the typed registry", () => {
    const formOptions = STEP_OP_OPTIONS.filter(({ op }) => FORM_OPS.has(op))
      .map(({ op }) => op)
      .sort()

    expect(formOptions).toEqual(Object.keys(STEP_EDITORS).sort())
  })

  it.each(["branch", "forEach", "while"] as const)(
    "edits %s through a structured form",
    (op) => {
      expect(createDefaultStepRow(op).kind).toBe("form")
    },
  )
})
