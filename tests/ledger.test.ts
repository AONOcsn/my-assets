import test from 'node:test'
import assert from 'node:assert/strict'
import { allocationByType, balanceOf, rateFor, removeAccount, totalFor } from '../src/ledger.ts'

const account = { id: 'cash', name: '现金', kind: 'asset' as const, type: 'cash' as const, currency: 'CNY', openingBalance: 100, color: '#000', icon: '◉', sortOrder: 0, createdAt: '2026-01-01' }
const card = { id: 'card', name: '信用卡', kind: 'liability' as const, type: 'credit-card' as const, currency: 'CNY', openingBalance: 20, color: '#000', icon: '▱', sortOrder: 1, createdAt: '2026-01-01' }
const state = (transactions: any[]) => ({ version: 1 as const, accounts: [account, card], categories: [], transactions, rates: { USD: { currency: 'USD', usdValue: 1, updatedAt: '' }, CNY: { currency: 'CNY', usdValue: 1 / 7.2, updatedAt: '' } }, settings: { baseCurrency: 'CNY' as const } })

test('income, expense and adjustment change a balance predictably', () => {
  const entries = [
    { id: '1', type: 'income' as const, accountId: 'cash', amount: 50, date: '', createdAt: '' },
    { id: '2', type: 'expense' as const, accountId: 'cash', amount: 30, date: '', createdAt: '' },
    { id: '3', type: 'adjustment' as const, accountId: 'cash', amount: -10, date: '', createdAt: '' }
  ]
  assert.equal(balanceOf(account, entries), 110)
})

test('a transfer debits its source and credits its target', () => {
  const transfer = [{ id: '1', type: 'transfer' as const, accountId: 'cash', targetAccountId: 'card', amount: 40, targetAmount: 35, date: '', createdAt: '' }]
  assert.equal(balanceOf(account, transfer), 60)
  assert.equal(balanceOf(card, transfer), 55)
})

test('totals exclude accounts without a rate and separate liabilities', () => {
  const data = state([])
  assert.equal(totalFor(data, 'asset'), 100)
  assert.equal(totalFor(data, 'liability'), 20)
  assert.deepEqual(allocationByType(data), [{ type: 'cash', value: 100 }])
})

test('the selected base currency changes every conversion consistently', () => {
  const data = state([])
  data.rates.BTC = { currency: 'BTC', usdValue: 100000, updatedAt: '' }
  assert.equal(rateFor(data, 'CNY'), 1)
  assert.equal(rateFor(data, 'BTC'), 720000)
  data.settings.baseCurrency = 'BTC'
  assert.equal(rateFor(data, 'BTC'), 1)
  assert.equal(rateFor(data, 'CNY'), 1 / 720000)
})

test('deleting an account also removes its related records', () => {
  const data = state([{ id: 'transfer', type: 'transfer' as const, accountId: 'cash', targetAccountId: 'card', amount: 10, targetAmount: 10, date: '', createdAt: '' }])
  const next = removeAccount(data, 'cash')
  assert.deepEqual(next.accounts.map(item => item.id), ['card'])
  assert.equal(next.transactions.length, 0)
})
