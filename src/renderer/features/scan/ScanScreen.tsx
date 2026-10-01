import { useEffect, useRef, useState } from 'react';
import { formatBytes, formatCount, formatDuration } from '@shared/format';
import { msg } from '@shared/i18n';
import { Bar } from '../../components/controls';
import { Icon } from '../../components/Icon';
import { useScanProgress } from '../../lib/scanProgress';
import { useApp } from '../../store/appStore';
import { useSettings } from '../../store/settingsStore';

const R = 48;
const C = 2 * Math.PI * R;

/**
 * Progresso da varredura. Pode ser deixada e retomada a qualquer momento (atalho na barra lateral
 * e na barra de status) — o estado vem do store, não da tela.
 */
export function ScanScreen() {
  const scan = useApp(s => s.scan);
  const summary = useApp(s => s.summary);
  const cancelScan = useApp(s => s.cancelScan);
  const go = useApp(s => s.go);
  const info = useApp(s => s.info);
  const settings = useSettings(s => s.settings);
  const units = settings?.units ?? 'binary';
  const { percent: livePercent, phase, volume } = useScanProgress();
  const [ticker, setTicker] = useState<string[]>([]);
  const lastPath = useRef('');

  const p = scan.progress;
  const done = scan.status !== 'scanning' && !!summary && summary.finishedAt >= scan.startedAt;
  const percent = done ? 100 : livePercent;

  useEffect(() => {
    if (!p?.currentPath || p.currentPath === lastPath.current || phase !== 'scanning') return;
    lastPath.current = p.currentPath;
    setTicker(t => [p.currentPath, ...t].slice(0, 9));
  }, [p?.currentPath, phase]);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => go('explore'), 900);
    return () => clearTimeout(t);
  }, [done, go]);

  const bytes = done ? (summary?.disk ?? 0) : (p?.bytes ?? 0);
  const rate = p && p.elapsedMs > 0 ? ((p.files + p.dirs) / p.elapsedMs) * 1000 : 0;
  const saving = phase === 'saving' && !done;
  const m = msg().scan;
  const title = done ? m.titleDone : saving ? m.titleSaving : volume ? m.titleDisk : m.titleFolder;

  return (
    <div className={`scan ${done ? 'scan-done' : ''}`}>
      <div className="radar">
        <div className="rings" />
        <div className="sweep" />
        <div className="orbit">
          <i />
        </div>
        <svg className="prog" viewBox="0 0 100 100" aria-hidden="true">
          <circle className="trk" cx="50" cy="50" r={R} />
          <circle
            className="val"
            cx="50"
            cy="50"
            r={R}
            strokeDasharray={C}
            strokeDashoffset={C * (1 - (percent ?? 0) / 100)}
          />
        </svg>
        <div className="core" aria-live="polite">
          {percent !== null ? (
            <div className="pct">
              {percent}
              <small>%</small>
            </div>
          ) : (
            <div className="pct" style={{ fontSize: 34 }}>
              {formatBytes(bytes, units)}
            </div>
          )}
          <div className="bytes">
            {saving
              ? m.writing
              : percent !== null
                ? formatBytes(bytes, units)
                : msg().common.files(formatCount(p?.files ?? 0))}
          </div>
        </div>
      </div>

      <div className="scan-info stagger">
        <div className="eyebrow">{title}</div>
        <div className="target">{scan.target ?? summary?.rootPath}</div>
        <div className="muted">
          {volume ? volume.fileSystem : m.onlyFolder} · {info?.engine === 'native' ? m.engineNative : m.engineNode} ·{' '}
          {settings?.threads ? m.threads(settings.threads) : m.threadsAuto}
        </div>
        <div className="stats">
          <div className="panel stat">
            <span>{m.statFiles}</span>
            <b>{formatCount(done ? (summary?.files ?? 0) : (p?.files ?? 0))}</b>
          </div>
          <div className="panel stat">
            <span>{m.statFolders}</span>
            <b>{formatCount(done ? (summary?.dirs ?? 0) : (p?.dirs ?? 0))}</b>
          </div>
          <div className="panel stat">
            <span>{m.statDisk}</span>
            <b>{formatBytes(bytes, units)}</b>
          </div>
          <div className="panel stat">
            <span>{m.statRate}</span>
            <b>{saving || done ? '—' : formatCount(rate)}</b>
          </div>
        </div>
        <div className="panel ticker" aria-hidden="true">
          {ticker.map(path => (
            <div key={path}>{path}</div>
          ))}
        </div>
        <div className="panel found">
          <div className="row">
            <div className="h2 grow">{m.progress}</div>
            <Icon name="clock" />
          </div>
          <div className="found-item">
            <span className="n">{m.elapsed}</span>
            <b>{formatDuration(done ? (summary?.elapsedMs ?? 0) : (p?.elapsedMs ?? 0))}</b>
          </div>
          <div className="found-item">
            <span className="n">{m.noPermission}</span>
            <b>{formatCount(done ? (summary?.errorCount ?? 0) : (p?.errors ?? 0))}</b>
          </div>
          {saving && p?.total ? (
            <div className="found-item">
              <span className="n">{m.writingDb}</span>
              <Bar percent={((p.saved ?? 0) / p.total) * 100} />
              <b>
                {formatCount(p.saved ?? 0)} / {formatCount(p.total)}
              </b>
            </div>
          ) : null}
        </div>
        {!done && (
          <div className="row" style={{ marginTop: 16 }}>
            <button type="button" className="btn ghost" onClick={() => void cancelScan()}>
              <Icon name="x" /> {msg().common.cancel}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              {m.background}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
