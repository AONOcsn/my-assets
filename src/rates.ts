import { supportedCurrencies, type AppData, type Rate } from './types.ts'

export type FiatRates = Record<string, number>
export type CryptoPrices = Record<string, number>
export interface LiveRates { fiat: FiatRates; crypto: CryptoPrices }

/**
 * 汇率数据源配置。
 *
 * 每个数据源都提供多个上游域名，因为单一域名随时可能在特定网络环境下不可达。
 * 实测（中国大陆网络）：CoinGecko / Coinbase / api.binance.com 会连接超时或被重置，
 * 因此加密货币以 data-api.binance.vision 为主、CoinGecko 为备用。
 */
const FIAT_SOURCES = [
  { name: 'open.er-api.com', url: 'https://open.er-api.com/v6/latest/USD' },
  { name: 'frankfurter.app', url: 'https://api.frankfurter.app/latest?from=USD' }
]

const CRYPTO_SOURCES = [
  {
    name: 'binance.vision',
    url: 'https://data-api.binance.vision/api/v3/ticker/price?symbols=' +
      encodeURIComponent(JSON.stringify(['BTCUSDT', 'ETHUSDT', 'USDCUSDT']))
  },
  {
    name: 'coingecko',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether,usd-coin&vs_currencies=usd'
  }
]

/** 单次请求超时。没有超时时，被封锁的域名会挂起几十秒，把整个更新流程卡死。 */
const FETCH_TIMEOUT_MS = 8000
/** 每个数据源的尝试次数；配合退避应对瞬时抖动。 */
const RETRY_DELAYS_MS = [0, 500, 1500]

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** 带超时的 JSON 请求。4xx/5xx 与超时同样按失败处理，交给上层换源。 */
async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' })
  if (!response.ok) throw new Error(`${url} 返回 HTTP ${response.status}`)
  return await response.json() as T
}

/** 依次尝试某个数据源的所有上游域名，同一域名可重试；全部失败则抛错。 */
async function resolveFrom<T>(
  sources: { name: string; url: string }[],
  parse: (payload: unknown, name: string) => T | undefined
): Promise<T> {
  const failures: string[] = []
  for (const source of sources) {
    for (const delay of RETRY_DELAYS_MS) {
      if (delay > 0) await sleep(delay)
      try {
        const parsed = parse(await getJson<unknown>(source.url), source.name)
        if (parsed) return parsed
        failures.push(`${source.name}: 响应缺少需要的币种`)
        break
      } catch (error) {
        failures.push(`${source.name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  throw new Error(failures.join('；'))
}

/** 法币：上游以 USD 为基准给出 1 USD 等于多少目标币。 */
async function fetchFiatRates(): Promise<FiatRates> {
  return resolveFrom(FIAT_SOURCES, payload => {
    const rates = (payload as { rates?: Record<string, number> })?.rates
    if (!rates || !Number.isFinite(rates.CNY)) return undefined
    const result: FiatRates = {}
    for (const [code] of supportedCurrencies) {
      const value = rates[code]
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) result[code] = value
    }
    // 至少要拿到人民币，否则认为该源不可用
    return result.CNY ? result : undefined
  })
}

/**
 * 加密货币：统一折算为「1 单位币值多少 USDT」。
 * USDT 自身即为计价单位，恒为 1；USDC 由 USDCUSDT 交易对推导。
 */
async function fetchCryptoPrices(): Promise<CryptoPrices> {
  return resolveFrom(CRYPTO_SOURCES, (payload, name) => {
    if (name === 'binance.vision') {
      const list = payload as { symbol?: string; price?: string }[]
      if (!Array.isArray(list)) return undefined
      const price = Object.fromEntries(
        list.filter(item => item?.symbol && Number.isFinite(Number(item.price)))
          .map(item => [item.symbol as string, Number(item.price)])
      )
      if (!price.BTCUSDT || !price.ETHUSDT) return undefined
      return {
        BTC: price.BTCUSDT,
        ETH: price.ETHUSDT,
        USDT: 1,
        USDC: price.USDCUSDT ?? 1
      }
    }
    const data = payload as Record<string, { usd?: number }>
    const bitcoin = data?.bitcoin?.usd, ethereum = data?.ethereum?.usd
    if (!Number.isFinite(bitcoin) || !Number.isFinite(ethereum)) return undefined
    return {
      BTC: bitcoin as number,
      ETH: ethereum as number,
      USDT: data.tether?.usd ?? 1,
      USDC: data['usd-coin']?.usd ?? 1
    }
  })
}

/**
 * 并发获取两类汇率，但**互不牵连**：任一失败不影响另一类结果。
 * 原实现用 Promise.all 合并请求，只要加密货币源被墙，法币汇率也一并更新失败。
 */
export async function fetchLiveRates(): Promise<LiveRates> {
  const [fiat, crypto] = await Promise.allSettled([fetchFiatRates(), fetchCryptoPrices()])
  if (fiat.status === 'rejected' && crypto.status === 'rejected') {
    throw new Error(`法币源与加密货币源均不可用。法币：${fiat.reason?.message ?? '-'}；加密货币：${crypto.reason?.message ?? '-'}`)
  }
  return {
    fiat: fiat.status === 'fulfilled' ? fiat.value : {},
    crypto: crypto.status === 'fulfilled' ? crypto.value : {}
  }
}

/** 纯函数：把上游行情折算成账本使用的「1 单位币值多少 USD」。便于单元测试。 */
export function makeRates(current: AppData, live: LiveRates, now = new Date().toISOString()): AppData {
  const { fiat, crypto } = live
  const rates: Record<string, Rate> = {}
  for (const [code] of supportedCurrencies) {
    let usdValue: number | undefined
    if (code === 'USD') usdValue = 1
    else if (crypto[code] !== undefined) usdValue = crypto[code]
    else if (fiat[code]) usdValue = 1 / fiat[code]
    // 本轮未取到的币种保留上一次的值，避免部分源失败时把已有汇率清空
    else usdValue = current.rates[code]?.usdValue
    if (typeof usdValue === 'number' && Number.isFinite(usdValue) && usdValue > 0) {
      rates[code] = { currency: code, usdValue, updatedAt: now }
    }
  }
  const source = [
    live.fiat.CNY ? '法币' : '',
    Object.keys(live.crypto).length ? '加密货币' : ''
  ].filter(Boolean).join(' + ')
  return { ...current, rates, settings: { ...current.settings, lastRateUpdate: now, lastRateSource: source || undefined } }
}
