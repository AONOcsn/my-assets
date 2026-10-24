import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyData } from '../src/data.ts'
import { balanceOf } from '../src/ledger.ts'
import { migrateData, parseBackup } from '../src/backup.ts'
import { inventoryBalances, captureSnapshot, snapshotValue, trendPoints, setArchived, deleteEmptyAccount } from '../src/inventory.ts'
import { createWriteQueue } from '../src/store.ts'

const now = '2026-10-24T04:00:00.000Z'
const account = (id = 'bank', openingBalance = 100) => ({ id, name: id, kind: 'asset' as const, type: 'bank' as const, currency: 'CNY', openingBalance, color: '#007aff', icon: '', sortOrder: 0, createdAt: now })
const legacy = () => ({ version: 1, accounts: [account()], categories: [{ id: 'salary', name: '工资', direction: 'income', color: '#007aff', icon: '', sortOrder: 0, active: true }], transactions: [{ id: 'old', type: 'income', accountId: 'bank', categoryId: 'salary', amount: 25, date: '2026-10-23', createdAt: now }], rates: { CNY: { currency: 'CNY', usdValue: 1 / 7, updatedAt: now }, USD: { currency: 'USD', usdValue: 1, updatedAt: now } }, settings: { baseCurrency: 'CNY' } })
const state = () => migrateData(legacy(), now)

test('migration preserves balances and creates exactly one baseline', () => {
  const data = state()
  assert.equal(data.version, 2)
  assert.equal(balanceOf(data.accounts[0], data.transactions), 125)
  assert.deepEqual(data.transactions, legacy().transactions)
  assert.equal(data.snapshots.length, 1)
  assert.equal(data.snapshots[0].source, 'baseline')
  assert.equal(migrateData(data, now).snapshots.length, 1)
  assert.equal(data.settings.hideAmounts, false)
})

test('reachable legacy empty dates and mismatched categories survive migration and future restores', () => {
  const input = legacy()
  input.transactions[0].date = ''
  input.categories[0].direction = 'expense'
  const migrated = migrateData(input, now)
  assert.deepEqual(migrated.transactions, input.transactions)
  assert.equal(balanceOf(migrated.accounts[0], migrated.transactions), 125)
  assert.deepEqual(parseBackup(JSON.stringify(migrated), now), migrated)
})

test('single inventory sets the target balance and preserves old entries', () => {
  const data = inventoryBalances(state(), { bank: '150.50' }, now)
  assert.equal(balanceOf(data.accounts[0], data.transactions), 150.5)
  assert.equal(data.transactions.at(-1)?.amount, 25.5)
  assert.equal(data.accounts[0].lastInventoriedAt, now)
  assert.equal(data.snapshots.length, 2)
  assert.equal(data.snapshots.at(-1)?.source, 'inventory')
})

test('batch distinguishes empty, zero and unchanged and saves one snapshot', () => {
  const data = state()
  data.accounts.push(account('zero', 50), account('skip', 75))
  const next = inventoryBalances(data, { bank: '125', zero: '0', skip: '' }, now)
  assert.equal(balanceOf(next.accounts[1], next.transactions), 0)
  assert.equal(balanceOf(next.accounts[2], next.transactions), 75)
  assert.equal(next.accounts[0].lastInventoriedAt, now)
  assert.equal(next.accounts[2].lastInventoriedAt, undefined)
  assert.deepEqual(next.snapshots.at(-1)?.checkedAccountIds, ['bank', 'zero'])
  assert.equal(next.snapshots.length, 2)
  assert.equal(next.transactions.length, 2, 'unchanged balance needs no zero adjustment')
})

test('invalid or archived batch targets fail atomically', () => {
  const data = state()
  for (const value of ['NaN', 'Infinity', '1e999', '0x10', '1,000']) assert.throws(() => inventoryBalances(data, { bank: value }, now))
  assert.throws(() => inventoryBalances(data, { unknown: '3' }, now))
  assert.throws(() => inventoryBalances(data, { bank: ' ' }, now))
  assert.throws(() => inventoryBalances(setArchived(data, 'bank', true, now), { bank: '3' }, now))
  assert.equal(balanceOf(data.accounts[0], data.transactions), 125)
  assert.equal(data.snapshots.length, 1)
})

test('snapshots keep original rates and balances, missing conversions return null', () => {
  const data = state()
  const snapshot = data.snapshots[0]
  data.rates.CNY.usdValue = 1 / 10
  data.accounts[0].name = 'renamed'
  assert.equal(snapshotValue(snapshot, 'USD')?.net, 125 / 7)
  assert.equal(snapshot.accounts[0].name, 'bank')
  assert.equal(snapshotValue(snapshot, 'EUR'), null)
  assert.equal(snapshotValue(snapshot, 'CNY')?.net, 125)
})

test('trend uses last point per local day and keeps missing-rate gaps', () => {
  let data = state()
  data = captureSnapshot(data, 'rates', '2026-10-24T05:00:00Z')
  delete data.rates.CNY
  data = captureSnapshot(data, 'rates', '2026-10-25T05:00:00Z')
  const points = trendPoints(data.snapshots, 'USD', 'all', '2026-10-26')
  assert.equal(points.length, 2)
  assert.equal(points[0].snapshot.createdAt, '2026-10-24T05:00:00Z')
  assert.equal(points[1].value, null)
  assert.equal(trendPoints(data.snapshots, 'USD', '30', '2026-12-30').length, 0)
})

test('archive and restore preserve transfers and history', () => {
  const data = state()
  const archived = setArchived(data, 'bank', true, now)
  assert.deepEqual(archived.transactions, data.transactions)
  assert.equal(snapshotValue(archived.snapshots.at(-1)!, 'CNY')?.net, 0)
  const restored = setArchived(archived, 'bank', false, now)
  assert.equal(balanceOf(restored.accounts[0], restored.transactions), 125)
  assert.throws(() => deleteEmptyAccount(restored, 'bank', now))
  const fresh = emptyData()
  fresh.accounts.push(account('new'))
  assert.equal(deleteEmptyAccount(fresh, 'new', now).accounts.length, 0)
})

test('backup round trip retains snapshots and checks invalid fields and references', () => {
  const data = inventoryBalances(state(), { bank: '200' }, now)
  assert.deepEqual(parseBackup(JSON.stringify(data), now), data)
  for (const transform of [
    (d: any) => { d.accounts[0].openingBalance = '100' },
    (d: any) => { d.transactions[0].accountId = 'missing' },
    (d: any) => { d.categories = undefined },
    (d: any) => { d.accounts.push(d.accounts[0]) },
    (d: any) => { d.rates.CNY.usdValue = -1 },
    (d: any) => { d.snapshots[0].accounts[0].balance = 'bad' },
    (d: any) => { d.settings.hideAmounts = 'yes' },
    (d: any) => { d.version = 9 }
  ]) {
    const broken = structuredClone(data)
    transform(broken)
    assert.throws(() => parseBackup(JSON.stringify(broken), now))
  }
})

test('write queue publishes after durability and does not overwrite intervening inventory', async () => {
  const initial = state()
  const persisted: number[] = [], published: number[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const queue = createWriteQueue(initial, async data => { await gate; persisted.push(balanceOf(data.accounts[0], data.transactions)) }, data => { published.push(balanceOf(data.accounts[0], data.transactions)) })
  const first = queue.commit(data => inventoryBalances(data, { bank: '200' }, now))
  const second = queue.commit(data => ({ ...data, settings: { ...data.settings, hideAmounts: true } }))
  assert.deepEqual(published, [])
  release()
  await Promise.all([first, second])
  assert.deepEqual(persisted, [200, 200])
  assert.deepEqual(published, [200, 200])
  assert.equal(queue.current().settings.hideAmounts, true)
})

test('failed writes keep the old state and allow a later retry', async () => {
  let fail = true
  const queue = createWriteQueue(state(), async () => { if (fail) throw new Error('disk full') }, () => {})
  await assert.rejects(queue.commit(data => inventoryBalances(data, { bank: '500' }, now)), /disk full/)
  assert.equal(balanceOf(queue.current().accounts[0], queue.current().transactions), 125)
  fail = false
  await queue.commit(data => inventoryBalances(data, { bank: '500' }, now))
  assert.equal(balanceOf(queue.current().accounts[0], queue.current().transactions), 500)
})
