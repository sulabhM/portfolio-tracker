import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Newspaper } from 'lucide-react';
import { fetchTickerNews, type TickerNewsItem } from '../../services/yahooFinance';
import { openExternalUrl } from '../../services/openExternal';
import { cn } from '../../utils/format';

function formatNewsAge(unixSeconds: number): string {
  if (unixSeconds <= 0) return '';
  const then = unixSeconds * 1000;
  const diffMs = Date.now() - then;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function TickerNewsPanel({ ticker }: { ticker: string }) {
  const [items, setItems] = useState<TickerNewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setLoading(true);
        setItems([]);
      })
      .then(() => fetchTickerNews(ticker))
      .then((news) => {
        if (!cancelled) setItems(news);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 dark:text-slate-500">
        <Loader2 size={22} className="animate-spin mr-2" />
        Loading news for {ticker}…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-slate-400">
        <Newspaper size={40} className="mx-auto mb-3 opacity-40" />
        <p className="text-sm">No recent news found for {ticker}.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2 max-h-[min(60vh,28rem)] overflow-y-auto pr-1">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => void openExternalUrl(item.url)}
            className={cn(
              'w-full text-left rounded-lg border border-gray-200 dark:border-slate-700',
              'bg-gray-50/80 dark:bg-slate-800/40 px-4 py-3',
              'hover:border-indigo-300 dark:hover:border-indigo-700',
              'hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20',
              'transition-colors group'
            )}
          >
            <div className="flex items-start gap-2">
              <p className="flex-1 text-sm font-medium text-gray-900 dark:text-white leading-snug group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
                {item.title}
              </p>
              <ExternalLink
                size={14}
                className="shrink-0 mt-0.5 text-gray-400 group-hover:text-indigo-500"
                aria-hidden
              />
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              {item.publisher}
              {item.publishedAt > 0 && (
                <>
                  <span className="mx-1.5">·</span>
                  <span className="tabular-nums">{formatNewsAge(item.publishedAt)}</span>
                </>
              )}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}
