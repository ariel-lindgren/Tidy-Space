import { describe, expect, it } from 'vitest';
import { formatBytes, formatCount, formatDuration, formatPercent, formatRelative } from './format';

describe('format', () => {
  it('formata bytes em binário e decimal', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(1024 ** 3 * 123.4)).toBe('123 GB');
    expect(formatBytes(1_500_000, 'decimal')).toBe('1,5 MB');
    expect(formatBytes(1024 ** 4 * 2)).toBe('2,0 TB');
  });

  it('formata contagens, porcentagens e durações', () => {
    expect(formatCount(1234567)).toBe('1.234.567');
    expect(formatPercent(1, 3)).toBe('33,3%');
    expect(formatPercent(1, 100000)).toBe('<0,1%');
    expect(formatPercent(5, 0)).toBe('0%');
    expect(formatDuration(450)).toBe('450 ms');
    expect(formatDuration(3400)).toBe('3,4 s');
    expect(formatDuration(125_000)).toBe('2 min 5 s');
  });

  it('formata datas relativas', () => {
    const now = Date.UTC(2026, 0, 1);
    const day = 86_400_000;
    expect(formatRelative(0, now)).toBe('—');
    expect(formatRelative(now - 1000, now)).toBe('hoje');
    expect(formatRelative(now - 1.5 * day, now)).toBe('ontem');
    expect(formatRelative(now - 10 * day, now)).toBe('há 10 dias');
    expect(formatRelative(now - 40 * day, now)).toBe('há 1 mês');
    expect(formatRelative(now - 800 * day, now)).toBe('há 2 anos');
  });
});
