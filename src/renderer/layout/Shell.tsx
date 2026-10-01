import { useLayoutEffect, useRef, useState } from 'react';
import { THEMES } from '@shared/themes';
import { formatBytes, formatCount, formatDuration } from '@shared/format';
import { msg } from '@shared/i18n';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { useApp, type Screen } from '../store/appStore';
import { useQueue } from '../store/queueStore';
import { useSettings } from '../store/settingsStore';
import { useScanProgress } from '../lib/scanProgress';
import { useCleanup } from '../store/cleanupStore';
import { switchTheme, themeInfo } from '../lib/theme';
import { toast } from '../store/uiStore';
import { engineLabel } from '../lib/engine';

export function TitleBar() {
  const setPaletteOpen = useApp(s => s.setPaletteOpen);
  const go = useApp(s => s.go);
  const theme = useSettings(s => s.settings?.theme ?? 'neon');
  const [maximized, setMaximized] = useState(false);
  useLayoutEffect(() => api().window.onMaximizedChange(setMaximized), []);
  const m = msg().nav;
  return (
    <header className="titlebar">
      <div className="brand">
        <div className="brand-mark" />
        TidySpace
      </div>
      <div className="tb-center">
        <button type="button" className="tb-search" onClick={() => setPaletteOpen(true)}>
          <Icon name="search" />
          <span>{m.searchPlaceholder}</span>
          <kbd>Ctrl K</kbd>
        </button>
      </div>
      <div className="tb-actions">
        <button
          type="button"
          className="tb-btn"
          title={m.switchTheme}
          aria-label={m.switchTheme}
          onClick={e => {
            const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] as (typeof THEMES)[number];
            switchTheme(next, { x: e.clientX, y: e.clientY });
            toast(m.theme(themeInfo(next).name), 'palette');
          }}
        >
          <Icon name="palette" />
        </button>
        <button
          type="button"
          className="tb-btn"
          title={m.settings}
          aria-label={m.settings}
          onClick={() => go('settings')}
        >
          <Icon name="settings" />
        </button>
      </div>
      <div className="win-ctrl">
        <button type="button" aria-label={m.minimize} onClick={() => api().window.minimize()}>
          <Icon name="minus" />
        </button>
        <button
          type="button"
          aria-label={maximized ? m.restore : m.maximize}
          onClick={() => api().window.toggleMaximize()}
        >
          <Icon name="square" />
        </button>
        <button type="button" className="close" aria-label={m.close} onClick={() => api().window.close()}>
          <Icon name="x" />
        </button>
      </div>
    </header>
  );
}

type NavItem = { screen: Screen; icon: string; label: string; needsScan?: boolean };

/** Itens da barra lateral; uma função para que os rótulos sigam o idioma atual. */
const navItems = (): NavItem[] => {
  const m = msg().nav;
  return [
    { screen: 'home', icon: 'home', label: m.home },
    { screen: 'explore', icon: 'pie', label: m.explore, needsScan: true },
    { screen: 'largest', icon: 'bars', label: m.largest, needsScan: true },
    { screen: 'types', icon: 'layers', label: m.types, needsScan: true },
    { screen: 'clean', icon: 'sparkles', label: m.clean, needsScan: true },
  ];
};

export function Sidebar() {
  const screen = useApp(s => s.screen);
  const hasScan = useApp(s => !!s.summary);
  const go = useApp(s => s.go);
  const queued = useQueue(s => s.items.length);
  const progress = useScanProgress();
  const active = screen;
  const ref = useRef<HTMLElement>(null);
  const [indTop, setIndTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const btn = ref.current?.querySelector<HTMLElement>(`[data-screen="${active}"]`);
      setIndTop(btn ? btn.offsetTop + (btn.offsetHeight - 34) / 2 : null);
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [active, progress.scanning]);

  const m = msg().nav;
  const nav = navItems();
  const item = (n: NavItem & { className?: string }) => (
    <button
      key={n.screen}
      type="button"
      data-screen={n.screen}
      className={`nav-btn ${active === n.screen ? 'active' : ''} ${'className' in n ? n.className : ''}`}
      disabled={n.needsScan && !hasScan}
      aria-current={active === n.screen ? 'page' : undefined}
      onClick={() => go(n.screen)}
    >
      <Icon name={n.icon} />
      {n.label}
      {n.screen === 'clean' && queued > 0 && (
        <span className="badge" key={queued}>
          {queued}
        </span>
      )}
    </button>
  );

  return (
    <nav className="sidebar" ref={ref} aria-label={m.mainNav}>
      <div className="nav-ind" style={{ top: indTop ?? 0, opacity: indTop === null ? 0 : 1 }} />
      {nav.slice(0, 1).map(item)}
      {/* Enquanto houver varredura, um atalho permanente para a tela de progresso. */}
      {progress.scanning &&
        item({
          screen: 'scan',
          icon: 'target',
          label:
            progress.percent !== null
              ? `${progress.percent}%`
              : progress.phase === 'saving'
                ? m.navSaving
                : m.navScanning,
          className: 'scanning',
        })}
      {nav.slice(1).map(item)}
      <div className="spacer" />
      {item({ screen: 'settings', icon: 'settings', label: m.settings })}
    </nav>
  );
}

export function StatusBar() {
  const scanning = useApp(s => s.scan.status === 'scanning');
  const go = useApp(s => s.go);
  const progress = useScanProgress();
  const cleanup = useCleanup(s => s.job);
  const summary = useApp(s => s.summary);
  const info = useApp(s => s.info);
  const settings = useSettings(s => s.settings);
  const units = settings?.units ?? 'binary';
  const m = msg().nav;
  return (
    <footer className="statusbar">
      {scanning ? (
        <button type="button" className="status-scan" onClick={() => go('scan')} title={m.scanProgressTitle}>
          <span className="dot" style={{ background: 'var(--warn)', boxShadow: '0 0 8px var(--warn)' }} />
          {m.scanStatus(progress.phase === 'saving', progress.percent)}
        </button>
      ) : (
        <span>
          <span className="dot" />
          {m.ready}
        </span>
      )}
      {cleanup && !cleanup.outcome && (
        <button
          type="button"
          className="status-scan"
          onClick={() => useCleanup.getState().openDialog()}
          title={m.cleanupProgressTitle}
        >
          <span className="dot" style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
          {m.cleaning(Math.min(cleanup.current + 1, cleanup.items.length), cleanup.items.length)}
        </button>
      )}
      {summary ? (
        <>
          <span className="mono">{summary.rootPath}</span>
          <span>
            {m.totals(formatCount(summary.files), formatBytes(summary.size, units), summary.measure === 'disk')}
          </span>
          <span>{m.scannedIn(formatDuration(summary.elapsedMs))}</span>
          {summary.errorCount > 0 && (
            <span title={summary.issues.map(i => `${i.path}: ${i.message}`).join('\n')}>
              {m.noAccess(formatCount(summary.errorCount))}
            </span>
          )}
        </>
      ) : (
        <span>{m.noScan}</span>
      )}
      <span className="grow" />
      {info && <span title={info.nativeError ?? undefined}>{m.engine(engineLabel(info))}</span>}
      <span>{m.theme(themeInfo(settings?.theme ?? 'neon').name)}</span>
      {info && <span>v{info.version}</span>}
    </footer>
  );
}

export function Background() {
  return (
    <div className="bg-fx" aria-hidden="true">
      <div className="grid" />
      <div className="glow g1" />
      <div className="glow g2" />
    </div>
  );
}
