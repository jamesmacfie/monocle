import { describe, expect, it } from "vitest"
import { withStorageLock } from "./storageMutex"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("withStorageLock", () => {
  it("serializes critical sections on the same key", async () => {
    const order: string[] = []
    const gate = deferred<void>()

    const first = withStorageLock("k", async () => {
      order.push("first:start")
      await gate.promise
      order.push("first:end")
    })

    const second = withStorageLock("k", async () => {
      order.push("second:start")
    })

    // Give the second call every chance to start early if the lock is broken.
    await Promise.resolve()
    expect(order).toEqual(["first:start"])

    gate.resolve()
    await Promise.all([first, second])

    expect(order).toEqual(["first:start", "first:end", "second:start"])
  })

  it("runs independent keys concurrently", async () => {
    const order: string[] = []
    const gate = deferred<void>()

    const a = withStorageLock("a", async () => {
      order.push("a:start")
      await gate.promise
    })
    const b = withStorageLock("b", async () => {
      order.push("b:start")
    })

    await b
    expect(order).toEqual(["a:start", "b:start"])

    gate.resolve()
    await a
  })

  it("does not poison the queue when a critical section rejects", async () => {
    const failure = withStorageLock("k", async () => {
      throw new Error("boom")
    })
    const after = withStorageLock("k", async () => "ran")

    await expect(failure).rejects.toThrow("boom")
    await expect(after).resolves.toBe("ran")
  })

  it("passes the critical section's return value through", async () => {
    await expect(withStorageLock("k", async () => 42)).resolves.toBe(42)
  })
})
