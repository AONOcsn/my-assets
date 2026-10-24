import { useEffect, useRef, useState } from 'react'

export function useAppUpdate() {
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const accepting = useRef(false)
  const [ready, setReady] = useState(false), [checking, setChecking] = useState(false), [status, setStatus] = useState('')
  useEffect(() => {
    if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
    let cancelled = false
    let cleanup = () => {}
    let hadController = !!navigator.serviceWorker.controller
    const changed = () => {
      if (accepting.current) location.reload()
      else if (hadController) { setReady(true); setStatus('新版本已就绪，准备好后可更新。') }
      hadController = true
    }
    navigator.serviceWorker.addEventListener('controllerchange', changed)
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' }).then(reg => {
      if (cancelled) return
      registration.current = reg
      const inspect = () => {
        if (reg.waiting && navigator.serviceWorker.controller) { setReady(true); setStatus('发现新版本。') }
      }
      const found = () => {
        const worker = reg.installing
        if (!worker) return
        worker.addEventListener('statechange', () => { if (!cancelled && worker.state === 'installed') inspect() })
      }
      inspect(); found(); reg.addEventListener('updatefound', found)
      cleanup = () => reg.removeEventListener('updatefound', found)
      void reg.update().catch(() => {})
    }).catch(() => { if (!cancelled) setStatus('离线资源未准备好，联网后请重试检查更新。') })
    // 首次安装接管不弹更新通知；后续更新始终交给用户决定。
    return () => { cancelled = true; cleanup(); navigator.serviceWorker.removeEventListener('controllerchange', changed) }
  }, [])
  const check = async () => {
    if (import.meta.env.DEV) { setStatus('当前为本地开发预览，部署后的版本可在这里检查更新。'); return }
    setChecking(true); setStatus('')
    try {
      const reg = registration.current
      if (!reg) throw new Error('离线资源尚未准备好，请联网后重新打开页面。')
      await reg.update()
      if (reg.waiting) { setReady(true); setStatus('发现新版本。') }
      else setStatus(reg.installing ? '新版本正在准备，完成后会提示。' : '已完成检查，当前没有待安装的新版本。')
    } catch { setStatus('暂时无法检查更新，请联网后重试。') }
    finally { setChecking(false) }
  }
  const apply = () => {
    accepting.current = true
    if (registration.current?.waiting) registration.current.waiting.postMessage({ type: 'SKIP_WAITING' })
    else location.reload()
  }
  return { ready, checking, status, check, apply }
}
