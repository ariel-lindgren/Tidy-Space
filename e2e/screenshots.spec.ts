import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { messagesFor, type Locale } from '../src/shared/i18n';
import type { Settings } from '../src/shared/settings';
import { createDemoHome, mountDrive } from './demo';
import { electronEnv, seedSettings } from './helpers';

/**
 * Prints do README, gerados com uma pasta pessoal fictícia (nenhum dado real do disco).
 * Só roda quando pedido: `npm run screenshots` (Windows).
 */
const OUT = process.env.SCREENSHOTS;
test.skip(!OUT, 'defina SCREENSHOTS=<pasta> (npm run screenshots)');
test.skip(process.platform !== 'win32', 'a pasta fictícia usa arquivos esparsos e subst (Windows)');
test.setTimeout(240_000);

let tmp: string;
let drive: ReturnType<typeof mountDrive>;
let home: string;

test.beforeAll(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-demo-'));
  createDemoHome(path.join(tmp, 'Users', 'ana'));
  drive = mountDrive(tmp);
  home = `${drive.root}Users\\ana`;
  mkdirSync(OUT as string, { recursive: true });
});
test.afterAll(() => {
  drive?.unmount();
  rmSync(tmp, { recursive: true, force: true });
});

async function launch(
  userData: string,
  settings: Partial<Settings>,
): Promise<{ app: ElectronApplication; page: Page }> {
  seedSettings(userData, { motion: 'reduced', theme: 'neon', ...settings });
  const local = `${home}\\AppData\\Local`;
  const app = await electron.launch({
    args: ['.'],
    env: electronEnv({
      TIDYSPACE_USER_DATA: userData,
      TIDYSPACE_DEMO: '1',
      // A pasta pessoal fictícia faz as sugestões (Downloads, Temp, caches) apontarem para ela.
      USERPROFILE: home,
      HOME: home,
      LOCALAPPDATA: local,
      TEMP: `${local}\\Temp`,
      TMP: `${local}\\Temp`,
    }),
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1440, height: 860 });
  return { app, page };
}

const shoot = async (page: Page, name: string) => {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(900); // transições de entrada e gráficos
  await page.screenshot({ path: path.join(OUT as string, `${name}.png`) });
};

for (const locale of ['pt-BR', 'en'] as const satisfies readonly Locale[]) {
  test(`prints (${locale})`, async () => {
    const m = messagesFor(locale);
    const userData = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-demo-data-'));
    const { app, page } = await launch(userData, { language: locale });
    try {
      await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [folder],
        })) as typeof dialog.showOpenDialog;
      }, home);
      await page.getByRole('button', { name: m.home.scanFolder }).first().click();
      await expect(page.locator('.crumbs button').first()).toHaveText(home, { timeout: 120_000 });

      const suffix = locale === 'en' ? 'en' : 'pt';
      await shoot(page, `explore-${suffix}`);

      await page.getByRole('radio', { name: 'Sunburst' }).click();
      await shoot(page, `sunburst-${suffix}`);

      await page.getByRole('navigation').getByRole('button', { name: m.nav.clean }).click();
      await expect(page.locator('.sugg .sg').first()).toBeVisible();
      await shoot(page, `cleanup-${suffix}`);
    } finally {
      await app.close();
      rmSync(userData, { recursive: true, force: true });
    }
  });
}
