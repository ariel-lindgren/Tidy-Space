import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { category } from '@shared/categories';
import { formatBytes, formatCount, formatPercent, formatRelative, type Units } from '@shared/format';
import { msg } from '@shared/i18n';
import { categoryColor } from '../lib/colors';
import { nodeName, useTooltip } from './types';

/** Tooltip dos gráficos. Assina seu próprio store: só ele re-renderiza quando o mouse se move. */
export function ChartTooltip({
  rootSize,
  units,
  measure,
}: {
  rootSize: number;
  units: Units;
  measure: 'disk' | 'logical';
}) {
  const target = useTooltip(s => s.target);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    if (!target || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    let left = target.x + 16;
    let top = target.y + 16;
    if (left + r.width > innerWidth - 10) left = target.x - r.width - 16;
    if (top + r.height > innerHeight - 10) top = target.y - r.height - 16;
    setPos({ left, top });
  }, [target]);

  if (!target) return <div className="tooltip" ref={ref} />;
  const { node, parent } = target;
  const m = msg().charts.tooltip;
  const rows: [string, string][] = [[measure === 'disk' ? m.onDisk : m.size, formatBytes(node.size, units)]];
  if (node.cloudOnly) rows.push([m.inCloud, m.noDiskUsage]);
  else if (node.cloud > 0) rows.push([m.cloudOnly, formatBytes(node.cloud, units)]);
  if (parent) rows.push([m.pctOfFolder, formatPercent(node.size, parent.size)]);
  rows.push([m.pctOfScan, formatPercent(node.size, rootSize)]);
  if (node.kind === 'group') rows.push([m.groups, m.groupedItems(formatCount(node.groupedCount ?? 0))]);
  else if (node.kind === 'dir')
    rows.push([m.contents, msg().common.files(formatCount(node.files))], [m.modified, formatRelative(node.mtime)]);
  else rows.push([m.type, category(node.category).label], [m.modified, formatRelative(node.mtime)]);

  return (
    <div className="tooltip on" ref={ref} style={pos} role="tooltip">
      <div className="tt-name" style={{ '--c': categoryColor(node.category) } as CSSProperties}>
        <i />
        {nodeName(node)}
      </div>
      <div className="tt-grid" style={{ marginTop: 8 }}>
        {rows.map(([k, v]) => (
          <span key={k} style={{ display: 'contents' }}>
            <span>{k}</span>
            <b>{v}</b>
          </span>
        ))}
      </div>
      {node.kind === 'dir' && <div className="tt-hint">{m.hintDir}</div>}
      {node.kind === 'file' && <div className="tt-hint">{m.hintFile}</div>}
    </div>
  );
}
