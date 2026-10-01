import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { msg } from '@shared/i18n';
import { Icon } from './Icon';

export interface SegmentOption<T extends string> {
  value: T;
  label?: string;
  icon?: string;
  title?: string;
}

/** Controle segmentado com indicador deslizante. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const btn = ref.current?.querySelector<HTMLButtonElement>('button[aria-checked="true"]');
      if (btn) setInd({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    place();
    void document.fonts?.ready.then(place);
  }, [value, options.length]);
  return (
    <div className="seg" role="radiogroup" aria-label={label} ref={ref}>
      <span className="seg-ind" style={ind} />
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          title={o.title}
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  /** Parte dos itens marcada (cabeçalho de listas). */
  indeterminate?: boolean;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      tabIndex={0}
      className={`check ${checked ? 'on' : ''} ${indeterminate ? 'mixed' : ''}`}
      onClick={e => {
        e.stopPropagation();
        onChange();
      }}
      onKeyDown={e => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange();
        }
      }}
    >
      <Icon name={indeterminate ? 'minus' : 'check'} />
    </span>
  );
}

export function Bar({ percent, color }: { percent: number; color?: string }) {
  return (
    <div className="bar">
      <i
        style={{
          width: `${Math.max(0.5, Math.min(100, percent))}%`,
          ...(color ? ({ '--c': color } as React.CSSProperties) : {}),
        }}
      />
    </div>
  );
}

export function EmptyState({
  icon = 'sparkles',
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div style={{ marginTop: 8 }}>{title}</div>
      {children && <div style={{ fontSize: 12, marginTop: 4 }}>{children}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <b>{msg().nav.errorTitle}</b>
      {error.message}
      {onRetry && (
        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn sm" onClick={onRetry}>
            <Icon name="refresh" /> {msg().nav.retry}
          </button>
        </div>
      )}
    </div>
  );
}
