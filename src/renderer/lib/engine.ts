import type { AppInfo } from '@shared/ipc';
import { msg } from '@shared/i18n';

/** Nome do motor de varredura em uso, para a barra de status e as configurações. */
export function engineLabel(info: Pick<AppInfo, 'engine' | 'engineChoice'> | null | undefined): string {
  if (!info) return '—';
  const m = msg().nav;
  if (info.engine === 'native') return m.engineNative;
  return info.engineChoice === 'node' ? m.engineNode : m.engineFallback;
}
