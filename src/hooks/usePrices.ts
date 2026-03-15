import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchPrices, clearAllCaches } from '../services/yahooFinance';
import type { PriceData } from '../types';

export function usePrices(tickers: string[]) {
  const [prices, setPrices] = useState<Map<string, PriceData>>(new Map());
  const [loading, setLoading] = useState(false);
  const tickerKey = tickers.join(',');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refetch = useCallback(async () => {
    const list = tickerKey ? tickerKey.split(',') : [];
    if (list.length === 0) {
      setPrices(new Map());
      return;
    }
    setLoading(true);
    try {
      const result = await fetchPrices(list);
      if (mountedRef.current) setPrices(result);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [tickerKey]);

  const forceRefresh = useCallback(async () => {
    await clearAllCaches();
    await refetch();
  }, [refetch]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { prices, loading, refetch, forceRefresh };
}
