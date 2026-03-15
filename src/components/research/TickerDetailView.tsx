import { useState, useEffect } from 'react';
import {
  Building2,
  Globe,
  Users,
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  PieChart,
  Target,
  Activity,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { fetchTickerProfile } from '../../services/yahooFinance';
import type { TickerProfile } from '../../services/yahooFinance';
import { formatCurrency, cn } from '../../utils/format';

export function TickerDetailView({ ticker }: { ticker: string }) {
  const [profile, setProfile] = useState<TickerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    setProfile(null);
    setExpanded(false);
    fetchTickerProfile(ticker)
      .then(setProfile)
      .finally(() => setLoading(false));
  }, [ticker]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 dark:text-slate-500">
        <Loader2 size={24} className="animate-spin mr-2" />
        Loading {ticker}…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-slate-400">
        Could not load data for {ticker}.
      </div>
    );
  }

  const positive = profile.change >= 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {profile.ticker}
              </h2>
              <span className="text-sm text-gray-500 dark:text-slate-400">
                {profile.exchange}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-2">
              {profile.name}
            </p>
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400 flex-wrap">
              {profile.sector && (
                <span className="flex items-center gap-1">
                  <Building2 size={12} />
                  {profile.sector}
                </span>
              )}
              {profile.industry && (
                <span>· {profile.industry}</span>
              )}
              {profile.employees > 0 && (
                <span className="flex items-center gap-1">
                  <Users size={12} />
                  {profile.employees.toLocaleString()}
                </span>
              )}
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-indigo-500 hover:underline"
                >
                  <Globe size={12} />
                  Website
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-3xl font-bold text-gray-900 dark:text-white tabular-nums">
              {formatCurrency(profile.price)}
            </p>
            <p
              className={cn(
                'text-sm font-medium tabular-nums',
                positive ? 'text-gain' : 'text-loss'
              )}
            >
              {positive ? '+' : ''}
              {formatCurrency(profile.change)} ({positive ? '+' : ''}
              {profile.changePercent.toFixed(2)}%)
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              Day: {formatCurrency(profile.dayLow)} – {formatCurrency(profile.dayHigh)}
            </p>
          </div>
        </div>

        {/* Description */}
        {profile.description && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
            <p
              className={cn(
                'text-sm text-gray-600 dark:text-slate-300 leading-relaxed',
                !expanded && 'line-clamp-3'
              )}
            >
              {profile.description}
            </p>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-indigo-500 hover:underline mt-1"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          </div>
        )}
      </div>

      {/* Metric sections */}
      <div className="grid md:grid-cols-2 gap-5">
        <Section
          title="Valuation"
          icon={<DollarSign size={16} />}
          items={[
            ['Market Cap', profile.marketCap],
            ['Trailing P/E', profile.trailingPE],
            ['Forward P/E', profile.forwardPE],
            ['Price / Book', profile.priceToBook],
            ['EV / Revenue', profile.evToRevenue],
            ['EV / EBITDA', profile.evToEbitda],
          ]}
        />

        <Section
          title="Financials"
          icon={<BarChart3 size={16} />}
          items={[
            ['Revenue', profile.revenue],
            ['Revenue Growth', profile.revenueGrowth],
            ['EBITDA', profile.ebitda],
            ['Trailing EPS', profile.trailingEps],
            ['Forward EPS', profile.forwardEps],
            ['Earnings Growth', profile.earningsGrowth],
          ]}
        />

        <Section
          title="Margins & Returns"
          icon={<PieChart size={16} />}
          items={[
            ['Gross Margin', profile.grossMargins],
            ['Operating Margin', profile.operatingMargins],
            ['Profit Margin', profile.profitMargins],
            ['Return on Assets', profile.returnOnAssets],
            ['Return on Equity', profile.returnOnEquity],
            ['Free Cash Flow', profile.freeCashflow],
          ]}
        />

        <Section
          title="Balance Sheet"
          icon={<Activity size={16} />}
          items={[
            ['Total Cash', profile.totalCash],
            ['Total Debt', profile.totalDebt],
            ['Debt / Equity', profile.debtToEquity],
            ['Current Ratio', profile.currentRatio],
            ['Book Value', profile.bookValue],
            ['Shares Outstanding', profile.sharesOutstanding],
          ]}
        />

        <Section
          title="Dividends"
          icon={
            <TrendingUp size={16} />
          }
          items={[
            ['Annual Rate', profile.dividendRate],
            ['Yield', profile.dividendYield],
            ['Payout Ratio', profile.payoutRatio],
            ['Ex-Dividend Date', profile.exDividendDate],
            ['5-Year Avg Yield', profile.fiveYearAvgYield],
          ]}
        />

        <Section
          title="Analyst Targets"
          icon={<Target size={16} />}
          items={[
            ['Recommendation', profile.recommendation.toUpperCase()],
            ['# Analysts', profile.numAnalysts > 0 ? profile.numAnalysts.toString() : '—'],
            ['Target Low', profile.targetLow],
            ['Target Mean', profile.targetMean],
            ['Target Median', profile.targetMedian],
            ['Target High', profile.targetHigh],
          ]}
        />

        <Section
          title="Price Range"
          icon={
            positive ? <TrendingUp size={16} /> : <TrendingDown size={16} />
          }
          items={[
            ['52w Low', formatCurrency(profile.fiftyTwoWeekLow)],
            ['52w High', formatCurrency(profile.fiftyTwoWeekHigh)],
            ['52w Change', profile.fiftyTwoWeekChange],
            ['Beta', profile.beta],
            ['Volume', profile.volume],
            ['Avg Volume', profile.avgVolume],
          ]}
        />

        <Section
          title="Ownership"
          icon={<Users size={16} />}
          items={[
            ['Insiders', profile.heldByInsiders],
            ['Institutions', profile.heldByInstitutions],
            ['Short Ratio', profile.shortRatio],
            ['Last Split', profile.lastSplitFactor],
          ]}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: [string, string][];
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <span className="text-indigo-500">{icon}</span>
        {title}
      </h3>
      <div className="space-y-2">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-gray-500 dark:text-slate-400">{label}</span>
            <span className="font-medium text-gray-900 dark:text-white tabular-nums">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
