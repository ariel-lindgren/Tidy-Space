import { msg } from '@shared/i18n';
import { api } from '../api';
import { useApp } from '../store/appStore';
import { toQueueItem, useQueue } from '../store/queueStore';
import { toast } from '../store/uiStore';

/** Abre o seletor nativo de pasta e inicia a análise da escolhida. */
export async function pickAndScan(): Promise<void> {
  const path = await api().dialog.pickFolder();
  if (path) await useApp.getState().startScan(path);
}

/** Adiciona um item (buscando caminho/categoria no engine) à fila de limpeza. */
export async function addItemsToQueue(ids: number[]): Promise<void> {
  const details = await Promise.all(ids.map(id => api().query('details', { id })));
  const { added, bytes } = useQueue.getState().add(
    details.map(d =>
      toQueueItem({
        ...d.node,
        path: d.path,
        parentPath: d.trail.length > 1 ? d.path.slice(0, d.path.length - d.node.name.length - 1) : '',
      }),
    ),
  );
  toast(added ? msg().nav.addedToCleanup(added) : msg().nav.alreadyQueued, added ? 'sparkles' : 'info');
  void bytes;
}
