import type { CashAccount, CashPayoutMode } from '../types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_YEAR = 365.25;

export const DEFAULT_PAYOUT_FREQUENCY_MONTHS = 12;

/** Add calendar months, clamping the day-of-month (Jan 31 + 1 → Feb 28/29). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, daysInTarget));
  return d;
}

/** Rough elapsed years; used only to seed the periodic payout search. */
function approxYearsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY / DAYS_PER_YEAR;
}

/**
 * Elapsed years by calendar: whole anniversaries count as exactly 1, and the
 * remainder is the fraction of the current anniversary year that has passed.
 * Keeps a 2-year deposit worth exactly P·(1+r)² on its maturity date.
 */
function calendarYearsBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let whole = Math.max(0, to.getFullYear() - from.getFullYear() - 1);
  let anniversary = addMonths(from, whole * 12);
  let next = addMonths(from, (whole + 1) * 12);
  while (next <= to) {
    whole += 1;
    anniversary = next;
    next = addMonths(from, (whole + 1) * 12);
  }
  const yearMs = next.getTime() - anniversary.getTime();
  const fraction =
    yearMs > 0 ? (to.getTime() - anniversary.getTime()) / yearMs : 0;
  return whole + fraction;
}

function toValidDate(value: Date | string | number | undefined): Date | undefined {
  if (value == null) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface CashValuation {
  /** Principal + accrued interest as of `asOf`, in the account currency. */
  value: number;
  /**
   * Interest earned but still held in the account: since the last payout for
   * `periodic`, or all compounded interest to date for `maturity`.
   */
  accruedInterest: number;
  /** Interest paid on each payout date (`periodic` only). */
  payoutAmount?: number;
  /** Next payout (`periodic`) or the maturity date (`maturity`) if still ahead. */
  nextPayout?: Date;
  /** True once a `maturity` account has reached its maturity date. */
  matured: boolean;
}

/**
 * Value a cash deposit as of a given date from its principal, deposit date
 * and yearly rate. Nothing is persisted: the stored row is the contract, the
 * value is derived.
 */
export function valueCashAccount(
  account: CashAccount,
  asOf: Date = new Date()
): CashValuation {
  const principal = Number.isFinite(account.principal) ? account.principal : 0;
  const rate = account.interestRate > 0 ? account.interestRate : 0;
  const deposit = toValidDate(account.depositDate);

  if (rate === 0 || principal <= 0 || !deposit || deposit > asOf) {
    return { value: principal, accruedInterest: 0, matured: false };
  }

  if (account.payoutMode === 'maturity') {
    const maturity = toValidDate(account.maturityDate);
    const matured = maturity != null && maturity <= asOf;
    const end = matured ? maturity : asOf;
    const years = calendarYearsBetween(deposit, end);
    const value = principal * Math.pow(1 + rate, years);
    return {
      value,
      accruedInterest: value - principal,
      nextPayout: matured ? undefined : maturity,
      matured,
    };
  }

  const freq = Math.max(
    1,
    Math.round(account.payoutFrequencyMonths ?? DEFAULT_PAYOUT_FREQUENCY_MONTHS)
  );

  // Locate the payout period containing `asOf`: start from an estimate of the
  // number of completed periods, then correct for calendar-month lengths.
  let k = Math.max(
    0,
    Math.floor((approxYearsBetween(deposit, asOf) * 12) / freq)
  );
  let last = addMonths(deposit, k * freq);
  while (k > 0 && last > asOf) {
    k -= 1;
    last = addMonths(deposit, k * freq);
  }
  let next = addMonths(deposit, (k + 1) * freq);
  while (next <= asOf) {
    k += 1;
    last = next;
    next = addMonths(deposit, (k + 1) * freq);
  }

  const payoutAmount = (principal * rate * freq) / 12;
  const periodMs = next.getTime() - last.getTime();
  const fraction =
    periodMs > 0 ? (asOf.getTime() - last.getTime()) / periodMs : 0;
  const accruedInterest = payoutAmount * Math.min(1, Math.max(0, fraction));

  return {
    value: principal + accruedInterest,
    accruedInterest,
    payoutAmount,
    nextPayout: next,
    matured: false,
  };
}

/** Interest expected over the next twelve months, in the account currency. */
export function annualCashInterest(
  account: CashAccount,
  asOf: Date = new Date()
): number {
  if (account.interestRate <= 0 || account.principal <= 0) return 0;
  if (account.payoutMode === 'maturity') {
    const { value, matured } = valueCashAccount(account, asOf);
    return matured ? 0 : value * account.interestRate;
  }
  return account.principal * account.interestRate;
}

/** Pre-migration row shape, kept only so old data can be upgraded. */
interface LegacyCashAccountFields {
  balance?: number;
  compoundFrequency?: 'daily' | 'monthly' | 'none';
  lastInterestDate?: Date | string;
}

type RawCashAccount = Partial<
  Omit<CashAccount, 'depositDate' | 'maturityDate' | 'createdAt'>
> &
  LegacyCashAccountFields & {
    depositDate?: Date | string;
    maturityDate?: Date | string;
    createdAt?: Date | string;
  };

/**
 * Coerce a stored cash account (current or legacy shape, dates as Date or
 * ISO string) into the current `CashAccount` shape. Legacy `balance` becomes
 * the principal as of `lastInterestDate` (the point up to which interest had
 * been credited); `daily`/`monthly` compounding maps to a compounded deposit
 * with no maturity date yet, and `none` to yearly simple-interest payouts.
 * Rows without an `accountId` (pre-accounts) are assigned `defaultAccountId`.
 */
export function normalizeCashAccount(
  raw: RawCashAccount,
  defaultAccountId: number
): CashAccount {
  const createdAt = toValidDate(raw.createdAt) ?? new Date();
  const principal = Number.isFinite(raw.principal)
    ? (raw.principal as number)
    : Number.isFinite(raw.balance)
      ? (raw.balance as number)
      : 0;
  const depositDate =
    toValidDate(raw.depositDate) ??
    toValidDate(raw.lastInterestDate) ??
    createdAt;

  let payoutMode: CashPayoutMode;
  if (raw.payoutMode === 'periodic' || raw.payoutMode === 'maturity') {
    payoutMode = raw.payoutMode;
  } else if (
    raw.compoundFrequency === 'daily' ||
    raw.compoundFrequency === 'monthly'
  ) {
    payoutMode = 'maturity';
  } else {
    payoutMode = 'periodic';
  }

  const account: CashAccount = {
    accountId:
      typeof raw.accountId === 'number' && Number.isInteger(raw.accountId)
        ? raw.accountId
        : defaultAccountId,
    name: raw.name ?? '',
    principal,
    depositDate,
    currency: raw.currency ?? 'USD',
    interestRate:
      Number.isFinite(raw.interestRate) && (raw.interestRate as number) > 0
        ? (raw.interestRate as number)
        : 0,
    payoutMode,
    createdAt,
  };
  if (raw.id != null) account.id = raw.id;

  if (payoutMode === 'periodic') {
    const freq = raw.payoutFrequencyMonths;
    account.payoutFrequencyMonths =
      Number.isFinite(freq) && (freq as number) >= 1
        ? Math.round(freq as number)
        : DEFAULT_PAYOUT_FREQUENCY_MONTHS;
  } else {
    const maturity = toValidDate(raw.maturityDate);
    if (maturity) account.maturityDate = maturity;
  }

  return account;
}
