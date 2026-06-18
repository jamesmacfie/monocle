import { beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { clearReconnectAlarm, ensureReconnectAlarm } from "./reconnect"

const ALARM = "native-bridge:reconnect"

describe("native-bridge reconnect alarm", () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it("creates a periodic heartbeat alarm under the expected name", async () => {
    ensureReconnectAlarm()
    const alarm = await fakeBrowser.alarms.get(ALARM)
    expect(alarm).toBeDefined()
    expect(alarm?.periodInMinutes).toBe(1)
  })

  it("clears the heartbeat alarm", async () => {
    ensureReconnectAlarm()
    clearReconnectAlarm()
    const alarm = await fakeBrowser.alarms.get(ALARM)
    expect(alarm).toBeUndefined()
  })
})
