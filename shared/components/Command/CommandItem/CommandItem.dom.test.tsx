// @vitest-environment jsdom
//
// Regression tests for plan 010: CommandItem rows are memoized with narrow
// props (primitives + stable callbacks), so unrelated page-state changes —
// like editing one inline input's form value — must not re-render every row.
// Render counting works by wrapping CommandItemAction (the action-row body)
// in a module mock; no production instrumentation.
import { waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { actionSuggestion, renderPalette } from "../../../test/renderPalette"
import type { Suggestion } from "../../../types"

const actionRenderSpy = vi.fn()

vi.mock("./CommandItemAction", async (importOriginal) => {
  const mod = (await importOriginal()) as {
    CommandItemAction: (props: unknown) => unknown
  }
  return {
    CommandItemAction: (props: unknown) => {
      actionRenderSpy()
      return mod.CommandItemAction(props)
    },
  }
})

const textInput = (id: string, required: boolean): Suggestion => ({
  type: "input",
  id,
  name: `${id} label`,
  inputField: {
    id: `${id}-field`,
    label: "Name",
    required,
    type: "text",
    placeholder: "type here",
  },
})

const submitSuggestion = (id: string): Suggestion => ({
  type: "submit",
  id,
  name: "Save",
  actionLabel: "Save it",
})

describe("CommandItem row memoization", () => {
  it("does not re-render action rows when another row's form value changes", async () => {
    const { user, container, getItem } = renderPalette({
      items: {
        favorites: [],
        suggestions: [
          textInput("name-input", false),
          submitSuggestion("save-form"),
          actionSuggestion("bystander-action", "Bystander Action"),
        ],
      },
    })

    await waitFor(() => {
      expect(getItem("bystander-action")).toBeTruthy()
    })
    const rendersAfterMount = actionRenderSpy.mock.calls.length
    expect(rendersAfterMount).toBeGreaterThan(0)

    // Typing into the inline input dispatches setFormValue per keystroke —
    // page state churns, but the bystander action row's props are all
    // stable, so its memo must hold.
    const inlineInput = container.querySelector(
      'input[placeholder="type here"]',
    ) as HTMLInputElement
    expect(inlineInput).toBeTruthy()
    await user.type(inlineInput, "hello")

    await waitFor(() => {
      expect(inlineInput.value).toBe("hello")
    })
    expect(actionRenderSpy.mock.calls.length).toBe(rendersAfterMount)
  })
})

describe("submit validation parity (moved from row to CommandList)", () => {
  it("blocks submit and skips execution when a required field is empty", async () => {
    const { user, getItem, executeCommand } = renderPalette({
      items: {
        favorites: [],
        suggestions: [
          textInput("name-input", true),
          submitSuggestion("save-form"),
        ],
      },
    })

    await waitFor(() => {
      expect(getItem("save-form").querySelector("button")).toBeTruthy()
    })
    const button = getItem("save-form").querySelector("button")
    await user.click(button as HTMLButtonElement)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(executeCommand).not.toHaveBeenCalled()
  })

  it("executes the submit command when the form is valid", async () => {
    const { user, getItem, executeCommand } = renderPalette({
      items: {
        favorites: [],
        suggestions: [
          textInput("name-input", false),
          submitSuggestion("save-form"),
        ],
      },
    })

    await waitFor(() => {
      expect(getItem("save-form").querySelector("button")).toBeTruthy()
    })
    const button = getItem("save-form").querySelector("button")
    await user.click(button as HTMLButtonElement)

    await waitFor(() => {
      expect(executeCommand).toHaveBeenCalledTimes(1)
    })
    expect(executeCommand.mock.calls[0][0]).toBe("save-form")
  })
})
