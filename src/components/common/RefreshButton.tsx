import { RefreshCw, Clock } from 'lucide-react';
import { useRefreshTimer } from '../../contexts/RefreshTimerContext';
import { cn } from '../../utils/format';

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

export function RefreshButton() {
  const {
    loading,
    onCooldown,
    cooldownRemaining,
    autoRemaining,
    manualRefresh,
  } = useRefreshTimer();

  const disabled = loading || onCooldown;

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'flex items-center gap-1 text-[10px] tabular-nums',
          'text-gray-400 dark:text-slate-500'
        )}
        title="Time until next auto-refresh"
      >
        <Clock size={10} />
        {loading ? '…' : formatTime(autoRemaining)}
      </span>

      <button
        onClick={manualRefresh}
        disabled={disabled}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
          'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300',
          'hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        {loading
          ? 'Refreshing'
          : onCooldown
            ? `${cooldownRemaining}s`
            : 'Refresh'}
      </button>
    </div>
  );
}
