/** A persistence adapter shares this queue across editor mounts. Reads wait for
 * pending writes, including writes started by the previous editor's cleanup. */
export function createPendingWrites() {
  const pending = new Map<string, Promise<unknown>>()
  return {
    async read<T>(key: string, read: () => Promise<T>): Promise<T> {
      while (pending.has(key)) {
        // A failed write must not prevent a later read or retry.
        await pending.get(key)!.catch(() => {})
      }
      return read()
    },
    write<T>(key: string, write: () => Promise<T>): Promise<T> {
      const result = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(write)
      pending.set(key, result)
      const finished = () => { if (pending.get(key) === result) pending.delete(key) }
      void result.then(finished, finished)
      return result
    },
  }
}
