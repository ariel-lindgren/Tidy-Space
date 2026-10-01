import { Fragment, useEffect, useRef, useState, type ComponentType } from 'react';
import { msg, resolveLocale, setLocale } from '@shared/i18n';
import { THEMES } from '@shared/themes';
import { api } from './api';
import { IconSprite, Icon } from './components/Icon';
import { ContextMenu, Toasts } from './components/Overlays';
import { RingGradients } from './components/RingGauge';
import { CleanupDialog } from './features/cleanup/CleanupDialog';
import { CleanupScreen } from './features/cleanup/CleanupScreen';
import { ExploreScreen } from './features/explore/ExploreScreen';
import { HomeScreen } from './features/home/HomeScreen';
import { LargestScreen } from './features/largest/LargestScreen';
import { ScanScreen } from './features/scan/ScanScreen';
import { CommandPalette } from './features/search/CommandPalette';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { TypesScreen } from './features/types/TypesScreen';
import { Background, Sidebar, StatusBar, TitleBar } from './layout/Shell';
import { switchTheme } from './lib/theme';
import { useHotkey } from './lib/hooks';
import { useApp, type Screen } from './store/appStore';
import { useCleanup } from './store/cleanupStore';
import { applyAppearance, useSettings } from './store/settingsStore';
import { toast } from './store/uiStore';

const SCREENS: Record<Screen, ComponentType> = {
  home: HomeScreen,
  scan: ScanScreen,
  explore: ExploreScreen,
  largest: LargestScreen,
  types: TypesScreen,
  clean: CleanupScreen,
  settings: SettingsScreen,
};

/** Liga os eventos de varredura do main ao estado da aplicação. */
function useScanEvents() {
  useEffect(() => {
    const s = api().scan;
    const offs = [
      s.onProgress(p => useApp.getState().scanProgress(p)),
      s.onDone(summary => useApp.getState().scanDone(summary)),
      s.onError(message => useApp.getState().scanFailed(message)),
    ];
    return () => offs.forEach(off => off());
  }, []);
}

/** Arrastar uma pasta para a janela inicia a análise dela. */
function DropZone() {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      depth.current++;
      setOver(true);
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setOver(false);
    };
    const overFn = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      const path = api().pathForFile(file);
      if (path) void useApp.getState().startScan(path);
      else toast(msg().nav.dropUnreadable, 'alert');
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return (
    <div className={`dropzone ${over ? 'on' : ''}`} aria-hidden={!over}>
      <div className="dz">
        <Icon name="folder-in" />
        <div className="h2">{msg().nav.dropTitle}</div>
        <div className="muted">{msg().nav.dropHint}</div>
      </div>
    </div>
  );
}

export function App() {
  const screen = useApp(s => s.screen);
  const paletteOpen = useApp(s => s.paletteOpen);
  const cleanupDialogOpen = useCleanup(s => s.dialogOpen);
  const info = useApp(s => s.info);
  const settings = useSettings(s => s.settings);
  const Current = SCREENS[screen];

  // Idioma: o das configurações ou, em "sistema", o do SO. Definido antes de renderizar os filhos;
  // a `key` abaixo remonta a interface inteira quando ele muda (os estados globais continuam).
  const locale = resolveLocale(settings?.language, navigator.languages);
  setLocale(locale);
  useEffect(() => void (document.documentElement.lang = locale), [locale]);

  useEffect(() => {
    void useSettings.getState().load();
    // Reabre a última análise gravada (o engine já a carregou do banco local).
    api()
      .query('summary')
      .then(s => s && useApp.getState().setSummary(s))
      .catch(() => undefined);
    api()
      .app.info()
      .then(i => useApp.getState().setInfo(i))
      .catch(err => toast(msg().nav.engineFailed(String(err)), 'alert'));
  }, []);
  useEffect(() => applyAppearance(settings, info?.platform), [settings, info?.platform]);
  useScanEvents();

  useHotkey(
    e => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k',
    e => {
      e.preventDefault();
      useApp.getState().setPaletteOpen(true);
    },
    true,
  );
  useHotkey(
    e => (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't',
    e => {
      e.preventDefault();
      const current = useSettings.getState().settings?.theme ?? 'neon';
      switchTheme(THEMES[(THEMES.indexOf(current) + 1) % THEMES.length] as (typeof THEMES)[number]);
    },
  );

  return (
    <Fragment key={locale}>
      <IconSprite />
      <RingGradients />
      <Background />
      <div className="app">
        <TitleBar />
        <Sidebar />
        <main className="main">
          <div key={screen} className={`screen enter ${screen === 'explore' ? 'full' : ''}`}>
            <Current />
          </div>
        </main>
        <StatusBar />
      </div>
      <ContextMenu />
      <Toasts />
      <DropZone />
      {paletteOpen && <CommandPalette />}
      {cleanupDialogOpen && <CleanupDialog />}
    </Fragment>
  );
}
