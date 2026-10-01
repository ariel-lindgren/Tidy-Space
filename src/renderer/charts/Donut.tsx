import type { CSSProperties, ReactNode } from 'react';
import { msg } from '@shared/i18n';
import { arcPath } from './layout';

export interface DonutSlice {
  key: string;
  value: number;
  color: string;
  label: string;
}

export function Donut({
  slices,
  selected,
  onSelect,
  onHover,
  children,
}: {
  slices: DonutSlice[];
  selected: string | null;
  onSelect(key: string): void;
  onHover(key: string | null): void;
  children?: ReactNode;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  let a = 0;
  return (
    <svg
      className={`donut ${selected ? 'has-sel' : ''}`}
      viewBox="-100 -100 200 200"
      role="img"
      aria-label={msg().charts.donutLabel}
    >
      {slices.map((s, i) => {
        const span = (s.value / total) * Math.PI * 2;
        const a0 = a + 0.012;
        const a1 = Math.max(a0 + 0.001, a + span - 0.012);
        a += span;
        return (
          <path
            key={s.key}
            className={`dn-arc ${selected === s.key ? 'on' : ''}`}
            d={arcPath(58, 92, a0, a1)}
            style={{ '--c': s.color, '--d': `${i * 60}ms` } as CSSProperties}
            onClick={() => onSelect(s.key)}
            onMouseEnter={() => onHover(s.key)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{s.label}</title>
          </path>
        );
      })}
      {children}
    </svg>
  );
}
