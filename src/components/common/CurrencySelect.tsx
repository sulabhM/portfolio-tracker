import { SUPPORTED_CURRENCIES, type CurrencyCode } from '../../constants/currencies';

interface CurrencySelectProps {
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
  className?: string;
  id?: string;
}

export function CurrencySelect({
  value,
  onChange,
  className,
  id,
}: CurrencySelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as CurrencyCode)}
      className={className}
    >
      {SUPPORTED_CURRENCIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
