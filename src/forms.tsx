import { useState } from 'react'
import { balanceOf } from './ledger'
import { localDate, parseAmount } from './inventory'
import { dateTime, money } from './format'
import { accountTypes, colors, supportedCurrencies, uid, type Account, type AccountKind, type AccountType, type AppData, type EntryType, type Transaction } from './types'
import { Modal, SaveForm } from './ui'

export function InventoryForm({ data, accountId, onSave, onClose }: { data: AppData; accountId?: string; onSave: (inputs: Record<string, string>) => Promise<unknown>; onClose: () => void }) {
  const accounts = data.accounts.filter(account => !account.archived && (!accountId || account.id === accountId)).sort((a, b) => a.sortOrder - b.sortOrder)
  const [inputs, setInputs] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false)
  const changed = Object.values(inputs).some(value => value.trim())
  const count = Object.values(inputs).filter(value => value.trim()).length
  return <Modal title={accountId ? '更新当前余额' : '批量盘点'} onClose={onClose} busy={busy} dirty={changed}><SaveForm busy={busy} setBusy={setBusy} onSave={() => onSave(inputs)} label={count ? `保存${accountId ? '' : ` ${count} 个账户的`}盘点` : '保存盘点'}>
    <p className="form-intro">填写账户里现在实际有多少。{accountId ? '系统会自动计算差额。' : '留空表示本次跳过，填 0 表示余额归零。'}</p>
    <div className="inventory-fields">{accounts.map(account => {
      const old = balanceOf(account, data.transactions), text = inputs[account.id] ?? ''
      let delta: number | undefined
      try { if (text.trim()) delta = parseAmount(text) - old } catch { /* 输入完成后统一校验 */ }
      return <label className="inventory-field" key={account.id}><span className="inventory-field-head"><b>{account.name}</b><span>{account.currency}</span></span><small>当前记录 {money(old, account.currency, data.settings.hideAmounts)}</small><input inputMode="decimal" autoComplete="off" aria-label={`${account.name}当前余额`} value={text} onChange={event => setInputs({ ...inputs, [account.id]: event.target.value })} placeholder="填写最新余额"/>{delta !== undefined && <span className="delta-label">{data.settings.hideAmounts ? '已填写新余额' : delta === 0 ? '余额未变，记录本次核对时间' : `比原余额${delta > 0 ? '增加' : '减少'} ${money(Math.abs(delta), account.currency)}`}</span>}</label>
    })}</div>
    <p className="footnote">本次盘点时间：{dateTime(new Date().toISOString())}。保存后会保留原流水。</p>
  </SaveForm></Modal>
}

export function AccountForm({ data, account, onSave, onClose }: { data: AppData; account?: Account; onSave: (account: Account) => Promise<unknown>; onClose: () => void }) {
  const initial = { name: account?.name ?? '', kind: account?.kind ?? 'asset' as AccountKind, type: account?.type ?? 'bank' as AccountType, currency: account?.currency ?? data.settings.baseCurrency, openingBalance: String(account?.openingBalance ?? ''), color: account?.color ?? colors[data.accounts.length % colors.length], note: account?.note ?? '' }
  const [form, setForm] = useState(initial), [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const save = async () => {
    if (!form.name.trim()) throw new Error('请填写账户名称。')
    const openingBalance = form.openingBalance.trim() ? parseAmount(form.openingBalance) : 0
    await onSave({ id: account?.id ?? uid(), name: form.name.trim(), kind: form.kind, type: form.type, currency: form.currency, openingBalance, color: form.color, icon: account?.icon ?? accountTypes[form.type].icon, note: form.note.trim(), sortOrder: account?.sortOrder ?? data.accounts.length, archived: account?.archived, createdAt: account?.createdAt ?? new Date().toISOString() })
  }
  return <Modal title={account ? '编辑账户信息' : '添加账户'} onClose={onClose} busy={busy} dirty={dirty}><SaveForm busy={busy} setBusy={setBusy} onSave={save} label={account ? '保存账户信息' : '添加账户'}><div className="form-fields">
    <label>账户名称<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="例如：招商银行、证券账户" maxLength={80}/></label>
    <div className="two-fields"><label>账户属性<select disabled={!!account} value={form.kind} onChange={event => { const kind = event.target.value as AccountKind; setForm({ ...form, kind, type: kind === 'liability' ? 'credit-card' : 'bank' }) }}><option value="asset">资产</option><option value="liability">负债</option></select></label><label>账户类型<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value as AccountType })}>{Object.entries(accountTypes).filter(([key]) => form.kind === 'asset' ? !['credit-card', 'loan'].includes(key) : ['credit-card', 'loan', 'other'].includes(key)).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label></div>
    <label>币种<select disabled={!!account} value={form.currency} onChange={event => setForm({ ...form, currency: event.target.value })}>{supportedCurrencies.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></label>
    {!account && <label>{form.kind === 'liability' ? '当前欠款' : '当前余额'}<input inputMode="decimal" value={form.openingBalance} onChange={event => setForm({ ...form, openingBalance: event.target.value })} placeholder="0.00"/></label>}
    {account && <p className="footnote">余额请使用“更新当前余额”修改。币种与资产属性创建后保持固定；需要变更时请另建账户。</p>}
    <label>备注（可选）<textarea rows={2} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="例如：长期持有、备用金"/></label>
    <div className="color-field"><span>账户标记色</span><div className="color-picker">{colors.map((color, index) => <button type="button" key={color} style={{ background: color }} className={form.color === color ? 'selected' : ''} aria-label={`标记色 ${index + 1}`} aria-pressed={form.color === color} onClick={() => setForm({ ...form, color })}/>)}</div></div>
    </div></SaveForm></Modal>
}

export function EntryForm({ data, entry, defaultAccountId, onSave, onDelete, onClose }: { data: AppData; entry?: Transaction; defaultAccountId?: string; onSave: (entry: Transaction) => Promise<unknown>; onDelete: () => Promise<unknown>; onClose: () => void }) {
  const initial = { type: entry?.type ?? 'expense' as EntryType, accountId: entry?.accountId ?? defaultAccountId ?? data.accounts.find(account => !account.archived)?.id ?? '', targetAccountId: entry?.targetAccountId ?? '', amount: entry ? String(entry.amount) : '', targetAmount: entry ? String(entry.targetAmount ?? entry.amount) : '', categoryId: entry?.categoryId ?? '', date: entry?.date ?? localDate(), note: entry?.note ?? '' }
  const [form, setForm] = useState(initial), [busy, setBusy] = useState(false)
  const active = data.accounts.filter(account => !account.archived || account.id === entry?.accountId || account.id === entry?.targetAccountId)
  const categories = data.categories.filter(category => (category.active || category.id === entry?.categoryId) && category.direction === form.type)
  const save = async () => {
    const amount = parseAmount(form.amount)
    if (!form.accountId || !data.accounts.some(account => account.id === form.accountId && !account.archived)) throw new Error('请选择使用中的账户。归档账户需先恢复使用。')
    if (form.type !== 'adjustment' && amount <= 0 || form.type === 'adjustment' && amount === 0) throw new Error('请填写有效金额；收入、支出和转账金额须大于零。')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !Number.isFinite(Date.parse(form.date))) throw new Error('请选择有效日期。')
    if ((form.type === 'income' || form.type === 'expense') && !categories.some(category => category.id === form.categoryId)) throw new Error('请选择分类。')
    let targetAmount: number | undefined
    if (form.type === 'transfer') {
      targetAmount = parseAmount(form.targetAmount)
      if (form.targetAccountId === form.accountId || !active.some(account => account.id === form.targetAccountId && !account.archived) || targetAmount <= 0) throw new Error('请选择不同的转入账户，并填写大于零的到账金额。')
    }
    await onSave({ id: entry?.id ?? uid(), type: form.type, accountId: form.accountId, targetAccountId: form.type === 'transfer' ? form.targetAccountId : undefined, amount, targetAmount, categoryId: form.type === 'income' || form.type === 'expense' ? form.categoryId : undefined, date: form.date, note: form.note.trim(), createdAt: entry?.createdAt ?? new Date().toISOString() })
  }
  return <Modal title={entry ? '流水详情' : '记一笔'} onClose={onClose} busy={busy} dirty={JSON.stringify(initial) !== JSON.stringify(form)}><SaveForm busy={busy} setBusy={setBusy} onSave={save} label="保存流水"><div className="form-fields">
    {form.type === 'adjustment' ? <p className="form-intro">这是一笔余额调整。修改调整额会改变当前余额，历史盘点快照保留原值。</p> : <div className="segmented">{([['expense', '支出'], ['income', '收入'], ['transfer', '转账']] as const).map(([type, label]) => <button key={type} type="button" aria-pressed={form.type === type} onClick={() => setForm({ ...form, type, categoryId: '' })}>{label}</button>)}</div>}
    <label>{form.type === 'transfer' ? '转出账户' : '账户'}<select value={form.accountId} onChange={event => setForm({ ...form, accountId: event.target.value })}><option value="">选择账户</option>{active.map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}{account.archived ? '（已归档）' : ''}</option>)}</select></label>
    {form.type === 'transfer' && <label>转入账户<select value={form.targetAccountId} onChange={event => setForm({ ...form, targetAccountId: event.target.value })}><option value="">选择账户</option>{active.filter(account => account.id !== form.accountId && !account.archived).map(account => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>}
    <label>{form.type === 'adjustment' ? '调整额（可填负数）' : form.type === 'transfer' ? '转出金额' : '金额'}<input inputMode="decimal" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} placeholder="0.00"/></label>
    {form.type === 'transfer' && <label>实际到账金额<input inputMode="decimal" value={form.targetAmount} onChange={event => setForm({ ...form, targetAmount: event.target.value })} placeholder="0.00"/></label>}
    {(form.type === 'income' || form.type === 'expense') && <label>分类<select value={form.categoryId} onChange={event => setForm({ ...form, categoryId: event.target.value })}><option value="">选择分类</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}{category.active ? '' : '（已停用）'}</option>)}</select></label>}
    <label>日期<input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })}/></label><label>备注（可选）<input value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="这笔资金的说明"/></label>
    {entry && <button className="danger-button" type="button" onClick={async () => { if (window.confirm('删除这笔流水？当前余额会重新计算，历史盘点快照保留。')) { setBusy(true); try { await onDelete() } finally { setBusy(false) } } }}>删除这笔流水</button>}
    </div></SaveForm></Modal>
}
