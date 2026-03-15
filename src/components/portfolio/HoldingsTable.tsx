import { useState, useMemo } from 'react';
import { Trash2, Pencil, TrendingUp, TrendingDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { Holding, PriceData } from '../../types';
import { deleteHolding } from '../../db/hooks';
import { useEffectivePrice } from '../../hooks/useEffectivePrice';
import { formatCurrency, formatPercent, cn } from '../../utils/format';
import type { DividendRateData } from '../../services/yahooFinance';

type SortCol = 'ticker' | 'name' | 'shares' | 'avgCost' | 'price' | 'mktValue' | 'pnl' | 'dayChg' | 'dividend';

interface HoldingsTableProps {
  holdings: Holding[];
  prices: Map<string, PriceData>;
  dividendRates?: Map<string, DividendRateData>;
  onEdit: (holding: Holding) => void;
}

function SortableTh({
  label,
  col,
  current,
  dir,
  onSort,
  align = 'left',
}: {
  label: string;
  col: SortCol;
  current: SortCol;
  dir: 'asc' | 'desc';
  onSort: (col: SortCol) => void;
  align?: 'left' | 'right' | 'center';
}) {
  const active = current === col;
  return (
    <th
      className={cn(
        'px-4 py-3 font-medium text-gray-500 dark:text-slate-400',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        'cursor-pointer select-none hover:text-gray-700 dark:hover:text-slate-200 transition-colors'
      )}
      onClick={() => onSort(col)}
    >
      <span className={cn('inline-flex items-center gap-0.5', align === 'right' && 'justify-end', align === 'center' && 'justify-center')}>
        {label}
        {active && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );
}

export function HoldingsTable({
  holdings,
  prices,
  dividendRates = new Map(),
  onEdit,
}: HoldingsTableProps) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>('ticker');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const resolve = useEffectivePrice();

  const rows = useMemo(() => {
    return holdings.map((h) => {
      const raw = prices.get(h.ticker.toUpperCase());
      const ep = resolve(raw, h.avgCost);
      const mktValue = h.shares * ep.price;
      const pnlValue = (ep.price - h.avgCost) * h.shares;
      const div = dividendRates.get(h.ticker.toUpperCase());
      const dividendSort = div?.yieldPercent ?? div?.annualRate ?? -Infinity;
      return {
        holding: h,
        raw,
        ep,
        mktValue,
        pnlValue,
        pnlPct: h.avgCost !== 0 ? (pnlValue / (h.shares * h.avgCost)) * 100 : 0,
        div,
        dividendSort,
      };
    });
  }, [holdings, prices, dividendRates, resolve]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sortCol) {
        case 'ticker':
          return dir * a.holding.ticker.localeCompare(b.holding.ticker);
        case 'name':
          return dir * (a.holding.name || '').localeCompare(b.holding.name || '');
        case 'shares':
          return dir * (a.holding.shares - b.holding.shares);
        case 'avgCost':
          return dir * (a.holding.avgCost - b.holding.avgCost);
        case 'price':
          return dir * (a.ep.price - b.ep.price);
        case 'mktValue':
          return dir * (a.mktValue - b.mktValue);
        case 'pnl':
          return dir * (a.pnlValue - b.pnlValue);
        case 'dayChg':
          return dir * (a.ep.changePercent - b.ep.changePercent);
        case 'dividend':
          return dir * (a.dividendSort - b.dividendSort);
        default:
          return 0;
      }
    });
  }, [rows, sortCol, sortDir]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  async function handleDelete(id: number) {
    if (deletingId === id) {
      await deleteHolding(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
    }
  }

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-slate-800/50">
            <tr>
              <SortableTh label="Ticker" col="ticker" current={sortCol} dir={sortDir} onSort={toggleSort} />
              <SortableTh label="Name" col="name" current={sortCol} dir={sortDir} onSort={toggleSort} />
              <SortableTh label="Shares" col="shares" current={sortCol} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableTh label="Avg Cost" col="avgCost" current={sortCol} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableTh label="Price" col="price" current={sortCol} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableTh label="Mkt Value" col="mktValue" current={sortCol} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableTh label="P&L" col="pnl" current={sortCol} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableTh label="Day Chg" col="dayChg" current={sortCol} dir={sortDir} onSort={toggleSort} align="right" />
              <SortableTh label="Dividend" col="dividend" current={sortCol} dir={sortDir} onSort={toggleSort} align="right" />
              <th className="text-center px-4 py-3 font-medium text-gray-500 dark:text-slate-400 w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {sortedRows.map(({ holding: h, raw, ep, mktValue, pnlValue, pnlPct, div }) => (
                <tr
                  key={h.id}
                  className="hover:bg-gray-50 dark:hover:bg-slate-800/30"
                >
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                    {h.ticker}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-slate-300">
                    {h.name}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {h.shares}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(h.avgCost)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {raw ? (
                      <span>
                        {formatCurrency(ep.price)}
                        {ep.isExtended && (
                          <span className="ml-1 text-[10px] text-amber-500">
                            EXT
                          </span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {formatCurrency(mktValue)}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right tabular-nums font-medium',
                      pnlValue >= 0 ? 'text-gain' : 'text-loss'
                    )}
                  >
                    {raw
                      ? `${formatCurrency(pnlValue)} (${formatPercent(pnlPct)})`
                      : '—'}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3 text-right tabular-nums',
                      raw
                        ? ep.change >= 0
                          ? 'text-gain'
                          : 'text-loss'
                        : ''
                    )}
                  >
                    {raw ? (
                      <span className="inline-flex items-center gap-1">
                        {ep.change >= 0 ? (
                          <TrendingUp size={14} />
                        ) : (
                          <TrendingDown size={14} />
                        )}
                        {formatPercent(ep.changePercent)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-slate-300">
                    {div && (div.annualRate > 0 || div.yieldPercent > 0) ? (
                      <span title={`${formatCurrency(div.annualRate)}/yr`}>
                        {div.yieldPercent > 0 ? `${div.yieldPercent.toFixed(2)}%` : formatCurrency(div.annualRate)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onEdit(h)}
                        className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => h.id && handleDelete(h.id)}
                        className={cn(
                          'p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20',
                          deletingId === h.id
                            ? 'text-red-500'
                            : 'text-gray-400 hover:text-red-500'
                        )}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {sortedRows.map(({ holding: h, raw, ep, mktValue, pnlValue, pnlPct, div }) => (
            <div
              key={h.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {h.ticker}
                  </span>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {h.name}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => onEdit(h)}
                    className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => h.id && handleDelete(h.id)}
                    className={cn(
                      'p-1.5 rounded',
                      deletingId === h.id
                        ? 'text-red-500'
                        : 'text-gray-400'
                    )}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-slate-400">
                    Shares:
                  </span>{' '}
                  <span className="font-medium">{h.shares}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-slate-400">
                    Avg Cost:
                  </span>{' '}
                  <span className="font-medium tabular-nums">
                    {formatCurrency(h.avgCost)}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-slate-400">
                    Price:
                  </span>{' '}
                  <span className="font-medium tabular-nums">
                    {raw ? formatCurrency(ep.price) : '—'}
                    {ep.isExtended && (
                      <span className="ml-1 text-[10px] text-amber-500">
                        EXT
                      </span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-slate-400">
                    Value:
                  </span>{' '}
                  <span className="font-medium tabular-nums">
                    {formatCurrency(mktValue)}
                  </span>
                </div>
                {div && (div.annualRate > 0 || div.yieldPercent > 0) && (
                  <div>
                    <span className="text-gray-500 dark:text-slate-400">
                      Dividend:
                    </span>{' '}
                    <span className="font-medium tabular-nums">
                      {div.yieldPercent > 0 ? `${div.yieldPercent.toFixed(2)}%` : formatCurrency(div.annualRate)}
                    </span>
                  </div>
                )}
              </div>
              {raw && (
                <div
                  className={cn(
                    'mt-2 text-sm font-medium tabular-nums',
                    pnlValue >= 0 ? 'text-gain' : 'text-loss'
                  )}
                >
                  P&L: {formatCurrency(pnlValue)} (
                  {formatPercent(pnlPct)})
                </div>
              )}
            </div>
        ))}
      </div>
    </div>
  );
}
