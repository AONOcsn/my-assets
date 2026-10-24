import { useState } from 'react'
import { balanceOf, rateFor } from './ledger'
import { dateTime, money } from './format'
import { hasAccountHistory } from './inventory'
import { accountTypes, type Account, type AppData } from './types'
import { EmptyState, Icon, Modal, SectionTitle } from './ui'

export function AccountRow({ account, data, onClick }: { account: Account; data: AppData; onClick: () => void }) {
  const balance = balanceOf(account, data.transactions), rate = rateFor(data, account.currency), hidden = data.settings.hideAmounts
  return <button className="account-row" onClick={onClick}><span className="account-symbol" style={{ color: account.color, backgroundColor: `${account.color}14` }}><Icon name={account.kind === 'liability' ? 'wallet' : account.type === 'investment' || account.type === 'exchange' ? 'trend' : 'bank'}/></span><span className="account-info"><strong>{account.name}</strong><small>{account.lastInventoriedAt ? `${dateTime(account.lastInventoriedAt)} 盘点` : '尚未盘点'}</small></span><span className="account-amount"><strong>{money(balance, account.currency, hidden)}</strong><small>{rate === undefined ? '缺少汇率' : account.currency !== data.settings.baseCurrency ? `≈ ${money(balance * rate, data.settings.baseCurrency, hidden)}` : accountTypes[account.type].label}</small></span><Icon name="chevron" size={15}/></button>
}

export function Accounts({ data, onSelect, onAdd, onInventory, onBills, onMove, onArchive, onDelete }: { data: AppData; onSelect: (account: Account) => void; onAdd: () => void; onInventory: () => void; onBills: () => void; onMove: (id: string, direction: number) => void; onArchive: (account: Account) => void; onDelete: (account: Account) => void }) {
  const [managing, setManaging] = useState(false)
  const active = data.accounts.filter(account => !account.archived).sort((a, b) => a.sortOrder - b.sortOrder)
  const archived = data.accounts.filter(account => account.archived).sort((a, b) => a.sortOrder - b.sortOrder)
  return <main className="page"><header className="page-head"><div><span className="page-kicker">把余额理清楚</span><h1>我的账户</h1></div><button className="icon-button add-account" aria-label="添加账户" onClick={onAdd}><Icon name="plus" size={25}/></button></header>
    <div className="account-actions"><button className="primary-button" disabled={!active.length} onClick={onInventory}><Icon name="check" size={19}/>批量盘点</button><button className="secondary-button" onClick={onBills}><Icon name="list" size={19}/>资金流水</button></div>
    <SectionTitle title={`账户 · ${active.length}`}><button className="text-button" onClick={() => setManaging(!managing)}>{managing ? '完成管理' : '管理'}</button></SectionTitle>
    {active.length ? <section className="group account-group">{active.map((account, index) => <div className="managed-account" key={account.id}><AccountRow account={account} data={data} onClick={() => onSelect(account)}/>{managing && <div className="management-actions"><button className="secondary-button" aria-label={`上移${account.name}`} disabled={index === 0} onClick={() => onMove(account.id, -1)}><Icon name="up" size={17}/>上移</button><button className="secondary-button" aria-label={`下移${account.name}`} disabled={index === active.length - 1} onClick={() => onMove(account.id, 1)}><Icon name="down" size={17}/>下移</button><button className="text-button" onClick={() => onArchive(account)}>归档</button>{!hasAccountHistory(data, account.id) && <button className="text-button danger-text" onClick={() => onDelete(account)}>删除</button>}</div>}</div>)}</section> : <section className="group"><EmptyState title="还没有使用中的账户" action="添加账户" onAction={onAdd}>添加账户后，就能开始盘点余额。</EmptyState></section>}
    {managing && <><SectionTitle title={`已归档 · ${archived.length}`}/><section className="group">{archived.length ? archived.map(account => <div key={account.id} className="archived-item"><AccountRow account={account} data={data} onClick={() => onSelect(account)}/><button className="text-button restore-button" onClick={() => onArchive(account)}>恢复使用</button></div>) : <p className="inline-empty">归档的账户会保留历史，并退出当前资产汇总。</p>}</section></>}
    <p className="footnote page-footnote">投资账户填写当前市值；负债账户填写当前欠款。<br/>不同币种分别建账户，更容易核对。</p>
  </main>
}

export function AccountDetail({ account, data, onClose, onEdit, onInventory, onBills, onArchive, onDelete }: { account: Account; data: AppData; onClose: () => void; onEdit: () => void; onInventory: () => void; onBills: () => void; onArchive: () => void; onDelete: () => void }) {
  const balance = balanceOf(account, data.transactions), rate = rateFor(data, account.currency), hidden = data.settings.hideAmounts
  const records = [...data.snapshots].reverse().filter(snapshot => snapshot.checkedAccountIds.includes(account.id))
  return <Modal title="账户详情" onClose={onClose}><div className="sheet-content"><div className="detail-hero"><span className="detail-tag">{accountTypes[account.type].label} · {account.currency}{account.archived ? ' · 已归档' : ''}</span><h3>{account.name}</h3><strong>{money(balance, account.currency, hidden)}</strong>{account.currency !== data.settings.baseCurrency && <p>{rate === undefined ? '缺少汇率，暂未计入汇总' : `≈ ${money(balance * rate, data.settings.baseCurrency, hidden)}`}</p>}<small>最近盘点：{dateTime(account.lastInventoriedAt)}</small></div>
    {!account.archived && <button className="primary-button full-width" onClick={onInventory}><Icon name="check" size={19}/>更新当前余额</button>}
    <div className="detail-actions"><button className="secondary-button" onClick={onEdit}>编辑账户信息</button><button className="secondary-button" onClick={onBills}>查看关联流水</button></div>
    {account.note && <p className="account-note">{account.note}</p>}
    <SectionTitle title="盘点历史"/><section className="group history-list">{records.length ? records.map(snapshot => { const row = snapshot.accounts.find(item => item.id === account.id); return <div className="history-row" key={snapshot.id}><span><b>{dateTime(snapshot.createdAt)}</b><small>余额盘点</small></span><strong>{row ? money(row.balance, row.currency, hidden) : '—'}</strong></div> }) : <p className="inline-empty">还没有盘点记录。更新一次余额，即可开始积累。</p>}</section>
    <div className="detail-danger-actions"><button className="secondary-button" onClick={onArchive}><Icon name="archive" size={18}/>{account.archived ? '恢复使用' : '归档账户'}</button>{!hasAccountHistory(data, account.id) && <button className="text-button danger-text" onClick={onDelete}>删除账户</button>}</div>
    </div></Modal>
}
