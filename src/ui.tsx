import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'

export const ToastContext = createContext('')

const paths = {
  overview: 'M3 13a9 9 0 1 0 10-10v10H3Z M3 9a6 6 0 0 1 6-6v6H3Z',
  wallet: 'M4 5h14a2 2 0 0 1 2 2v12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h13 M20 10h-6v5h6 M16.5 12.5h.01',
  settings: 'M9 3h6l.8 3 2.8 1L21 9.5l-2 2.5 2 2.5-2.4 2.5-2.8 1-.8 3H9l-.8-3-2.8-1L3 14.5 5 12 3 9.5 5.4 7l2.8-1L9 3Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  plus: 'M12 5v14 M5 12h14', close: 'M6 6l12 12 M6 18 18 6', chevron: 'm9 5 7 7-7 7', back: 'm15 5-7 7 7 7',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  hidden: 'm3 3 18 18 M9.5 5.3A12 12 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8 M6.1 6.1A18 18 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5-1.1 M10 10a3 3 0 0 0 4 4',
  history: 'M3 4v6h6 M3 10a9 9 0 1 1 .5 6 M12 7v5l3 2',
  check: 'm5 12 4 4L19 6', refresh: 'M20 4v6h-6 M4 20v-6h6 M20 10a8 8 0 0 0-14-5 M4 14a8 8 0 0 0 14 5',
  download: 'M12 3v12 m-5-5 5 5 5-5 M4 15v6h16v-6', upload: 'M12 16V4 m-5 5 5-5 5 5 M4 15v6h16v-6',
  bank: 'm3 8 9-5 9 5 M3 8h18 M5 10v8 m7-8v8 m7-8v8 M3 21h18',
  archive: 'M3 4h18v4H3V4Z M5 8v13h14V8 M10 12h4',
  income: 'M12 4v16 m-6-6 6 6 6-6', expense: 'M12 20V4 m-6 6 6-6 6 6', transfer: 'M3 7h17 m-4-4 4 4-4 4 M21 17H4 m4-4-4 4 4 4',
  trend: 'm3 17 6-6 4 4 8-10 M15 5h6v6', lock: 'M6 10h12v11H6V10Z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  up: 'm6 14 6-6 6 6', down: 'm6 10 6 6 6-6', info: 'M12 10v7 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z'
}
export type IconName = keyof typeof paths
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg> }

export function Modal({ title, children, onClose, busy = false, dirty = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; dirty?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const notice = useContext(ToastContext)
  const close = () => { if (!busy && (!dirty || window.confirm('放弃尚未保存的修改？'))) onClose() }
  useEffect(() => {
    const dialog = ref.current!
    const active = document.activeElement as HTMLElement | null
    dialog.showModal()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const viewport = window.visualViewport
    const resize = () => {
      if (!viewport) return
      dialog.style.maxHeight = `${Math.max(180, viewport.height - 16)}px`
      dialog.style.bottom = `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`
    }
    resize(); viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize)
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); dialog.close(); document.body.style.overflow = previous; active?.focus() }
  }, [])
  return <dialog ref={ref} className="sheet" aria-labelledby="sheet-title" onCancel={event => { event.preventDefault(); close() }}>
    <header className="sheet-head"><h2 id="sheet-title">{title}</h2><button className="icon-button" type="button" aria-label="关闭" disabled={busy} onClick={close}><Icon name="close"/></button></header>
    {children}{notice && <div className="sheet-notice" role="status">{notice}</div>}
  </dialog>
}

export function SaveForm({ children, onSave, label = '保存', busy, setBusy }: { children: ReactNode; onSave: () => Promise<unknown>; label?: string; busy: boolean; setBusy: (busy: boolean) => void }) {
  const [error, setError] = useState('')
  const saving = useRef(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving.current) return
    saving.current = true; setBusy(true); setError('')
    try { await onSave() } catch (error) { setError(error instanceof Error ? error.message : '保存失败，请重试。') }
    finally { saving.current = false; setBusy(false) }
  }
  return <form className="save-form" onSubmit={submit}><fieldset disabled={busy}>{children}</fieldset><footer className="form-footer">{error && <p role="alert" className="error-message">{error}</p>}<button className="primary-button" type="submit" disabled={busy}>{busy ? '正在保存…' : label}</button></footer></form>
}

export function EmptyState({ title, children, action, onAction }: { title: string; children: ReactNode; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-symbol"><Icon name="wallet" size={30}/></div><h3>{title}</h3><p>{children}</p>{action && <button className="primary-button" onClick={onAction}>{action}</button>}</div>
}

export function SectionTitle({ title, children }: { title: string; children?: ReactNode }) { return <div className="section-title"><h2>{title}</h2>{children}</div> }
