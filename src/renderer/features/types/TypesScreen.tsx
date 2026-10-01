import { useState, type CSSProperties } from 'react';
import { category } from '@shared/categories';
import { formatBytes, formatCount, formatPercent, formatRelative } from '@shared/format';
import { msg } from '@shared/i18n';
import type { CategoryId } from '@shared/types';
import { api } from '../../api';
import { Donut } from '../../charts/Donut';
import { Bar, ErrorBox } from '../../components/controls';
import { Icon } from '../../components/Icon';
import { categoryColor } from '../../lib/colors';
import { scanKey, useQuery } from '../../lib/useQuery';
import { useApp } from '../../store/appStore';
import { useSettings } from '../../store/settingsStore';
import { useOverlay } from '../../store/uiStore';

export function TypesScreen() {
  const summary = useApp(s => s.summary);
  const selected = useApp(s => s.typesCategory);
  const setSelected = useApp(s => s.setTypesCategory);
  const reveal = useApp(s => s.reveal);
  const patchLargest = useApp(s => s.patchLargest);
  const go = useApp(s => s.go);
  const openMenu = useOverlay(s => s.openMenu);
  const units = useSettings(s => s.settings?.units ?? 'binary');
  const [hover, setHover] = useState<CategoryId | null>(null);

  const stats = useQuery(summary ? ['types', scanKey(summary)] : null, () => api().query('types'));
  const files = useQuery(summary && selected ? ['top', scanKey(summary), 'type', selected] : null, () =>
    api().query('top', { kind: 'file', category: selected ?? undefined, limit: 12 }),
  );

  if (!summary) return null;
  if (stats.error) return <ErrorBox error={stats.error} />;
  const m = msg().types;
  const cats = stats.data?.categories ?? [];
  const total = cats.reduce((a, c) => a + c.size, 0);
  const count = cats.reduce((a, c) => a + c.count, 0);
  const focus = cats.find(c => c.category === (hover ?? selected));
  const toggle = (c: CategoryId) => setSelected(selected === c ? null : c);

  return (
    <>
      <div className="page-head stagger">
        <div>
          <div className="eyebrow">{summary.rootPath}</div>
          <h1 className="h1">{m.title}</h1>
          <p className="sub">{m.subtitle}</p>
        </div>
      </div>
      <div className="types stagger">
        <div className="panel donut-wrap">
          <Donut
            slices={cats.map(c => ({
              key: c.category,
              value: c.size,
              color: categoryColor(c.category),
              label: category(c.category).label,
            }))}
            selected={selected}
            onSelect={k => toggle(k as CategoryId)}
            onHover={k => setHover(k as CategoryId | null)}
          >
            <text y={-6} style={{ fontSize: 9, fill: 'var(--text-3)' }}>
              {focus ? category(focus.category).label.toUpperCase() : m.total}
            </text>
            <text y={12} style={{ fontSize: 17, fontWeight: 600 }}>
              {formatBytes(focus?.size ?? total, units)}
            </text>
            <text y={26} style={{ fontSize: 8, fill: 'var(--text-3)' }}>
              {focus
                ? `${formatPercent(focus.size, total)} · ${msg().common.files(formatCount(focus.count))}`
                : msg().common.files(formatCount(count))}
            </text>
          </Donut>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            {m.hoverHint}
          </div>
        </div>
        <div className="panel cat-rows" role="list">
          {cats.map(c => {
            const def = category(c.category);
            return (
              <button
                type="button"
                role="listitem"
                key={c.category}
                className={`cat-row ${selected === c.category ? 'on' : ''}`}
                style={{ '--c': categoryColor(c.category), width: '100%', textAlign: 'left' } as CSSProperties}
                onClick={() => toggle(c.category)}
              >
                <div className="ico">
                  <Icon name={def.icon} />
                </div>
                <div>
                  <div>{def.label}</div>
                  <Bar percent={(c.size / (cats[0]?.size || 1)) * 100} />
                </div>
                <div className="num">{m.filesShort(formatCount(c.count))}</div>
                <div className="num" style={{ color: 'var(--text)' }}>
                  {formatBytes(c.size, units)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel stagger" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <div className="h2">{m.heaviestExtensions}</div>
        </div>
        <div className="ext-grid">
          {stats.data?.extensions.map(e => (
            <div key={e.ext || '—'} className="ext" style={{ '--c': categoryColor(e.category) } as CSSProperties}>
              <b>.{e.ext || '—'}</b>
              <span>{formatBytes(e.size, units)}</span>
              <span className="muted">{formatCount(e.count)}</span>
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <div className="h2">{m.largestIn(category(selected).label)}</div>
            <div className="grow" />
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                patchLargest({ kind: 'file', category: selected });
                go('largest');
              }}
            >
              <Icon name="bars" /> {m.seeAllInLargest}
            </button>
          </div>
          <table className="tbl">
            <tbody>
              {files.data?.map((n, i) => (
                <tr
                  key={n.id}
                  className="r"
                  style={{ animationDelay: `${i * 25}ms` }}
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
                    <div className="nm" style={{ '--c': categoryColor(selected) } as CSSProperties}>
                      <Icon name={category(selected).icon} />
                      <span className="t">{n.name}</span>
                    </div>
                  </td>
                  <td>
                    <div className="path-cell">{n.parentPath}</div>
                  </td>
                  <td className="num">{formatRelative(n.mtime)}</td>
                  <td className="num" style={{ color: 'var(--text)' }}>
                    {formatBytes(n.size, units)}
                  </td>
                  <td className="acts">
                    <button
                      type="button"
                      className="btn sm ghost"
                      aria-label={m.showNameInExplore(n.name)}
                      onClick={() => reveal(n)}
                    >
                      <Icon name="search" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
