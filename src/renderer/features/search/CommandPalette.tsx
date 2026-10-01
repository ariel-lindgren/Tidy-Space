import { useEffect, useState } from 'react';
import { category } from '@shared/categories';
import { formatBytes } from '@shared/format';
import { msg } from '@shared/i18n';
import { api } from '../../api';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { scanKey, useQuery } from '../../lib/useQuery';
import { useApp } from '../../store/appStore';
import { useSettings } from '../../store/settingsStore';

/** Busca global (Ctrl K): nomes na análise atual; sem análise, oferece os volumes. */
export function CommandPalette() {
  const close = () => useApp.getState().setPaletteOpen(false);
  const summary = useApp(s => s.summary);
  const units = useSettings(s => s.settings?.units ?? 'binary');
  const [text, setText] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const m = msg().search;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text), 150);
    return () => clearTimeout(t);
  }, [text]);

  const results = useQuery(summary && debounced.trim() ? ['search', scanKey(summary), debounced] : null, () =>
    api().query('search', { text: debounced, limit: 12 }),
  );
  const topDirs = useQuery(summary && !debounced.trim() ? ['top', scanKey(summary), 'palette'] : null, () =>
    api().query('top', { kind: 'dir', limit: 8 }),
  );
  const volumes = useQuery(!summary ? ['volumes'] : null, () => api().query('listVolumes'));

  const items = summary
    ? ((debounced.trim() ? results.data : topDirs.data)?.map(n => ({
        key: String(n.id),
        icon: n.kind === 'dir' ? 'folder' : category(n.category).icon,
        name: n.name,
        detail: n.path,
        size: n.size,
        run: () => useApp.getState().reveal(n),
      })) ?? [])
    : (volumes.data?.map(v => ({
        key: v.id,
        icon: 'hdd',
        name: m.scanVolume(v.mountPoint),
        detail: v.name,
        size: v.total - v.available,
        run: () => void useApp.getState().startScan(v.mountPoint),
      })) ?? []);

  const choose = (i: number) => {
    const item = items[i];
    if (!item) return;
    close();
    item.run();
  };

  return (
    <Modal onClose={close} label={m.label} top>
      <div className="input-icon">
        <Icon name="search" />
        <input
          className="input"
          style={{ width: '100%', height: 42, fontSize: 15 }}
          placeholder={summary ? m.placeholder(summary.rootPath) : m.pickVolume}
          aria-label={m.label}
          spellCheck={false}
          value={text}
          onChange={e => {
            setText(e.target.value);
            setActive(0);
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(a => (items.length ? (a + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length : 0));
            }
            if (e.key === 'Enter') choose(active);
          }}
        />
      </div>
      <div className="palette-list" role="listbox">
        {items.map((it, i) => (
          <button
            type="button"
            role="option"
            aria-selected={i === active}
            key={it.key}
            className={i === active ? 'on' : ''}
            onClick={() => choose(i)}
            onMouseEnter={() => setActive(i)}
          >
            <Icon name={it.icon} />
            <div style={{ minWidth: 0 }}>
              <div>{it.name}</div>
              <div className="pth">{it.detail}</div>
            </div>
            <b>{formatBytes(it.size, units)}</b>
          </button>
        ))}
        {!items.length && debounced && !results.loading && <div className="empty">{m.nothingFound}</div>}
      </div>
    </Modal>
  );
}
