import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchDividendRates } from '../services/yahooFinance';
import type { DividendRateData } from '../services/yahooFinance';
import type { Holding, CashAccount } from '../types';

export interface IncomeItem {
  ticker: string;
  name: string;
  type: 'dividend' | 'interest';
  annualAmount: number;
}

export function useExpectedIncome(
  holdings: Holding[],
  cashAccounts: CashAccount[]
) {
  const [divRates, setDivRates] = useState<Map<string, DividendRateData>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const tickerKey = holdings.map((h) => h.ticker).join(',');

  const refetch = useCallback(() => {
    const tickers = tickerKey ? tickerKey.split(',') : [];
    if (tickers.length === 0) {
      setDivRates(new Map());
      return;
    }
    setLoading(true);
    fetchDividendRates(tickers)
      .then(setDivRates)
      .finally(() => setLoading(false));
  }, [tickerKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return useMemo(() => {
    let dividendIncome = 0;
    const breakdown: IncomeItem[] = [];

    for (const h of holdings) {
      const rate = divRates.get(h.ticker.toUpperCase());
      if (rate && rate.annualRate > 0) {
        const gross = h.shares * rate.annualRate;
        const net = h.drip
          ? gross * (1 - (h.dividendTaxRate ?? 0))
          : gross;
        dividendIncome += net;
        breakdown.push({
          ticker: h.ticker,
          name: h.name,
          type: 'dividend',
          annualAmount: net,
        });
      }
    }

    let interestIncome = 0;
    for (const a of cashAccounts) {
      if (a.interestRate <= 0 || a.compoundFrequency === 'none') continue;
      let effectiveRate = a.interestRate;
      if (a.compoundFrequency === 'daily') {
        effectiveRate = Math.pow(1 + a.interestRate / 365, 365) - 1;
      } else if (a.compoundFrequency === 'monthly') {
        effectiveRate = Math.pow(1 + a.interestRate / 12, 12) - 1;
      }
      const income = a.balance * effectiveRate;
      interestIncome += income;
      breakdown.push({
        ticker: a.name,
        name: a.name,
        type: 'interest',
        annualAmount: income,
      });
    }

    breakdown.sort((a, b) => b.annualAmount - a.annualAmount);

    return {
      total: dividendIncome + interestIncome,
      dividendIncome,
      interestIncome,
      breakdown,
      loading,
    };
  }, [holdings, cashAccounts, divRates, loading]);
}
