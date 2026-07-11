import { describe, expect, it } from "vitest"
import { EXAMPLE_AUTOMATIONS } from "../../../shared/automations/examples"
import { buildAutomationGenerationInstructions } from "./prompt"

describe("automation generation prompt", () => {
  it("includes the complete authoring contract and every curated example", () => {
    const prompt = buildAutomationGenerationInstructions([])
    expect(prompt).toContain("Monocle Automations — authoring context")
    for (const example of EXAMPLE_AUTOMATIONS)
      expect(prompt).toContain(example.name)
    for (const op of [
      "click",
      "httpRequest",
      "branch",
      "forEach",
      "showSurface",
    ]) {
      expect(prompt).toContain(`"op": "${op}"`)
    }
    expect(prompt).toContain("No saved snippets are available")
  })

  it("includes snippet names and ids but has no input for snippet bodies", () => {
    const prompt = buildAutomationGenerationInstructions([
      { id: "snippet-123", name: "API token" },
    ])
    expect(prompt).toContain("API token: snippet-123")
    expect(prompt).toContain("names and ids only")
  })
})
