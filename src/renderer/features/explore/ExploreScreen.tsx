import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import { category } from '@shared/categories';
import { formatBytes, formatCount, formatPercent } from '@shared/format';
import { msg } from '@shared/i18n';
import type { NodeId, NodeInfo, TreeViewNode } from '@shared/types';
import { api } from '../../api';
import { ChartTooltip } from '../../charts/ChartTooltip';
import { Sunburst } from '../../charts/Sunburst';
import { Treemap } from '../../charts/Treemap';
import { useTooltip, type ChartProps } from '../../charts/types';
import { ErrorBox, Segmented } from '../../components/controls';
import { Icon } from '../../components/Icon';
import { categoryColor, paletteColor } from '../../lib/colors';
import { useHotkey } from '../../lib/hooks';
import { useQuery } from '../../lib/useQuery';
import { useApp } from '../../store/appStore';
import { useSettings } from '../../store/settingsStore';
import { toast, useHover, useOverlay } from '../../store/uiStore';
import { AnalyticTable, type TableFlash } from './AnalyticTable';

const VIEW_PARAMS = {
  treemap: { depth: 2, maxChildren: 60, minFraction: 0.0015 },
  sunburst: { depth: 4, maxChildren: 40, minFraction: 0.002 },
} as const;

export function ExploreScreen() {
  const summary = useApp(s => s.summary);
  const currentId = useApp(s => s.currentId);
  const flash = useApp(s => s.flash);
  const explore = useApp(s => s.explore);
  const patchExplore = useApp(s => s.patchExplore);
  const go = useApp(s => s.go);
  const settings = useSettings(s => s.settings);
  const openMenu = useOverlay(s => s.openMenu);
  const units = settings?.units ?? 'binary';
  const animate = settings?.motion === 'full';
  // Tudo que invalida as consultas: análise aberta, alterações na árvore e medida escolhida.
  const dataKey = summary ? `${summary.id}|${summary.treeVersion}|${summary.measure}` : '';

  const [direction, setDirection] = useState<'down' | 'up'>('down');
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<NodeId | null>(null);
  const [tableFlash, setTableFlash] = useState<TableFlash | null>(null);

  const details = useQuery(summary ? ['details', dataKey, currentId] : null, () =>
    api().query('details', { id: currentId }),
  );
  const params = VIEW_PARAMS[explore.chart];
  const view = useQuery(summary ? ['view', dataKey, currentId, explore.chart] : null, () =>
    api().query('view', { id: currentId, ...params }),
  );

  // O item atual pode ter sido removido (limpeza) — volta para a raiz.
  useEffect(() => {
    if (details.error && summary && currentId !== summary.rootId) useApp.setState({ currentId: summary.rootId });
  }, [details.error, summary, currentId]);

  // "Mostrar no Explorar": descobre a posição do item, rola a tabela até ele, seleciona e pisca.
  useEffect(() => {
    if (!flash) return;
    let alive = true;
    api()
      .query('rankOf', { id: flash.id })
      .then(rank => {
        if (!alive) return;
        setFilter('');
        setSelectedId(flash.id);
        setTableFlash({ id: flash.id, rank, nonce: flash.nonce });
        useHover.getState().set(flash.id);
        setTimeout(() => useHover.getState().id === flash.id && useHover.getState().set(null), 2500);
      })
      .catch(err => toast(msg().explore.locateFailed(String(err)), 'alert'));
    return () => {
      alive = false;
    };
  }, [flash]);

  const navigate = (id: NodeId, dir: 'down' | 'up') => {
    setDirection(dir);
    setSelectedId(dir === 'up' ? currentId : null);
    setFilter('');
    setTableFlash(null);
    useTooltip.getState().set(null);
    useApp.setState({ currentId: id });
  };
  const parentId = details.data?.node.parentId ?? null;
  const canUp = !!summary && currentId !== summary.rootId && parentId !== null;
  const up = () => canUp && parentId !== null && navigate(parentId, 'up');

  useHotkey(
    e => e.key === 'Backspace' || (e.altKey && e.key === 'ArrowLeft'),
    e => {
      e.preventDefault();
      up();
    },
  );
  useHotkey(
    e => e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey && !e.altKey,
    () => patchExplore({ chart: explore.chart === 'treemap' ? 'sunburst' : 'treemap' }),
  );

  const branchOf = useMemo(
    () => new Map((view.data?.children ?? []).filter(c => c.id !== null).map((c, i) => [c.id as NodeId, i])),
    [view.data],
  );

  const contextFor = (
    item: Pick<NodeInfo, 'id' | 'name' | 'kind' | 'size' | 'cloudOnly'> & { logical?: number },
    parent: NodeId | null,
    e: MouseEvent,
  ) =>
    openMenu(e.clientX, e.clientY, {
      id: item.id,
      name: item.name,
      kind: item.kind,
      size: item.size,
      parentId: parent,
      cloudOnly: item.cloudOnly,
      ...(item.logical !== undefined ? { logical: item.logical } : {}),
    });

  const chartProps: ChartProps | null = view.data
    ? {
        view: view.data,
        colorMode: explore.colorMode,
        animate,
        direction,
        units,
        canGoUp: canUp,
        onDrill: id => navigate(id, 'down'),
        onUp: up,
        onSelect: n => n.id !== null && setSelectedId(n.id),
        onHover: (node, parent, e) => {
          useTooltip.getState().set(node && e ? { node, parent, x: e.clientX, y: e.clientY } : null);
          useHover.getState().set(node?.id ?? null);
        },
        onContext: (node: TreeViewNode, e) =>
          node.id !== null &&
          contextFor({ ...node, id: node.id, kind: node.kind === 'group' ? 'other' : node.kind }, currentId, e),
      }
    : null;

  if (!summary) return null;
  const m = msg().explore;
  const d = details.data;
  const legendItems =
    explore.colorMode === 'type' ? null : (view.data?.children ?? []).filter(c => c.id !== null).slice(0, 7);

  return (
    <div className="explore">
      <div className="ex-head">
        <button
          type="button"
          className="btn icon"
          onClick={up}
          disabled={!canUp}
          style={{ opacity: canUp ? 1 : 0.4 }}
          aria-label={m.goUp}
          title={m.goUpHint}
        >
          <Icon name="arrow-up" />
        </button>
        <nav className="crumbs" aria-label={m.breadcrumbs}>
          {d?.trail.map((c, i) => (
            <span key={c.id} style={{ display: 'contents' }}>
              {i > 0 && <Icon name="chev-r" />}
              <button
                type="button"
                className="crumb-in"
                aria-current={c.id === currentId ? 'location' : undefined}
                onClick={() => c.id !== currentId && navigate(c.id, 'up')}
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>
        <Segmented
          label={m.layout}
          value={explore.layout}
          onChange={layout => patchExplore({ layout })}
          options={[
            { value: 'chart', icon: 'pie', label: m.layoutChart },
            { value: 'split', icon: 'columns', label: m.layoutSplit },
            { value: 'table', icon: 'list', label: m.layoutTable },
          ]}
        />
        <button
          type="button"
          className="btn"
          title={m.rescan}
          aria-label={m.rescan}
          onClick={() => void useApp.getState().startScan(summary.rootPath)}
        >
          <Icon name="refresh" />
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void exportCsv(currentId, d?.node.name ?? msg().common.folder, units)}
        >
          <Icon name="download" /> {m.exportCsv}
        </button>
      </div>

      <div className="kpis stagger">
        <div className="panel kpi">
          <span>{summary.measure === 'disk' ? m.kpi.onDisk : m.kpi.logicalSize}</span>
          <b>{d ? formatBytes(d.node.size, units) : '—'}</b>
          <em title={d && d.node.cloud > 0 ? m.kpi.cloudHint : undefined}>
            {d && d.node.cloud > 0 ? (
              <>
                <Icon name="cloud" /> {m.kpi.cloudOnly(formatBytes(d.node.cloud, units))}
              </>
            ) : d && d.node.shared > 0 ? (
              <span title={m.kpi.hardLinksHint}>
                <Icon name="link" /> {m.kpi.hardLinks(formatBytes(d.node.shared, units))}
              </span>
            ) : d && summary.volume ? (
              m.kpi.ofDisk(formatPercent(d.node.disk, summary.volume.total))
            ) : (
              m.kpi.ofScan(formatPercent(d?.node.size ?? 0, summary.size))
            )}
          </em>
        </div>
        <div className="panel kpi">
          <span>{m.kpi.contents}</span>
          <b>{d ? formatCount(d.node.files) : '—'}</b>
          <em>{m.kpi.filesInFolders(d ? formatCount(d.node.dirs) : '—')}</em>
        </div>
        <div className="panel kpi">
          <span>{m.kpi.largestFile}</span>
          <b>{d?.largestFile ? formatBytes(d.largestFile.size, units) : '—'}</b>
          <em title={d?.largestFile?.path}>{d?.largestFile?.name ?? m.kpi.none}</em>
        </div>
        <div className="panel kpi">
          <span>{m.kpi.dominantType}</span>
          <b style={{ color: d ? categoryColor(d.dominant.category) : undefined }}>
            {d ? category(d.dominant.category).label : '—'}
          </b>
          <em>{d ? m.kpi.ofVolume(formatPercent(d.dominant.share, 1)) : ''}</em>
        </div>
        <button
          type="button"
          className="panel kpi"
          style={{ textAlign: 'left', cursor: 'pointer' }}
          onClick={() => go('clean')}
        >
          <span>{m.kpi.reclaimable}</span>
          <b style={{ color: 'var(--ok)' }}>{d ? formatBytes(d.reclaimable, units) : '—'}</b>
          <em>{m.kpi.seeSuggestions}</em>
        </button>
      </div>

      <div className={`ex-body l-${explore.layout}`}>
        <div className="panel chart-panel">
          <div className="panel-head">
            <Segmented
              label={m.chartType}
              value={explore.chart}
              onChange={chart => patchExplore({ chart })}
              options={[
                { value: 'treemap', icon: 'grid', label: 'Treemap' },
                { value: 'sunburst', icon: 'sun', label: 'Sunburst' },
              ]}
            />
            <div className="grow" />
            <span className="muted" style={{ fontSize: 12 }}>
              {m.color}
            </span>
            <Segmented
              label={m.colorBy}
              value={explore.colorMode}
              onChange={colorMode => patchExplore({ colorMode })}
              options={[
                { value: 'folder', label: m.byFolder },
                { value: 'type', label: m.byType },
              ]}
            />
          </div>
          <div className="chart-wrap">
            {view.error && <ErrorBox error={view.error} />}
            {chartProps && (explore.chart === 'treemap' ? <Treemap {...chartProps} /> : <Sunburst {...chartProps} />)}
            {!chartProps && !view.error && <div className="chart loading-shimmer" />}
          </div>
          <div className="legend">
            {legendItems
              ? legendItems.map((c, i) => (
                  <span key={c.id}>
                    <i style={{ '--c': paletteColor(i) } as CSSProperties} />
                    {c.name}
                  </span>
                ))
              : Object.entries(groupByCategory(view.data)).map(([cat, size]) => (
                  <span key={cat}>
                    <i style={{ '--c': categoryColor(cat as never) } as CSSProperties} />
                    {category(cat as never).label}{' '}
                    <b className="mono muted">{formatPercent(size, view.data?.size ?? 1)}</b>
                  </span>
                ))}
            <span className="grow" />
            <span className="muted">{m.legendHint}</span>
          </div>
        </div>

        <div className="panel tbl-panel">
          <div className="panel-head">
            <div className="h2">{m.breakdown}</div>
            <span className="muted" style={{ fontSize: 12 }}>
              {d ? m.childCount(formatCount(d.node.childCount)) : ''}
            </span>
            <div className="grow" />
            <div className="input-icon">
              <Icon name="search" />
              <input
                className="input"
                placeholder={m.filterPlaceholder}
                aria-label={m.filterPlaceholder}
                style={{ height: 30, width: 190 }}
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
          </div>
          <AnalyticTable
            rootId={currentId}
            rootSize={d?.node.size ?? 0}
            dataKey={dataKey}
            filter={filter}
            units={units}
            colorMode={explore.colorMode}
            branchOf={branchOf}
            selectedId={selectedId}
            flash={tableFlash}
            onDrill={id => navigate(id, 'down')}
            onSelect={setSelectedId}
            onContext={(item, e) => contextFor(item, item.parentId, e)}
            onOpen={item =>
              api()
                .files.open(item.id)
                .catch(err => toast(String(err), 'alert'))
            }
          />
        </div>
      </div>
      <ChartTooltip rootSize={summary.size} units={units} measure={summary.measure} />
    </div>
  );
}

function groupByCategory(view: TreeViewNode | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of view?.children ?? []) if (c.kind !== 'group') out[c.category] = (out[c.category] ?? 0) + c.size;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}

async function exportCsv(id: NodeId, name: string, units: 'binary' | 'decimal'): Promise<void> {
  const page = await api().query('children', { id, sort: 'size', direction: 'desc', offset: 0, limit: 2000 });
  const t = msg().explore.csv;
  const rows = [[t.name, t.type, t.diskBytes, t.logicalBytes, t.onDisk, t.cloudOnly, t.files, t.modified]];
  for (const i of page.items)
    rows.push([
      i.name,
      i.kind === 'dir' ? t.folder : category(i.category).label,
      String(i.disk),
      String(i.logical),
      formatBytes(i.disk, units),
      i.cloudOnly ? t.yes : i.cloud > 0 ? formatBytes(i.cloud, units) : '',
      String(i.files),
      i.mtime ? new Date(i.mtime).toISOString().slice(0, 10) : '',
    ]);
  const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv' }));
  a.download = `tidyspace-${name.replace(/[\\/:*?"<>|]/g, '') || t.rootFileName}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(t.exported(a.download), 'download');
}
