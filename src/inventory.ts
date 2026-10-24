import { balanceOf, rateFor, removeAccount } from './ledger.ts'
import { uid, type AppData, type AssetSnapshot, type SnapshotSource } from './types.ts'

export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const snapshotLabels: Record<SnapshotSource, string> = { baseline: '初始记录', inventory: '余额盘点', account: '账户变更', transaction: '流水变更', archive: '归档变更', rates: '汇率更新' }

export function captureSnapshot(data: AppData, source: SnapshotSource, now = new Date().toISOString(), checkedAccountIds: string[] = []): AppData {
  const snapshot: AssetSnapshot = {
    id: uid(), createdAt: now, date: localDate(new Date(now)), source, checkedAccountIds,
    accounts: data.accounts.map(account => ({ id: account.id, name: account.name, kind: account.kind, type: account.type, currency: account.currency, balance: balanceOf(account, data.transactions), archived: account.archived ?? false })),
    rates: structuredClone(data.rates)
  }
  return { ...data, snapshots: [...data.snapshots, snapshot] }
}

export function parseAmount(text: string): number {
  const value = text.trim()
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value))) throw new Error('请填写有效的数字金额，不要包含逗号或其他符号。')
  return Number(value)
}

export function inventoryBalances(data: AppData, inputs: Record<string, string>, now = new Date().toISOString()): AppData {
  const checked = Object.entries(inputs).filter(([, text]) => text.trim() !== '')
  if (!checked.length) throw new Error('请至少填写一个账户的当前余额。')
  const updates = checked.map(([id, text]) => {
    const account = data.accounts.find(item => item.id === id && !item.archived)
    if (!account) throw new Error('账户已归档或不存在，请重新打开盘点。')
    const amount = parseAmount(text) - balanceOf(account, data.transactions)
    if (!Number.isFinite(amount)) throw new Error('金额超出可保存范围。')
    return { id, amount }
  })
  const next: AppData = {
    ...data,
    accounts: data.accounts.map(account => updates.some(update => update.id === account.id) ? { ...account, lastInventoriedAt: now } : account),
    transactions: [...data.transactions, ...updates.filter(update => update.amount !== 0).map(update => ({ id: uid(), type: 'adjustment' as const, accountId: update.id, amount: update.amount, date: localDate(new Date(now)), note: '余额盘点', createdAt: now }))]
  }
  return captureSnapshot(next, 'inventory', now, updates.map(update => update.id))
}

export function snapshotValue(snapshot: AssetSnapshot, baseCurrency: string) {
  let assets = 0, liabilities = 0
  const data = { rates: snapshot.rates, settings: { baseCurrency } }
  for (const account of snapshot.accounts.filter(account => !account.archived)) {
    const rate = rateFor(data, account.currency)
    if (rate === undefined && account.balance !== 0) return null
    const value = account.balance * (rate ?? 0)
    if (!Number.isFinite(value)) return null
    if (account.kind === 'asset') assets += value
    else liabilities += value
  }
  return { assets, liabilities, net: assets - liabilities }
}

export function trendPoints(snapshots: AssetSnapshot[], baseCurrency: string, range: '30' | '90' | 'all', today = localDate()) {
  const cutoff = new Date(`${today}T12:00:00`)
  if (range !== 'all') cutoff.setDate(cutoff.getDate() - Number(range) + 1)
  const start = range === 'all' ? '' : localDate(cutoff)
  const daily = new Map<string, AssetSnapshot>()
  for (const snapshot of [...snapshots].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    if (snapshot.date >= start && snapshot.date <= today) daily.set(snapshot.date, snapshot)
  }
  return [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map(snapshot => ({ snapshot, value: snapshotValue(snapshot, baseCurrency) }))
}

export function hasAccountHistory(data: AppData, accountId: string) {
  return data.transactions.some(entry => entry.accountId === accountId || entry.targetAccountId === accountId) || data.snapshots.some(snapshot => snapshot.checkedAccountIds.includes(accountId))
}

export function setArchived(data: AppData, accountId: string, archived: boolean, now = new Date().toISOString()): AppData {
  if (!data.accounts.some(account => account.id === accountId)) throw new Error('账户不存在。')
  return captureSnapshot({ ...data, accounts: data.accounts.map(account => account.id === accountId ? { ...account, archived } : account) }, 'archive', now)
}

export function deleteEmptyAccount(data: AppData, accountId: string, now = new Date().toISOString()): AppData {
  if (hasAccountHistory(data, accountId)) throw new Error('这个账户已有历史记录，请使用归档。')
  return captureSnapshot(removeAccount(data, accountId), 'account', now)
}
