import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { addHolding, updateHolding } from '../../db/hooks';
import { lookupTicker } from '../../services/yahooFinance';
import { isTauri } from '../../services/fileAdapter';
import type { Holding } from '../../types';
import { cn } from '../../utils/format';
import { TickerSearchInput } from '../common/TickerSearchInput';

interface AddHoldingFormProps {
  holding?: Holding;
  onDone: () => void;
}

export function AddHoldingForm({ holding, onDone }: AddHoldingFormProps) {
  const [ticker, setTicker] = useState(holding?.ticker ?? '');
  const [name, setName] = useState(holding?.name ?? '');
  const [shares, setShares] = useState(holding?.shares?.toString() ?? '');
  const [avgCost, setAvgCost] = useState(holding?.avgCost?.toString() ?? '');
  const [sector, setSector] = useState(holding?.sector ?? '');
  const [country, setCountry] = useState(holding?.country ?? '');
  const [drip, setDrip] = useState(holding?.drip ?? false);
  const [dividendTaxRate, setDividendTaxRate] = useState(
    holding?.dividendTaxRate != null
      ? (holding.dividendTaxRate * 100).toString()
      : '0'
  );
  const [lookupState, setLookupState] = useState<
    'idle' | 'loading' | 'found' | 'notfound'
  >('idle');
  const lookupTimeout = useRef<number>(0);

  const isEditing = !!holding;

  useEffect(() => {
    if (isEditing) return;
    const raw = ticker.trim().toUpperCase();
    if (raw.length < 1) {
      setLookupState('idle');
      return;
    }

    setLookupState('loading');
    clearTimeout(lookupTimeout.current);
    lookupTimeout.current = window.setTimeout(async () => {
      const info = await lookupTicker(raw);
      if (info) {
        setName(info.name);
        setSector(info.sector);
        setCountry(info.country || '');
        setLookupState('found');
      } else {
        setLookupState('notfound');
      }
    }, 500);

    return () => clearTimeout(lookupTimeout.current);
  }, [ticker, isEditing]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const data = {
      ticker: ticker.toUpperCase().trim(),
      name: name.trim(),
      shares: parseFloat(shares),
      avgCost: parseFloat(avgCost),
      sector: sector || 'Other',
      country: (country || '').trim() || 'Other',
      drip,
      dividendTaxRate: Math.max(0, Math.min(1, parseFloat(dividendTaxRate) / 100 || 0)),
      addedDate: holding?.addedDate ?? new Date(),
    };

    if (holding?.id) {
      await updateHolding(holding.id, data);
    } else {
      await addHolding(data);
    }
    onDone();
  }

  const inputClass =
    'w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-300 dark:border-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Ticker with search (by symbol or company name) and auto-lookup */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
          Ticker
        </label>
        <div className="relative">
          <TickerSearchInput
            value={ticker}
            onChange={setTicker}
            onSelect={(symbol, companyName) => {
              setTicker(symbol);
              setName(companyName);
            }}
            placeholder="Search by ticker or company name (e.g. AAPL or Apple)"
            required
            autoFocus={!isEditing}
            allowSearch={!isEditing}
            inputClass={cn(inputClass, 'w-full')}
          />
          {lookupState !== 'idle' && (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
              {lookupState === 'loading' && (
                <Loader2
                  size={16}
                  className="animate-spin text-gray-400 dark:text-slate-500"
                />
              )}
              {lookupState === 'found' && (
                <Check size={16} className="text-emerald-500" />
              )}
              {lookupState === 'notfound' && (
                <X size={16} className="text-amber-500" />
              )}
            </span>
          )}
        </div>
        {!isEditing && name && lookupState !== 'notfound' && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 min-h-[1rem]">
            {lookupState === 'loading' ? (
              <>Checking… {name}</>
            ) : lookupState === 'found' ? (
              <>Found: {name} &middot; {sector}</>
            ) : (
              <>{name}</>
            )}
          </p>
        )}
        {lookupState === 'notfound' && !isEditing && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 min-h-[1rem]">
            Ticker not recognized &mdash; fill in name & sector manually
          </p>
        )}
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Apple Inc."
          required
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Shares
          </label>
          <input
            type="number"
            step="any"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="100"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Avg Cost
          </label>
          <input
            type="number"
            step="any"
            value={avgCost}
            onChange={(e) => setAvgCost(e.target.value)}
            placeholder="150.00"
            required
            className={inputClass}
          />
        </div>
      </div>

      {/* Sector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
          Sector
        </label>
        <input
          type="text"
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          placeholder="Technology"
          className={inputClass}
        />
        {isTauri() && (
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Sector and country are from Yahoo when available.
          </p>
        )}
      </div>

      {/* DRIP toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Reinvest dividends (DRIP)
          </p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            Automatically buy more shares with dividend payouts
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={drip}
          onClick={() => setDrip(!drip)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors',
            drip ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-600'
          )}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform mt-0.5',
              drip ? 'translate-x-5.5 ml-px' : 'translate-x-0.5'
            )}
          />
        </button>
      </div>

      {/* Tax rate (visible when DRIP is on) */}
      {drip && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Dividend tax rate (%)
          </label>
          <input
            type="number"
            step="any"
            min="0"
            max="100"
            value={dividendTaxRate}
            onChange={(e) => setDividendTaxRate(e.target.value)}
            placeholder="15"
            className={inputClass}
          />
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
            Tax withheld before reinvesting (e.g. 15 for 15%)
          </p>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          {holding ? 'Update' : 'Add Holding'}
        </button>
      </div>
    </form>
  );
}
