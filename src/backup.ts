import { captureSnapshot } from './inventory.ts'
import { accountTypes, type AppData } from './types.ts'

type ObjectValue = Record<string, unknown>
const object = (value: unknown): value is ObjectValue => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): value is string => typeof value === 'string'
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const stamp = (value: unknown) => text(value) && Number.isFinite(Date.parse(value))
const day = (value: unknown) => text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
const currency = (value: unknown) => text(value) && /^[A-Z]{2,10}$/.test(value)
const optionalText = (value: unknown) => value === undefined || text(value)
const optionalBool = (value: unknown) => value === undefined || typeof value === 'boolean'
function requireValue(condition: unknown): asserts condition { if (!condition) throw new Error('备份内容不完整或包含无效数据，请选择原始 JSON 备份文件。') }
function uniqueIds(items: unknown[]): asserts items is ObjectValue[] {
  const ids = new Set<string>()
  for (const item of items) { requireValue(object(item) && text(item.id) && item.id.length > 0 && !ids.has(item.id)); ids.add(item.id) }
}
function validateRates(value: unknown) {
  requireValue(object(value))
  for (const [key, rate] of Object.entries(value)) requireValue(object(rate) && currency(key) && rate.currency === key && finite(rate.usdValue) && rate.usdValue > 0 && stamp(rate.updatedAt) && (key !== 'USD' || rate.usdValue === 1))
}
function validateAccount(account: ObjectValue, snapshot = false) {
  requireValue(text(account.name) && account.name.trim() && ['asset', 'liability'].includes(String(account.kind)) && Object.prototype.hasOwnProperty.call(accountTypes, String(account.type)) && currency(account.currency) && optionalBool(account.archived))
  if (snapshot) requireValue(finite(account.balance))
  else requireValue(finite(account.openingBalance) && finite(account.sortOrder) && text(account.color) && text(account.icon) && stamp(account.createdAt) && optionalText(account.note) && (account.lastInventoriedAt === undefined || stamp(account.lastInventoriedAt)))
}

export function migrateData(value: unknown, now = new Date().toISOString()): AppData {
  requireValue(object(value) && [1, 2].includes(Number(value.version)) && typeof value.version === 'number')
  requireValue(Array.isArray(value.accounts) && Array.isArray(value.categories) && Array.isArray(value.transactions) && object(value.settings))
  uniqueIds(value.accounts); uniqueIds(value.categories); uniqueIds(value.transactions)
  value.accounts.forEach(account => validateAccount(account))
  const accounts = new Set(value.accounts.map(account => account.id))
  const categories = new Set(value.categories.map(category => category.id))
  for (const category of value.categories) requireValue(text(category.name) && ['income', 'expense'].includes(String(category.direction)) && text(category.color) && text(category.icon) && finite(category.sortOrder) && typeof category.active === 'boolean')
  for (const entry of value.transactions) {
    // 旧版允许清空日期、切换收支时保留原分类；保留这类记录以免升级阻断原账本。
    requireValue(['income', 'expense', 'transfer', 'adjustment'].includes(String(entry.type)) && text(entry.accountId) && accounts.has(entry.accountId) && finite(entry.amount) && (entry.date === '' || day(entry.date)) && stamp(entry.createdAt) && optionalText(entry.note))
    if (entry.type === 'transfer') requireValue(accounts.has(entry.targetAccountId) && entry.targetAccountId !== entry.accountId && finite(entry.targetAmount) && entry.targetAmount > 0 && entry.amount > 0)
    if (entry.type === 'income' || entry.type === 'expense') requireValue(categories.has(entry.categoryId) && entry.amount > 0)
  }
  validateRates(value.rates)
  requireValue(currency(value.settings.baseCurrency) && optionalBool(value.settings.hideAmounts) && optionalText(value.settings.lastRateSource) && (value.settings.lastRateUpdate === undefined || stamp(value.settings.lastRateUpdate)))
  if (value.version === 2) {
    requireValue(Array.isArray(value.snapshots)); uniqueIds(value.snapshots)
    for (const snapshot of value.snapshots) {
      requireValue(stamp(snapshot.createdAt) && day(snapshot.date) && ['baseline', 'inventory', 'account', 'transaction', 'archive', 'rates'].includes(String(snapshot.source)) && Array.isArray(snapshot.accounts) && Array.isArray(snapshot.checkedAccountIds))
      uniqueIds(snapshot.accounts); snapshot.accounts.forEach(account => validateAccount(account, true)); validateRates(snapshot.rates)
      requireValue(new Set(snapshot.checkedAccountIds).size === snapshot.checkedAccountIds.length && snapshot.checkedAccountIds.every(id => text(id) && (snapshot.accounts as ObjectValue[]).some(account => account.id === id)))
    }
  }
  const data = structuredClone({ ...value, version: 2, settings: { ...value.settings, hideAmounts: value.settings.hideAmounts ?? false }, snapshots: value.version === 2 ? value.snapshots : [] }) as unknown as AppData
  // 旧备份只创建迁移时的基线，不尝试重建历史估值。
  return value.version === 1 ? captureSnapshot(data, 'baseline', now) : data
}

export function parseBackup(json: string, now = new Date().toISOString()): AppData {
  let value: unknown
  try { value = JSON.parse(json) } catch { throw new Error('无法读取 JSON，请选择净值导出的备份文件。') }
  return migrateData(value, now)
}
