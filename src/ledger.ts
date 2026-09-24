import type { Account, AppData, Transaction } from './types.ts'

export function balanceOf(account: Account, transactions: Transaction[]) {
  return transactions.reduce((balance, entry) => {
    if (entry.type === 'income' && entry.accountId === account.id) return balance + entry.amount
    if (entry.type === 'expense' && entry.accountId === account.id) return balance - entry.amount
    if (entry.type === 'adjustment' && entry.accountId === account.id) return balance + entry.amount
    if (entry.type === 'transfer') {
      if (entry.accountId === account.id) balance -= entry.amount
      if (entry.targetAccountId === account.id) balance += entry.targetAmount ?? entry.amount
    }
    return balance
  }, account.openingBalance)
}

export function rateFor(data: AppData, currency: string) {
  const source = currency.toUpperCase(), base = data.settings.baseCurrency.toUpperCase()
  if (source === base) return 1
  const sourceUsd = source === 'USD' ? 1 : data.rates[source]?.usdValue
  const baseUsd = base === 'USD' ? 1 : data.rates[base]?.usdValue
  return sourceUsd && baseUsd ? sourceUsd / baseUsd : undefined
}
export function totalFor(data: AppData, kind: Account['kind']) {
  return data.accounts.filter(a => !a.archived && a.kind === kind).reduce((sum, account) => {
    const rate = rateFor(data, account.currency); return rate === undefined ? sum : sum + balanceOf(account, data.transactions) * rate
  }, 0)
}
export function allocationByType(data: AppData) {
  const group = new Map<string, number>()
  data.accounts.filter(a => !a.archived && a.kind === 'asset').forEach(account => {
    const rate = rateFor(data, account.currency); if (rate === undefined) return
    const value = balanceOf(account, data.transactions) * rate
    group.set(account.type, (group.get(account.type) ?? 0) + Math.max(value, 0))
  })
  return [...group.entries()].map(([type, value]) => ({ type, value })).sort((a, b) => b.value - a.value)
}
export function currencies(data: AppData) { return [...new Set(data.accounts.map(a => a.currency.toUpperCase()))] }

export function removeAccount(data: AppData, accountId: string): AppData {
  return {
    ...data,
    accounts: data.accounts.filter(account => account.id !== accountId),
    transactions: data.transactions.filter(entry => entry.accountId !== accountId && entry.targetAccountId !== accountId)
  }
}
