import { useMemo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Briefcase,
  DollarSign,
  Landmark,
  CalendarCheck,
  BarChart3,
  PieChart as PieChartIcon,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useHoldings, useCashAccounts } from '../db/hooks';
import { usePrices } from '../hooks/usePrices';
import { useExpectedIncome } from '../hooks/useExpectedIncome';
import { useMarketState } from '../hooks/useMarketState';
import { useEffectivePrice } from '../hooks/useEffectivePrice';
import { useRegisterRefresh } from '../contexts/RefreshTimerContext';
import { formatCurrency, formatPercent, cn } from '../utils/format';
import { EmptyState } from '../components/common/EmptyState';
import { MarketBadge } from '../components/common/MarketBadge';
import { RefreshButton } from '../components/common/RefreshButton';
import type { ReactNode } from 'react';

const COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
];

interface AllocationRow {
  name: string;
  value: number;
  percent: number;
  pnl: number;
  pnlPercent: number;
  isCash: boolean;
}

export function Dashboard() {
  const holdings = useHoldings();
  const cashAccounts = useCashAccounts();
  const navigate = useNavigate();
  const tickers = useMemo(() => holdings.map((h) => h.ticker), [holdings]);
  const { prices, loading, forceRefresh } = usePrices(tickers);
  const income = useExpectedIncome(holdings, cashAccounts);
  const marketState = useMarketState();
  const resolve = useEffectivePrice();

  const stableRefresh = useCallback(() => forceRefresh(), [forceRefresh]);
  useRegisterRefresh('dashboard-prices', stableRefresh);

  const totalCash = useMemo(
    () => cashAccounts.reduce((sum, a) => sum + a.balance, 0),
    [cashAccounts]
  );

  const stats = useMemo(() => {
    let holdingsValue = 0;
    let totalCost = 0;
    let dayChange = 0;

    for (const h of holdings) {
      const p = prices.get(h.ticker.toUpperCase());
      const ep = resolve(p, h.avgCost);
      holdingsValue += h.shares * ep.price;
      totalCost += h.shares * h.avgCost;
      dayChange += h.shares * ep.change;
    }

    const totalValue = holdingsValue + totalCash;
    const totalPnl = holdingsValue - totalCost;
    const totalPnlPercent =
      totalCost !== 0 ? (totalPnl / totalCost) * 100 : 0;
    const dayChangePercent =
      holdingsValue - dayChange !== 0
        ? (dayChange / (holdingsValue - dayChange)) * 100
        : 0;

    return {
      totalValue,
      holdingsValue,
      totalPnl,
      totalPnlPercent,
      dayChange,
      dayChangePercent,
    };
  }, [holdings, prices, totalCash, resolve]);

  const incomeYield = useMemo(() => {
    if (stats.totalValue <= 0) return 0;
    return (income.total / stats.totalValue) * 100;
  }, [income.total, stats.totalValue]);

  const allocationData: AllocationRow[] = useMemo(() => {
    const raw: AllocationRow[] = holdings.map((h) => {
      const p = prices.get(h.ticker.toUpperCase());
      const ep = resolve(p, h.avgCost);
      const value = h.shares * ep.price;
      const cost = h.shares * h.avgCost;
      const pnl = value - cost;
      const pnlPercent = cost !== 0 ? (pnl / cost) * 100 : 0;
      return { name: h.ticker, value, percent: 0, pnl, pnlPercent, isCash: false };
    });

    if (totalCash > 0) {
      raw.push({ name: 'Cash', value: totalCash, percent: 0, pnl: 0, pnlPercent: 0, isCash: true });
    }

    const total = raw.reduce((s, r) => s + r.value, 0);
    for (const r of raw) {
      r.percent = total > 0 ? (r.value / total) * 100 : 0;
    }

    return raw.sort((a, b) => b.value - a.value);
  }, [holdings, prices, totalCash, resolve]);

  const maxValue = useMemo(
    () => Math.max(...allocationData.map((r) => r.value), 1),
    [allocationData]
  );

  const sectorAllocationData = useMemo(() => {
    const bySector = new Map<string, number>();
    for (const h of holdings) {
      const p = prices.get(h.ticker.toUpperCase());
      const ep = resolve(p, h.avgCost);
      const value = h.shares * ep.price;
      const sector = h.sector?.trim() || 'Other';
      bySector.set(sector, (bySector.get(sector) ?? 0) + value);
    }
    if (totalCash > 0) {
      bySector.set('Cash', (bySector.get('Cash') ?? 0) + totalCash);
    }
    const total = [...bySector.values()].reduce((s, v) => s + v, 0);
    return [...bySector.entries()]
      .map(([name, value]) => ({
        name,
        value: Math.round(value * 100) / 100,
        percent: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, prices, totalCash, resolve]);

  const countryAllocationData = useMemo(() => {
    const byCountry = new Map<string, number>();
    for (const h of holdings) {
      const p = prices.get(h.ticker.toUpperCase());
      const ep = resolve(p, h.avgCost);
      const value = h.shares * ep.price;
      const country = (h.country ?? '').trim() || 'Other';
      byCountry.set(country, (byCountry.get(country) ?? 0) + value);
    }
    if (totalCash > 0) {
      byCountry.set('Cash', (byCountry.get('Cash') ?? 0) + totalCash);
    }
    const total = [...byCountry.values()].reduce((s, v) => s + v, 0);
    return [...byCountry.entries()]
      .map(([name, value]) => ({
        name,
        value: Math.round(value * 100) / 100,
        percent: total > 0 ? (value / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [holdings, prices, totalCash, resolve]);

  const [allocationTab, setAllocationTab] = useState<'holding' | 'sector' | 'country'>('holding');

  if (holdings.length === 0 && cashAccounts.length === 0) {
    return (
      <EmptyState
        icon={<Briefcase size={48} />}
        title="Welcome to Portfolio Tracker"
        description="Add your first holding to get started tracking your portfolio."
        action={
          <button
            onClick={() => navigate('/portfolio')}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Go to Portfolio
          </button>
        }
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <MarketBadge state={marketState} />
        </div>
        <RefreshButton />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Portfolio Value"
          value={formatCurrency(stats.totalValue)}
          loading={loading}
          icon={<DollarSign size={18} />}
        />
        <StatCard
          label="Day's Change"
          value={formatCurrency(stats.dayChange)}
          sub={formatPercent(stats.dayChangePercent)}
          positive={stats.dayChange >= 0}
          loading={loading}
          icon={
            stats.dayChange >= 0 ? (
              <TrendingUp size={18} />
            ) : (
              <TrendingDown size={18} />
            )
          }
        />
        <StatCard
          label="Total P&L"
          value={formatCurrency(stats.totalPnl)}
          sub={formatPercent(stats.totalPnlPercent)}
          positive={stats.totalPnl >= 0}
          loading={loading}
          icon={
            stats.totalPnl >= 0 ? (
              <TrendingUp size={18} />
            ) : (
              <TrendingDown size={18} />
            )
          }
        />
        <StatCard
          label="Est. Yearly Income"
          value={formatCurrency(income.total)}
          sub={`${incomeYield.toFixed(2)}% yield`}
          positive={income.total > 0}
          loading={income.loading}
          icon={<CalendarCheck size={18} />}
        />
        <StatCard
          label="Cash"
          value={formatCurrency(totalCash)}
          icon={<Landmark size={18} />}
        />
        <StatCard
          label="Holdings"
          value={holdings.length.toString()}
          icon={<Briefcase size={18} />}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Allocation */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <BarChart3 size={18} className="text-indigo-500" />
              Allocation
            </h2>
            <div className="flex rounded-lg bg-gray-100 dark:bg-slate-800 p-0.5">
              <button
                onClick={() => setAllocationTab('holding')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                  allocationTab === 'holding'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                )}
              >
                <BarChart3 size={12} />
                By holding
              </button>
              <button
                onClick={() => setAllocationTab('sector')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                  allocationTab === 'sector'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                )}
              >
                <PieChartIcon size={12} />
                By sector
              </button>
              <button
                onClick={() => setAllocationTab('country')}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                  allocationTab === 'country'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                    : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
                )}
              >
                <PieChartIcon size={12} />
                By country
              </button>
            </div>
          </div>

          {allocationTab === 'holding' && allocationData.length > 0 && (
            <div className="space-y-2.5">
              {allocationData.map((row, i) => (
                <div key={row.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {row.name}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-slate-400 tabular-nums">
                        {row.percent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-white tabular-nums">
                        {formatCurrency(row.value)}
                      </span>
                      {!row.isCash && (
                        <span
                          className={cn(
                            'text-xs font-medium tabular-nums min-w-[90px] text-right',
                            row.pnl >= 0 ? 'text-gain' : 'text-loss'
                          )}
                        >
                          {row.pnl >= 0 ? '+' : ''}
                          {formatCurrency(row.pnl)}{' '}
                          <span className="opacity-70">
                            ({row.pnl >= 0 ? '+' : ''}
                            {row.pnlPercent.toFixed(1)}%)
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(row.value / maxValue) * 100}%`,
                        backgroundColor: COLORS[i % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {allocationTab === 'sector' && sectorAllocationData.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-48 h-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sectorAllocationData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={1}
                    >
                      {sectorAllocationData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _name, props) => [
                        value != null ? `${formatCurrency(Number(value))} (${(props?.payload as { percent?: number })?.percent?.toFixed(1) ?? 0}%)` : '',
                        'Value',
                      ]}
                      contentStyle={{
                        backgroundColor: 'var(--tw-bg-slate-900, #0f172a)',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        fontSize: '0.75rem',
                      }}
                      labelFormatter={(name) => name}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5 w-full">
                {sectorAllocationData.map((row, i) => (
                  <div
                    key={row.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {row.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-gray-500 dark:text-slate-400 tabular-nums">
                        {row.percent.toFixed(1)}%
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white tabular-nums">
                        {formatCurrency(row.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {allocationTab === 'sector' && sectorAllocationData.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-slate-400 py-4">
              No sector data to display.
            </p>
          )}

          {allocationTab === 'country' && countryAllocationData.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-48 h-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={countryAllocationData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={1}
                    >
                      {countryAllocationData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _name, props) => [
                        value != null ? `${formatCurrency(Number(value))} (${(props?.payload as { percent?: number })?.percent?.toFixed(1) ?? 0}%)` : '',
                        'Value',
                      ]}
                      contentStyle={{
                        backgroundColor: 'var(--tw-bg-slate-900, #0f172a)',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        fontSize: '0.75rem',
                      }}
                      labelFormatter={(name) => name}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5 w-full">
                {countryAllocationData.map((row, i) => (
                  <div
                    key={row.name}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="font-medium text-gray-900 dark:text-white truncate">
                        {row.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-gray-500 dark:text-slate-400 tabular-nums">
                        {row.percent.toFixed(1)}%
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white tabular-nums">
                        {formatCurrency(row.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {allocationTab === 'country' && countryAllocationData.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-slate-400 py-4">
              No country/region data to display.
            </p>
          )}
        </div>

        {/* Expected income breakdown */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <CalendarCheck size={18} className="text-indigo-500" />
            Expected Yearly Income
          </h2>

          {income.breakdown.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400 py-4">
              No income-generating holdings or cash accounts yet.
            </p>
          ) : (
            <>
              {/* Summary bar */}
              <div className="flex items-center gap-4 mb-4 p-3 rounded-lg bg-gray-50 dark:bg-slate-800/50">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Dividends
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                    {formatCurrency(income.dividendIncome)}
                    <span className="text-xs font-normal text-gray-500 dark:text-slate-400">
                      /yr
                    </span>
                  </p>
                </div>
                <div className="w-px h-8 bg-gray-200 dark:bg-slate-700" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Interest
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                    {formatCurrency(income.interestIncome)}
                    <span className="text-xs font-normal text-gray-500 dark:text-slate-400">
                      /yr
                    </span>
                  </p>
                </div>
                <div className="w-px h-8 bg-gray-200 dark:bg-slate-700" />
                <div className="flex-1">
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    Monthly
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                    {formatCurrency(income.total / 12)}
                    <span className="text-xs font-normal text-gray-500 dark:text-slate-400">
                      /mo
                    </span>
                  </p>
                </div>
              </div>

              {/* Breakdown list */}
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {income.breakdown.map((item) => (
                  <div
                    key={`${item.type}-${item.ticker}`}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'inline-block w-1.5 h-1.5 rounded-full shrink-0',
                          item.type === 'dividend'
                            ? 'bg-emerald-500'
                            : 'bg-amber-500'
                        )}
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {item.ticker}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-medium px-1 py-0.5 rounded shrink-0',
                          item.type === 'dividend'
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                        )}
                      >
                        {item.type === 'dividend' ? 'div' : 'int'}
                      </span>
                    </div>
                    <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                      {formatCurrency(item.annualAmount)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  loading?: boolean;
  icon: ReactNode;
}

function StatCard({ label, value, sub, positive, loading, icon }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gray-400 dark:text-slate-500">{icon}</span>
        <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
          {label}
        </span>
      </div>
      <p
        className={cn(
          'text-xl font-bold tabular-nums',
          loading ? 'animate-pulse' : '',
          sub !== undefined
            ? positive
              ? 'text-gain'
              : 'text-loss'
            : 'text-gray-900 dark:text-white'
        )}
      >
        {value}
      </p>
      {sub && (
        <p
          className={cn(
            'text-xs font-medium tabular-nums',
            positive ? 'text-gain' : 'text-loss'
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
