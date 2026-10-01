import { useEffect, useState, type CSSProperties } from 'react';
import { formatBytes, formatCount, formatDuration } from '@shared/format';
import { msg } from '@shared/i18n';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { useCountUp } from '../../lib/hooks';
import { estimateFraction, estimateSeconds, useCleanup, type CleanupJob } from '../../store/cleanupStore';
import { useSettings } from '../../store/settingsStore';
import { toast } from '../../store/uiStore';
import type { CleanupOutcome } from './runCleanup';

/**
 * Progresso e resultado da limpeza. Montado no nível do App: a limpeza roda num store e continua
 * se a janela for fechada ("continuar em segundo plano") ou se o usuário mudar de tela.
 */
export function CleanupDialog() {
  const job = useCleanup(s => s.job);
  const close = useCleanup(s => s.closeDialog);
  const units = useSettings(s => s.settings?.units ?? 'binary');
  if (!job) return null;
  return (
    <Modal onClose={close} label={msg().cleanup.dialogLabel}>
      {job.outcome ? (
        <CleanupResult outcome={job.outcome} units={units} onClose={close} />
      ) : (
        <CleanupProgress job={job} units={units} />
      )}
    </Modal>
  );
}

function CleanupProgress({ job, units }: { job: CleanupJob; units: 'binary' | 'decimal' }) {
  const close = useCleanup(s => s.closeDialog);
  const stop = useCleanup(s => s.stop);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const total = job.items.reduce((a, i) => a + i.size, 0);
  const item = job.items[Math.min(job.current, job.items.length - 1)];
  const elapsed = now - job.itemStartedAt;
  const fraction = item ? estimateFraction(item, elapsed) : 1;
  const estimate = item ? estimateSeconds(item) : 0;
  const overall = total ? (job.bytesDone + (item?.size ?? 0) * fraction) / total : 0;
  const slow = elapsed / 1000 > Math.max(10, estimate * 1.5);
  const m = msg().cleanup;
  const verb = job.mode === 'permanent' ? m.deleting : m.movingToTrash;

  return (
    <div className="cleanup-running">
      <div className="eyebrow">{verb}</div>
      <div className="h2" style={{ fontSize: 18, margin: '4px 0 12px' }}>
        {m.itemProgress(Math.min(job.current + 1, job.items.length), job.items.length)}
      </div>

      <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
        <span className="muted">{m.total}</span>
        <span className="mono">
          {m.totalProgress(formatBytes(job.bytesDone, units), formatBytes(total, units), Math.round(overall * 100))}
        </span>
      </div>
      <div
        className="bar"
        style={{ height: 8, marginTop: 6 }}
        role="progressbar"
        aria-label={m.totalProgressLabel}
        aria-valuenow={Math.round(overall * 100)}
      >
        <i style={{ width: `${overall * 100}%`, animation: 'none', transition: 'width .25s' }} />
      </div>

      {item && (
        <div className="panel current-item">
          <div className="row" style={{ gap: 8 }}>
            <Icon name={item.kind === 'dir' ? 'folder' : 'file'} />
            <b
              className="grow"
              style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {item.name}
            </b>
            <span className="mono">{formatBytes(item.size, units)}</span>
          </div>
          <div className="current" title={item.path}>
            {item.path}
          </div>
          <div className="bar estimate" style={{ height: 6, marginTop: 10 }} aria-hidden="true">
            <i style={{ width: `${fraction * 100}%`, animation: 'none', transition: 'width .25s' }} />
          </div>
          <div className="row muted" style={{ justifyContent: 'space-between', fontSize: 11.5, marginTop: 6 }}>
            <span>
              {item.kind === 'dir' ? m.approxFiles(formatCount(item.files)) : ''}
              {m.itemTiming(formatDuration(elapsed), formatDuration(estimate * 1000))}
            </span>
          </div>
          {slow && (
            <div className="notice" style={{ marginTop: 10 }}>
              <Icon name="clock" /> {m.slowNotice}
            </div>
          )}
        </div>
      )}

      <div className="modal-foot">
        <button type="button" className="btn" disabled={job.stopping} onClick={stop}>
          <Icon name="pause" /> {job.stopping ? m.stopping : m.stop}
        </button>
        <button type="button" className="btn primary" onClick={close}>
          {m.continueInBackground}
        </button>
      </div>
    </div>
  );
}

function CleanupResult({
  outcome,
  units,
  onClose,
}: {
  outcome: CleanupOutcome;
  units: 'binary' | 'decimal';
  onClose(): void;
}) {
  const animate = useSettings(s => s.settings?.motion === 'full');
  const freed = useCountUp(outcome.bytes, 1200, animate);
  const [particles] = useState(() =>
    Array.from({ length: animate && outcome.done.length ? 36 : 0 }, (_, i) => {
      const a = Math.random() * Math.PI * 2;
      const d = 80 + Math.random() * 160;
      return { i, x: Math.cos(a) * d, y: Math.sin(a) * d - 30, r: Math.random() * 720, delay: Math.random() * 120 };
    }),
  );
  useEffect(() => {
    if (outcome.failed.length) toast(msg().cleanup.failedToast(outcome.failed.length), 'alert');
  }, [outcome.failed.length]);
  const m = msg().cleanup;
  // `reason` vem do main; o texto é só o fallback para resultados sem ele.
  const blocked = outcome.failed.some(
    f => f.reason === 'permission' || f.reason === 'protected' || (!f.reason && f.error.includes('administrador')),
  );

  return (
    <div className="success">
      {particles.map(p => (
        <i
          key={p.i}
          className="particle"
          style={
            {
              '--c': `var(--c${1 + (p.i % 8)})`,
              '--x': `${p.x}px`,
              '--y': `${p.y}px`,
              '--r': `${p.r}deg`,
              animationDelay: `${p.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
      {outcome.done.length > 0 ? (
        <>
          <div className="burst">
            <Icon name="check" />
          </div>
          <div className="freed">{formatBytes(freed, units)}</div>
          <div className="h2" style={{ marginTop: 6 }}>
            {outcome.mode === 'trash' ? m.movedToTrash : m.freed}
          </div>
          <p className="sub">{outcome.mode === 'trash' ? m.trashNote : m.permanentNote}</p>
        </>
      ) : (
        <>
          <div className="burst none">
            <Icon name="alert" />
          </div>
          <div className="h2" style={{ fontSize: 20 }}>
            {m.nothingRemoved}
          </div>
          <p className="sub">{m.nothingChanged}</p>
        </>
      )}
      {outcome.skipped.length > 0 && <p className="sub">{m.interrupted(outcome.skipped.length)}</p>}
      {blocked && (
        <div className="notice" style={{ marginTop: 12, textAlign: 'left' }}>
          <Icon name="shield" /> {m.protectedNotice}
        </div>
      )}
      {outcome.failed.length > 0 && (
        <div
          className="panel"
          style={{ textAlign: 'left', padding: '8px 12px', marginTop: 12, maxHeight: 160, overflow: 'auto' }}
        >
          {outcome.failed.map(f => (
            <div key={f.id} className="row" style={{ fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: 'var(--danger)' }}>
                <Icon name="alert" />
              </span>
              <span className="grow path-cell" style={{ maxWidth: 'none' }}>
                {f.path || m.unknownItem(f.id)}
              </span>
              <span className="muted">{f.error}</span>
            </div>
          ))}
        </div>
      )}
      <div className="modal-foot" style={{ justifyContent: 'center' }}>
        <button type="button" className="btn primary" onClick={onClose}>
          {msg().common.done}
        </button>
      </div>
    </div>
  );
}
