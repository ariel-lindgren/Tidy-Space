import type { ScanProgress, VolumeInfo } from '@shared/types';
import { api } from '../api';
import { useApp } from '../store/appStore';
import { useQuery } from './useQuery';

export interface ScanProgressInfo {
  scanning: boolean;
  phase: ScanProgress['phase'];
  /** 0–100, ou null quando não há como estimar (pasta sem total conhecido). */
  percent: number | null;
  /** Volume da raiz, quando a análise é de um disco inteiro. */
  volume: VolumeInfo | undefined;
}

const normalize = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase();

/**
 * Progresso da varredura em andamento, usado pela tela de análise, pela barra lateral e pela
 * barra de status. Disco inteiro: bytes lidos ÷ espaço em uso. Gravação: entradas gravadas ÷ total.
 */
export function useScanProgress(): ScanProgressInfo {
  const scan = useApp(s => s.scan);
  const volumes = useQuery(['volumes'], () => api().query('listVolumes'));
  const p = scan.progress;
  const volume = volumes.data?.find(v => scan.target && normalize(v.mountPoint) === normalize(scan.target));
  const phase = p?.phase ?? 'scanning';
  let percent: number | null = null;
  if (phase === 'saving' && p?.total) percent = Math.min(100, Math.floor(((p.saved ?? 0) / p.total) * 100));
  else if (volume && p)
    percent = Math.min(99, Math.floor((p.bytes / Math.max(1, volume.total - volume.available)) * 100));
  return { scanning: scan.status === 'scanning', phase, percent, volume };
}
