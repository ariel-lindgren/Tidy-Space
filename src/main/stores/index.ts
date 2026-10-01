import { defaultSettings, SETTINGS_VERSION, settingsSchema, type Settings } from '@shared/settings';
import { JsonFileStore } from './JsonFileStore';

const logCorrupt = (file: string, reason: string) =>
  console.warn(`[store] ${file} inválido, restaurando padrões: ${reason}`);

/** Configurações: campos ausentes (versões antigas) são completados com os padrões. */
export function createSettingsStore(file: string, platform: string): JsonFileStore<Settings> {
  return new JsonFileStore<Settings>({
    file,
    schema: settingsSchema,
    defaults: () => defaultSettings(platform),
    migrate: raw =>
      raw && typeof raw === 'object' ? { ...defaultSettings(platform), ...raw, version: SETTINGS_VERSION } : raw,
    onCorrupt: logCorrupt,
  });
}
