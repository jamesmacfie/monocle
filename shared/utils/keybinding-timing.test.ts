import { describe, expect, it } from "vitest"
import {
  CHORD_TIMEOUT_MS,
  UI_SEQUENCE_IDLE_TIMEOUT_MS,
} from "./keybinding-timing"

describe("keybinding timing", () => {
  it("keeps the UI sequence buffer alive strictly longer than the background chord window", () => {
    expect(UI_SEQUENCE_IDLE_TIMEOUT_MS).toBeGreaterThan(CHORD_TIMEOUT_MS)
  })
})
