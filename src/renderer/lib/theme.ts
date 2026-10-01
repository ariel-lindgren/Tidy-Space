import { msg } from '@shared/i18n';
import type { THEMES } from '@shared/themes';
import { useSettings } from '../store/settingsStore';

/** Nomes próprios dos temas (iguais em todos os idiomas); a descrição vem do catálogo. */
const THEME_NAMES: Record<(typeof THEMES)[number], string> = {
  neon: 'Neon',
  aurora: 'Aurora',
  solar: 'Solar',
  glacier: 'Glacier',
};

export function themeInfo(theme: (typeof THEMES)[number]): { name: string; desc: string } {
  return { name: THEME_NAMES[theme], desc: msg().nav.themeDesc[theme] };
}

/** Troca de tema com revelação circular a partir do clique (View Transitions do Chromium). */
export function switchTheme(theme: (typeof THEMES)[number], origin?: { x: number; y: number }) {
  const { settings, update } = useSettings.getState();
  const apply = () => void update({ theme });
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && settings?.motion === 'full') {
    if (origin) {
      document.documentElement.style.setProperty('--vx', `${origin.x}px`);
      document.documentElement.style.setProperty('--vy', `${origin.y}px`);
    }
    doc.startViewTransition(() => {
      document.documentElement.dataset.theme = theme;
      apply();
    });
  } else apply();
}
