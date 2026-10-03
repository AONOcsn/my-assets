import test from 'node:test'
import assert from 'node:assert/strict'
import { makeRates } from '../src/rates.ts'

// makeRates 是纯函数，不触网，因此可在 CI 里稳定验证折算逻辑。
const base = (rates: Record<string, { currency: string; usdValue: number; updatedAt: string }> = {}) => ({
  version: 1 as const, accounts: [], categories: [], transactions: [], rates,
  settings: { baseCurrency: 'CNY' as const }
})

test('crypto prices are used directly as USD value per unit', () => {
  const next = makeRates(base(), { fiat: {}, crypto: { BTC: 85000, ETH: 2700, USDT: 1, USDC: 1.00015 } }, 'T')
  assert.equal(next.rates.BTC.usdValue, 85000)
  assert.equal(next.rates.ETH.usdValue, 2700)
  assert.equal(next.rates.USDC.usdValue, 1.00015)
})

test('fiat rates given per USD are inverted into USD value', () => {
  const next = makeRates(base(), { fiat: { USD: 1, CNY: 7.2, HKD: 7.8 }, crypto: {} }, 'T')
  assert.equal(next.rates.USD.usdValue, 1)
  assert.equal(next.rates.CNY.usdValue, 1 / 7.2)
  assert.equal(next.rates.HKD.usdValue, 1 / 7.8)
})

test('currencies missing from this round keep their previous value', () => {
  const previous = base({ BTC: { currency: 'BTC', usdValue: 60000, updatedAt: 'old' } })
  // 加密货币源整体失败：只回填了法币
  const next = makeRates(previous, { fiat: { CNY: 7.2 }, crypto: {} }, 'T')
  assert.equal(next.rates.BTC.usdValue, 60000, 'BTC 应保留旧值而不是被清空')
  assert.equal(next.rates.CNY.usdValue, 1 / 7.2, 'CNY 应更新为新值')
})

test('every supported currency is updated when both sources succeed', () => {
  const fiat = { USD: 1, CNY: 7.2, HKD: 7.8, EUR: 0.92, GBP: 0.79, JPY: 157, SGD: 1.35, AUD: 1.52, CAD: 1.37, KRW: 1380, TWD: 32.4 }
  const crypto = { USDT: 1, USDC: 1, BTC: 85000, ETH: 2700 }
  const next = makeRates(base(), { fiat, crypto }, 'T')
  for (const code of ['CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY', 'SGD', 'AUD', 'CAD', 'KRW', 'TWD', 'USDT', 'USDC', 'BTC', 'ETH']) {
    assert.ok(next.rates[code], `${code} 应有汇率`)
    assert.ok(next.rates[code].usdValue > 0, `${code} 汇率应为正数`)
  }
})

test('partial update records which sources succeeded', () => {
  const onlyFiat = makeRates(base(), { fiat: { CNY: 7.2 }, crypto: {} }, 'T')
  assert.equal(onlyFiat.settings.lastRateSource, '法币')
  const both = makeRates(base(), { fiat: { CNY: 7.2 }, crypto: { BTC: 85000 } }, 'T')
  assert.equal(both.settings.lastRateSource, '法币 + 加密货币')
  assert.equal(both.settings.lastRateUpdate, 'T')
})

test('zero or negative values from a bad payload are rejected', () => {
  const previous = base({ CNY: { currency: 'CNY', usdValue: 0.14, updatedAt: 'old' } })
  const next = makeRates(previous, { fiat: { CNY: 0 }, crypto: { BTC: -1 } }, 'T')
  assert.equal(next.rates.CNY.usdValue, 0.14, '非法的新值不应覆盖旧值')
  assert.equal(next.rates.BTC, undefined, '无旧值的非法币种不应写入')
})
