import { useState } from 'react'
import { balanceOf, rateFor, totalFor } from './ledger'
import { snapshotLabels, trendPoints } from './inventory'
import { money, dateTime, shortDate } from './format'
import { colors, accountTypes, type AppData, type AccountType } from './types'
import { EmptyState, Icon, SectionTitle } from './ui'

function Trend({ data }: { data: AppData }) {
  const [range, setRange] = useState<'30' | '90' | 'all'>('90')
  const [selection, setSelection] = useState<string>('')
  const currency = data.settings.baseCurrency, hidden = data.settings.hideAmounts
  const points = trendPoints(data.snapshots, currency, range)
  const selected = points.find(point => point.snapshot.id === selection) ?? points.at(-1)
  const values = points.flatMap(point => point.value ? [point.value.net] : [])
  const low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 1
  const padding = Math.max((high - low) * .15, Math.abs(high) * .005, 1)
  const min = low - padding, max = high + padding
  const span = max - min || 1
  const firstTime = points.length ? Date.parse(points[0].snapshot.date) : 0
  const lastTime = points.length ? Date.parse(points.at(-1)!.snapshot.date) : 0
  const x = (index: number) => points.length === 1 ? 160 : 12 + (Date.parse(points[index].snapshot.date) - firstTime) / (lastTime - firstTime || 1) * 296
  const y = (value: number) => 116 - (value - min) / span * 92
  const segments: string[] = []
  let line = ''
  points.forEach((point, index) => {
    if (!point.value) { if (line) segments.push(line); line = ''; return }
    line += `${line ? ' L' : 'M'}${x(index)},${y(point.value.net)}`
  })
  if (line) segments.push(line)
  return <>
    <SectionTitle title="净资产变化"><span className="caption">{currency}</span></SectionTitle>
    <section className="group trend-card">
      <div className="segmented" aria-label="趋势时间范围">{([['30', '近30天'], ['90', '近90天'], ['all', '全部']] as const).map(([value, label]) => <button key={value} aria-pressed={range === value} onClick={() => { setRange(value); setSelection('') }}>{label}</button>)}</div>
      {selected ? <>
        <div className="trend-readout"><strong>{selected.value ? money(selected.value.net, currency, hidden) : '估值不完整'}</strong><span>{shortDate(selected.snapshot.date)} · {snapshotLabels[selected.snapshot.source]}</span></div>
        <svg className="trend-chart" viewBox="0 0 320 144" role="img" aria-label={`净资产变化图，${points.length}个记录日`} onPointerDown={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          const position = (event.clientX - rect.left) / rect.width * 320
          let index = 0
          points.forEach((_, i) => { if (Math.abs(x(i) - position) < Math.abs(x(index) - position)) index = i })
          setSelection(points[index].snapshot.id)
        }}>
          {[24, 70, 116].map(value => <line key={value} x1="0" y1={value} x2="320" y2={value} className="chart-grid"/>)}
          {segments.map((path, index) => <path key={index} d={path} className="chart-line"/>)}
          {points.map((point, index) => point.value ? <circle key={point.snapshot.id} cx={x(index)} cy={y(point.value.net)} r={point === selected ? 5 : 3} className={point === selected ? 'chart-dot selected' : 'chart-dot'}/> : <path key={point.snapshot.id} d={`M${x(index) - 3},128l6,6m-6,0 6-6`} className="chart-gap"/>)}
        </svg>
        <div className="chart-dates"><span>{shortDate(points[0].snapshot.date)}</span><span>{points.length > 1 ? shortDate(points.at(-1)!.snapshot.date) : '起始记录'}</span></div>
        {points.some(point => !point.value) && <p className="warning-text">部分记录缺少当时的汇率，图中留空。</p>}
        {points.length === 1 && <p className="footnote">这是你的起始记录，之后的盘点会逐步形成趋势。</p>}
        <details className="record-details"><summary>查看估值记录 <Icon name="history" size={16}/></summary><div className="history-list">{[...points].reverse().map(point => <button key={point.snapshot.id} onClick={() => setSelection(point.snapshot.id)}><span><b>{dateTime(point.snapshot.createdAt)}</b><small>{snapshotLabels[point.snapshot.source]}</small></span><strong>{point.value ? money(point.value.net, currency, hidden) : '缺少汇率'}</strong></button>)}</div></details>
      </> : <div className="chart-empty"><Icon name="trend" size={30}/><p>这个时间范围还没有记录</p><span>盘点后，资产变化会记录在这里。</span></div>}
      <p className="footnote chart-note">包含资金进出与汇率变化，不代表投资收益。</p>
    </section>
  </>
}

function Distribution({ data }: { data: AppData }) {
  const [groupBy, setGroupBy] = useState<'type' | 'currency'>('type')
  const grouped = new Map<string, number>()
  data.accounts.filter(account => !account.archived && account.kind === 'asset').forEach(account => {
    const rate = rateFor(data, account.currency), balance = balanceOf(account, data.transactions)
    if (rate === undefined || balance <= 0) return
    const key = groupBy === 'type' ? account.type : account.currency
    grouped.set(key, (grouped.get(key) ?? 0) + balance * rate)
  })
  const items = [...grouped.entries()].sort((a, b) => b[1] - a[1]), total = items.reduce((sum, [, value]) => sum + value, 0)
  let cursor = 0
  const gradient = items.map(([, value], index) => { const start = cursor; cursor += value / total * 100; return `${colors[index % colors.length]} ${start}% ${cursor}%` }).join(',')
  return <><SectionTitle title="资产分布"/><section className="group distribution-card">
    <div className="segmented small-segments">{([['type', '按类型'], ['currency', '按币种']] as const).map(([value, label]) => <button key={value} aria-pressed={groupBy === value} onClick={() => setGroupBy(value)}>{label}</button>)}</div>
    {items.length ? <><div className="allocation-visual"><div className="donut" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label="资产占比分布"><div><strong>{items.length}</strong><span>{groupBy === 'type' ? '种类型' : '种币种'}</span></div></div><div className="allocation-caption"><span>可换算的正余额</span><strong>{money(total, data.settings.baseCurrency, data.settings.hideAmounts)}</strong></div></div><div className="allocation-list">{items.map(([key, value], index) => <div key={key}><i style={{ background: colors[index % colors.length] }}/><span>{groupBy === 'type' ? accountTypes[key as AccountType].label : key}</span><strong>{money(value, data.settings.baseCurrency, data.settings.hideAmounts)}</strong><small>{(value / total * 100).toFixed(1)}%</small></div>)}</div></> : <p className="inline-empty">添加余额并更新所需汇率后查看分布。</p>}
  </section></>
}

export function Overview({ data, onInventory, onAdd, onTogglePrivacy, onRates }: { data: AppData; onInventory: () => void; onAdd: () => void; onTogglePrivacy: () => void; onRates: () => void }) {
  const assets = totalFor(data, 'asset'), liabilities = totalFor(data, 'liability'), active = data.accounts.filter(account => !account.archived)
  const missing = [...new Set(active.filter(account => rateFor(data, account.currency) === undefined && balanceOf(account, data.transactions) !== 0).map(account => account.currency))]
  const hidden = data.settings.hideAmounts, currency = data.settings.baseCurrency
  const unchecked = active.filter(account => !account.lastInventoriedAt).length
  return <main className="page overview-page"><header className="page-head"><div><span className="brand-wordmark">净值<span className="brand-dot"/></span><h1>资产总览</h1></div><button className="icon-button privacy-button" aria-label={hidden ? '显示金额' : '隐藏金额'} aria-pressed={hidden} onClick={onTogglePrivacy}><Icon name={hidden ? 'hidden' : 'eye'}/></button></header>
    <section className="net-worth"><div className="net-label">{missing.length ? '已计入的净资产' : '净资产'}<span>{currency}</span></div><strong className="net-value">{money(assets - liabilities, currency, hidden)}</strong><div className={`net-summary ${liabilities === 0 ? 'no-debt' : ''}`}><div><span>总资产</span><b>{money(assets, currency, hidden)}</b></div><div><span>总负债</span><b>{money(liabilities, currency, hidden)}</b></div></div></section>
    {missing.length > 0 && <button className="notice" onClick={onRates}><Icon name="info" size={18}/><span>{missing.join('、')} 缺少汇率，部分余额未计入。<b>去更新</b></span><Icon name="chevron" size={16}/></button>}
    {active.length ? <button className="inventory-callout" onClick={onInventory}><span className="callout-icon"><Icon name="check"/></span><span><strong>盘点账户余额</strong><small>{unchecked ? `${unchecked} 个账户尚未盘点` : '核对最新余额，留下一次记录'}</small></span><Icon name="chevron" size={18}/></button> : <section className="group welcome-card"><EmptyState title="从第一个账户开始" action="添加账户" onAction={onAdd}>添加银行卡、投资或海外账户，<br/>把你的资产放在一起看。</EmptyState></section>}
    {data.accounts.length > 0 && <><Trend data={data}/><Distribution data={data}/></>}
    <div className="local-caption"><Icon name="lock" size={13}/><span>数据保存在这台设备</span></div>
  </main>
}
