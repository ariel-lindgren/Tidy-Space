/** Formatação no idioma atual da interface (tamanhos, contagens, porcentagens e datas relativas). */
import { getLocale, msg } from './i18n';

export type Units = 'binary' | 'decimal';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

export function formatBytes(bytes: number, units: Units = 'binary'): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const base = units === 'binary' ? 1024 : 1000;
  let value = bytes;
  let i = 0;
  while (value >= base && i < UNITS.length - 1) {
    value /= base;
    i++;
  }
  if (i === 0) return `${Math.round(value)} B`;
  const digits = value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toLocaleString(getLocale(), { minimumFractionDigits: value < 10 ? 1 : 0, maximumFractionDigits: digits })} ${UNITS[i]}`;
}

export function formatCount(n: number): string {
  return Math.round(n).toLocaleString(getLocale());
}

export function formatPercent(part: number, whole: number): string {
  if (!whole || part <= 0) return '0%';
  const p = (part / whole) * 100;
  if (p < 0.1) return `<${(0.1).toLocaleString(getLocale())}%`;
  return `${p.toLocaleString(getLocale(), { maximumFractionDigits: 1 })}%`;
}

const DAY = 86_400_000;

export function formatRelative(time: number, now: number = Date.now()): string {
  if (!time) return '—';
  const days = (now - time) / DAY;
  const f = msg().format;
  if (days < 1) return f.today;
  if (days < 2) return f.yesterday;
  if (days < 30) return f.daysAgo(Math.floor(days));
  if (days < 365) return f.monthsAgo(Math.floor(days / 30));
  return f.yearsAgo(Math.floor(days / 365));
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toLocaleString(getLocale(), { maximumFractionDigits: 1 })} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s % 60)} s`;
}
