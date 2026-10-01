import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Settings } from '../src/shared/settings';

/**
 * Ambiente para o Electron: sem ELECTRON_RUN_AS_NODE, que terminais do VS Code exportam e que
 * faria o Electron rodar como Node.
 */
export function electronEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k, v]) => k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined),
  ) as Record<string, string>;
  return { ...env, ...extra };
}

/**
 * Grava configurações iniciais no diretório de dados do teste. Campos ausentes são completados
 * com os padrões pelo app. Os testes fixam o idioma: sem isso, ele seguiria o do SO (os runners do
 * CI estão em inglês).
 */
export function seedSettings(userData: string, settings: Partial<Settings>): void {
  mkdirSync(userData, { recursive: true });
  writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ version: 1, ...settings }));
}
