import { useState, type CSSProperties, type ReactNode } from 'react';
import { msg, systemLocale, type LanguagePreference, type Locale } from '@shared/i18n';
import type { Settings } from '@shared/settings';
import { THEMES } from '@shared/themes';
import { Segmented, Toggle } from '../../components/controls';
import { Icon } from '../../components/Icon';
import { switchTheme, themeInfo } from '../../lib/theme';
import { formatBytes, formatCount } from '@shared/format';
import { api } from '../../api';
import { useQuery } from '../../lib/useQuery';
import { useApp } from '../../store/appStore';
import { toast } from '../../store/uiStore';
import { useSettings } from '../../store/settingsStore';
import { engineLabel } from '../../lib/engine';

/** Nome de cada idioma na própria língua (igual em todos os catálogos). */
const LANGUAGE_NAMES: Record<Locale, string> = { 'pt-BR': 'Português (Brasil)', en: 'English' };

function Row({ title, hint, children }: { title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="l">
        <div>{title}</div>
        <small>{hint}</small>
      </div>
      {children}
    </div>
  );
}

export function SettingsScreen() {
  const settings = useSettings(s => s.settings);
  const update = useSettings(s => s.update);
  const info = useApp(s => s.info);
  const [exclusion, setExclusion] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const summaryId = useApp(s => s.summary?.id ?? '');
  const saved = useQuery(['saved-scans', summaryId, savedVersion], () => api().query('listScans'));
  if (!settings) return null;
  const m = msg().settings;
  const cloudBlind = info?.engine === 'node' && info.platform === 'win32' && settings.measure === 'disk';

  const toggle = (key: keyof Settings, title: string, hint: ReactNode) => (
    <Row title={title} hint={hint}>
      <Toggle checked={settings[key] as boolean} label={title} onChange={v => void update({ [key]: v })} />
    </Row>
  );
  const addExclusion = () => {
    const v = exclusion.trim();
    if (!v || settings.exclusions.includes(v)) return;
    void update({ exclusions: [...settings.exclusions, v] });
    setExclusion('');
  };
  const threadsPct = (settings.threads / 32) * 100;
  const fastPath =
    info?.platform === 'win32' ? m.fastPathWin : info?.platform === 'darwin' ? m.fastPathMac : m.fastPathLinux;

  return (
    <div className="settings">
      <div className="page-head stagger" style={{ margin: 0 }}>
        <div>
          <div className="eyebrow">{m.eyebrow}</div>
          <h1 className="h1">{m.title}</h1>
        </div>
      </div>

      <section className="panel set-sec stagger">
        <div className="h2">
          <Icon name="palette" /> {m.appearance}
        </div>
        <div className="themes" role="radiogroup" aria-label={m.theme}>
          {THEMES.map(t => (
            <button
              type="button"
              key={t}
              role="radio"
              aria-checked={settings.theme === t}
              className={`theme-card ${settings.theme === t ? 'on' : ''}`}
              onClick={e => switchTheme(t, { x: e.clientX, y: e.clientY })}
            >
              <div className="theme-prev" data-theme={t} style={{ background: 'var(--bg)' } as CSSProperties}>
                <div className="sb" style={{ background: 'var(--panel-2)', border: '1px solid var(--line)' }} />
                <div className="tm">
                  <i style={{ background: 'var(--c1)' }} />
                  <i style={{ background: 'var(--c2)' }} />
                  <i style={{ background: 'var(--c3)' }} />
                </div>
              </div>
              <div className="nm">
                {themeInfo(t).name}
                <small>{themeInfo(t).desc}</small>
              </div>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <Row title={m.language} hint={m.languageHint}>
            <Segmented<LanguagePreference>
              label={m.language}
              value={settings.language}
              onChange={language => void update({ language })}
              options={[
                {
                  value: 'system',
                  label: m.languageSystem,
                  title: m.languageSystemTitle(LANGUAGE_NAMES[systemLocale(navigator.languages)]),
                },
                { value: 'pt-BR', label: LANGUAGE_NAMES['pt-BR'] },
                { value: 'en', label: LANGUAGE_NAMES.en },
              ]}
            />
          </Row>
          <Row title={m.motion} hint={m.motionHint}>
            <Segmented
              label={m.motion}
              value={settings.motion}
              onChange={motion => void update({ motion })}
              options={[
                { value: 'full', label: m.motionFull },
                { value: 'reduced', label: m.motionReduced },
                { value: 'off', label: m.motionOff },
              ]}
            />
          </Row>
          {toggle('backgroundFx', m.backgroundFx, m.backgroundFxHint)}
        </div>
      </section>

      <section className="panel set-sec stagger">
        <div className="h2">
          <Icon name="target" /> {m.analysis}
        </div>
        <Row title={m.units} hint={m.unitsHint}>
          <Segmented
            label={m.units}
            value={settings.units}
            onChange={units => void update({ units })}
            options={[
              { value: 'binary', label: m.unitsBinary },
              { value: 'decimal', label: m.unitsDecimal },
            ]}
          />
        </Row>
        <Row title={m.measure} hint={m.measureHint}>
          <Segmented
            label={m.measure}
            value={settings.measure}
            onChange={measure =>
              void update({ measure }).then(() =>
                api()
                  .query('summary')
                  .then(s => useApp.getState().setSummary(s)),
              )
            }
            options={[
              { value: 'disk', icon: 'hdd', label: m.measureDisk },
              { value: 'logical', icon: 'file', label: m.measureLogical },
            ]}
          />
        </Row>
        {cloudBlind && (
          <div className="notice">
            <Icon name="cloud" /> {m.cloudBlind}
          </div>
        )}
        {toggle('includeHidden', m.includeHidden, m.includeHiddenHint)}
        {toggle('followSymlinks', m.followSymlinks, m.followSymlinksHint)}
        {toggle('hardLinks', m.hardLinks, m.hardLinksHint)}
        {toggle('oneFilesystem', m.oneFilesystem, m.oneFilesystemHint)}
        <Row title={m.threads} hint={m.threadsHint(fastPath)}>
          <span className="mono" style={{ width: 70, textAlign: 'right' }}>
            {settings.threads || m.threadsAuto}
          </span>
          <input
            type="range"
            className="range"
            min={0}
            max={32}
            aria-label={m.threads}
            value={settings.threads}
            style={{ '--p': `${threadsPct}%` } as CSSProperties}
            onChange={e => void update({ threads: Number(e.target.value) })}
          />
        </Row>
      </section>

      <section className="panel set-sec stagger">
        <div className="h2">
          <Icon name="disk" /> {m.savedScans}
        </div>
        <Row title={m.keep} hint={m.keepHint}>
          <span className="mono" style={{ width: 70, textAlign: 'right' }}>
            {settings.keepScans}
          </span>
          <input
            type="range"
            className="range"
            min={1}
            max={20}
            aria-label={m.keepLabel}
            value={settings.keepScans}
            style={{ '--p': `${((settings.keepScans - 1) / 19) * 100}%` } as CSSProperties}
            onChange={e => void update({ keepScans: Number(e.target.value) }).then(() => setSavedVersion(v => v + 1))}
          />
        </Row>
        <Row title={m.storage} hint={m.storageHint(formatCount(saved.data?.length ?? 0))}>
          <span className="mono">
            {formatBytes(saved.data?.reduce((a, s) => a + s.storageBytes, 0) ?? 0, settings.units)}
          </span>
          <button
            type="button"
            className={`btn sm ${confirmClear ? 'danger' : ''}`}
            disabled={!saved.data?.length}
            onClick={async () => {
              if (!confirmClear) {
                setConfirmClear(true);
                setTimeout(() => setConfirmClear(false), 4000);
                return;
              }
              await api().scans.deleteAll();
              useApp.getState().setSummary(null);
              setConfirmClear(false);
              setSavedVersion(v => v + 1);
              toast(m.allDeleted, 'trash');
            }}
          >
            <Icon name="trash" /> {confirmClear ? m.confirmDeleteAll : m.deleteAll}
          </button>
        </Row>
      </section>

      <section className="panel set-sec stagger">
        <div className="h2">
          <Icon name="trash" /> {m.cleanup}
        </div>
        {toggle('allowPermanentDelete', m.permanent, m.permanentHint)}
        {settings.allowPermanentDelete && (
          <div className="notice">
            <Icon name="alert" /> {m.permanentNotice}
          </div>
        )}
      </section>

      <section className="panel set-sec stagger">
        <div className="h2">
          <Icon name="eye-off" /> {m.exclusions}
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {m.exclusionsHint(
            <code key="path">/mnt/backup</code>,
            <code key="name">node_modules</code>,
            <code key="ext">*.tmp</code>,
          )}
        </div>
        {settings.exclusions.map(p => (
          <div key={p} className="excl">
            <Icon name={p.startsWith('*.') ? 'filter' : 'folder'} />
            <span className="grow">{p}</span>
            <button
              type="button"
              className="btn sm icon ghost"
              aria-label={m.removeExclusion(p)}
              onClick={() => void update({ exclusions: settings.exclusions.filter(x => x !== p) })}
            >
              <Icon name="x" />
            </button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 10 }}>
          <input
            className="input mono grow"
            placeholder={m.exclusionPlaceholder}
            aria-label={m.newExclusion}
            spellCheck={false}
            value={exclusion}
            onChange={e => setExclusion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addExclusion()}
          />
          <button type="button" className="btn" onClick={addExclusion}>
            <Icon name="plus" /> {msg().common.add}
          </button>
        </div>
      </section>

      <section className="panel set-sec stagger">
        <div className="h2">
          <Icon name="info" /> {m.about}
        </div>
        <div className="muted" style={{ lineHeight: 1.7 }}>
          TidySpace {info?.version} · {info?.platform}
          <br />
          {m.engine} <b>{engineLabel(info)}</b>
          {info?.engineChoice !== 'auto' && <span> · {m.engineChosen(info?.engineChoice ?? '')}</span>}
          {info?.nativeError && info.engineChoice !== 'node' && (
            <>
              <br />
              <span title={info.nativeError}>
                {info.engineChoice === 'native' ? m.nativeFailedStrict : m.nativeFailed}
              </span>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
