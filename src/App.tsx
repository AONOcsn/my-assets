import { useCallback, useEffect, useRef, useState } from 'react'
import { loadData, saveData } from './db'
import { parseBackup } from './backup'
import { createWriteQueue } from './store'
import { captureSnapshot, deleteEmptyAccount, hasAccountHistory, inventoryBalances, localDate, setArchived } from './inventory'
import { fetchLiveRates, makeRates } from './rates'
import { AccountDetail, Accounts } from './Accounts'
import { Overview } from './Overview'
import { Bills } from './Bills'
import { Categories, Settings } from './Settings'
import { AccountForm, EntryForm, InventoryForm } from './forms'
import { Icon, Modal, SaveForm, ToastContext } from './ui'
import { useAppUpdate } from './updates'
import type { Account, AppData, Transaction } from './types'

type Page = 'overview' | 'accounts' | 'settings'
type ModalState = null | { kind: 'detail'; id: string } | { kind: 'account'; id?: string } | { kind: 'inventory'; id?: string } | { kind: 'entry'; entry?: Transaction } | { kind: 'categories' } | { kind: 'import'; data: AppData }

function exportBackup(data: AppData) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url; link.download = `jingzi-backup-${localDate()}.json`
  document.body.append(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function ImportDialog({ incoming, hasCurrent, onExport, onConfirm, onClose }: { incoming: AppData; hasCurrent: boolean; onExport: () => void; onConfirm: () => Promise<unknown>; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false)
  return <Modal title="恢复备份" onClose={onClose} busy={busy}><SaveForm label="替换本机数据并恢复" busy={busy} setBusy={setBusy} onSave={async () => { if (!confirmed) throw new Error('请先确认已保存需要保留的本机数据。'); await onConfirm() }}><div className="import-summary"><Icon name="upload" size={28}/><h3>已检查备份内容</h3><dl><div><dt>账户</dt><dd>{incoming.accounts.length} 个</dd></div><div><dt>流水</dt><dd>{incoming.transactions.length} 笔</dd></div><div><dt>历史估值</dt><dd>{incoming.snapshots.length} 份</dd></div><div><dt>主币种</dt><dd>{incoming.settings.baseCurrency}</dd></div></dl></div><p className="warning-text">恢复将替换这台设备上的全部数据。备份中的历史记录会一起恢复。</p>{hasCurrent && <button type="button" className="secondary-button full-width" onClick={onExport}><Icon name="download" size={18}/>先导出当前数据</button>}<label className="checkbox-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>我已保存需要保留的数据，确认替换。</span></label></SaveForm></Modal>
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null), [loadError, setLoadError] = useState(''), [loading, setLoading] = useState(true)
  const [page, setPage] = useState<Page>('overview'), [billsAccount, setBillsAccount] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null), [toast, setToast] = useState(''), [updatingRates, setUpdatingRates] = useState(false), [writing, setWriting] = useState(0)
  const queue = useRef<ReturnType<typeof createWriteQueue> | null>(null), timer = useRef<number | undefined>(undefined), fileRef = useRef<HTMLInputElement>(null), updating = useRef(false)
  const updates = useAppUpdate(), [updateDismissed, setUpdateDismissed] = useState(false)
  const message = useCallback((text: string) => { setToast(text); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(''), 5000) }, [])
  const initialize = useCallback(async () => {
    setLoading(true); setLoadError('')
    try {
      const loaded = await loadData()
      queue.current = createWriteQueue(loaded, saveData, setData)
      setData(loaded)
    } catch (error) { setLoadError(error instanceof Error ? error.message : '无法读取本地账本。'); setData(null) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void initialize(); return () => window.clearTimeout(timer.current) }, [initialize])

  const commit = async (update: (current: AppData) => AppData) => {
    if (!queue.current) throw new Error('账本尚未准备好。')
    setWriting(count => count + 1)
    try { return await queue.current.commit(update) }
    catch (error) { throw new Error(error instanceof Error && /账户|金额|分类|归档/.test(error.message) ? error.message : '未能保存到本机，请检查可用空间后重试。你的输入仍然保留。') }
    finally { setWriting(count => count - 1) }
  }
  const report = async (action: () => Promise<unknown>) => { try { await action() } catch (error) { message(error instanceof Error ? error.message : '操作失败，请重试。') } }
  const readImport = async (file: File) => { try { const incoming = parseBackup(await file.text()); setModal({ kind: 'import', data: incoming }) } catch (error) { message(error instanceof Error ? error.message : '无法读取备份文件。') } }
  const exportCurrent = () => { const current = queue.current?.current(); if (current) { exportBackup(current); message('已生成备份，请将文件保存到安全位置。') } }
  const restore = async (incoming: AppData) => {
    if (queue.current) await commit(() => incoming)
    else { await saveData(incoming); queue.current = createWriteQueue(incoming, saveData, setData); setData(incoming); setLoadError('') }
    setModal(null); setBillsAccount(null); setPage('overview'); message('备份已恢复')
  }
  const updateRates = async () => {
    if (updating.current) return
    updating.current = true; setUpdatingRates(true)
    try {
      const live = await fetchLiveRates()
      await commit(current => captureSnapshot(makeRates(current, live), 'rates'))
      message(live.fiat.CNY && Object.keys(live.crypto).length ? '参考汇率已更新' : '部分汇率已更新；未获取的币种保留旧值和更新时间。')
    } catch (error) { message(error instanceof Error && error.message.includes('保存') ? error.message : '暂时无法获取汇率，请检查网络后重试。原汇率已保留。') }
    finally { updating.current = false; setUpdatingRates(false) }
  }
  const saveAccount = async (account: Account) => {
    await commit(current => {
      const existing = current.accounts.find(item => item.id === account.id)
      const next = { ...current, accounts: existing ? current.accounts.map(item => item.id === account.id ? { ...item, name: account.name, type: account.type, color: account.color, note: account.note } : item) : [...current.accounts, { ...account, sortOrder: current.accounts.length }] }
      return existing ? next : captureSnapshot(next, 'account')
    })
    setModal(null); message('账户已保存')
  }
  const saveEntry = async (entry: Transaction) => {
    await commit(current => {
      if (!current.accounts.some(account => account.id === entry.accountId && !account.archived) || entry.type === 'transfer' && !current.accounts.some(account => account.id === entry.targetAccountId && !account.archived)) throw new Error('账户已归档，请恢复后再记账。')
      return captureSnapshot({ ...current, transactions: current.transactions.some(item => item.id === entry.id) ? current.transactions.map(item => item.id === entry.id ? entry : item) : [...current.transactions, entry] }, 'transaction')
    })
    setModal(null); message('流水已保存')
  }
  const archiveAccount = (account: Account) => {
    if (!account.archived && !window.confirm(`归档“${account.name}”？\n余额将退出当前资产汇总，历史和关联流水保留，之后可以恢复。`)) return
    void report(async () => { await commit(current => setArchived(current, account.id, !account.archived)); setModal(null); message(account.archived ? '账户已恢复' : '账户已归档') })
  }
  const deleteAccount = (account: Account) => {
    if (!window.confirm(`删除“${account.name}”？此操作无法撤销。`)) return
    void report(async () => { await commit(current => deleteEmptyAccount(current, account.id)); setModal(null); message('账户已删除') })
  }
  const moveAccount = (id: string, direction: number) => void report(async () => { await commit(current => {
    const active = current.accounts.filter(account => !account.archived).sort((a, b) => a.sortOrder - b.sortOrder)
    const index = active.findIndex(account => account.id === id), other = active[index + direction]
    if (!other) return current
    ;[active[index], active[index + direction]] = [active[index + direction], active[index]]
    const order = new Map([...active, ...current.accounts.filter(account => account.archived)].map((account, index) => [account.id, index]))
    return { ...current, accounts: current.accounts.map(account => ({ ...account, sortOrder: order.get(account.id)! })) }
  }) })

  const closeModal = () => setModal(null)
  const currentAccount = modal && 'id' in modal ? data?.accounts.find(account => account.id === modal.id) : undefined
  const importDialog = modal?.kind === 'import' && <ImportDialog incoming={modal.data} hasCurrent={!!data} onClose={closeModal} onConfirm={() => restore(modal.data)} onExport={exportCurrent}/>
  if (loading) return <div className="loading-screen"><span className="app-monogram">净</span><p>正在打开本地账本…</p></div>
  if (loadError || !data) return <ToastContext.Provider value={toast}><div className="recovery-screen"><Icon name="info" size={36}/><h1>暂时无法打开账本</h1><p>{loadError}</p><p className="footnote">原有数据没有被空账本覆盖。可以重试读取，或从你保存的备份恢复。</p><button className="primary-button" onClick={() => void initialize()}>重试读取</button><button className="secondary-button" onClick={() => fileRef.current?.click()}>选择备份恢复</button><input type="file" ref={fileRef} accept="application/json,.json" hidden onChange={event => { const file = event.target.files?.[0]; if (file) void readImport(file); event.target.value = '' }}/>{importDialog}{toast && <div className="toast" role="status">{toast}</div>}</div></ToastContext.Provider>
  return <ToastContext.Provider value={toast}><div className="app-shell"><div className="app-content">
    {updates.ready && !updateDismissed && <div className="update-banner"><span>新版本已准备好</span><button disabled={!!modal || writing > 0} onClick={updates.apply}>立即更新</button><button onClick={() => setUpdateDismissed(true)}>稍后</button></div>}
    {billsAccount !== null ? <Bills key={billsAccount} data={data} initialAccountId={billsAccount} onBack={() => setBillsAccount(null)} onAdd={() => setModal({ kind: 'entry' })} onEdit={entry => setModal({ kind: 'entry', entry })}/> : page === 'overview' ? <Overview data={data} onAdd={() => setModal({ kind: 'account' })} onInventory={() => setModal({ kind: 'inventory' })} onTogglePrivacy={() => void report(async () => { await commit(current => ({ ...current, settings: { ...current.settings, hideAmounts: !current.settings.hideAmounts } })) })} onRates={() => setPage('settings')}/> : page === 'accounts' ? <Accounts data={data} onSelect={account => setModal({ kind: 'detail', id: account.id })} onAdd={() => setModal({ kind: 'account' })} onInventory={() => setModal({ kind: 'inventory' })} onBills={() => setBillsAccount('')} onMove={moveAccount} onArchive={archiveAccount} onDelete={deleteAccount}/> : <Settings data={data} commit={commit} onRates={() => void updateRates()} updatingRates={updatingRates} onExport={exportCurrent} onImport={file => void readImport(file)} onCategories={() => setModal({ kind: 'categories' })} onCheckUpdate={() => { setUpdateDismissed(false); void updates.check() }} checkingUpdate={updates.checking} updateStatus={updates.status}/>}</div>
    <nav className="tabbar" aria-label="主导航">{([['overview', 'overview', '总览'], ['accounts', 'wallet', '账户'], ['settings', 'settings', '设置']] as const).map(([key, icon, label]) => <button key={key} aria-current={page === key && billsAccount === null ? 'page' : undefined} onClick={() => { setPage(key); setBillsAccount(null); window.scrollTo(0, 0) }}><Icon name={icon}/><span>{label}</span></button>)}</nav>
    {modal?.kind === 'detail' && currentAccount && <AccountDetail account={currentAccount} data={data} onClose={closeModal} onEdit={() => setModal({ kind: 'account', id: currentAccount.id })} onInventory={() => setModal({ kind: 'inventory', id: currentAccount.id })} onBills={() => { setModal(null); setPage('accounts'); setBillsAccount(currentAccount.id) }} onArchive={() => archiveAccount(currentAccount)} onDelete={() => { if (!hasAccountHistory(data, currentAccount.id)) deleteAccount(currentAccount) }}/>}
    {modal?.kind === 'account' && <AccountForm key={modal.id ?? 'new'} data={data} account={currentAccount} onSave={saveAccount} onClose={closeModal}/>}
    {modal?.kind === 'inventory' && <InventoryForm data={data} accountId={modal.id} onClose={closeModal} onSave={async inputs => { await commit(current => inventoryBalances(current, inputs)); setModal(null); message('余额盘点已保存') }}/>}
    {modal?.kind === 'entry' && <EntryForm data={data} entry={modal.entry} defaultAccountId={billsAccount || undefined} onClose={closeModal} onSave={saveEntry} onDelete={() => report(async () => { const id = modal.entry?.id; await commit(current => captureSnapshot({ ...current, transactions: current.transactions.filter(entry => entry.id !== id) }, 'transaction')); setModal(null); message('流水已删除') })}/>}
    {modal?.kind === 'categories' && <Categories data={data} commit={commit} onClose={closeModal}/>}{importDialog}
    {toast && <div className="toast" role="status">{toast}</div>}
  </div></ToastContext.Provider>
}
