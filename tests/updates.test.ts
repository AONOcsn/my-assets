import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'

test('first installation stays quiet; accepting a later worker reloads in the same session', async () => {
  const source = fs.readFileSync(new URL('../src/updates.ts', import.meta.url), 'utf8').replace(/^import .* from 'react'\r?\n/, '').replaceAll('import.meta.env.DEV', 'false').replaceAll('import.meta.env.BASE_URL', "'./'").replace('export function', 'function') + '\nglobalThis.result = useAppUpdate()'
  const handlers = new Map<string, Function>()
  let reloads = 0, messages = 0
  const registration = { waiting: null as null | { postMessage: Function }, installing: null, addEventListener() {}, removeEventListener() {}, update: async () => {} }
  const worker = { controller: null as null | object, addEventListener: (name: string, handler: Function) => handlers.set(name, handler), removeEventListener: (name: string) => handlers.delete(name), register: async () => registration }
  const stateWrites: unknown[] = []
  const context = vm.createContext({ navigator: { serviceWorker: worker }, location: { reload: () => { reloads++ } }, useRef: (current: unknown) => ({ current }), useState: (initial: unknown) => [initial, (value: unknown) => stateWrites.push(value)], useEffect: (effect: Function) => effect() })
  vm.runInContext(stripTypeScriptTypes(source), context)
  await Promise.resolve(); await Promise.resolve()
  worker.controller = {}
  handlers.get('controllerchange')?.()
  assert.equal(stateWrites.includes(true), false, 'first acquisition must not announce an update')
  registration.waiting = { postMessage: () => { messages++ } }
  context.result.apply()
  handlers.get('controllerchange')?.()
  assert.equal(messages, 1)
  assert.equal(reloads, 1)
})
