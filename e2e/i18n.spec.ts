import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { electronEnv, seedSettings } from './helpers';

/** Idioma da interface: segue o SO por padrão, troca em Ajustes e a escolha persiste. */
let userData: string;
let app: ElectronApplication | undefined;

test.beforeEach(() => {
  userData = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-i18n-'));
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
  rmSync(userData, { recursive: true, force: true });
});

/** `--lang` simula o idioma do sistema operacional para o Chromium. */
async function launch(lang?: string) {
  app = await electron.launch({
    args: ['.', ...(lang ? [`--lang=${lang}`] : [])],
    env: electronEnv({ TIDYSPACE_USER_DATA: userData }),
  });
  const page = await app.firstWindow();
  await expect(page.getByRole('navigation')).toBeVisible();
  return page;
}

const sidebar = (page: Awaited<ReturnType<typeof launch>>) => page.getByRole('navigation');

test('segue o idioma do sistema: português → pt-BR; outros → inglês', async () => {
  let page = await launch('pt-BR');
  await expect(sidebar(page).getByRole('button', { name: 'Início' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await app?.close();

  page = await launch('de-DE');
  await expect(sidebar(page).getByRole('button', { name: 'Home' })).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: 'Explore' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('troca o idioma em Ajustes, aplica na hora e mantém após reiniciar', async () => {
  seedSettings(userData, { language: 'pt-BR' });
  let page = await launch('de-DE');
  await page.getByRole('button', { name: 'Ajustes' }).first().click();
  await page.getByRole('radiogroup', { name: 'Idioma' }).getByRole('radio', { name: 'English' }).click();

  await expect(page.getByRole('radiogroup', { name: 'Language' })).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: 'Cleanup' })).toBeVisible();
  await expect.poll(() => JSON.parse(readFileSync(path.join(userData, 'settings.json'), 'utf8')).language).toBe('en');

  await app?.close();
  page = await launch('pt-BR');
  await expect(sidebar(page).getByRole('button', { name: 'Home' })).toBeVisible();
});
