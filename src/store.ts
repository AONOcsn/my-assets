import type { AppData } from './types.ts'

export function createWriteQueue(initial: AppData, persist: (data: AppData) => Promise<void>, publish: (data: AppData) => void) {
  let current = initial
  let tail: Promise<unknown> = Promise.resolve()
  return {
    current: () => current,
    commit(update: (data: AppData) => AppData): Promise<AppData> {
      const operation = tail.then(async () => {
        const next = update(current)
        await persist(next)
        current = next
        publish(next)
        return next
      })
      tail = operation.catch(() => {})
      return operation
    }
  }
}
