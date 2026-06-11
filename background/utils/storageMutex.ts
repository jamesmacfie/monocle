const queues = new Map<string, Promise<unknown>>()

/**
 * Serializes async critical sections per key. All read-modify-write cycles
 * against the same storage key must run inside withStorageLock(key, ...) so
 * concurrent message handlers cannot interleave between load and save and
 * silently lose writes. Reads outside a critical section remain lock-free.
 *
 * Locks are NOT re-entrant: a locked function must never call another
 * function that takes the same lock, or both deadlock. Keep delegating
 * helpers unlocked and take the lock only at the outermost write boundary.
 */
export const withStorageLock = async <T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const previous = queues.get(key) ?? Promise.resolve()
  // Run regardless of the predecessor's outcome; its failure belongs to its
  // own caller, not to the next critical section in the queue.
  const run = previous.then(fn, fn)

  // Park the chain on a settled promise so one rejection doesn't poison the
  // queue, and clean the map entry up once the tail settles.
  const parked = run.then(
    () => undefined,
    () => undefined,
  )
  queues.set(key, parked)
  void parked.then(() => {
    if (queues.get(key) === parked) {
      queues.delete(key)
    }
  })

  return run
}
