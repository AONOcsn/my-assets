export type AccountKind = 'asset' | 'liability'
export type AccountType = 'cash' | 'bank' | 'foreign-bank' | 'wealth' | 'investment' | 'exchange' | 'credit-card' | 'loan' | 'other'
export type EntryType = 'income' | 'expense' | 'transfer' | 'adjustment'
export type CategoryDirection = 'income' | 'expense'

export interface Account {
  id: string; name: string; kind: AccountKind; type: AccountType; currency: string
  openingBalance: number; color: string; icon: string; note?: string; sortOrder: number
  archived?: boolean; createdAt: string
}
export interface Category { id: string; name: string; direction: CategoryDirection; color: string; icon: string; sortOrder: number; active: boolean }
export interface Transaction {
  id: string; type: EntryType; accountId?: string; targetAccountId?: string
  amount: number; targetAmount?: number; categoryId?: string; date: string; note?: string; createdAt: string
}
export interface Rate { currency: string; usdValue: number; updatedAt: string }
export interface Settings { baseCurrency: string; lastRateUpdate?: string }
export interface AppData { version: 1; accounts: Account[]; categories: Category[]; transactions: Transaction[]; rates: Record<string, Rate>; settings: Settings }

export const accountTypes: Record<AccountType, { label: string; icon: string }> = {
  cash: { label: '现金', icon: '◉' }, bank: { label: '银行卡', icon: '▤' }, 'foreign-bank': { label: '海外银行卡', icon: '◎' },
  wealth: { label: '理财', icon: '◒' }, investment: { label: '投资', icon: '↗' }, exchange: { label: '虚拟交易所', icon: '◇' },
  'credit-card': { label: '信用卡', icon: '▱' }, loan: { label: '贷款', icon: '⌁' }, other: { label: '其他', icon: '○' }
}

export const colors = ['#2f6b5b', '#c77d4d', '#4e7ca8', '#9d668b', '#b79742', '#5b8796', '#7d8752']
export const supportedCurrencies = [
  ['CNY', '人民币'], ['USD', '美元'], ['HKD', '港币'], ['EUR', '欧元'], ['GBP', '英镑'], ['JPY', '日元'], ['SGD', '新加坡元'], ['AUD', '澳元'], ['CAD', '加拿大元'], ['KRW', '韩元'], ['TWD', '新台币'],
  ['USDT', '泰达币'], ['USDC', 'USD Coin'], ['BTC', '比特币'], ['ETH', '以太坊']
] as const
export const currencyName = (code: string) => supportedCurrencies.find(([item]) => item === code.toUpperCase())?.[1] ?? code.toUpperCase()
export const uid = () => crypto.randomUUID()
