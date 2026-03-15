import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { searchTickers } from '../../services/yahooFinance';
import type { SearchQuote } from '../../services/yahooFinance';
import { cn } from '../../utils/format';

const SEARCH_DEBOUNCE_MS = 300;

interface TickerSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (symbol: string, name: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  inputClass?: string;
  /** When true, show search dropdown; when false (e.g. editing existing), act as plain input */
  allowSearch?: boolean;
}

export function TickerSearchInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Ticker or company name',
  disabled,
  required,
  autoFocus,
  inputClass,
  allowSearch = true,
}: TickerSearchInputProps) {
  const [searchResults, setSearchResults] = useState<SearchQuote[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 1) {
      setSearchResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    try {
      const results = await searchTickers(q);
      setSearchResults(results);
      setOpen(results.length > 0);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!allowSearch) return;
    const q = value.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setOpen(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [value, allowSearch, runSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(quote: SearchQuote) {
    const name = quote.longname || quote.shortname || quote.symbol;
    onSelect(quote.symbol.toUpperCase(), name);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => value.trim().length >= 2 && searchResults.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          autoComplete="off"
          className={cn('pr-9', inputClass)}
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          {searching && (
            <Loader2 size={16} className="animate-spin text-gray-400 dark:text-slate-500" />
          )}
        </span>
      </div>
      {allowSearch && open && searchResults.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1"
          role="listbox"
        >
          {searchResults.map((quote) => (
            <li
              key={`${quote.symbol}-${quote.exchange ?? ''}`}
              role="option"
              aria-selected={false}
              onClick={() => handleSelect(quote)}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-900 dark:text-white flex flex-col gap-0.5"
            >
              <span className="font-medium">{quote.symbol}</span>
              <span className="text-xs text-gray-500 dark:text-slate-400 truncate">
                {quote.longname || quote.shortname || quote.symbol}
                {quote.exchange ? ` · ${quote.exchange}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
