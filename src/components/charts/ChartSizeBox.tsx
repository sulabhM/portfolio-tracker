import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../utils/format';

/**
 * Measures its container and passes explicit pixel dimensions to children.
 * Avoids Recharts ResponsiveContainer failing to render inside modals (0-width measure).
 */
export function ChartSizeBox({
  height,
  className,
  renderKey,
  children,
}: {
  height: number;
  className?: string;
  /** When this changes, layout is re-measured (e.g. new ticker or modal open). */
  renderKey?: string | number;
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const { width } = el.getBoundingClientRect();
      const w = Math.floor(width);
      if (w > 0) setSize({ width: w, height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height, renderKey]);

  return (
    <div
      ref={ref}
      className={cn('w-full min-w-0', className)}
      style={{ height }}
    >
      {size ? children(size) : null}
    </div>
  );
}
