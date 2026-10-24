import test from 'node:test'
import assert from 'node:assert/strict'
import { loadData, saveData } from '../src/db.ts'
import { emptyData } from '../src/data.ts'

test('database open failures reject rather than returning an empty ledger', async () => {
  const original = globalThis.indexedDB
  globalThis.indexedDB = { open() { throw new Error('storage unavailable') } } as any
  try {
    await assert.rejects(loadData(), /storage unavailable/)
    await assert.rejects(saveData(emptyData()), /storage unavailable/)
  } finally { globalThis.indexedDB = original }
})
