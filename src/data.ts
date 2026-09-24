import type { AppData, Category } from './types'

const categories: Category[] = [
  ['工资', 'income', '#2f6b5b', '↑'], ['奖金', 'income', '#4e7ca8', '✦'], ['投资收益', 'income', '#b79742', '↗'], ['其他收入', 'income', '#7d8752', '+'],
  ['餐饮', 'expense', '#c77d4d', '◒'], ['交通', 'expense', '#4e7ca8', '↔'], ['购物', 'expense', '#9d668b', '□'], ['居住', 'expense', '#b79742', '⌂'], ['娱乐', 'expense', '#5b8796', '✦'], ['医疗', 'expense', '#b55353', '＋'], ['其他支出', 'expense', '#777777', '−']
].map(([name, direction, color, icon], index) => ({ id: `seed-${index}`, name, direction: direction as Category['direction'], color, icon, sortOrder: index, active: true }))

export const emptyData = (): AppData => ({
  version: 1,
  accounts: [], categories, transactions: [],
  rates: { USD: { currency: 'USD', usdValue: 1, updatedAt: new Date().toISOString() } },
  settings: { baseCurrency: 'CNY' }
})
