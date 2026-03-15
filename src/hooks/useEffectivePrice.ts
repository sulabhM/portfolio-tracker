import { useExtendedHours } from '../contexts/ExtendedHoursContext';
import type { PriceData } from '../types';

export function useEffectivePrice() {
  const { extendedHours } = useExtendedHours();

  return function resolve(p: PriceData | undefined, fallbackPrice?: number) {
    if (!p) {
      return {
        price: fallbackPrice ?? 0,
        change: 0,
        changePercent: 0,
        isExtended: false,
      };
    }
    if (extendedHours && p.extPrice != null) {
      return {
        price: p.extPrice,
        change: p.extChange ?? 0,
        changePercent: p.extChangePercent ?? 0,
        isExtended: true,
      };
    }
    return {
      price: p.price,
      change: p.change,
      changePercent: p.changePercent,
      isExtended: false,
    };
  };
}
