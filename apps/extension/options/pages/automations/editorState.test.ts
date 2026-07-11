import { describe, expect, it, vi } from "vitest"
import { EXAMPLE_AUTOMATIONS } from "../../../shared/automations/examples"
import type { Automation, AutomationDraft } from "../../../shared/types"
import {
  assembleDraft,
  collectTemplateWarnings,
  createEmptyEditorState,
  editorStateFromScript,
  groupIssuesByIndex,
} from "./editorState"
import { prepareImportedDraft } from "./importExport"

const storedAutomation = (
  draft: AutomationDraft,
  index: number,
): Automation => ({
  ...draft,
  id: `automation-${index}`,
  createdAt: 1,
  updatedAt: 1,
})

describe("automation editor state", () => {
  it("defaults success notifications off and persists an explicit opt-in", () => {
    const state = createEmptyEditorState()
    expect(state.options?.showResultToast).not.toBe(true)

    const assembled = assembleDraft({
      ...state,
      name: "Notify me",
      options: { showResultToast: true },
    })

    expect(assembled.draft).toMatchObject({
      options: { showResultToast: true },
    })
  })

  it("round-trips every example without changing its draft", () => {
    EXAMPLE_AUTOMATIONS.forEach((example, index) => {
      const assembled = assembleDraft(
        editorStateFromScript(storedAutomation(example, index)),
      )

      expect(assembled.issues).toEqual([])
      expect(assembled.draft).toEqual(example)
    })
  })

  it("warns only for unknown template namespaces", () => {
    const draft: AutomationDraft = {
      schemaVersion: 1,
      name: "Template namespaces",
      enabled: true,
      triggers: [{ type: "manual" }],
      steps: [
        {
          op: "toast",
          message:
            "{{trigger.url}} {{params.query}} {{snippet:welcome}} {{missing}}",
        },
      ],
    }

    expect(collectTemplateWarnings(draft)).toEqual(["missing"])
  })

  it("groups indexed validation issues without losing nested path detail", () => {
    expect(
      groupIssuesByIndex(
        [
          { path: "steps.2.target.value", message: "Required" },
          { path: "steps.2", message: "Invalid step" },
          { path: "triggers.0.at", message: "Invalid time" },
          { path: "name", message: "Required" },
        ],
        "steps",
      ),
    ).toEqual({
      2: ["target.value: Required", "Invalid step"],
    })
  })
})

describe("automation import", () => {
  it("disarms every imported non-manual trigger", () => {
    vi.spyOn(Date, "now").mockReturnValue(123)
    const candidate = {
      ...EXAMPLE_AUTOMATIONS[0],
      triggers: [
        { type: "manual" as const },
        { type: "urlMatch" as const, on: ["load" as const], disarmed: false },
        { type: "interval" as const, everyMinutes: 15, disarmed: false },
        { type: "schedule" as const, at: "09:00", disarmed: false },
        { type: "onStartup" as const, disarmed: false },
      ],
    }

    const prepared = prepareImportedDraft(JSON.stringify(candidate))

    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    expect(
      prepared.draft.triggers
        .filter((trigger) => trigger.type !== "manual")
        .every((trigger) => trigger.disarmed === true),
    ).toBe(true)
    expect(prepared.draft.source).toEqual({
      kind: "imported",
      importedAt: 123,
    })
  })
})
