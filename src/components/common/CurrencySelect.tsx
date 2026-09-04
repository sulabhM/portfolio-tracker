import { SUPPORTED_CURRENCIES, type CurrencyCode } from '../../constants/currencies';
import { cn } from '../../utils/format';

interface CurrencySelectProps {
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
  className?: string;
  id?: string;
  /**
   * When set, the select is locked to this currency: Yahoo reported it for the
   * ticker and it overrides any manual choice on save, so the UI should not
   * pretend the user can pick something else.
   */
  reported?: CurrencyCode | null;
}

export const REPORTED_CURRENCY_HINT = 'Currency reported by Yahoo for this ticker';

export function CurrencySelect({
  value,
  onChange,
  className,
  id,
  reported,
}: CurrencySelectProps) {
  const locked = !!reported;
  return (
    <select
      id={id}
      value={reported ?? value}
      onChange={(e) => onChange(e.target.value as CurrencyCode)}
      disabled={locked}
      title={locked ? REPORTED_CURRENCY_HINT : undefined}
      aria-readonly={locked || undefined}
      className={cn(className, locked && 'opacity-70 cursor-not-allowed')}
    >
      {SUPPORTED_CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
