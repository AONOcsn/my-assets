import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
function worker() {
  const listeners: Record<string, Function> = {}, removed: string[] = [], cached: string[] = []
  let skips = 0
  const context = { self: { addEventListener: (name: string, handler: Function) => { listeners[name] = handler }, skipWaiting: () => { skips++; return Promise.resolve() }, clients: { claim: async () => {} } }, caches: { open: async () => ({ addAll: async (items: string[]) => { cached.push(...items) }, put: async () => {} }), keys: async () => ['jingzi-v4', 'other-app-cache', 'jingzi-v6'], delete: async (key: string) => { removed.push(key) }, match: async () => undefined }, location: { origin: 'https://local.example' }, URL, fetch: async () => ({ ok: true, clone: () => ({}) }) }
  vm.runInNewContext(source, context)
  return { listeners, removed, cached, skips: () => skips }
}
test('a new worker waits for explicit user acceptance', async () => {
  const w = worker()
  let completion!: Promise<void>
  w.listeners.install({ waitUntil: (promise: Promise<void>) => { completion = promise } })
  await completion
  assert.equal(w.skips(), 0)
  assert.ok(w.cached.includes('./assets/app.js'))
  w.listeners.message({ data: { type: 'SKIP_WAITING' } })
  assert.equal(w.skips(), 1)
})
test('worker activation deletes only this app caches', async () => {
  const w = worker()
  let completion!: Promise<void>
  w.listeners.activate({ waitUntil: (promise: Promise<void>) => { completion = promise } })
  await completion
  assert.deepEqual(w.removed, ['jingzi-v4'])
})
test('cross-origin rates bypass the offline cache', () => {
  const w = worker()
  let intercepted = false
  w.listeners.fetch({ request: { method: 'GET', url: 'https://rates.example/USD' }, respondWith: () => { intercepted = true } })
  assert.equal(intercepted, false)
})
