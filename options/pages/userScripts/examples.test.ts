// Architecture: options/ tests. Guards the curated example automations
// (examples.ts) against the shared document schema, so the "Add Example
// Automations" button can never seed a document the background would reject,
// and so a future schema tightening fails here loudly rather than at the
// user's click.
import { describe, expect, it } from "vitest"
import type { UserScriptTriggerType } from "../../../shared/types/userScripts"
import { validateUserScriptDraft } from "../../../shared/types/userScriptValidation"
import { EXAMPLE_AUTOMATIONS } from "./examples"

describe("example automations", () => {
  it("every example validates against the shared draft schema", () => {
    for (const example of EXAMPLE_AUTOMATIONS) {
      const result = validateUserScriptDraft(example)
      expect(
        result.success,
        `"${example.name}" should validate; errors: ${
          result.success
            ? ""
            : result.errors.map((e) => `${e.path}: ${e.message}`).join("; ")
        }`,
      ).toBe(true)
    }
  })

  it("has unique names so duplicate-guarding by name works", () => {
    const names = EXAMPLE_AUTOMATIONS.map((example) => example.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("ships every non-manual trigger disarmed (no surprise execution)", () => {
    for (const example of EXAMPLE_AUTOMATIONS) {
      for (const trigger of example.triggers) {
        if (trigger.type !== "manual") {
          expect(
            (trigger as { disarmed?: boolean }).disarmed,
            `"${example.name}" trigger ${trigger.type} must ship disarmed`,
          ).toBe(true)
        }
      }
    }
  })

  it("collectively exercises every trigger type", () => {
    const seen = new Set<UserScriptTriggerType>()
    for (const example of EXAMPLE_AUTOMATIONS) {
      for (const trigger of example.triggers) {
        seen.add(trigger.type)
      }
    }

    const expected: UserScriptTriggerType[] = [
      "manual",
      "urlMatch",
      "elementAppears",
      "interval",
      "schedule",
      "onStartup",
    ]
    for (const type of expected) {
      expect(seen.has(type), `no example uses the ${type} trigger`).toBe(true)
    }
  })
})
