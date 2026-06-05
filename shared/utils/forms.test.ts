import { describe, expect, it } from "vitest"
import type { Suggestion } from "../types"
import {
  collectInputFieldsFromSuggestions,
  computeDefaultFormValues,
  validateFormValues,
} from "./forms"

describe("palette form helpers", () => {
  it("computes inline input defaults and validates required fields", () => {
    const suggestions: Suggestion[] = [
      {
        id: "name-input",
        name: "Name",
        type: "input",
        inputField: {
          id: "name",
          label: "Name",
          type: "text",
          defaultValue: "Monocle",
          required: true,
        },
      },
      {
        id: "tags-input",
        name: "Tags",
        type: "input",
        inputField: {
          id: "tags",
          label: "Tags",
          type: "multi",
          options: [
            { value: "browser", label: "Browser" },
            { value: "palette", label: "Palette" },
          ],
          defaultValue: ["browser"],
          required: true,
        },
      },
    ]

    expect(computeDefaultFormValues(suggestions)).toEqual({
      name: "Monocle",
      tags: ["browser"],
    })
    const fields = collectInputFieldsFromSuggestions(suggestions)

    expect(
      validateFormValues({ name: "Monocle", tags: ["browser"] }, fields)
        .isValid,
    ).toBe(true)
    expect(validateFormValues({ name: "", tags: [] }, fields)).toMatchObject({
      isValid: false,
      invalidFields: ["name", "tags"],
    })
  })
})
