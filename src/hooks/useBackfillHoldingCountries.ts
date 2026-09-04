import { useEffect, useRef } from 'react';
import { useHoldings, updateHolding } from '../db/hooks';
import {
  DEFAULT_CURRENCY,
  normalizeCurrencyWithDefault,
} from '../constants/currencies';
import { lookupTicker } from '../services/yahooFinance';

const DELAY_MS = 800;

/**
 * Backfill country and trading currency for holdings from Yahoo quote data.
 */
export function useBackfillHoldingCountries() {
  const holdings = useHoldings();
  const backfillingRef = useRef(false);
  /**
   * Tickers already looked up this session. A USD holding whose currency
   * Yahoo confirms as USD never gets "fixed", so without this it was queried
   * again on every holdings change (each DRIP update, each edit, …) — one
   * quoteSummary round-trip per holding, every time.
   */
  const checkedRef = useRef(new Set<string>());

  useEffect(() => {
    const needBackfill = holdings.filter((h) => {
      if (h.id == null) return false;
      if (checkedRef.current.has(h.ticker.toUpperCase())) return false;
      const needsCountry = !(h.country ?? '').trim();
      const needsCurrency =
        !(h.currency ?? '').trim() ||
        normalizeCurrencyWithDefault(h.currency) === DEFAULT_CURRENCY;
      return needsCountry || needsCurrency;
    });
    if (needBackfill.length === 0 || backfillingRef.current) return;

    backfillingRef.current = true;

    (async () => {
      for (const h of needBackfill) {
        checkedRef.current.add(h.ticker.toUpperCase());
        try {
          const info = await lookupTicker(h.ticker);
          const updates: { country?: string; currency?: string } = {};
          if (!(h.country ?? '').trim() && info?.country?.trim()) {
            updates.country = info.country.trim();
          }
          if (info?.currency) {
            const reported = normalizeCurrencyWithDefault(info.currency);
            const stored = normalizeCurrencyWithDefault(h.currency);
            if (!(h.currency ?? '').trim() || stored === DEFAULT_CURRENCY) {
              if (reported !== stored) {
                updates.currency = reported;
              }
            }
          }
          if (Object.keys(updates).length > 0) {
            await updateHolding(h.id!, updates);
          }
        } catch (err) {
          console.warn(`Holding metadata backfill failed for ${h.ticker}:`, err);
        }
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
      backfillingRef.current = false;
    })();
  }, [holdings]);
}
