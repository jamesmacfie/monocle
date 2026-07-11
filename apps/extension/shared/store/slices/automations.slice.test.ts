import { describe, expect, it } from "vitest"
import type { Automation, AutomationDraft } from "../../../shared/types"
import automationsReducer, {
  addAutomation,
  loadAutomations,
} from "./automations.slice"

const draft: AutomationDraft = {
  schemaVersion: 1,
  name: "First automation",
  enabled: true,
  triggers: [{ type: "manual" }],
  steps: [{ op: "toast", message: "Done" }],
}

const automation: Automation = {
  ...draft,
  id: "automation-id",
  createdAt: 1,
  updatedAt: 1,
}

describe("automations reducer", () => {
  it("keeps one automation when a storage reload arrives before add fulfillment", () => {
    const loaded = automationsReducer(
      undefined,
      loadAutomations.fulfilled(
        { automations: [automation] },
        "load-request",
        undefined,
      ),
    )

    const reconciled = automationsReducer(
      loaded,
      addAutomation.fulfilled(automation, "add-request", {
        automation: draft,
      }),
    )

    expect(reconciled.automations).toEqual([automation])
  })

  it("keeps one automation when add fulfillment arrives before a storage reload", () => {
    const added = automationsReducer(
      undefined,
      addAutomation.fulfilled(automation, "add-request", {
        automation: draft,
      }),
    )

    const reconciled = automationsReducer(
      added,
      loadAutomations.fulfilled(
        { automations: [automation] },
        "load-request",
        undefined,
      ),
    )

    expect(reconciled.automations).toEqual([automation])
  })
})
