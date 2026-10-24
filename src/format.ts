export const money = (value: number, currency = 'CNY', hidden = false) => {
  if (hidden) return '••••••'
  const digits = ['BTC', 'ETH'].includes(currency) ? 8 : ['USDT', 'USDC'].includes(currency) ? 4 : 2
  try { return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: digits }).format(value) }
  catch { return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(value)} ${currency}` }
}
export const dateTime = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '尚未盘点'
export const shortDate = (value: string) => value ? `${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日` : '未填写日期'
