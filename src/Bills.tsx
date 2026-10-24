import { useState } from 'react'
import { money, shortDate } from './format'
import { localDate } from './inventory'
import type { AppData, Transaction } from './types'
import { EmptyState, Icon } from './ui'

export function Bills({ data, initialAccountId = '', onBack, onAdd, onEdit }: { data: AppData; initialAccountId?: string; onBack: () => void; onAdd: () => void; onEdit: (entry: Transaction) => void }) {
  const [month, setMonth] = useState(localDate().slice(0, 7)), [accountId, setAccountId] = useState(initialAccountId), [query, setQuery] = useState('')
  const account = (id?: string) => data.accounts.find(item => item.id === id)
  const entries = [...data.transactions].filter(entry => (!month || entry.date.startsWith(month)) && (!accountId || entry.accountId === accountId || entry.targetAccountId === accountId) && (!query.trim() || [entry.note, data.categories.find(category => category.id === entry.categoryId)?.name, account(entry.accountId)?.name, account(entry.targetAccountId)?.name].some(value => value?.toLowerCase().includes(query.trim().toLowerCase())))).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  let day: string | null = null
  return <main className="page bills-page"><button className="back-button" onClick={onBack}><Icon name="back" size={18}/>账户</button><header className="page-head"><div><h1>资金流水</h1><p className="page-subtitle">收支、转账与余额调整</p></div><button className="icon-button add-account" aria-label="新增流水" onClick={onAdd}><Icon name="plus"/></button></header>
    <div className="filters"><label><span>月份</span><input type="month" value={month} onChange={event => setMonth(event.target.value)}/></label><label><span>账户</span><select value={accountId} onChange={event => setAccountId(event.target.value)}><option value="">全部账户</option>{data.accounts.map(item => <option key={item.id} value={item.id}>{item.name}{item.archived ? '（已归档）' : ''}</option>)}</select></label><label className="search-field"><span className="sr-only">搜索流水</span><input placeholder="搜索账户、分类或备注" value={query} onChange={event => setQuery(event.target.value)}/></label></div>
    <div className="filter-summary"><span>{entries.length} 笔记录</span><button className="text-button" onClick={() => { setMonth(''); setAccountId(''); setQuery('') }}>查看全部时间</button></div>
    {entries.length ? <section className="group entries-group">{entries.map(entry => {
      const category = data.categories.find(item => item.id === entry.categoryId), source = account(entry.accountId), target = account(entry.targetAccountId)
      const showDate = entry.date !== day; day = entry.date
      const title = entry.type === 'transfer' ? '账户转账' : entry.type === 'adjustment' ? entry.note === '余额盘点' ? '余额盘点' : '余额调整' : category?.name ?? (entry.type === 'income' ? '收入' : '支出')
      const info = entry.type === 'transfer' ? `${source?.name} → ${target?.name}` : source?.name ?? '账户'
      const positive = entry.type === 'income' || entry.type === 'adjustment' && entry.amount >= 0
      return <div key={entry.id}>{showDate && <div className="entry-day">{shortDate(entry.date)}</div>}<button className="entry-row" onClick={() => onEdit(entry)}><span className={`entry-symbol ${entry.type}`}><Icon name={entry.type === 'adjustment' ? 'check' : entry.type} size={20}/></span><span className="entry-info"><strong>{title}</strong><small>{info}</small>{entry.note && entry.note !== '余额盘点' && <small>{entry.note}</small>}</span><span className="entry-amount"><strong className={positive ? 'positive-text' : ''}>{data.settings.hideAmounts ? '••••••' : `${entry.type === 'transfer' ? '' : positive ? '+' : '−'}${money(Math.abs(entry.amount), source?.currency ?? 'CNY')}`}</strong>{entry.type === 'transfer' && <small>到账 {money(entry.targetAmount ?? entry.amount, target?.currency, data.settings.hideAmounts)}</small>}</span><Icon name="chevron" size={14}/></button></div>
    })}</section> : <section className="group"><EmptyState title="没有符合条件的流水" action="记一笔" onAction={onAdd}>试试切换月份、账户或搜索关键词。</EmptyState></section>}
  </main>
}
