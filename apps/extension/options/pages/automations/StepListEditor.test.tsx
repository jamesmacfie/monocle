// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import type { AutomationStep } from "../../../shared/types"
import { StepListEditor } from "./StepListEditor"
import type { StepNodeState } from "./stepEditors"
import { countStepNodes, stepNodeFromStep } from "./stepTree"

afterEach(cleanup)

function Harness({
  initial,
  issues = [],
  depth = 0,
}: {
  initial: StepNodeState[]
  issues?: Array<{ path: string; message: string }>
  depth?: number
}) {
  const [nodes, setNodes] = useState(initial)
  return (
    <StepListEditor
      context={{
        path: ["steps"],
        label: "Automation",
        controlFlowDepth: depth,
        minimumSteps: 1,
        nested: false,
      }}
      issues={issues}
      nodes={nodes}
      snippets={[]}
      totalStepCount={countStepNodes(nodes)}
      onChange={setNodes}
    />
  )
}

describe("StepListEditor", () => {
  it("collapses later parent steps and keeps their row controls available", () => {
    render(
      <Harness
        initial={[
          stepNodeFromStep({ op: "toast", message: "First message" }),
          stepNodeFromStep({ op: "toast", message: "Second message" }),
        ]}
      />,
    )

    expect(
      screen
        .getByRole("button", { name: "Collapse Automation step 1" })
        .getAttribute("aria-expanded"),
    ).toBe("true")
    expect(
      screen
        .getByRole("button", { name: "Expand Automation step 2" })
        .getAttribute("aria-expanded"),
    ).toBe("false")
    expect(screen.getByDisplayValue("First message")).toBeTruthy()
    expect(screen.queryByDisplayValue("Second message")).toBeNull()

    fireEvent.click(
      screen.getByRole("button", { name: "Expand Automation step 2" }),
    )
    expect(screen.getByDisplayValue("Second message")).toBeTruthy()

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse Automation step 1" }),
    )
    expect(screen.queryByDisplayValue("First message")).toBeNull()
    expect(screen.getByLabelText("Automation step 1 operation")).toBeTruthy()
  })

  it("expands a collapsed parent step when a descendant has an error", async () => {
    const branch: AutomationStep = {
      op: "branch",
      if: { kind: "urlIncludes", value: "example.com" },
      then: [{ op: "toast", message: "Matched" }],
    }
    render(
      <Harness
        initial={[
          stepNodeFromStep({ op: "toast", message: "First" }),
          stepNodeFromStep(branch),
        ]}
        issues={[
          {
            path: "steps.1.then.0.message",
            message: "Message is required",
          },
        ]}
      />,
    )

    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Collapse Automation step 2" })
          .getAttribute("aria-expanded"),
      ).toBe("true"),
    )
    expect(screen.getByText("message: Message is required")).toBeTruthy()
  })

  it("opens a newly added step", () => {
    render(
      <Harness
        initial={[stepNodeFromStep({ op: "toast", message: "First" })]}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Add Step" }))

    expect(
      screen
        .getByRole("button", { name: "Collapse Automation step 2" })
        .getAttribute("aria-expanded"),
    ).toBe("true")
  })

  it("keeps disclosure state attached to a step while reordering", () => {
    render(
      <Harness
        initial={[
          stepNodeFromStep({ op: "toast", message: "First" }),
          stepNodeFromStep({ op: "toast", message: "Second" }),
        ]}
      />,
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Expand Automation step 2" }),
    )
    fireEvent.click(
      screen.getByRole("button", { name: "Collapse Automation step 1" }),
    )
    fireEvent.click(
      screen.getByRole("button", { name: "Move Automation step 2 up" }),
    )

    expect(
      screen
        .getByRole("button", { name: "Collapse Automation step 1" })
        .getAttribute("aria-expanded"),
    ).toBe("true")
    expect(screen.getByDisplayValue("Second")).toBeTruthy()
    expect(
      screen
        .getByRole("button", { name: "Expand Automation step 2" })
        .getAttribute("aria-expanded"),
    ).toBe("false")
    expect(screen.queryByDisplayValue("First")).toBeNull()
  })

  it("uses restrained frames to distinguish actions and nested step lists", () => {
    const surface: AutomationStep = {
      op: "showSurface",
      surfaceId: "actions",
      kind: "inline",
      placement: { selector: "#toolbar", position: "append" },
      content: {},
      actions: [
        {
          id: "open",
          label: "Open",
          steps: [{ op: "toast", message: "Opening" }],
        },
      ],
    }
    const { container } = render(
      <Harness initial={[stepNodeFromStep(surface)]} />,
    )

    const actionGroup = container.querySelector(
      '[data-automation-surface-actions="true"]',
    )
    const action = container.querySelector(
      '[data-automation-surface-action="true"]',
    )
    const nestedList = container.querySelector(
      '[data-automation-step-list="nested"]',
    )
    const nestedRow = container.querySelector(
      '[data-automation-step-row="nested"]',
    )

    for (const region of [actionGroup, action, nestedList, nestedRow]) {
      expect(region?.getAttribute("class")).toContain("border")
    }
    expect(action?.getAttribute("class")).toContain("rounded-md")
  })

  it("uses the same add-step controls inside a branch", () => {
    const branch: AutomationStep = {
      op: "branch",
      if: { kind: "urlIncludes", value: "example.com" },
      then: [{ op: "toast", message: "Matched" }],
    }
    render(<Harness initial={[stepNodeFromStep(branch)]} />)

    expect(screen.getByText("Nested steps · Then")).toBeTruthy()
    const selector = screen.getByLabelText("Step type to add to Then")
    fireEvent.change(selector, { target: { value: "click" } })
    const controls = selector.parentElement
    if (!controls) throw new Error("Expected nested add controls")
    fireEvent.click(within(controls).getByRole("button", { name: "Add Step" }))

    expect(
      (screen.getByLabelText("Then step 2 operation") as HTMLSelectElement)
        .value,
    ).toBe("click")
  })

  it("adds and removes an Otherwise path without JSON editing", () => {
    const branch: AutomationStep = {
      op: "branch",
      if: { kind: "urlIncludes", value: "example.com" },
      then: [],
    }
    render(<Harness initial={[stepNodeFromStep(branch)]} />)

    fireEvent.click(screen.getByRole("button", { name: "Add Otherwise" }))
    expect(screen.getByText("Nested steps · Otherwise")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Remove Otherwise" }))
    expect(screen.queryByText("Nested steps · Otherwise")).toBeNull()
  })

  it("removes navigation and deeper control flow at the maximum depth", () => {
    render(
      <Harness
        depth={3}
        initial={[stepNodeFromStep({ op: "toast", message: "Done" })]}
      />,
    )

    const selector = screen.getByLabelText("Step type to add to Automation")
    expect(
      within(selector).queryByRole("option", { name: "Navigate" }),
    ).toBeNull()
    expect(
      within(selector).queryByRole("option", { name: "Branch" }),
    ).toBeNull()
    expect(
      screen.getByText("Maximum branch and loop nesting depth reached."),
    ).toBeTruthy()
  })

  it("disables current-tab URL opening inside control flow", () => {
    render(
      <Harness
        depth={1}
        initial={[
          stepNodeFromStep({
            op: "openUrl",
            url: "https://example.com",
            disposition: "newTab",
          }),
        ]}
      />,
    )

    const disposition = screen.getByLabelText("Open in") as HTMLSelectElement
    const currentTab = within(disposition).getByRole("option", {
      name: /Current tab/,
    }) as HTMLOptionElement
    expect(currentTab.disabled).toBe(true)
  })

  it("expands a collapsed inline action when it has a validation error", async () => {
    const surface: AutomationStep = {
      op: "showSurface",
      surfaceId: "actions",
      kind: "inline",
      placement: { selector: "#toolbar", position: "append" },
      content: {},
      actions: [
        { id: "first", label: "First", steps: [{ op: "toast", message: "1" }] },
        {
          id: "second",
          label: "Second",
          steps: [{ op: "toast", message: "2" }],
        },
      ],
    }
    render(
      <Harness
        initial={[stepNodeFromStep(surface)]}
        issues={[{ path: "steps.0.actions.1.id", message: "Invalid id" }]}
      />,
    )

    const second = screen.getByRole("button", { name: "Edit button 2: Second" })
    await waitFor(() =>
      expect(second.getAttribute("aria-expanded")).toBe("true"),
    )
    expect(screen.getByText("id: Invalid id")).toBeTruthy()
  })

  it("adds inline buttons up to the schema limit", () => {
    const surface: AutomationStep = {
      op: "showSurface",
      surfaceId: "actions",
      kind: "inline",
      placement: { selector: "#toolbar", position: "append" },
      content: {},
      actions: [
        { id: "first", label: "First", steps: [{ op: "toast", message: "1" }] },
      ],
    }
    render(<Harness initial={[stepNodeFromStep(surface)]} />)

    const addButton = screen.getByRole("button", { name: "Add button" })
    fireEvent.click(addButton)
    fireEvent.click(addButton)
    fireEvent.click(addButton)
    fireEvent.click(addButton)

    expect(addButton.hasAttribute("disabled")).toBe(true)
    expect(screen.getByText("5 / 5")).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Edit button 5: Button 5" }),
    ).toBeTruthy()
  })
})
