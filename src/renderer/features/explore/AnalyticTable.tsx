import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { category } from '@shared/categories';
import { formatBytes, formatCount, formatPercent, formatRelative, type Units } from '@shared/format';
import { msg } from '@shared/i18n';
import type { NodeId, NodeInfo, SortKey } from '@shared/types';
import { api } from '../../api';
import { Bar } from '../../components/controls';
import { Icon } from '../../components/Icon';
import { nodeColor, type ColorMode } from '../../lib/colors';
import { useQuery } from '../../lib/useQuery';
import { useQueue } from '../../store/queueStore';
import { useHover } from '../../store/uiStore';

const PAGE = 300;
const NESTED_PAGE = 60;

/** Pedido de destaque vindo de "Mostrar no Explorar": `rank` = posição entre os irmãos. */
export interface TableFlash {
  id: NodeId;
  rank: number;
  nonce: number;
}

export interface AnalyticTableProps {
  rootId: NodeId;
  rootSize: number;
  /** Muda quando análise, versão da árvore ou medida mudam (invalida as consultas). */
  dataKey: string;
  filter: string;
  units: Units;
  colorMode: ColorMode;
  /** Índice de cor de cada filho direto, na mesma ordem usada pelo gráfico. */
  branchOf: Map<NodeId, number>;
  selectedId: NodeId | null;
  flash: TableFlash | null;
  onDrill(id: NodeId): void;
  onSelect(id: NodeId): void;
  onContext(item: NodeInfo, e: MouseEvent): void;
  onOpen(item: NodeInfo): void;
}

interface Handlers {
  drill(id: NodeId): void;
  select(id: NodeId): void;
  context(item: NodeInfo, e: MouseEvent): void;
  open(item: NodeInfo): void;
  toggle(id: NodeId): void;
}

const COLUMNS: { key: SortKey | 'pct'; numeric: boolean }[] = [
  { key: 'name', numeric: false },
  { key: 'size', numeric: true },
  { key: 'pct', numeric: true },
  { key: 'files', numeric: true },
  { key: 'mtime', numeric: true },
];

/** Rótulo de cada coluna, no idioma atual. */
function columnLabel(key: SortKey | 'pct'): string {
  const m = msg().explore.table;
  return { name: m.colName, size: m.colSize, pct: '%', files: m.colItems, mtime: m.colModified }[key];
}

/**
 * Tabela em árvore: cada nível expandido busca seus filhos sob demanda (paginado). As linhas são
 * memorizadas e assinam o destaque individualmente, então passar o mouse no gráfico não
 * re-renderiza a tabela inteira.
 */
export function AnalyticTable(p: AnalyticTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'size', dir: 'desc' });
  const [expanded, setExpanded] = useState<Set<NodeId>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [prevRoot, setPrevRoot] = useState(p.rootId);
  if (prevRoot !== p.rootId) {
    setPrevRoot(p.rootId);
    setExpanded(new Set());
    setLimit(PAGE);
  }
  // Garante que o item destacado esteja entre as linhas carregadas (pastas com milhares de itens).
  const [prevFlash, setPrevFlash] = useState<TableFlash | null>(null);
  if (p.flash !== prevFlash) {
    setPrevFlash(p.flash);
    if (p.flash) {
      setSort({ key: 'size', dir: 'desc' });
      if (p.flash.rank >= limit) setLimit(Math.ceil((p.flash.rank + 50) / PAGE) * PAGE);
    }
  }

  const latest = useRef(p);
  latest.current = p;
  const handlers = useMemo<Handlers>(
    () => ({
      drill: id => latest.current.onDrill(id),
      select: id => latest.current.onSelect(id),
      context: (item, e) => latest.current.onContext(item, e),
      open: item => latest.current.onOpen(item),
      toggle: id =>
        setExpanded(s => {
          const next = new Set(s);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
    }),
    [],
  );

  const sortBy = (key: SortKey | 'pct') => {
    const k: SortKey = key === 'pct' ? 'size' : key;
    setSort(s => ({ key: k, dir: s.key === k ? (s.dir === 'asc' ? 'desc' : 'asc') : k === 'name' ? 'asc' : 'desc' }));
  };

  const m = msg().explore.table;
  return (
    <div className="tbl-scroll" onMouseLeave={() => useHover.getState().set(null)}>
      <table className="tbl" aria-label={m.label}>
        <thead>
          <tr>
            {COLUMNS.map(c => {
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  className={`${active ? 'sorted' : ''} ${c.numeric ? 'num' : ''}`}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  onClick={() => sortBy(c.key)}
                >
                  {columnLabel(c.key)}
                  {active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              );
            })}
            <th aria-label={m.actions} />
          </tr>
        </thead>
        <tbody>
          <Rows
            {...p}
            parentId={p.rootId}
            parentSize={p.rootSize}
            depth={0}
            branch={-1}
            sort={sort}
            limit={limit}
            expanded={expanded}
            handlers={handlers}
            onMore={() => setLimit(l => l + PAGE)}
          />
        </tbody>
      </table>
    </div>
  );
}

interface RowsProps extends AnalyticTableProps {
  parentId: NodeId;
  parentSize: number;
  depth: number;
  branch: number;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  limit: number;
  expanded: Set<NodeId>;
  handlers: Handlers;
  onMore?: () => void;
}

function Rows(p: RowsProps) {
  const limit = p.depth === 0 ? p.limit : NESTED_PAGE;
  const filter = p.depth === 0 ? p.filter.trim() : '';
  const { data, error } = useQuery(['children', p.dataKey, p.parentId, p.sort, filter, limit], () =>
    api().query('children', {
      id: p.parentId,
      sort: p.sort.key,
      direction: p.sort.dir,
      filter: filter || undefined,
      offset: 0,
      limit,
    }),
  );
  const queued = useQueue(s => s.items);
  const m = msg().explore.table;

  if (error)
    return (
      <tr>
        <td colSpan={6} className="empty">
          {error.message}
        </td>
      </tr>
    );
  if (!data) {
    return p.depth === 0 ? (
      <tr>
        <td colSpan={6}>
          <div className="loading-shimmer" style={{ height: 28, margin: '8px 0' }} />
        </td>
      </tr>
    ) : null;
  }
  if (!data.items.length && p.depth === 0) {
    return (
      <tr>
        <td colSpan={6} className="empty">
          {filter ? m.nothingFound(filter) : m.emptyFolder}
        </td>
      </tr>
    );
  }

  return (
    <>
      {data.items.map((item, i) => {
        const branch = p.depth === 0 ? (p.branchOf.get(item.id) ?? -1) : p.branch;
        const color = nodeColor(
          p.colorMode,
          item.category,
          Math.max(0, branch),
          p.colorMode === 'folder' && branch < 0,
        );
        const open = p.expanded.has(item.id);
        const flashing = p.flash?.id === item.id;
        return (
          <FragmentRow key={flashing ? `${item.id}-${p.flash?.nonce}` : item.id}>
            <Row
              item={item}
              depth={p.depth}
              index={i}
              color={color}
              parentSize={p.parentSize}
              units={p.units}
              open={open}
              selected={p.selectedId === item.id}
              flashing={flashing}
              queued={queued.some(q => q.id === item.id)}
              handlers={p.handlers}
            />
            {open && (
              <Rows
                {...p}
                parentId={item.id}
                parentSize={item.size}
                depth={p.depth + 1}
                branch={branch}
                onMore={undefined}
              />
            )}
          </FragmentRow>
        );
      })}
      {data.total > data.items.length && (
        <tr className="more">
          <td colSpan={6} style={{ padding: 0, paddingLeft: p.depth * 18 }}>
            {p.onMore ? (
              <button type="button" className="load-more" onClick={p.onMore}>
                {m.showMore(
                  formatCount(Math.min(PAGE, data.total - data.items.length)),
                  formatCount(data.total - data.items.length),
                )}
              </button>
            ) : (
              <span style={{ display: 'block', padding: '10px 36px' }}>
                {m.andMoreSmaller(formatCount(data.total - data.items.length))}
              </span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

interface RowProps {
  item: NodeInfo;
  depth: number;
  index: number;
  color: string;
  parentSize: number;
  units: Units;
  open: boolean;
  selected: boolean;
  flashing: boolean;
  queued: boolean;
  handlers: Handlers;
}

const Row = memo(function Row({
  item,
  depth,
  index,
  color,
  parentSize,
  units,
  open,
  selected,
  flashing,
  queued,
  handlers,
}: RowProps) {
  const highlighted = useHover(s => s.id === item.id);
  const ref = useRef<HTMLTableRowElement>(null);
  const isDir = item.kind === 'dir';
  useEffect(() => {
    if (flashing) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [flashing]);

  const cls = ['r', selected ? 'sel' : '', highlighted ? 'hl' : '', flashing ? 'flash' : ''].join(' ');
  const m = msg().explore.table;
  return (
    <tr
      ref={ref}
      className={cls}
      data-id={item.id}
      style={{ animationDelay: flashing ? undefined : `${Math.min(index * 18, 360)}ms` }}
      onMouseEnter={() => useHover.getState().set(item.id)}
      onClick={() => handlers.select(item.id)}
      onDoubleClick={() => (isDir ? handlers.drill(item.id) : handlers.open(item))}
      onContextMenu={e => {
        e.preventDefault();
        handlers.context(item, e);
      }}
    >
      <td>
        <div className="nm" style={{ paddingLeft: depth * 18, '--c': color } as CSSProperties}>
          <button
            type="button"
            className={`caret ${isDir && item.childCount ? (open ? 'open' : '') : 'none'}`}
            aria-label={open ? m.collapse : m.expand}
            aria-expanded={open}
            tabIndex={isDir && item.childCount ? 0 : -1}
            onClick={e => {
              e.stopPropagation();
              handlers.toggle(item.id);
            }}
          >
            <Icon name="chev-r" />
          </button>
          <Icon name={isDir ? 'folder' : category(item.category).icon} />
          <span
            className={`t ${isDir ? 'link' : ''}`}
            onClick={e => {
              if (!isDir) return;
              e.stopPropagation();
              handlers.drill(item.id);
            }}
          >
            {item.name}
          </span>
          <CloudTag item={item} units={units} />
          <LinkTag item={item} units={units} />
          {queued && (
            <span className="pill safe" title={m.inCleanupQueue}>
              <Icon name="sparkles" />
            </span>
          )}
        </div>
      </td>
      <td>
        <div className="sizecell">
          <Bar percent={(item.size / (parentSize || 1)) * 100} color={color} />
          <b>{formatBytes(item.size, units)}</b>
        </div>
      </td>
      <td className="num">{formatPercent(item.size, parentSize)}</td>
      <td className="num">{isDir ? formatCount(item.files) : '—'}</td>
      <td className="num">{formatRelative(item.mtime)}</td>
      <td className="acts">
        <button
          type="button"
          className="btn sm icon ghost"
          aria-label={m.actionsFor(item.name)}
          onClick={e => {
            e.stopPropagation();
            handlers.context(item, e);
          }}
        >
          <Icon name="more" />
        </button>
      </td>
    </tr>
  );
});

/** Indica conteúdo que está só na nuvem (não ocupa disco). */
export function CloudTag({
  item,
  units,
}: {
  item: Pick<NodeInfo, 'cloudOnly' | 'cloud' | 'logical' | 'kind'>;
  units: Units;
}) {
  const m = msg().explore.tags;
  if (item.cloudOnly) {
    return (
      <span className="cloud-tag" title={m.cloudOnlyTitle(formatBytes(item.logical, units))}>
        <Icon name="cloud" />
        {m.cloud}
      </span>
    );
  }
  if (item.kind === 'dir' && item.cloud > 0) {
    return (
      <span className="cloud-tag" title={m.cloudPartTitle(formatBytes(item.cloud, units))}>
        <Icon name="cloud" />
        {formatBytes(item.cloud, units)}
      </span>
    );
  }
  return null;
}

/** Indica conteúdo com hard links (ex.: pnpm): remover este item não libera esses bytes. */
export function LinkTag({ item, units }: { item: Pick<NodeInfo, 'shared' | 'disk' | 'kind'>; units: Units }) {
  if (item.shared <= 0) return null;
  const m = msg().explore.tags;
  const all = item.shared >= item.disk;
  return (
    <span className="cloud-tag" title={all ? m.hardLinkAllTitle : m.hardLinkPartTitle(formatBytes(item.shared, units))}>
      <Icon name="link" />
      {item.kind === 'dir' ? formatBytes(item.shared, units) : m.link}
    </span>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
