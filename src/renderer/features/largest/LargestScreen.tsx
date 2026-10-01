import { useEffect, useState, type CSSProperties } from 'react';
import { CATEGORIES, category } from '@shared/categories';
import { formatBytes, formatRelative } from '@shared/format';
import { msg } from '@shared/i18n';
import type { NodeId } from '@shared/types';
import { api } from '../../api';
import { Bar, Checkbox, ErrorBox, Segmented } from '../../components/controls';
import { Icon } from '../../components/Icon';
import { categoryColor } from '../../lib/colors';
import { CloudTag } from '../explore/AnalyticTable';
import { scanKey, useQuery } from '../../lib/useQuery';
import { useApp } from '../../store/appStore';
import { toQueueItem, useQueue } from '../../store/queueStore';
import { useSettings } from '../../store/settingsStore';
import { toast, useOverlay } from '../../store/uiStore';

const LIMIT = 150;

export function LargestScreen() {
  const summary = useApp(s => s.summary);
  const filters = useApp(s => s.largest);
  const patch = useApp(s => s.patchLargest);
  const reveal = useApp(s => s.reveal);
  const units = useSettings(s => s.settings?.units ?? 'binary');
  const openMenu = useOverlay(s => s.openMenu);
  const queued = useQueue(s => s.items);
  const [text, setText] = useState(filters.text);
  const [selected, setSelected] = useState<Set<NodeId>>(new Set());

  // Busca por texto com debounce.
  useEffect(() => {
    const t = setTimeout(() => patch({ text }), 200);
    return () => clearTimeout(t);
  }, [text, patch]);

  const types = useQuery(summary ? ['types', scanKey(summary)] : null, () => api().query('types'));
  const top = useQuery(summary ? ['top', scanKey(summary), filters] : null, () =>
    api().query('top', {
      kind: filters.kind,
      category: filters.category === 'all' ? undefined : filters.category,
      olderThanDays: filters.olderThanDays || undefined,
      text: filters.text || undefined,
      limit: LIMIT,
    }),
  );
  const items = top.data ?? [];
  const max = items[0]?.size ?? 1;
  const selectedItems = items.filter(i => selected.has(i.id));
  const allSelected = items.length > 0 && items.every(i => selected.has(i.id));
  const toggle = (id: NodeId) =>
    setSelected(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!summary) return null;
  const m = msg().largest;
  return (
    <>
      <div className="page-head stagger">
        <div>
          <div className="eyebrow">{summary.rootPath}</div>
          <h1 className="h1">{m.title}</h1>
          <p className="sub">{m.subtitle}</p>
        </div>
        <Segmented
          label={m.itemKind}
          value={filters.kind}
          onChange={kind => {
            setSelected(new Set());
            patch({ kind });
          }}
          options={[
            { value: 'file', icon: 'file', label: m.files },
            { value: 'dir', icon: 'folder', label: m.folders },
          ]}
        />
      </div>
      <div className="panel big-list stagger">
        <div className="filters">
          <div className="input-icon">
            <Icon name="search" />
            <input
              className="input"
              placeholder={m.searchPlaceholder}
              aria-label={m.search}
              style={{ height: 30, width: 230 }}
              value={text}
              onChange={e => setText(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={`chip ${filters.category === 'all' ? 'on' : ''}`}
            onClick={() => patch({ category: 'all' })}
          >
            {m.all}
          </button>
          {CATEGORIES.filter(c => types.data?.categories.some(x => x.category === c.id)).map(c => (
            <button
              type="button"
              key={c.id}
              className={`chip ${filters.category === c.id ? 'on' : ''}`}
              style={{ '--c': categoryColor(c.id) } as CSSProperties}
              onClick={() => patch({ category: c.id })}
            >
              <span className="sw" />
              {c.label}
            </button>
          ))}
          <div className="grow" />
          <Segmented
            label={m.age}
            value={String(filters.olderThanDays) as '0' | '180' | '365'}
            onChange={v => patch({ olderThanDays: Number(v) as 0 | 180 | 365 })}
            options={[
              { value: '0', label: m.anyDate },
              { value: '180', label: m.olderThan6Months },
              { value: '365', label: m.olderThan1Year },
            ]}
          />
        </div>
        {top.error ? (
          <ErrorBox error={top.error} />
        ) : (
          <div className="tbl-scroll">
            <table className="tbl" aria-label={m.tableLabel}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <Checkbox
                      checked={allSelected}
                      label={m.selectAll}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(items.map(i => i.id)))}
                    />
                  </th>
                  <th>#</th>
                  <th>{m.colName}</th>
                  <th>{m.colLocation}</th>
                  <th className="num">{m.colSize}</th>
                  <th className="num">{m.colModified}</th>
                  <th aria-label={m.actions} />
                </tr>
              </thead>
              <tbody>
                {items.map((n, i) => {
                  const color = categoryColor(n.category);
                  return (
                    <tr
                      key={n.id}
                      className={`r ${selected.has(n.id) ? 'sel' : ''}`}
                      style={{ animationDelay: `${Math.min(i * 14, 420)}ms` }}
                      onClick={() => toggle(n.id)}
                      onContextMenu={e => {
                        e.preventDefault();
                        openMenu(e.clientX, e.clientY, {
                          cloudOnly: n.cloudOnly,
                          logical: n.logical,
                          id: n.id,
                          name: n.name,
                          kind: n.kind,
                          size: n.size,
                          parentId: n.parentId,
                          path: n.path,
                        });
                      }}
                    >
                      <td>
                        <Checkbox checked={selected.has(n.id)} label={m.select(n.name)} onChange={() => toggle(n.id)} />
                      </td>
                      <td className="num muted">{i + 1}</td>
                      <td>
                        <div className="nm" style={{ '--c': color } as CSSProperties}>
                          <Icon name={n.kind === 'dir' ? 'folder' : category(n.category).icon} />
                          <span className="t" title={n.name}>
                            {n.name}
                          </span>
                          <CloudTag item={n} units={units} />
                          {queued.some(q => q.id === n.id) && <span className="pill safe">{m.queued}</span>}
                        </div>
                      </td>
                      <td>
                        <div className="path-cell" title={n.parentPath}>
                          {n.parentPath}
                        </div>
                      </td>
                      <td>
                        <div className="sizecell">
                          <Bar percent={(n.size / max) * 100} color={color} />
                          <b>{formatBytes(n.size, units)}</b>
                        </div>
                      </td>
                      <td className="num">{formatRelative(n.mtime)}</td>
                      <td className="acts">
                        <button
                          type="button"
                          className="btn sm ghost"
                          title={m.showInExplore}
                          aria-label={m.showNameInExplore(n.name)}
                          onClick={e => {
                            e.stopPropagation();
                            reveal(n);
                          }}
                        >
                          <Icon name="search" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!top.loading && !items.length && (
                  <tr>
                    <td colSpan={7} className="empty">
                      {m.empty}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className={`panel selbar ${selected.size ? 'on' : ''}`} aria-hidden={!selected.size}>
        <span>
          <b>{selected.size}</b> {m.selected} ·{' '}
          <b className="mono">
            {formatBytes(
              selectedItems.reduce((a, n) => a + n.size, 0),
              units,
            )}
          </b>
        </span>
        <button type="button" className="btn sm ghost" onClick={() => setSelected(new Set())}>
          {m.clearSelection}
        </button>
        <button
          type="button"
          className="btn sm primary"
          onClick={() => {
            const { added } = useQueue.getState().add(selectedItems.map(toQueueItem));
            toast(msg().largest.added(added), 'sparkles');
            setSelected(new Set());
          }}
        >
          <Icon name="plus" /> {m.addToCleanup}
        </button>
      </div>
    </>
  );
}
