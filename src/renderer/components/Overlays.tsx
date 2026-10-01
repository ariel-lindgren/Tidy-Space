import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store/appStore';
import { useQueue } from '../store/queueStore';
import { formatBytes } from '@shared/format';
import { msg } from '@shared/i18n';
import { useSettings } from '../store/settingsStore';
import { toast, useOverlay, useToasts, type ItemRef } from '../store/uiStore';
import { addItemsToQueue } from '../lib/actions';
import { Icon } from './Icon';

export function Toasts() {
  const toasts = useToasts(s => s.toasts);
  const dismiss = useToasts(s => s.dismiss);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.leaving ? 'out' : ''}`}>
          <Icon name={t.icon} />
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                t.action?.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function ContextMenu() {
  const menu = useOverlay(s => s.menu);
  const close = useOverlay(s => s.closeMenu);
  const queued = useQueue(s => s.items);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ left: Math.min(menu.x, innerWidth - r.width - 8), top: Math.min(menu.y, innerHeight - r.height - 8) });
    ref.current.querySelector('button')?.focus();
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
    };
  }, [menu, close]);

  if (!menu) return null;
  const item: ItemRef = menu.item;
  const isDir = item.kind === 'dir';
  const inQueue = queued.some(q => q.id === item.id);
  const units = useSettings.getState().settings?.units ?? 'binary';
  const app = useApp.getState();
  const m = msg().nav;
  const run = (fn: () => unknown) => () => {
    close();
    Promise.resolve(fn()).catch(err => toast(err instanceof Error ? err.message : String(err), 'alert'));
  };
  const withPath = async () => item.path ?? (await api().query('details', { id: item.id })).path;

  type Action = { icon: string; label: string; run: () => unknown; when?: boolean; separatorBefore?: boolean };
  const actions: Action[] = [
    { icon: 'pie', label: m.exploreFolder, run: () => app.openFolder(item.id), when: isDir },
    {
      icon: 'search',
      label: m.showInExplore,
      run: () => app.reveal(item),
      // Redundante quando o item já está listado na pasta aberta no Explorar.
      when: !isDir && !(app.screen === 'explore' && app.currentId === item.parentId),
    },
    {
      icon: 'target',
      label: m.scanOnlyFolder,
      run: async () => app.startScan(await withPath()),
      when: isDir,
    },
    {
      icon: 'external',
      label: m.reveal,
      run: async () => {
        await api().files.reveal(item.id);
        toast(m.revealed(item.name), 'external');
      },
    },
    {
      icon: item.cloudOnly ? 'cloud' : 'file',
      label: item.cloudOnly ? m.openFromCloud : m.open,
      run: async () => {
        if (item.cloudOnly) toast(m.downloading(formatBytes(item.logical ?? 0, units)), 'cloud');
        await api().files.open(item.id);
        if (!item.cloudOnly) toast(m.opening(item.name), 'file');
      },
      when: !isDir,
    },
    {
      icon: 'copy',
      label: m.copyPath,
      run: async () => {
        await navigator.clipboard.writeText(await withPath());
        toast(m.pathCopied, 'copy');
      },
    },
    inQueue
      ? {
          icon: 'x',
          label: m.removeFromCleanup,
          run: () => useQueue.getState().remove([item.id]),
          separatorBefore: true,
        }
      : { icon: 'plus', label: m.addToCleanup, run: () => addItemsToQueue([item.id]), separatorBefore: true },
  ];

  return (
    <div ref={ref} className="ctx on" role="menu" style={pos} aria-label={m.actionsFor(item.name)}>
      <div className="ctx-h">{item.path ?? item.name}</div>
      {actions
        .filter(a => a.when !== false)
        .map(a => (
          <span key={a.label} style={{ display: 'contents' }}>
            {a.separatorBefore && <hr />}
            <button role="menuitem" type="button" onClick={run(a.run)}>
              <Icon name={a.icon} />
              {a.label}
            </button>
          </span>
        ))}
    </div>
  );
}
