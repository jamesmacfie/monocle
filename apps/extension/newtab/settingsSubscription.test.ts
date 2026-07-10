import { describe, expect, it, vi } from "vitest"
import { subscribeToNewTabSettingsChanges } from "./settingsSubscription"

describe("new-tab settings subscription", () => {
  it("rehydrates on local settings changes and unsubscribes cleanly", () => {
    let listener:
      | ((changes: Record<string, unknown>, areaName: string) => void)
      | undefined
    const event = {
      addListener: vi.fn((next: typeof listener) => {
        listener = next
      }),
      removeListener: vi.fn(),
    }
    const onSettingsChanged = vi.fn()

    const unsubscribe = subscribeToNewTabSettingsChanges(
      event,
      onSettingsChanged,
    )

    listener?.({ other: { newValue: true } }, "local")
    listener?.({ "monocle-settings": { newValue: {} } }, "sync")
    expect(onSettingsChanged).not.toHaveBeenCalled()

    listener?.({ "monocle-settings": { newValue: {} } }, "local")
    expect(onSettingsChanged).toHaveBeenCalledTimes(1)

    unsubscribe()
    expect(event.removeListener).toHaveBeenCalledWith(listener)
  })
})
