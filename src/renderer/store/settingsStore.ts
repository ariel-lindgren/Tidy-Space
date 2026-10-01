import { create } from 'zustand';
import { msg } from '@shared/i18n';
import type { Settings, SettingsPatch } from '@shared/settings';
import { api } from '../api';
import { clearQueryCache } from '../lib/useQuery';
import { toast } from './uiStore';

interface SettingsState {
  settings: Settings | null;
  load(): Promise<void>;
  update(patch: SettingsPatch): Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  load: async () => set({ settings: await api().settings.get() }),
  update: async patch => {
    const previous = get().settings;
    // Atualização otimista: a interface responde na hora; se o main recusar, volta atrás.
    // Exceção: o idioma só muda depois que o main confirma — ele reconfigura o engine antes de
    // responder, e as consultas refeitas pela interface remontada já vêm no idioma novo.
    const language = patch.language !== undefined;
    if (previous && !language) set({ settings: { ...previous, ...patch } });
    try {
      const next = await api().settings.update(patch);
      if (language) clearQueryCache();
      set({ settings: next });
    } catch (err) {
      set({ settings: previous });
      toast(msg().settings.saveFailed(err instanceof Error ? err.message : String(err)), 'alert');
    }
  },
}));

/** Aplica tema, animação e efeitos ao <html>. Sem configuração ainda, respeita a preferência do SO. */
export function applyAppearance(settings: Settings | null, platform: string | undefined): void {
  const root = document.documentElement;
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  root.dataset.theme = settings?.theme ?? 'neon';
  root.dataset.motion = settings?.motion ?? (prefersReduced ? 'reduced' : 'full');
  root.dataset.fx = settings?.backgroundFx === false ? 'off' : 'on';
  if (platform) root.dataset.platform = platform;
}
