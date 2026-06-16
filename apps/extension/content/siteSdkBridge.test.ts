import { parseHTML } from "linkedom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { initializeSiteSdkBridge } from "./siteSdkBridge"
import { installMonocleSiteSdk } from "./siteSdkFacade"

type RuntimeListener = (
  message: any,
  sender: any,
  sendResponse: (response?: any) => void,
) => boolean | undefined

const installDom = () => {
  const { window, document } = parseHTML(
    "<!doctype html><html><head><title>Fixture</title></head><body></body></html>",
  )

  Object.defineProperty(window, "location", {
    value: { href: "https://example.com/page" },
    configurable: true,
  })
  Object.defineProperty(window, "postMessage", {
    value(data: unknown) {
      setTimeout(() => {
        const event = new window.Event("message")
        Object.defineProperty(event, "data", {
          value: data,
          configurable: true,
        })
        Object.defineProperty(event, "source", {
          value: window,
          configurable: true,
        })
        window.dispatchEvent(event)
      }, 0)
    },
    configurable: true,
  })

  vi.stubGlobal("window", window)
  vi.stubGlobal("document", document)
}

const installChrome = () => {
  const runtimeListeners: RuntimeListener[] = []
  const sentMessages: any[] = []

  const chromeApi = {
    runtime: {
      id: "monocle-test",
      sendMessage: vi.fn(async (message: any) => {
        sentMessages.push(message)
        return { success: true }
      }),
      onMessage: {
        addListener: vi.fn((listener: RuntimeListener) => {
          runtimeListeners.push(listener)
        }),
      },
    },
  }

  vi.stubGlobal("chrome", chromeApi)
  vi.stubGlobal("browser", chromeApi)

  return { runtimeListeners, sentMessages }
}

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
}

const sendRuntimeMessage = (
  listener: RuntimeListener,
  message: any,
): Promise<any> => {
  return new Promise((resolve) => {
    listener(message, {}, resolve)
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("site SDK bridge and facade", () => {
  it("syncs registrations and correlates page-world callbacks", async () => {
    installDom()
    const { runtimeListeners, sentMessages } = installChrome()
    const onExecute = vi.fn()

    installMonocleSiteSdk()
    const queuedHandle = window.Monocle!.commands.register({
      namespace: "docs",
      commands: [
        {
          id: "open",
          type: "action",
          name: "Open",
          executionPayload: { source: "fixture" },
          onExecute,
        },
      ],
    })

    expect(sentMessages).toHaveLength(0)

    initializeSiteSdkBridge()
    await flush()

    expect(runtimeListeners).toHaveLength(1)
    expect(sentMessages.at(-1)).toMatchObject({
      type: "site-sdk-sync",
      registrations: [
        {
          namespace: "docs",
          commands: [{ id: "open", type: "action" }],
        },
      ],
    })

    const openCommand = sentMessages
      .at(-1)
      .registrations.flatMap((registration: any) => registration.commands)
      .find((command: any) => command.id === "open")
    const executeResponse = await sendRuntimeMessage(runtimeListeners[0], {
      type: "monocle-sdk-invoke",
      request: {
        type: "execute",
        callbackId: openCommand.execute.callbackId,
        commandId: "open",
        context: {
          url: "https://example.com/page",
          title: "Fixture",
          modifierKey: null,
        },
        values: { query: "abc" },
        executionPayload: { source: "fixture" },
      },
    })

    expect(executeResponse).toEqual({ success: true })
    expect(onExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: "open",
        values: { query: "abc" },
        executionPayload: { source: "fixture" },
      }),
    )

    queuedHandle.update([
      {
        id: "updated",
        type: "display",
        name: "Updated",
      },
    ])
    await flush()
    expect(sentMessages.at(-1).registrations[0].commands[0]).toMatchObject({
      id: "updated",
      type: "display",
    })

    queuedHandle.dispose()
    await flush()
    expect(sentMessages.at(-1).registrations).toEqual([])

    window.Monocle!.commands.register({
      namespace: "docs",
      commands: [
        {
          id: "group",
          type: "group",
          name: "Group",
          children: async () => [
            {
              id: "child",
              type: "action",
              name: "Child",
              placement: "root",
              onExecute: vi.fn(),
            },
          ],
        },
      ],
    })
    await flush()

    const groupCommand = sentMessages
      .at(-1)
      .registrations.flatMap((registration: any) => registration.commands)
      .find((command: any) => command.id === "group")
    const childrenResponse = await sendRuntimeMessage(runtimeListeners[0], {
      type: "monocle-sdk-invoke",
      request: {
        type: "children",
        callbackId: groupCommand.children.callback.callbackId,
        commandId: "group",
        context: {
          url: "https://example.com/page",
          title: "Fixture",
          modifierKey: null,
        },
      },
    })

    expect(childrenResponse.success).toBe(false)
    expect(childrenResponse.error).toContain("placement is only allowed")

    const syncResponse = await sendRuntimeMessage(runtimeListeners[0], {
      type: "monocle-sdk-sync-request",
    })

    expect(syncResponse.registrations[0]).toMatchObject({
      namespace: "docs",
      commands: [{ id: "group", type: "group" }],
    })
    await flush()
  })
})
