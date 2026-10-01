import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { formatBytes, type Units } from '@shared/format';
import { msg } from '@shared/i18n';
import type { TreeViewNode } from '@shared/types';
import { nodeColor, type ColorMode } from '../lib/colors';
import { useElementSize } from '../lib/hooks';
import { useHover } from '../store/uiStore';
import { squarify, type Tile as TileRect } from './layout';
import { nodeName, type ChartProps } from './types';

const ZOOM_MS = 420;

interface TileProps {
  tile: TileRect<TreeViewNode>;
  index: number;
  parent: TreeViewNode;
  colorMode: ColorMode;
  units: Units;
  zoom: 'none' | 'self' | 'other';
  box: { width: number; height: number };
  events: TileEvents;
}

interface TileEvents {
  activate(node: TreeViewNode, topId: number | null): void;
  hover(node: TreeViewNode, parent: TreeViewNode, e: MouseEvent): void;
  context(node: TreeViewNode, e: MouseEvent): void;
}

/** Um bloco (e seus sub-blocos). Só re-renderiza quando o próprio destaque muda. */
const Tile = memo(function Tile({ tile: t, index: i, parent, colorMode, units, zoom, box, events }: TileProps) {
  const n = t.item;
  const highlighted = useHover(s => s.id !== null && s.id === n.id);
  const subHighlight = useHover(s => (s.id !== null && n.children?.some(c => c.id === s.id) ? s.id : null));
  const color = nodeColor(colorMode, n.category, i, n.kind === 'group');
  const rect =
    zoom === 'self'
      ? { left: 0, top: 0, width: box.width, height: box.height }
      : { left: t.x, top: t.y, width: t.w, height: t.h };
  const subs =
    n.kind === 'dir' && n.children && t.w > 120 && t.h > 90
      ? squarify(n.children, { x: 0, y: 0, w: t.w - 10, h: t.h - 38 })
      : [];
  const cls = [
    'tm-tile',
    n.kind === 'dir' ? 'is-dir' : n.kind === 'group' ? 'is-group' : 'is-file',
    subs.length ? 'has-inner' : '',
    zoom === 'self' ? 'zooming' : zoom === 'other' ? 'fade' : '',
    highlighted ? 'hl' : '',
  ].join(' ');
  return (
    <div
      className={cls}
      data-id={n.id ?? undefined}
      style={{ ...rect, '--c': color, '--d': `${Math.min(i * 22, 420)}ms` } as CSSProperties}
      onMouseMove={e => events.hover(n, parent, e)}
      onClick={() => events.activate(n, n.id)}
      onContextMenu={e => events.context(n, e)}
    >
      {t.w > 70 && t.h > 34 && (
        <div className="tm-label">
          <b>{nodeName(n)}</b>
          <em>{formatBytes(n.size, units)}</em>
        </div>
      )}
      {subs.length > 0 && (
        <div className="tm-inner">
          {subs.map((s, j) => (
            <div
              key={s.item.id ?? `g${j}`}
              className={`tm-sub ${subHighlight !== null && subHighlight === s.item.id ? 'hl' : ''}`}
              style={
                {
                  left: s.x,
                  top: s.y,
                  width: s.w,
                  height: s.h,
                  '--c': nodeColor(colorMode, s.item.category, i, s.item.kind === 'group'),
                } as CSSProperties
              }
              onMouseMove={e => events.hover(s.item, n, e)}
              onClick={e => {
                e.stopPropagation();
                events.activate(s.item.kind === 'dir' ? s.item : n, n.id);
              }}
              onContextMenu={e => events.context(s.item, e)}
            >
              {s.w > 64 && s.h > 22 && <span>{nodeName(s.item)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export function Treemap(p: ChartProps) {
  const [ref, { width, height }] = useElementSize<HTMLDivElement>();
  const [zoomId, setZoomId] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => setZoomId(null), [p.view]);

  const tiles = useMemo(
    () => squarify(p.view.children ?? [], { x: 0, y: 0, w: width, h: height }),
    [p.view, width, height],
  );

  const latest = useRef(p);
  latest.current = p;
  const zoomRef = useRef(zoomId);
  zoomRef.current = zoomId;
  const events = useMemo<TileEvents>(
    () => ({
      activate: (node, topId) => {
        const cur = latest.current;
        // O grupo "itens menores" (id nulo) é inerte; nada acontece durante um zoom.
        if (node.id === null || zoomRef.current !== null) return;
        if (node.kind !== 'dir') return cur.onSelect(node);
        cur.onHover(null, null);
        if (!cur.animate) return cur.onDrill(node.id);
        setZoomId(topId ?? node.id);
        const id = node.id;
        timer.current = setTimeout(() => latest.current.onDrill(id), ZOOM_MS);
      },
      hover: (node, parent, e) => {
        e.stopPropagation();
        latest.current.onHover(node, parent, e);
      },
      context: (node, e) => {
        e.preventDefault();
        e.stopPropagation();
        if (node.id !== null) latest.current.onContext(node, e);
      },
    }),
    [],
  );

  const stage = p.animate ? (p.direction === 'up' ? 'up' : 'enter') : 'static';
  const box = useMemo(() => ({ width, height }), [width, height]);
  return (
    <div
      className="chart"
      ref={ref}
      onMouseLeave={() => p.onHover(null, null)}
      role="img"
      aria-label={msg().charts.treemapOf(p.view.name)}
    >
      {width > 0 && !tiles.length && <div className="chart-empty">{msg().charts.emptyFolder}</div>}
      <div className={`tm-stage ${stage}`} key={String(p.view.id)}>
        {tiles.map((t, i) => (
          <Tile
            key={t.item.id ?? `g${i}`}
            tile={t}
            index={i}
            parent={p.view}
            colorMode={p.colorMode}
            units={p.units}
            // Com o zoom inativo, nenhum bloco (nem o grupo de id nulo) fica em estado de zoom.
            zoom={zoomId === null ? 'none' : zoomId === t.item.id ? 'self' : 'other'}
            box={box}
            events={events}
          />
        ))}
      </div>
    </div>
  );
}
