import { db } from '../db/database';
import type { PriceData } from '../types';
import { normalizeCurrencyWithDefault } from '../constants/currencies';
import { isTauri } from './fileAdapter';
import { debugLog } from './debugLog';

const CACHE_DURATION_MS = 5 * 60 * 1000;

const YAHOO_ORIGIN = 'https://query2.finance.yahoo.com';
const CHART_ORIGIN = 'https://query1.finance.yahoo.com';
const YAHOO_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const YAHOO_PROXY_STORAGE_KEY = 'yahooProxyUrl';

/** Call this to set optional proxy URL (e.g. from Settings). In Tauri, when set, quoteSummary/search use proxy instead of direct auth. */
export function setYahooProxyUrl(url: string | null): void {
  try {
    if (url?.trim()) localStorage.setItem(YAHOO_PROXY_STORAGE_KEY, url.trim());
    else localStorage.removeItem(YAHOO_PROXY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getYahooProxyUrl(): string | null {
  try {
    const u = localStorage.getItem(YAHOO_PROXY_STORAGE_KEY);
    return u?.trim() || null;
  } catch {
    return null;
  }
}

// In Tauri: use optional proxy URL if set (avoids cookie/crumb); else use Yahoo with auth.
// In browser dev, Vite proxies /api/yahoo. In production PWA, set VITE_PRICE_PROXY_URL for CORS proxy.
export function getBaseUrl(): string {
  if (isTauri()) {
    const proxy = getYahooProxyUrl();
    if (proxy) return proxy.replace(/\/$/, '');
    return YAHOO_ORIGIN;
  }
  return import.meta.env.PROD
    ? (import.meta.env.VITE_PRICE_PROXY_URL ?? '')
    : '/api/yahoo';
}

function isUsingYahooProxy(): boolean {
  return isTauri() && !!getYahooProxyUrl();
}

// Use literal string so Vite can resolve and bundle the plugin (required for Tauri desktop).
let fetchImpl: Promise<typeof fetch> | null = null;
function getFetch(): Promise<typeof fetch> {
  if (fetchImpl != null) return fetchImpl;
  if (isTauri()) {
    fetchImpl = import('@tauri-apps/plugin-http').then((m: { fetch: typeof fetch }) => m.fetch);
  } else {
    fetchImpl = Promise.resolve(fetch);
  }
  return fetchImpl;
}

export async function yahooFetch(url: string, init?: RequestInit): Promise<Response> {
  // Tauri: use Rust backend for Yahoo auth (cookie+crumb) — no proxy needed.
  if (isTauri() && url.startsWith(YAHOO_ORIGIN)) {
    if (isUsingYahooProxy()) {
      const f = await getFetch();
      return f(url, { ...init, headers: { ...init?.headers, 'User-Agent': YAHOO_UA } });
    }
    const path = url.slice(YAHOO_ORIGIN.length).replace(/^\//, '');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const [status, body] = await invoke<[number, string]>('fetch_yahoo', { path });
      return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      debugLog.warn('Yahoo', 'Rust fetch_yahoo failed', err instanceof Error ? err.message : String(err));
      return new Response(JSON.stringify({ error: 'Yahoo request failed' }), { status: 502 });
    }
  }

  const f = await getFetch();
  if (isTauri()) return f(url, { ...init, headers: { ...init?.headers, 'User-Agent': YAHOO_UA } });
  return f(url, init);
}

// v8 chart endpoint works without auth in Tauri. Use for price/summary when quoteSummary returns 401.
async function tauriFetchChart(
  ticker: string,
  range: string = '5d',
  options?: { includePrePost?: boolean }
): Promise<{ meta?: Record<string, unknown> } | null> {
  if (!isTauri()) return null;
  try {
    const f = await getFetch();
    let url = `${CHART_ORIGIN}/v8/finance/chart/${encodeURIComponent(ticker.toUpperCase())}?interval=1d&range=${range}`;
    if (options?.includePrePost) url += '&includePrePost=true';
    const res = await f(url, { headers: { 'User-Agent': YAHOO_UA } });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    return result ?? null;
  } catch {
    return null;
  }
}

/** Map chart meta instrumentType/quoteType to a display sector when we don't have real sector data. */
function instrumentTypeToSector(raw: string): string {
  const u = raw.toUpperCase();
  if (u === 'ETF') return 'ETF';
  if (u === 'MUTUALFUND' || u === 'MUTUAL FUND') return 'Mutual Fund';
  if (u === 'INDEX') return 'Index';
  if (u === 'CRYPTOCURRENCY' || u === 'CRYPTO') return 'Crypto';
  if (u === 'CURRENCY') return 'Currency';
  if (u === 'FUTURE' || u === 'FUTURES') return 'Futures';
  if (u === 'OPTION' || u === 'OPTIONS') return 'Options';
  if (u === 'EQUITY' || u === 'STOCK') return 'Equity';
  if (u.length > 0) return raw; // e.g. "COMMODITY" or other known type
  return 'Other';
}

export interface TickerInfo {
  name: string;
  sector: string;
  country: string;
  quoteType: string;
  currency: string;
}

function parseQuoteCurrency(priceModule: Record<string, unknown> | undefined): string {
  const raw = priceModule?.currency;
  return normalizeCurrencyWithDefault(typeof raw === 'string' ? raw : undefined);
}

export interface SearchQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType: string;
  exchange?: string;
  typeDisp?: string;
}

export interface TickerNewsItem {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: number;
}

function parseTickerNews(
  data: unknown,
  ticker: string,
  limit: number,
  filterByTicker: boolean
): TickerNewsItem[] {
  const key = ticker.toUpperCase();
  const raw = (data as { news?: Array<Record<string, unknown>> })?.news ?? [];

  const items: TickerNewsItem[] = [];
  for (const row of raw) {
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const link = typeof row.link === 'string' ? row.link.trim() : '';
    if (!title || !link) continue;

    const related = Array.isArray(row.relatedTickers)
      ? row.relatedTickers.map((t) => String(t).toUpperCase())
      : [];
    if (filterByTicker && related.length > 0 && !related.includes(key)) continue;

    const publishedAt =
      typeof row.providerPublishTime === 'number' ? row.providerPublishTime : 0;

    items.push({
      id: String(row.uuid ?? link),
      title,
      publisher: typeof row.publisher === 'string' ? row.publisher : 'Yahoo Finance',
      url: link,
      publishedAt,
    });
  }

  items.sort((a, b) => b.publishedAt - a.publishedAt);
  return items.slice(0, limit);
}

export async function fetchTickerNews(
  ticker: string,
  limit = 15
): Promise<TickerNewsItem[]> {
  const key = ticker.toUpperCase().trim();
  if (!key) return [];

  const newsCount = Math.min(Math.max(limit * 2, limit), 30);
  const path = `/v1/finance/search?q=${encodeURIComponent(key)}&quotesCount=0&newsCount=${newsCount}`;

  try {
    const url =
      isTauri() && !isUsingYahooProxy()
        ? `${YAHOO_ORIGIN}${path}`
        : `${getBaseUrl()}${path}`;
    const res = await yahooFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const filtered = parseTickerNews(data, key, limit, true);
    if (filtered.length > 0) return filtered;
    return parseTickerNews(data, key, limit, false);
  } catch (err) {
    console.warn(`Failed to fetch news for ${ticker}:`, err);
    return [];
  }
}

function parseSearchQuotes(data: { quotes?: unknown[] }): SearchQuote[] {
  const quotes: unknown[] = data.quotes ?? [];
  return quotes
    .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
    .map((x) => ({
      symbol: String(x.symbol ?? ''),
      shortname: x.shortname != null ? String(x.shortname) : undefined,
      longname: x.longname != null ? String(x.longname) : undefined,
      quoteType: String(x.quoteType ?? ''),
      exchange: x.exchange != null ? String(x.exchange) : undefined,
      typeDisp: x.typeDisp != null ? String(x.typeDisp) : undefined,
    }))
    .filter((item) => item.symbol.length > 0);
}

export async function searchTickers(query: string): Promise<SearchQuote[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  try {
    // Tauri: try search endpoint with no auth; if that fails, treat query as a ticker and use chart.
    if (isTauri()) {
      const f = await getFetch();
      const url = `${CHART_ORIGIN}/v1/finance/search?q=${encodeURIComponent(q)}`;
      const res = await f(url, { headers: { 'User-Agent': YAHOO_UA } });
      if (res.ok) {
        const data = await res.json();
        const results = parseSearchQuotes(data);
        if (results.length > 0) {
          debugLog.info('Yahoo', 'Search from no-auth endpoint', `${results.length} results`);
          return results;
        }
      }
      // Fallback: if query looks like a ticker symbol, fetch chart and return one result.
      const tickerLike = /^[A-Z0-9.]{1,6}$/i.test(q);
      if (tickerLike) {
        const key = q.toUpperCase();
        const chartResult = await tauriFetchChart(key);
        const meta = chartResult?.meta;
        if (meta && (meta.shortName != null || meta.longName != null || meta.regularMarketPrice != null)) {
          const name = (meta.shortName ?? meta.longName ?? key) as string;
          debugLog.info('Yahoo', 'Search fallback: ticker from chart', key);
          return [{ symbol: key, shortname: name, longname: name, quoteType: (meta.instrumentType ?? 'EQUITY') as string }];
        }
      }
    }

    const url = `${getBaseUrl()}/v1/finance/search?q=${encodeURIComponent(q)}`;
    const res = await yahooFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return parseSearchQuotes(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('Ticker search failed:', err);
    debugLog.warn('Yahoo', 'Ticker search failed', msg);
    return [];
  }
}

export async function lookupTicker(ticker: string): Promise<TickerInfo | null> {
  const key = ticker.toUpperCase().trim();

  // Tauri: try quoteSummary first (Rust backend does cookie+crumb) for sector/country; fall back to chart if needed.
  if (isTauri() && !isUsingYahooProxy()) {
    try {
      const url = `${getBaseUrl()}/v10/finance/quoteSummary/${encodeURIComponent(key)}?modules=assetProfile,price,fundProfile`;
      const res = await yahooFetch(url);
      if (res.ok) {
        const data = await res.json();
        const result = data.quoteSummary?.result?.[0];
        if (result) {
          const price = result.price ?? {};
          const profile = result.assetProfile ?? {};
          const fund = result.fundProfile ?? {};
          let sector = profile.sector ?? '';
          if (!sector && fund.categoryName) sector = `ETF: ${fund.categoryName}`;
          debugLog.info('Yahoo', `Lookup from quoteSummary for ${key}`, price.longName ?? price.shortName);
          return {
            name: price.longName ?? price.shortName ?? key,
            sector: sector || 'Other',
            country: (profile.country as string)?.trim() || '',
            quoteType: price.quoteType ?? 'EQUITY',
            currency: parseQuoteCurrency(price),
          };
        }
      }
    } catch {
      /* fall through to chart */
    }
    const chartResult = await tauriFetchChart(key);
    const meta = chartResult?.meta;
    if (meta && (meta.regularMarketPrice != null || meta.shortName != null || meta.longName != null)) {
      const name = (meta.shortName ?? meta.longName ?? key) as string;
      const rawType = (meta.instrumentType ?? meta.quoteType ?? 'EQUITY') as string;
      const sector = instrumentTypeToSector(rawType || 'EQUITY');
      debugLog.info('Yahoo', `Lookup from chart for ${key}`, name);
      return {
        name: name || key,
        sector,
        country: '',
        quoteType: rawType || 'EQUITY',
        currency: normalizeCurrencyWithDefault(meta.currency as string),
      };
    }
    return null;
  }

  try {
    const url = `${getBaseUrl()}/v10/finance/quoteSummary/${encodeURIComponent(key)}?modules=assetProfile,price,fundProfile`;
    const res = await yahooFetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const result = data.quoteSummary?.result?.[0];
    if (!result) return null;

    const price = result.price ?? {};
    const profile = result.assetProfile ?? {};
    const fund = result.fundProfile ?? {};
    const quoteType: string = price.quoteType ?? 'EQUITY';

    let sector = profile.sector ?? '';
    if (!sector && fund.categoryName) {
      sector = `ETF: ${fund.categoryName}`;
    }

    const country = (profile.country as string)?.trim() || '';

    return {
      name: price.longName ?? price.shortName ?? key,
      sector: sector || 'Other',
      country,
      quoteType,
      currency: parseQuoteCurrency(price),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Ticker lookup failed for ${ticker}:`, err);
    debugLog.warn('Yahoo', `Lookup failed for ${ticker}`, msg);
    return null;
  }
}

export async function fetchPrice(ticker: string): Promise<PriceData | null> {
  const key = ticker.toUpperCase();
  const cached = await db.priceCache.get(key);

  if (cached && Date.now() - new Date(cached.lastUpdated).getTime() < CACHE_DURATION_MS) {
    return cached;
  }

  try {
    const url = `${getBaseUrl()}/v10/finance/quoteSummary/${encodeURIComponent(key)}?modules=price`;
    const res = await yahooFetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const p = data.quoteSummary?.result?.[0]?.price;
    if (!p) return cached ?? null;

    const price = p.regularMarketPrice?.raw ?? 0;
    const prevClose = p.regularMarketPreviousClose?.raw ?? price;
    const change = price - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    const state: string = p.marketState ?? '';
    let extPrice: number | undefined;
    let extChange: number | undefined;
    let extChangePercent: number | undefined;

    if (state === 'PRE' && p.preMarketPrice?.raw) {
      const ep = p.preMarketPrice.raw;
      extPrice = ep;
      extChange = p.preMarketChange?.raw ?? ep - prevClose;
      extChangePercent = p.preMarketChangePercent?.raw != null
        ? p.preMarketChangePercent.raw * 100
        : prevClose ? ((ep - prevClose) / prevClose) * 100 : 0;
    } else if ((state === 'POST' || state === 'CLOSED') && p.postMarketPrice?.raw) {
      const ep = p.postMarketPrice.raw;
      extPrice = ep;
      extChange = p.postMarketChange?.raw ?? (ep - price);
      extChangePercent = p.postMarketChangePercent?.raw != null
        ? p.postMarketChangePercent.raw * 100
        : price ? (((ep - price) / price) * 100) : 0;
    }

    const priceData: PriceData = {
      ticker: key,
      price,
      change,
      changePercent,
      currency: parseQuoteCurrency(p),
      extPrice,
      extChange,
      extChangePercent,
      lastUpdated: new Date(),
    };

    await db.priceCache.put(priceData);
    return priceData;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to fetch price for ${key}:`, err);
    debugLog.warn('Yahoo', `Price fetch failed for ${key}`, msg);
    return cached ?? null;
  }
}

export type MarketState = 'PRE' | 'REGULAR' | 'POST' | 'CLOSED';

let cachedMarketState: { state: MarketState; at: number } | null = null;

export async function fetchMarketState(): Promise<MarketState> {
  if (cachedMarketState && Date.now() - cachedMarketState.at < 60_000) {
    return cachedMarketState.state;
  }
  try {
    const url = `${getBaseUrl()}/v10/finance/quoteSummary/SPY?modules=price`;
    const res = await yahooFetch(url);
    if (!res.ok) return 'CLOSED';
    const json = await res.json();
    const state: MarketState =
      json.quoteSummary?.result?.[0]?.price?.marketState ?? 'CLOSED';
    cachedMarketState = { state, at: Date.now() };
    return state;
  } catch {
    return 'CLOSED';
  }
}

export async function clearAllCaches() {
  cachedMarketState = null;
  await db.priceCache.clear();
  divRateCache.clear();
  summaryCache.clear();
}

export async function fetchPrices(
  tickers: string[]
): Promise<Map<string, PriceData>> {
  const results = new Map<string, PriceData>();
  await Promise.allSettled(
    tickers.map(async (ticker) => {
      const data = await fetchPrice(ticker);
      if (data) results.set(ticker.toUpperCase(), data);
    })
  );
  return results;
}

export interface DividendRateData {
  ticker: string;
  annualRate: number;
  yieldPercent: number;
}

/** Yahoo field on summaryDetail (decimal, e.g. 0.04 = 4%). */
type YahooRawField = { raw?: number; fmt?: string };

/**
 * Treasury / bond ETFs (e.g. USFR, SGOV) often expose income only via `yield`,
 * not dividendRate/dividendYield. Derive annual $/share when price is known.
 */
function parseDividendMetrics(
  sd: {
    dividendRate?: YahooRawField;
    trailingAnnualDividendRate?: YahooRawField;
    dividendYield?: YahooRawField;
    trailingAnnualDividendYield?: YahooRawField;
    yield?: YahooRawField;
  },
  marketPrice = 0
): { annualRate: number; yieldPercent: number } {
  const distributionYield = sd.yield?.raw ?? 0;
  let annualRate =
    sd.dividendRate?.raw ?? sd.trailingAnnualDividendRate?.raw ?? 0;
  let yieldDecimal =
    sd.dividendYield?.raw ?? sd.trailingAnnualDividendYield?.raw ?? 0;

  if (yieldDecimal <= 0 && distributionYield > 0) {
    yieldDecimal = distributionYield;
  }

  if (annualRate <= 0 && yieldDecimal > 0 && marketPrice > 0) {
    annualRate = yieldDecimal * marketPrice;
  }

  return { annualRate, yieldPercent: yieldDecimal * 100 };
}

const divRateCache = new Map<
  string,
  { data: DividendRateData; at: number }
>();

export async function fetchDividendRate(
  ticker: string
): Promise<DividendRateData | null> {
  const key = ticker.toUpperCase();
  const cached = divRateCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_DURATION_MS) return cached.data;

  try {
    const url = `${getBaseUrl()}/v10/finance/quoteSummary/${encodeURIComponent(key)}?modules=summaryDetail,price`;
    const res = await yahooFetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const row = data.quoteSummary?.result?.[0];
    const sd = row?.summaryDetail;
    if (!sd) return null;

    const marketPrice = row?.price?.regularMarketPrice?.raw ?? 0;
    const { annualRate, yieldPercent } = parseDividendMetrics(sd, marketPrice);

    const result: DividendRateData = {
      ticker: key,
      annualRate,
      yieldPercent,
    };

    divRateCache.set(key, { data: result, at: Date.now() });
    return result;
  } catch (err) {
    console.warn(`Failed to fetch dividend rate for ${key}:`, err);
    return null;
  }
}

export async function fetchDividendRates(
  tickers: string[]
): Promise<Map<string, DividendRateData>> {
  const results = new Map<string, DividendRateData>();
  await Promise.allSettled(
    tickers.map(async (t) => {
      const d = await fetchDividendRate(t);
      if (d) results.set(t.toUpperCase(), d);
    })
  );
  return results;
}

export interface TickerSummary {
  ticker: string;
  name: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  targetMedian: number;
  dividendRate: number;
  dividendYield: number;
  recommendation: string;
  extPrice?: number;
  extChange?: number;
  extChangePercent?: number;
}

const summaryCache = new Map<string, { data: TickerSummary; at: number }>();

export async function fetchTickerSummary(
  ticker: string
): Promise<TickerSummary | null> {
  const key = ticker.toUpperCase();
  const cached = summaryCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_DURATION_MS) return cached.data;

  try {
    const url = `${getBaseUrl()}/v10/finance/quoteSummary/${encodeURIComponent(key)}?modules=price,summaryDetail,financialData`;
    const res = await yahooFetch(url);
    if (!res.ok) return null;

    const json = await res.json();
    const r = json.quoteSummary?.result?.[0];
    if (!r) return null;

    const p = r.price ?? {};
    const sd = r.summaryDetail ?? {};
    const fd = r.financialData ?? {};

    const mktPrice = p.regularMarketPrice?.raw ?? 0;
    const prevClose = p.regularMarketPreviousClose?.raw ?? mktPrice;
    const change = mktPrice - prevClose;
    const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    const state: string = p.marketState ?? '';
    let extPrice: number | undefined;
    let extChange: number | undefined;
    let extChangePercent: number | undefined;

    if (state === 'PRE' && p.preMarketPrice?.raw) {
      const ep = p.preMarketPrice.raw;
      extPrice = ep;
      extChange = p.preMarketChange?.raw ?? (ep - prevClose);
      extChangePercent = p.preMarketChangePercent?.raw != null
        ? p.preMarketChangePercent.raw * 100
        : prevClose ? ((ep - prevClose) / prevClose) * 100 : 0;
    } else if ((state === 'POST' || state === 'CLOSED') && p.postMarketPrice?.raw) {
      const ep = p.postMarketPrice.raw;
      extPrice = ep;
      extChange = p.postMarketChange?.raw ?? (ep - mktPrice);
      extChangePercent = p.postMarketChangePercent?.raw != null
        ? p.postMarketChangePercent.raw * 100
        : mktPrice ? (((ep - mktPrice) / mktPrice) * 100) : 0;
    }

    const result: TickerSummary = {
      ticker: key,
      name: p.longName ?? p.shortName ?? key,
      currency: parseQuoteCurrency(p),
      price: mktPrice,
      change,
      changePercent: changePct,
      fiftyTwoWeekLow: sd.fiftyTwoWeekLow?.raw ?? 0,
      fiftyTwoWeekHigh: sd.fiftyTwoWeekHigh?.raw ?? 0,
      targetMedian: fd.targetMedianPrice?.raw ?? 0,
      ...(() => {
        const { annualRate, yieldPercent } = parseDividendMetrics(sd, mktPrice);
        return { dividendRate: annualRate, dividendYield: yieldPercent };
      })(),
      recommendation: (fd.recommendationKey as string) ?? '',
      extPrice,
      extChange,
      extChangePercent,
    };

    summaryCache.set(key, { data: result, at: Date.now() });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to fetch summary for ${key}:`, err);
    debugLog.warn('Yahoo', `Summary fetch failed for ${key}`, msg);
    return null;
  }
}

export async function fetchTickerSummaries(
  tickers: string[]
): Promise<Map<string, TickerSummary>> {
  const results = new Map<string, TickerSummary>();
  await Promise.allSettled(
    tickers.map(async (t) => {
      const d = await fetchTickerSummary(t);
      if (d) results.set(t.toUpperCase(), d);
    })
  );
  return results;
}

export interface HistoricalPrice {
  date: number;
  close: number;
}

export type ChartRange = '1d' | '3mo' | '6mo' | '1y' | '2y' | '5y' | '10y' | 'max';

function parseHistoricalChartResponse(data: unknown): HistoricalPrice[] {
  const result = (data as { chart?: { result?: Array<{
    timestamp?: number[];
    indicators?: { quote?: Array<{ close?: (number | null)[] }> };
  }> } })?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const prices: HistoricalPrice[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] != null) prices.push({ date: timestamps[i], close: closes[i]! });
  }
  return prices;
}

export async function fetchHistoricalPrices(
  ticker: string,
  range: ChartRange = '1y'
): Promise<HistoricalPrice[]> {
  const key = ticker.toUpperCase();
  const interval = range === '1d' ? '5m' : '1d';
  const path = `/v8/finance/chart/${encodeURIComponent(key)}?interval=${interval}&range=${range}`;

  // Chart endpoint is the only Yahoo API that returns historical time series (timestamp + OHLC).
  // Route through query2 + yahooFetch (Vite proxy / Rust auth / optional proxy) like quoteSummary.
  try {
    const url =
      isTauri() && !isUsingYahooProxy()
        ? `${YAHOO_ORIGIN}${path}`
        : `${getBaseUrl()}${path}`;
    const res = await yahooFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return parseHistoricalChartResponse(data);
  } catch (err) {
    console.warn(`Failed to fetch historical prices for ${ticker}:`, err);
    return [];
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function raw(obj: any): number {
  return obj?.raw ?? 0;
}
function fmt(obj: any): string {
  return obj?.fmt ?? '—';
}

export interface TickerProfile {
  // Overview
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  website: string;
  employees: number;
  description: string;

  // Price
  price: number;
  change: number;
  changePercent: number;
  dayLow: number;
  dayHigh: number;
  fiftyTwoWeekLow: number;
  fiftyTwoWeekHigh: number;
  volume: string;
  avgVolume: string;
  marketCap: string;

  // Valuation
  trailingPE: string;
  forwardPE: string;
  priceToBook: string;
  evToRevenue: string;
  evToEbitda: string;

  // Financials
  revenue: string;
  revenueGrowth: string;
  grossMargins: string;
  operatingMargins: string;
  profitMargins: string;
  ebitda: string;
  trailingEps: string;
  forwardEps: string;
  earningsGrowth: string;
  returnOnAssets: string;
  returnOnEquity: string;
  totalCash: string;
  totalDebt: string;
  debtToEquity: string;
  currentRatio: string;
  freeCashflow: string;

  // Dividends
  dividendRate: string;
  dividendYield: string;
  payoutRatio: string;
  exDividendDate: string;
  fiveYearAvgYield: string;

  // Analyst
  targetLow: string;
  targetMean: string;
  targetMedian: string;
  targetHigh: string;
  recommendation: string;
  numAnalysts: number;

  // Key Stats
  beta: string;
  fiftyTwoWeekChange: string;
  sharesOutstanding: string;
  shortRatio: string;
  heldByInsiders: string;
  heldByInstitutions: string;
  bookValue: string;
  lastSplitFactor: string;
}

export async function fetchTickerProfile(
  ticker: string
): Promise<TickerProfile | null> {
  try {
    const key = ticker.toUpperCase();
    const modules =
      'price,summaryDetail,assetProfile,financialData,defaultKeyStatistics,calendarEvents';
    const url = `${getBaseUrl()}/v10/finance/quoteSummary/${encodeURIComponent(key)}?modules=${modules}`;
    const res = await yahooFetch(url);
    if (!res.ok) return null;

    const json = await res.json();
    const r = json.quoteSummary?.result?.[0];
    if (!r) return null;

    const p = r.price ?? {};
    const sd = r.summaryDetail ?? {};
    const ap = r.assetProfile ?? {};
    const fd = r.financialData ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const ce = r.calendarEvents ?? {};

    const mktPrice = raw(p.regularMarketPrice);
    const prevClose = raw(p.regularMarketPreviousClose) || mktPrice;
    const chg = mktPrice - prevClose;
    const chgPct = prevClose ? (chg / prevClose) * 100 : 0;
    const { annualRate, yieldPercent } = parseDividendMetrics(sd, mktPrice);

    return {
      ticker: key,
      name: p.longName ?? p.shortName ?? key,
      exchange: p.exchangeName ?? '',
      sector: ap.sector ?? '',
      industry: ap.industry ?? '',
      website: ap.website ?? '',
      employees: ap.fullTimeEmployees ?? 0,
      description: ap.longBusinessSummary ?? '',

      price: mktPrice,
      change: chg,
      changePercent: chgPct,
      dayLow: raw(sd.dayLow),
      dayHigh: raw(sd.dayHigh),
      fiftyTwoWeekLow: raw(sd.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: raw(sd.fiftyTwoWeekHigh),
      volume: fmt(sd.volume),
      avgVolume: fmt(sd.averageVolume),
      marketCap: fmt(sd.marketCap),

      trailingPE: fmt(sd.trailingPE),
      forwardPE: fmt(ks.forwardPE),
      priceToBook: fmt(ks.priceToBook),
      evToRevenue: fmt(ks.enterpriseToRevenue),
      evToEbitda: fmt(ks.enterpriseToEbitda),

      revenue: fmt(fd.totalRevenue),
      revenueGrowth: fmt(fd.revenueGrowth),
      grossMargins: fmt(fd.grossMargins),
      operatingMargins: fmt(fd.operatingMargins),
      profitMargins: fmt(fd.profitMargins),
      ebitda: fmt(fd.ebitda),
      trailingEps: fmt(ks.trailingEps),
      forwardEps: fmt(ks.forwardEps),
      earningsGrowth: fmt(fd.earningsGrowth),
      returnOnAssets: fmt(fd.returnOnAssets),
      returnOnEquity: fmt(fd.returnOnEquity),
      totalCash: fmt(fd.totalCash),
      totalDebt: fmt(fd.totalDebt),
      debtToEquity: fmt(fd.debtToEquity),
      currentRatio: fmt(fd.currentRatio),
      freeCashflow: fmt(fd.freeCashflow),

      dividendRate:
        annualRate > 0
          ? annualRate.toFixed(2)
          : fmt(sd.dividendRate),
      dividendYield:
        yieldPercent > 0
          ? `${yieldPercent.toFixed(2)}%`
          : fmt(sd.dividendYield),
      payoutRatio: fmt(sd.payoutRatio),
      exDividendDate: fmt(ce.exDividendDate),
      fiveYearAvgYield: sd.fiveYearAvgDividendYield
        ? `${raw(sd.fiveYearAvgDividendYield).toFixed(2)}%`
        : '—',

      targetLow: fmt(fd.targetLowPrice),
      targetMean: fmt(fd.targetMeanPrice),
      targetMedian: fmt(fd.targetMedianPrice),
      targetHigh: fmt(fd.targetHighPrice),
      recommendation: fd.recommendationKey ?? '—',
      numAnalysts: raw(fd.numberOfAnalystOpinions),

      beta: fmt(sd.beta),
      fiftyTwoWeekChange: fmt(ks['52WeekChange']),
      sharesOutstanding: fmt(ks.sharesOutstanding),
      shortRatio: fmt(ks.shortRatio),
      heldByInsiders: fmt(ks.heldPercentInsiders),
      heldByInstitutions: fmt(ks.heldPercentInstitutions),
      bookValue: fmt(ks.bookValue),
      lastSplitFactor: ks.lastSplitFactor ?? '—',
    };
  } catch (err) {
    console.warn(`Failed to fetch profile for ${ticker}:`, err);
    return null;
  }
}

export interface DividendEvent {
  date: number;
  amount: number;
}

export async function fetchDividendEvents(
  ticker: string,
  sinceDate: Date
): Promise<DividendEvent[]> {
  try {
    const key = ticker.toUpperCase();
    const now = Math.floor(Date.now() / 1000);
    const period1 = Math.floor(sinceDate.getTime() / 1000);
    const url = `${getBaseUrl()}/v8/finance/chart/${encodeURIComponent(key)}?interval=1d&period1=${period1}&period2=${now}&events=div`;
    const res = await yahooFetch(url);
    if (!res.ok) return [];

    const data = await res.json();
    const events = data.chart?.result?.[0]?.events?.dividends;
    if (!events) return [];

    return Object.values(events as Record<string, { date: number; amount: number }>).map(
      (d) => ({ date: d.date, amount: d.amount })
    );
  } catch (err) {
    console.warn(`Failed to fetch dividends for ${ticker}:`, err);
    return [];
  }
}
