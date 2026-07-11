import { describe, expect, it } from "vitest"
import { prepareUntrustedAutomation } from "./import"

describe("prepareUntrustedAutomation", () => {
  it("strips identity, stamps provenance, and disarms automatic triggers", () => {
    const result = prepareUntrustedAutomation(
      {
        format: "monocle-automation@1",
        script: {
          id: "remote-id",
          createdAt: 1,
          updatedAt: 2,
          owner: { kind: "feature", featureId: "bad-owner" },
          source: { kind: "local" },
          schemaVersion: 1,
          name: "Generated",
          enabled: true,
          triggers: [{ type: "manual" }, { type: "urlMatch", disarmed: false }],
          steps: [{ op: "toast", message: "Done" }],
        },
      },
      () => 123,
    )

    expect(result).toMatchObject({
      ok: true,
      draft: {
        source: { kind: "imported", importedAt: 123 },
        triggers: [{ type: "manual" }, { type: "urlMatch", disarmed: true }],
      },
    })
    if (result.ok) {
      expect(result.draft).not.toHaveProperty("id")
      expect(result.draft).not.toHaveProperty("owner")
    }
  })

  it("returns canonical field paths for invalid input", () => {
    const result = prepareUntrustedAutomation({ schemaVersion: 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(" ")).toContain("name")
  })
})
