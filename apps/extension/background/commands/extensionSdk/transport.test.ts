import { afterEach, describe, expect, it, vi } from "vitest"
import type {
  ExternalInvokeRequest,
  ExtInvokeReply,
} from "../../../shared/types"
import { invokeExtension } from "./transport"

type Listener<T> = (value: T) => void

const request: ExternalInvokeRequest = {
  type: "children",
  callbackId: "children",
  commandId: "group",
  context: {
    url: "https://example.com",
    title: "Example",
    modifierKey: null,
  },
}

const installPort = () => {
  const messageListeners: Listener<ExtInvokeReply>[] = []
  const disconnectListeners: Array<() => void> = []
  const postMessage = vi.fn()
  const disconnect = vi.fn()
  const port = {
    onMessage: {
      addListener: (listener: Listener<ExtInvokeReply>) =>
        messageListeners.push(listener),
    },
    onDisconnect: {
      addListener: (listener: () => void) => disconnectListeners.push(listener),
    },
    postMessage,
    disconnect,
  }
  const connect = vi.fn(() => port)
  vi.stubGlobal("browser", undefined)
  vi.stubGlobal("chrome", { runtime: { id: "monocle", connect } })
  return {
    connect,
    disconnect,
    disconnectListeners,
    messageListeners,
    postMessage,
  }
}

const replyId = (postMessage: ReturnType<typeof vi.fn>): string =>
  postMessage.mock.calls[0][0].id as string

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("invokeExtension", () => {
  it("resolves and re-validates an ok command reply", async () => {
    const port = installPort()
    const promise = invokeExtension("peer", request)
    port.messageListeners[0]({
      v: 1,
      id: replyId(port.postMessage),
      ok: true,
      commands: [{ type: "display", id: "child", name: "Child" }],
    })
    await expect(promise).resolves.toEqual([
      { type: "display", id: "child", name: "Child" },
    ])
    expect(port.disconnect).toHaveBeenCalledOnce()
  })

  it("rejects invalid commands and explicit peer failures", async () => {
    const invalid = installPort()
    const invalidPromise = invokeExtension("peer", request)
    invalid.messageListeners[0]({
      v: 1,
      id: replyId(invalid.postMessage),
      ok: true,
      commands: [{ type: "display", id: "" }],
    })
    await expect(invalidPromise).rejects.toThrow()

    const failed = installPort()
    const failedPromise = invokeExtension("peer", request)
    failed.messageListeners[0]({
      v: 1,
      id: replyId(failed.postMessage),
      ok: false,
      error: { message: "Denied" },
    })
    await expect(failedPromise).rejects.toThrow("Denied")
  })

  it("rejects and disconnects on timeout", async () => {
    vi.useFakeTimers()
    const port = installPort()
    const promise = invokeExtension("peer", request)
    const assertion = expect(promise).rejects.toThrow("timed out")
    await vi.advanceTimersByTimeAsync(3000)
    await assertion
    expect(port.disconnect).toHaveBeenCalledOnce()
  })

  it("rejects when the peer disconnects", async () => {
    const port = installPort()
    const promise = invokeExtension("peer", request)
    port.disconnectListeners[0]()
    await expect(promise).rejects.toThrow("Extension disconnected")
  })

  it("ignores late replies after settlement", async () => {
    const port = installPort()
    const promise = invokeExtension("peer", request)
    const id = replyId(port.postMessage)
    port.messageListeners[0]({ v: 1, id, ok: true })
    await expect(promise).resolves.toBeUndefined()
    expect(() =>
      port.messageListeners[0]({
        v: 1,
        id,
        ok: false,
        error: { message: "late" },
      }),
    ).not.toThrow()
    expect(port.disconnect).toHaveBeenCalledOnce()
  })

  it("rejects when connect throws", async () => {
    vi.stubGlobal("browser", undefined)
    vi.stubGlobal("chrome", {
      runtime: {
        id: "monocle",
        connect: () => {
          throw new Error("No peer")
        },
      },
    })
    await expect(invokeExtension("peer", request)).rejects.toThrow("No peer")
  })
})
