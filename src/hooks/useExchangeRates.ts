import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchRatesToUsd, clearExchangeRateCache } from '../services/exchangeRates';
import { DEFAULT_CURRENCY, normalizeCurrencyWithDefault } from '../constants/currencies';

export function useExchangeRates(currencies: string[]) {
  const [rates, setRates] = useState<Map<string, number>>(
    () => new Map([[DEFAULT_CURRENCY, 1]])
  );
  const [loading, setLoading] = useState(false);
  const currencyKey = [...new Set(currencies.map(normalizeCurrencyWithDefault))].sort().join(',');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    const list = currencyKey ? currencyKey.split(',') : [DEFAULT_CURRENCY];
    setLoading(true);
    try {
      const result = await fetchRatesToUsd(list);
      if (mountedRef.current) setRates(result);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [currencyKey]);

  const forceRefresh = useCallback(async () => {
    clearExchangeRateCache();
    await refetch();
  }, [refetch]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { rates, loading, refetch, forceRefresh };
}
