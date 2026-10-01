import { useState, type CSSProperties } from 'react';
import { category } from '@shared/categories';
import { formatBytes, formatPercent } from '@shared/format';
import { msg } from '@shared/i18n';
import type { Suggestion, TopItem } from '@shared/types';
import { api } from '../../api';
import { Checkbox, EmptyState, ErrorBox, Toggle } from '../../components/controls';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { categoryColor } from '../../lib/colors';
import { useCountUp } from '../../lib/hooks';
import { scanKey, useQuery } from '../../lib/useQuery';
import { useApp } from '../../store/appStore';
import { queueShared, queueTotal, toQueueItem, useQueue, type QueueItem } from '../../store/queueStore';
import { useSettings } from '../../store/settingsStore';
import { toast } from '../../store/uiStore';
import { useCleanup } from '../../store/cleanupStore';
import { ReviewModal } from './ReviewModal';
import type { CleanupMode } from './runCleanup';

// Só as cores; os rótulos vêm de `msg().cleanup.risk` no render.
const RISK_COLOR: Record<Suggestion['risk'], string> = {
  safe: 'var(--ok)',
  review: 'var(--warn)',
  advanced: 'var(--danger)',
};

export function CleanupScreen() {
  const summary = useApp(s => s.summary);
  const settings = useSettings(s => s.settings);
  const units = settings?.units ?? 'binary';
  const animate = settings?.motion === 'full';
  const queue = useQueue(s => s.items);
  const addToQueue = useQueue(s => s.add);
  const removeFromQueue = useQueue(s => s.remove);
  const [mode, setMode] = useState<CleanupMode>('trash');
  const [reviewing, setReviewing] = useState<Suggestion | null>(null);
  const [confirming, setConfirming] = useState(false);
  const cleanupRunning = useCleanup(s => !!s.job && !s.job.outcome);

  const suggestions = useQuery(summary ? ['suggestions', scanKey(summary)] : null, () => api().query('suggestions'));
  const list = suggestions.data ?? [];
  const potential = list.filter(s => s.action === 'queue').reduce((a, s) => a + s.size, 0);
  const shownPotential = useCountUp(potential, 1100, animate);
  const permanentAllowed = !!settings?.allowPermanentDelete;
  const effectiveMode: CleanupMode = permanentAllowed ? mode : 'trash';

  const [adding, setAdding] = useState<string | null>(null);
  const m = msg().cleanup;
  const add = (items: TopItem[]) => {
    const { added, bytes } = addToQueue(items.map(toQueueItem));
    toast(added ? m.added(added, formatBytes(bytes, units)) : m.alreadyQueued, added ? 'sparkles' : 'info');
  };

  if (!summary) return null;
  const volume = summary.volume;
  const used = volume ? volume.total - volume.available : 0;

  return (
    <>
      <div className="page-head stagger">
        <div>
          <div className="eyebrow">{m.eyebrow(summary.rootPath)}</div>
          <h1 className="h1">{m.title}</h1>
          <p className="sub">{m.subtitle}</p>
        </div>
      </div>
      <div className="clean">
        <div>
          <div className="panel reclaim stagger">
            <div>
              <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                {m.potential}
              </div>
              <div className="big gradient-text">{formatBytes(shownPotential, units)}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                {m.suggestionsFound(list.length)}
              </div>
            </div>
            {volume && (
              <div className="grow">
                <div className="row" style={{ fontSize: 12, justifyContent: 'space-between' }}>
                  <span className="muted">{m.volume(formatBytes(volume.total, units))}</span>
                  <span className="muted">{m.percentUsed(formatPercent(used, volume.total))}</span>
                </div>
                <div className="disk-bar">
                  <i
                    style={{
                      width: `${Math.max(0, ((used - potential) / volume.total) * 100)}%`,
                      background: 'var(--accent)',
                    }}
                  />
                  <i
                    style={{
                      width: `${(potential / volume.total) * 100}%`,
                      background:
                        'repeating-linear-gradient(45deg,var(--ok) 0 5px,color-mix(in srgb,var(--ok) 55%,transparent) 5px 10px)',
                    }}
                  />
                </div>
                <div className="row" style={{ fontSize: 11.5, marginTop: 8, gap: 16 }}>
                  <span>{m.legendUsed}</span>
                  <span style={{ color: 'var(--ok)' }}>{m.legendReclaimable}</span>
                  <span className="muted">
                    {m.freeAfter}{' '}
                    <b style={{ color: 'var(--ok)' }}>{formatBytes(volume.available + potential, units)}</b>
                  </span>
                </div>
              </div>
            )}
          </div>

          {suggestions.error && <ErrorBox error={suggestions.error} />}
          <div className="sugg stagger">
            {list.map(s => {
              const riskLabel = m.risk[s.risk];
              const riskColor = RISK_COLOR[s.risk];
              const inQueue = s.items.every(i =>
                queue.some(q => q.id === i.id || i.path.startsWith(q.path + '/') || i.path.startsWith(q.path + '\\')),
              );
              return (
                <div
                  key={s.id}
                  className={`panel sg ${inQueue ? 'added' : ''}`}
                  style={{ '--c': riskColor } as CSSProperties}
                >
                  <div className="top">
                    <div className="ico">
                      <Icon name={s.icon} />
                    </div>
                    <div className="grow">
                      <h4>{s.title}</h4>
                      <p>{s.description}</p>
                    </div>
                  </div>
                  <div className="row">
                    <span className="size">{formatBytes(s.size, units)}</span>
                    <span className="grow" />
                    <span className={`pill ${s.risk}`}>{riskLabel}</span>
                  </div>
                  {s.command && <code>{s.command}</code>}
                  <div className="foot">
                    {s.action === 'command' ? (
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => {
                          void navigator.clipboard.writeText(s.command ?? '');
                          toast(m.commandCopied, 'copy');
                        }}
                      >
                        <Icon name="copy" /> {m.copyCommand}
                      </button>
                    ) : (
                      <>
                        <button type="button" className="btn sm ghost" onClick={() => setReviewing(s)}>
                          <Icon name="list" /> {m.review(s.itemCount)}
                        </button>
                        <span className="grow" />
                        <button
                          type="button"
                          className="btn sm"
                          disabled={inQueue || adding === s.id}
                          onClick={async () => {
                            // O card traz só uma prévia; adiciona a lista completa.
                            setAdding(s.id);
                            try {
                              add(await api().query('suggestionItems', { id: s.id }));
                            } catch (err) {
                              toast(m.addFailed(String(err)), 'alert');
                            } finally {
                              setAdding(null);
                            }
                          }}
                        >
                          <Icon name={inQueue ? 'check' : 'plus'} />{' '}
                          {inQueue ? m.inQueue : adding === s.id ? m.adding : m.addCount(s.itemCount)}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {suggestions.data && !list.length && <div className="panel empty">{m.noSuggestions}</div>}
          </div>
        </div>

        <div className="panel queue stagger">
          <div className="panel-head">
            <div className="h2 grow">{m.queueTitle}</div>
            <span className="muted">{msg().common.items(queue.length)}</span>
          </div>
          <div className="queue-list">
            {queue.length ? (
              queue.map(q => (
                <div key={q.id} className="q-item">
                  <span style={{ color: categoryColor(q.category) }}>
                    <Icon name={q.kind === 'dir' ? 'folder' : category(q.category).icon} />
                  </span>
                  <div className="t">
                    <div>{q.name}</div>
                    <small title={q.path}>{q.parentPath}</small>
                  </div>
                  {q.shared > 0 && (
                    <span className="cloud-tag" title={m.sharedTitle(formatBytes(q.shared, units))}>
                      <Icon name="link" />
                    </span>
                  )}
                  <b>{formatBytes(q.size, units)}</b>
                  <button
                    type="button"
                    className="btn sm icon ghost"
                    aria-label={m.removeFromQueue(q.name)}
                    onClick={() => removeFromQueue([q.id])}
                  >
                    <Icon name="x" />
                  </button>
                </div>
              ))
            ) : (
              <EmptyState title={m.emptyQueue}>
                {m.emptyQueueHint1}
                <br />
                {m.emptyQueueHint2}
              </EmptyState>
            )}
          </div>
          <div className="queue-foot">
            <div className="queue-total">
              <span className="muted">{m.totalSelected}</span>
              <b>{formatBytes(queueTotal(queue), units)}</b>
            </div>
            <SharedNotice bytes={queueShared(queue)} units={units} />
            {permanentAllowed && (
              <label className="row" style={{ fontSize: 12.5 }}>
                <Toggle
                  checked={mode === 'permanent'}
                  label={m.deletePermanently}
                  onChange={v => setMode(v ? 'permanent' : 'trash')}
                />
                {m.deletePermanentlyToggle}
              </label>
            )}
            <button
              type="button"
              className={`btn ${effectiveMode === 'permanent' ? 'danger' : 'primary'}`}
              style={{ justifyContent: 'center' }}
              disabled={!queue.length && !cleanupRunning}
              onClick={() => (cleanupRunning ? useCleanup.getState().openDialog() : setConfirming(true))}
            >
              {cleanupRunning ? (
                <>
                  <Icon name="clock" /> {m.running}
                </>
              ) : (
                <>
                  <Icon name={effectiveMode === 'permanent' ? 'alert' : 'trash'} />{' '}
                  {effectiveMode === 'permanent' ? m.deletePermanently : m.moveToTrash}
                </>
              )}
            </button>
            <div className="muted" style={{ fontSize: 11.5, textAlign: 'center' }}>
              {permanentAllowed ? m.nothingWithoutConfirmation : m.trashRestorable}
            </div>
          </div>
        </div>
      </div>

      {reviewing && <ReviewModal suggestion={reviewing} units={units} onAdd={add} onClose={() => setReviewing(null)} />}
      {confirming && (
        <ConfirmCleanup items={queue} mode={effectiveMode} units={units} onClose={() => setConfirming(false)} />
      )}
    </>
  );
}

/** Confirmação; ao confirmar, a limpeza passa a rodar no store (ver CleanupDialog). */
function ConfirmCleanup({
  items,
  mode,
  units,
  onClose,
}: {
  items: QueueItem[];
  mode: CleanupMode;
  units: 'binary' | 'decimal';
  onClose(): void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  // A fila pode mudar depois; a limpeza trabalha sobre a lista confirmada.
  const [snapshot] = useState(items);
  const size = queueTotal(snapshot);
  const permanent = mode === 'permanent';
  const m = msg().cleanup;

  return (
    <Modal onClose={onClose} label={m.confirmLabel}>
      <div className="modal-head">
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            display: 'grid',
            placeItems: 'center',
            flex: 'none',
            color: permanent ? 'var(--danger)' : 'var(--warn)',
            background: `color-mix(in srgb, ${permanent ? 'var(--danger)' : 'var(--warn)'} 14%, transparent)`,
          }}
        >
          <Icon name={permanent ? 'alert' : 'trash'} />
        </div>
        <div className="grow">
          <div className="h2" style={{ fontSize: 18 }}>
            {permanent ? m.confirmPermanentTitle : m.confirmTrashTitle}
          </div>
          <p className="sub">
            {msg().common.items(snapshot.length)} · <b className="mono">{formatBytes(size, units)}</b>
            {permanent ? m.confirmPermanentNote : m.confirmTrashNote}
          </p>
        </div>
      </div>
      <div className="panel" style={{ padding: '6px 12px', maxHeight: 200, overflow: 'auto' }}>
        {snapshot.slice(0, 8).map(n => (
          <div key={n.id} className="row" style={{ padding: '6px 0', fontSize: 12.5 }}>
            <span style={{ color: categoryColor(n.category) }}>
              <Icon name={n.kind === 'dir' ? 'folder' : category(n.category).icon} />
            </span>
            <span className="grow path-cell" style={{ maxWidth: 'none' }}>
              {n.path}
            </span>
            <b className="mono" style={{ fontWeight: 500 }}>
              {formatBytes(n.size, units)}
            </b>
          </div>
        ))}
        {snapshot.length > 8 && (
          <div className="muted" style={{ padding: '6px 0', fontSize: 12 }}>
            {m.andMore(snapshot.length - 8)}
          </div>
        )}
      </div>
      <SharedNotice bytes={queueShared(snapshot)} units={units} />
      {permanent && (
        <label className="row notice" style={{ marginTop: 12, cursor: 'pointer' }}>
          <Checkbox checked={acknowledged} label={m.acknowledge} onChange={() => setAcknowledged(a => !a)} />
          {m.acknowledgeText}
        </label>
      )}
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={onClose}>
          {msg().common.cancel}
        </button>
        <button
          type="button"
          className={`btn ${permanent ? 'danger' : 'primary'}`}
          disabled={permanent && !acknowledged}
          onClick={() => {
            useCleanup.getState().start(snapshot, mode);
            onClose();
          }}
        >
          <Icon name={permanent ? 'alert' : 'trash'} /> {permanent ? m.deletePermanently : m.moveToTrash}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Hard links (ex.: `node_modules` do pnpm ↔ store): remover um nome não libera o conteúdo enquanto
 * existir outro. O total mostrado já desconta esses bytes; aqui explicamos por quê.
 */
function SharedNotice({ bytes, units }: { bytes: number; units: 'binary' | 'decimal' }) {
  if (bytes <= 0) return null;
  const m = msg().cleanup;
  return (
    <div className="notice" style={{ marginTop: 12, fontSize: 12 }}>
      <Icon name="link" /> {m.sharedBefore} <b>{formatBytes(bytes, units)}</b> {m.sharedMiddle}{' '}
      <code>pnpm store prune</code> {m.sharedAfter}
    </div>
  );
}
