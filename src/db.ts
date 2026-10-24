import type { AppData } from './types.ts'
import { emptyData } from './data.ts'
import { migrateData } from './backup.ts'

const DB_NAME = 'jingzi-assets'; const STORE = 'state'; const KEY = 'main'
async function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(open.error)
    open.onblocked = () => reject(new Error('本地数据库被其他页面占用，请关闭其他净值页面后重试。'))
  })
}
export async function loadData(): Promise<AppData> {
  const connection = await db()
  const result = await new Promise<unknown>((resolve, reject) => {
    const tx = connection.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(KEY)
    tx.oncomplete = () => resolve(request.result)
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('无法读取本地数据。'))
  }).finally(() => connection.close())
  const data = result === undefined ? emptyData() : migrateData(result)
  if (result !== undefined && (result as { version?: number }).version === 1) await saveData(data)
  return data
}
export async function saveData(value: AppData) {
  const connection = await db()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = connection.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('本地数据保存失败。'))
      tx.objectStore(STORE).put(value, KEY)
    })
  } finally { connection.close() }
}
