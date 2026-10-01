import { useState } from 'react';
import type { MouseEvent } from 'react';
import { formatBytes, formatRelative } from '@shared/format';
import { msg } from '@shared/i18n';
import type { SavedScan, VolumeInfo } from '@shared/types';
import { api } from '../../api';
import { Icon } from '../../components/Icon';
import { Bar } from '../../components/controls';
import { RingGauge } from '../../components/RingGauge';
import { pickAndScan } from '../../lib/actions';
import { useScanProgress } from '../../lib/scanProgress';
import { useQuery } from '../../lib/useQuery';
import { useApp } from '../../store/appStore';
import { useSettings } from '../../store/settingsStore';

const VOLUME_ICON: Record<string, string> = { ssd: 'ssd', hdd: 'hdd', unknown: 'hdd' };

function DriveCard({ volume, lastScan, loaded }: { volume: VolumeInfo; lastScan?: SavedScan; loaded: boolean }) {
  const units = useSettings(s => s.settings?.units ?? 'binary');
  const startScan = useApp(s => s.startScan);
  const used = volume.total - volume.available;
  const ratio = volume.total ? used / volume.total : 0;
  const m = msg().home;
  const spotlight = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <button
      type="button"
      className="panel drive"
      onClick={() => void startScan(volume.mountPoint)}
      onMouseMove={spotlight}
    >
      <div className="drive-top">
        <RingGauge value={ratio} />
        <div className="grow" style={{ textAlign: 'left' }}>
          <h3>
            <span className="letter">{volume.mountPoint}</span> {volume.name !== volume.mountPoint ? volume.name : ''}
          </h3>
          <div className="meta">
            <Icon name={volume.removable ? 'usb' : (VOLUME_ICON[volume.kind] ?? 'hdd')} />
            {[
              volume.kind !== 'unknown' ? volume.kind.toUpperCase() : null,
              volume.fileSystem,
              volume.removable ? m.removable : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div className="nums">
            <div>
              {m.used}
              <b>{formatBytes(used, units)}</b>
            </div>
            <div>
              {m.free}
              <b style={{ color: ratio > 0.85 ? 'var(--warn)' : 'var(--ok)' }}>
                {formatBytes(volume.available, units)}
              </b>
            </div>
          </div>
        </div>
      </div>
      <div className="drive-foot">
        <span className="muted">
          {loaded ? m.loaded : lastScan ? m.lastScan(formatRelative(lastScan.finishedAt)) : m.neverScanned} ·{' '}
          {formatBytes(volume.total, units)}
        </span>
        <span className="btn sm go">
          <Icon name="target" /> {m.scan}
        </span>
      </div>
    </button>
  );
}

export function HomeScreen() {
  const [deleted, setDeleted] = useState(0);
  const summary = useApp(s => s.summary);
  const startScan = useApp(s => s.startScan);
  const units = useSettings(s => s.settings?.units ?? 'binary');
  const volumes = useQuery(['volumes'], () => api().query('listVolumes'));
  const openSaved = useApp(s => s.openSaved);
  const deleteSaved = useApp(s => s.deleteSaved);
  const scanTarget = useApp(s => s.scan.target);
  const go = useApp(s => s.go);
  const progress = useScanProgress();
  // Recarrega a lista quando uma análise termina, é reaberta, alterada ou apagada.
  const history = useQuery(['saved-scans', summary?.id ?? '', summary?.treeVersion ?? 0, deleted], () =>
    api().query('listScans'),
  );
  const same = (a: string, b: string) =>
    a.replace(/[\\/]+$/, '').toLowerCase() === b.replace(/[\\/]+$/, '').toLowerCase();

  const m = msg().home;

  return (
    <div className="home">
      <div className="hero stagger">
        <div>
          <div className="eyebrow">{m.eyebrow}</div>
          <h1 className="h1">
            {m.titleBefore}
            <span className="gradient-text">{m.titleAccent}</span>
            {m.titleAfter}
          </h1>
          <p className="sub">{m.sub}</p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => void pickAndScan()}>
            <Icon name="folder" /> {m.scanFolder}
          </button>
        </div>
      </div>

      {progress.scanning && (
        <div className="panel scan-banner" role="status">
          <Icon name="target" />
          <div className="grow">
            <div className="h2">{progress.phase === 'saving' ? m.bannerSaving : m.bannerScanning}</div>
            <div className="muted mono" style={{ fontSize: 12 }}>
              {scanTarget}
            </div>
          </div>
          {progress.percent !== null && <Bar percent={progress.percent} />}
          <button type="button" className="btn sm primary" onClick={() => go('scan')}>
            {m.viewProgress}
          </button>
        </div>
      )}

      <div className="drives stagger">
        {volumes.loading &&
          !volumes.data &&
          [0, 1, 2].map(i => <div key={i} className="panel drive loading-shimmer" style={{ minHeight: 190 }} />)}
        {volumes.data?.map(v => (
          <DriveCard
            key={v.id}
            volume={v}
            loaded={!!summary && same(summary.rootPath, v.mountPoint)}
            lastScan={history.data?.find(h => same(h.rootPath, v.mountPoint))}
          />
        ))}
        <button type="button" className="panel drive folder-card" onClick={() => void pickAndScan()}>
          <div className="big-ico">
            <Icon name="folder-in" />
          </div>
          <div className="h2">{m.folderCardTitle}</div>
          <div className="muted" style={{ maxWidth: 220 }}>
            {m.folderCardHint}
          </div>
        </button>
      </div>

      <div className="home-grid stagger">
        <div className="panel recent">
          <div className="row" style={{ marginBottom: 8 }}>
            <div className="h2 grow">{m.savedScans}</div>
            <span className="muted" style={{ fontSize: 12 }}>
              {msg().common.items(history.data?.length ?? 0)}
            </span>
          </div>
          {history.data?.length === 0 && (
            <div className="muted" style={{ padding: '10px 0' }}>
              {m.noScans}
            </div>
          )}
          {history.data?.slice(0, 8).map(h => {
            const isOpen = summary?.id === h.id;
            return (
              <div key={h.id} className="recent-item">
                <button
                  type="button"
                  className="row grow"
                  style={{ textAlign: 'left', minWidth: 0 }}
                  title={m.openTitle}
                  onClick={() => (isOpen ? go('explore') : void openSaved(h.id))}
                >
                  <div className="ico">
                    <Icon name={h.rootPath.length <= 3 || h.rootPath === '/' ? 'hdd' : 'folder'} />
                  </div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="p" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.rootPath}
                    </div>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {formatRelative(h.finishedAt)} · {m.onDisk(formatBytes(h.disk, units))}
                      {h.cloud > 0 ? ` · ${m.inCloud(formatBytes(h.cloud, units))}` : ''}
                      {isOpen ? ` · ${m.openTag}` : ''}
                    </div>
                  </div>
                </button>
                <div className="acts">
                  <button
                    type="button"
                    className="btn sm icon ghost"
                    title={m.rescanTitle}
                    aria-label={m.rescanLabel(h.rootPath)}
                    onClick={() => void startScan(h.rootPath)}
                  >
                    <Icon name="refresh" />
                  </button>
                  <button
                    type="button"
                    className="btn sm icon ghost"
                    title={m.deleteTitle}
                    aria-label={m.deleteLabel(h.rootPath)}
                    onClick={() => void deleteSaved(h.id).then(() => setDeleted(d => d + 1))}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="panel tips">
          <div className="h2" style={{ marginBottom: 8 }}>
            {m.shortcuts}
          </div>
          <div className="kbd-row">
            {m.kSearch} <kbd>Ctrl K</kbd>
          </div>
          <div className="kbd-row">
            {m.kUp} <kbd>Backspace</kbd>
          </div>
          <div className="kbd-row">
            {m.kChart} <kbd>T</kbd>
          </div>
          <div className="kbd-row">
            {m.kTheme} <kbd>Ctrl Shift T</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
