import type { AppData } from './types'
import { emptyData } from './data'

const DB_NAME = 'jingzi-assets'; const STORE = 'state'; const KEY = 'main'
const request = <T,>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
async function db() {
  const open = indexedDB.open(DB_NAME, 1)
  open.onupgradeneeded = () => open.result.createObjectStore(STORE)
  return request(open)
}
export async function loadData(): Promise<AppData> {
  try { const result = await request<AppData | undefined>((await db()).transaction(STORE, 'readonly').objectStore(STORE).get(KEY)); return result ? normalizeData(result) : emptyData() }
  catch { return emptyData() }
}
function normalizeData(value: AppData): AppData {
  const validRates = Object.values(value.rates ?? {}).reduce<Record<string, AppData['rates'][string]>>((all, raw) => {
    if (typeof raw.usdValue === 'number' && raw.usdValue > 0) all[raw.currency] = raw
    return all
  }, { USD: { currency: 'USD', usdValue: 1, updatedAt: new Date().toISOString() } })
  return { ...value, rates: validRates, settings: { ...value.settings, baseCurrency: value.settings?.baseCurrency ?? 'CNY' } }
}
export async function saveData(value: AppData) {
  const connection = await db(); const tx = connection.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, KEY)
  return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
}
