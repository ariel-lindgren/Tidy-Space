import { useMemo, useState, type CSSProperties } from 'react';
import { formatBytes, formatPercent } from '@shared/format';
import { msg } from '@shared/i18n';
import type { TreeViewNode } from '@shared/types';
import { nodeColor } from '../lib/colors';
import { useTween } from '../lib/hooks';
import { useHover } from '../store/uiStore';
import { arcPath, partition, type Arc } from './layout';
import { nodeName, type ChartProps } from './types';

const R0 = 26;
const R1 = 98;
const DEPTH = 4;
const RING = (R1 - R0) / DEPTH;

export function Sunburst(p: ChartProps) {
  const arcs = useMemo(() => partition(p.view, DEPTH, 0.006), [p.view]);
  const t = useTween(p.view, p.direction === 'up' ? 520 : 760, p.animate);
  const [hover, setHover] = useState<Arc<TreeViewNode> | null>(null);
  const highlightId = useHover(s => s.id);

  // Cadeia do item sob o mouse até a raiz, para destacar o "caminho".
  const focus = useMemo(() => {
    if (!hover) return null;
    const byItem = new Map(arcs.map(a => [a.item, a]));
    const chain = new Set<TreeViewNode>();
    for (let a: Arc<TreeViewNode> | undefined = hover; a; a = a.parent ? byItem.get(a.parent) : undefined)
      chain.add(a.item);
    return chain;
  }, [hover, arcs]);

  const m = msg().charts;
  const center = hover?.item ?? p.view;
  const centerName = nodeName(center);
  const sub = hover
    ? m.shareOfFolder(formatPercent(hover.item.size, p.view.size))
    : p.canGoUp
      ? m.clickToGoUp
      : m.scanRoot;
  const svgClass = ['sb', focus ? 'focus' : '', !focus && highlightId !== null ? 'focus-hl' : ''].join(' ');

  return (
    <div className="chart" onMouseLeave={() => (setHover(null), p.onHover(null, null))}>
      <svg className={svgClass} viewBox="-100 -100 200 200" role="img" aria-label={m.sunburstOf(p.view.name)}>
        <g>
          {arcs.map((a, i) => {
            const r0 = R0 + (a.depth - 1) * RING + 0.4;
            const grow = Math.min(1, Math.max(0, t * 1.6 - (a.depth - 1) * 0.18));
            const r1 = r0 + (RING - 0.8) * grow + 0.01;
            const cls = [
              'sb-arc',
              `d${a.depth}`,
              focus?.has(a.item) ? 'on' : '',
              highlightId !== null && a.item.id === highlightId ? 'hl' : '',
            ].join(' ');
            return (
              <path
                key={a.item.id ?? `g${i}`}
                className={cls}
                d={arcPath(r0, r1, a.a0 * t, a.a1 * t)}
                style={
                  { '--c': nodeColor(p.colorMode, a.item.category, a.branch, a.item.kind === 'group') } as CSSProperties
                }
                onMouseMove={e => {
                  setHover(a);
                  p.onHover(a.item, a.parent, e);
                }}
                onClick={() => {
                  if (a.item.id === null) return;
                  p.onHover(null, null);
                  if (a.item.kind === 'dir') p.onDrill(a.item.id);
                  else p.onSelect(a.item);
                }}
                onContextMenu={e => {
                  e.preventDefault();
                  if (a.item.id !== null) p.onContext(a.item, e);
                }}
              />
            );
          })}
        </g>
        <g className="sb-center" onClick={() => p.canGoUp && p.onUp()} role="button" aria-label={m.goUp}>
          <circle r={R0 - 2} />
          <text className="sb-t1" y={-3}>
            {centerName.length > 18 ? `${centerName.slice(0, 17)}…` : centerName}
          </text>
          <text className="sb-t2" y={7}>
            {formatBytes(center.size, p.units)}
          </text>
          <text className="sb-t3" y={15}>
            {sub}
          </text>
        </g>
      </svg>
    </div>
  );
}
