import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

/**
 * 注册 Service Worker。
 *
 * 两个关键点：
 * - updateViaCache: 'none' 让浏览器绕过 HTTP 缓存检查 sw.js，否则新版本可能长时间发现不了。
 * - 检测到新 SW 接管时自动刷新一次页面（用 sessionStorage 防止循环刷新），
 *   这样已经“添加到主屏幕”的用户不用手动清缓存也能拿到修复。
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      registration.update().catch(() => {})

      let reloading = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading || sessionStorage.getItem('sw-reloaded') === '1') return
        reloading = true
        sessionStorage.setItem('sw-reloaded', '1')
        location.reload()
      })
    } catch {
      // 注册失败不影响应用主体功能，仅失去离线能力
    }
  })
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
