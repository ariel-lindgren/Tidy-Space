import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { category } from '@shared/categories';
import { formatBytes, formatCount, formatRelative, type Units } from '@shared/format';
import { getLocale, msg } from '@shared/i18n';
import type { NodeId, Suggestion, TopItem } from '@shared/types';
import { api } from '../../api';
import { Checkbox, ErrorBox } from '../../components/controls';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { categoryColor } from '../../lib/colors';
import { scanKey, useQuery } from '../../lib/useQuery';
import { useApp } from '../../store/appStore';

type SortKey = 'path' | 'mtime' | 'size';

const MIN_COL = 220;
const DEFAULT_COL = 560;

/**
 * Revisão dos itens de uma sugestão: lista completa (não só a prévia do card), filtro,
 * marcar/desmarcar todos, coluna de caminho redimensionável e janela redimensionável.
 */
export function ReviewModal({
  suggestion,
  units,
  onAdd,
  onClose,
}: {
  suggestion: Suggestion;
  units: Units;
  onAdd(items: TopItem[]): void;
  onClose(): void;
}) {
  const summary = useApp(s => s.summary);
  const items = useQuery(summary ? ['suggestion-items', scanKey(summary), suggestion.id] : null, () =>
    api().query('suggestionItems', { id: suggestion.id }),
  );
  const all = items.data;
  const [selected, setSelected] = useState<Set<NodeId> | null>(null);
  const [filter, setFilter] = useState('');
  const [colWidth, setColWidth] = useState(DEFAULT_COL);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Começa ocupando a largura disponível (as outras colunas têm 280 px no total).
  useLayoutEffect(() => {
    const width = listRef.current?.clientWidth ?? 0;
    if (width) setColWidth(Math.max(DEFAULT_COL, width - 280 - 2));
  }, []);

  // Tudo marcado por padrão, assim que a lista chega.
  const chosenIds = selected ?? new Set(all?.map(i => i.id) ?? []);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'size', dir: -1 });
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? (all ?? []).filter(i => i.path.toLowerCase().includes(q)) : [...(all ?? [])];
    const collator = new Intl.Collator(getLocale(), { numeric: true, sensitivity: 'base' });
    const value = (i: TopItem) => (sort.key === 'size' ? i.size : i.mtime);
    return list.sort((a, b) =>
      sort.key === 'path' ? sort.dir * collator.compare(a.path, b.path) : sort.dir * (value(a) - value(b)),
    );
  }, [all, filter, sort]);
  // Primeiro clique: caminho A→Z, datas e tamanhos do maior/mais recente para o menor/mais antigo.
  const sortBy = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'path' ? 1 : -1 }));
  const sortHeader = (key: SortKey, label: string) => {
    const active = sort.key === key;
    return {
      className: active ? 'sorted' : '',
      'aria-sort': active ? (sort.dir === 1 ? ('ascending' as const) : ('descending' as const)) : undefined,
      onClick: () => sortBy(key),
      children: `${label}${active ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}`,
    };
  };
  const visibleSelected = visible.filter(i => chosenIds.has(i.id)).length;
  const chosen = (all ?? []).filter(i => chosenIds.has(i.id));

  const update = (fn: (s: Set<NodeId>) => void) =>
    setSelected(() => {
      const next = new Set(chosenIds);
      fn(next);
      return next;
    });
  const m = msg().cleanup;
  const toggle = (id: NodeId) => update(s => (s.has(id) ? s.delete(id) : s.add(id)));
  const selectVisible = (on: boolean) => update(s => visible.forEach(i => (on ? s.add(i.id) : s.delete(i.id))));

  // Arraste acompanhado na janela inteira: o ponteiro pode sair da alça (ou da tabela) sem soltar.
  const onResizeStart = (e: PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { x: e.clientX, width: colWidth };
    const move = (ev: globalThis.PointerEvent) => {
      if (drag.current) setColWidth(Math.max(MIN_COL, drag.current.width + ev.clientX - drag.current.x));
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    document.body.style.cursor = 'col-resize';
  };

  return (
    <Modal onClose={onClose} label={suggestion.title} className="modal-review">
      <div className="modal-head">
        <div className="grow">
          <div className="eyebrow">{m.risk[suggestion.risk]}</div>
          <div className="h2" style={{ fontSize: 18, marginTop: 4 }}>
            {suggestion.title}
          </div>
          <p className="sub">{suggestion.description}</p>
        </div>
        <button type="button" className="btn ghost icon" aria-label={msg().common.close} onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>

      <div className="review-toolbar">
        <div className="input-icon grow">
          <Icon name="search" />
          <input
            className="input"
            style={{ width: '100%', height: 32 }}
            placeholder={m.filterByPath}
            aria-label={m.filterByPath}
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <button type="button" className="btn sm" disabled={!visible.length} onClick={() => selectVisible(true)}>
          <Icon name="check" /> {filter ? m.selectFiltered : m.selectAll}
        </button>
        <button type="button" className="btn sm" disabled={!visibleSelected} onClick={() => selectVisible(false)}>
          <Icon name="x" /> {filter ? m.deselectFiltered : m.deselectAll}
        </button>
      </div>

      <div className="panel review-list" ref={listRef}>
        {items.error && <ErrorBox error={items.error} />}
        {!all && !items.error && <div className="loading-shimmer" style={{ height: 36, margin: 8 }} />}
        {all && (
          <table className="tbl review-tbl" style={{ width: 40 + colWidth + 120 + 120 }} aria-label={m.tableLabel}>
            <colgroup>
              <col style={{ width: 40 }} />
              <col style={{ width: colWidth }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <Checkbox
                    checked={visible.length > 0 && visibleSelected === visible.length}
                    indeterminate={visibleSelected > 0 && visibleSelected < visible.length}
                    label={visibleSelected === visible.length ? m.deselectAll : m.selectAll}
                    onChange={() => selectVisible(visibleSelected !== visible.length)}
                  />
                </th>
                {(() => {
                  const { children, className, ...rest } = sortHeader('path', m.colItem);
                  return (
                    <th className={`resizable ${className}`} {...rest}>
                      {children}
                      <span
                        className="col-resize"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={m.resizeColumn}
                        title={m.resizeHint}
                        // A alça fica dentro do cabeçalho: não deve disparar a ordenação.
                        onClick={e => e.stopPropagation()}
                        onPointerDown={onResizeStart}
                        onDoubleClick={e => {
                          e.stopPropagation();
                          setColWidth(DEFAULT_COL);
                        }}
                      />
                    </th>
                  );
                })()}
                {(() => {
                  const { className, ...rest } = sortHeader('mtime', m.colModified);
                  return <th className={`num ${className}`} {...rest} />;
                })()}
                {(() => {
                  const { className, ...rest } = sortHeader('size', m.colSize);
                  return <th className={`num ${className}`} {...rest} />;
                })()}
              </tr>
            </thead>
            <tbody>
              {visible.map(n => (
                <tr
                  key={n.id}
                  className={`r noanim ${chosenIds.has(n.id) ? 'sel' : ''}`}
                  style={{ cursor: 'pointer', animation: 'none' }}
                  onClick={() => toggle(n.id)}
                >
                  <td>
                    <Checkbox checked={chosenIds.has(n.id)} label={n.path} onChange={() => toggle(n.id)} />
                  </td>
                  <td title={n.path}>
                    <div className="nm" style={{ '--c': categoryColor(n.category), maxWidth: 'none' } as CSSProperties}>
                      <Icon name={n.kind === 'dir' ? 'folder' : category(n.category).icon} />
                      <span className="t">{n.name}</span>
                    </div>
                    {/* O fim do caminho (nome do projeto) é o que interessa: reticências no começo. */}
                    <div className="path-cell path-tail">
                      <bdi dir="ltr">{n.parentPath}</bdi>
                    </div>
                  </td>
                  <td className="num">{formatRelative(n.mtime)}</td>
                  <td className="num" style={{ color: 'var(--text)' }}>
                    {formatBytes(n.size, units)}
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={4} className="empty">
                    {m.noMatch}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="modal-foot">
        <span className="grow muted" style={{ alignSelf: 'center' }}>
          {m.selectedSummary(
            formatCount(chosen.length),
            formatCount(all?.length ?? suggestion.itemCount),
            formatBytes(
              chosen.reduce((a, n) => a + n.size, 0),
              units,
            ),
          )}
        </span>
        <button type="button" className="btn ghost" onClick={onClose}>
          {msg().common.close}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!chosen.length}
          onClick={() => {
            onAdd(chosen);
            onClose();
          }}
        >
          <Icon name="plus" /> {m.addSelected}
        </button>
      </div>
    </Modal>
  );
}
