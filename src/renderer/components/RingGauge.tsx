import { useEffect, useState } from 'react';
import { msg } from '@shared/i18n';

/** Anel de uso (0–1) com animação de preenchimento. */
export function RingGauge({
  value,
  size = 88,
  hot = 0.85,
  label = msg().nav.inUse,
}: {
  value: number;
  size?: number;
  hot?: number;
  label?: string;
}) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const [offset, setOffset] = useState(c);
  useEffect(() => {
    const t = setTimeout(() => setOffset(c * (1 - Math.min(1, Math.max(0, value)))), 120);
    return () => clearTimeout(t);
  }, [value, c]);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 104 104" aria-hidden="true">
        <circle className="trk" cx="52" cy="52" r={r} />
        <circle
          className={`val ${value > hot ? 'hot' : ''}`}
          cx="52"
          cy="52"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="lbl">
        <b>{Math.round(value * 100)}%</b>
        <span>{label}</span>
      </div>
    </div>
  );
}

/** Gradientes usados pelo anel — montados uma vez no App. */
export function RingGradients() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
        <linearGradient id="ringHot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--warn)" />
          <stop offset="1" stopColor="var(--danger)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
