import type { MarketState } from '../../services/yahooFinance';
import { useExtendedHours } from '../../contexts/ExtendedHoursContext';
import { cn } from '../../utils/format';

const config: Record<MarketState, { label: string; dot: string; text: string }> = {
  REGULAR: { label: 'Market Open', dot: 'bg-emerald-500 animate-pulse', text: 'text-emerald-600 dark:text-emerald-400' },
  PRE:     { label: 'Pre-Market',  dot: 'bg-amber-500',                 text: 'text-amber-600 dark:text-amber-400' },
  POST:    { label: 'After Hours', dot: 'bg-amber-500',                 text: 'text-amber-600 dark:text-amber-400' },
  CLOSED:  { label: 'Market Closed', dot: 'bg-gray-400 dark:bg-slate-500', text: 'text-gray-500 dark:text-slate-400' },
};

export function MarketBadge({ state }: { state: MarketState }) {
  const { extendedHours, toggleExtendedHours } = useExtendedHours();
  const c = config[state];
  const hasExtended = state !== 'REGULAR';

  return (
    <div className="flex items-center gap-2">
      <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', c.text)}>
        <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
        {c.label}
      </span>
      {hasExtended && (
        <button
          onClick={toggleExtendedHours}
          className={cn(
            'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors',
            extendedHours
              ? 'bg-amber-500'
              : 'bg-gray-300 dark:bg-slate-600'
          )}
          title={extendedHours ? 'Showing extended hours prices' : 'Showing regular prices'}
        >
          <span
            className={cn(
              'inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
              extendedHours ? 'translate-x-3.5' : 'translate-x-0.5'
            )}
          />
        </button>
      )}
      {hasExtended && extendedHours && (
        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
          EXT
        </span>
      )}
    </div>
  );
}
