// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { sendMessage } = vi.hoisted(() => ({ sendMessage: vi.fn() }))

vi.mock("./useSendMessage", () => ({
  useSendMessage: () => sendMessage,
}))

import { useKeybindingCapture } from "./useKeybindingCapture"

const eventFor = (key: string): React.KeyboardEvent =>
  ({
    key,
    code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    nativeEvent: {
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
    },
  }) as unknown as React.KeyboardEvent

const noConflict = {
  hasConflict: false,
  conflictingCommand: null,
}

beforeEach(() => {
  sendMessage.mockReset()
  sendMessage.mockResolvedValue(noConflict)
})

describe("useKeybindingCapture", () => {
  it("appends and normalizes a captured stroke", async () => {
    const { result } = renderHook(() =>
      useKeybindingCapture({
        commandId: "target",
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      }),
    )

    act(() => result.current.handleKeyDown(eventFor("g")))

    await waitFor(() => expect(result.current.keybinding).toBe("g"))
    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: "monocle-keybinding-conflict-check",
        keybinding: "g",
        excludeCommandId: "target",
      },
      undefined,
    )
  })

  it("does not complete while a conflict is present", async () => {
    const onComplete = vi.fn()
    sendMessage.mockResolvedValue({
      hasConflict: true,
      conflictingCommand: { id: "other", name: "Other" },
      conflictType: "exact",
    })
    const { result } = renderHook(() =>
      useKeybindingCapture({
        onComplete,
        onCancel: vi.fn(),
      }),
    )

    act(() => result.current.handleKeyDown(eventFor("g")))
    await waitFor(() => expect(result.current.canSave).toBe(false))
    act(() => result.current.handleKeyDown(eventFor("Enter")))

    expect(onComplete).not.toHaveBeenCalled()
  })

  it("pops a stroke with Backspace and re-checks the remaining sequence", async () => {
    const { result } = renderHook(() =>
      useKeybindingCapture({
        onComplete: vi.fn(),
        onCancel: vi.fn(),
      }),
    )

    act(() => result.current.handleKeyDown(eventFor("g")))
    await waitFor(() => expect(result.current.strokes).toEqual(["g"]))
    act(() => result.current.handleKeyDown(eventFor("h")))
    await waitFor(() => expect(result.current.strokes).toEqual(["g", "h"]))
    sendMessage.mockClear()

    act(() => result.current.handleKeyDown(eventFor("Backspace")))

    await waitFor(() => expect(result.current.keybinding).toBe("g"))
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ keybinding: "g" }),
      undefined,
    )
  })

  it("cancels on Escape", () => {
    const onCancel = vi.fn()
    const { result } = renderHook(() =>
      useKeybindingCapture({
        onComplete: vi.fn(),
        onCancel,
      }),
    )

    act(() => result.current.handleKeyDown(eventFor("Escape")))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("blocks requirement violations but allows non-blocking warnings", async () => {
    const onComplete = vi.fn()
    sendMessage.mockResolvedValueOnce({
      ...noConflict,
      requirementViolation: { message: "Use cmd, ctrl, or alt" },
    })
    const { result } = renderHook(() =>
      useKeybindingCapture({
        onComplete,
        onCancel: vi.fn(),
      }),
    )

    act(() => result.current.handleKeyDown(eventFor("g")))
    await waitFor(() =>
      expect(result.current.requirementViolation).toBe("Use cmd, ctrl, or alt"),
    )
    act(() => result.current.handleKeyDown(eventFor("Enter")))
    expect(onComplete).not.toHaveBeenCalled()

    sendMessage.mockResolvedValueOnce({
      ...noConflict,
      warnings: [
        {
          type: "prefix-overlap",
          direction: "candidate-extends-existing",
          command: { id: "other", name: "Other" },
          keybinding: "g",
        },
      ],
    })
    act(() => result.current.handleKeyDown(eventFor("h")))
    await waitFor(() => expect(result.current.canSave).toBe(true))
    act(() => result.current.handleKeyDown(eventFor("Enter")))

    expect(onComplete).toHaveBeenCalledWith("g, h")
  })
})
