// 版本号变更会触发新 SW 安装、清理旧缓存并接管页面
const CACHE = 'jingzi-v3'
const CORE = ['./', './index.html', './assets/app.js', './assets/app.css', './manifest.webmanifest', './icon.svg']

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting())
))

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
))

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return

  let url
  try { url = new URL(request.url) } catch { return }

  // 跨域请求（汇率等实时数据接口）一律直连网络，绝不缓存：
  // 缓存汇率会让“更新汇率”读到旧响应，看起来像一直失败。
  if (url.origin !== location.origin) return

  // 页面导航采用 network-first，保证能拿到新版页面；断网时回退到缓存，维持离线可用。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match('./index.html')))
    )
    return
  }

  // 同源静态资源走 cache-first：产物文件名固定，内容变化由 CACHE 版本兜住
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then(cache => cache.put(request, copy))
      }
      return response
    }))
  )
})
