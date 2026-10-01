import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { electronEnv, seedSettings } from './helpers';

/** Argumento de inicialização `--engine=` escolhe o motor de varredura. */
for (const [arg, label] of [
  ['--engine=node', 'Motor Node'],
  ['--engine=native', 'Motor nativo (Rust)'],
] as const) {
  test(`inicia com ${arg}`, async () => {
    const userData = mkdtempSync(path.join(os.tmpdir(), 'tidyspace-engine-'));
    seedSettings(userData, { language: 'pt-BR' });
    const app = await electron.launch({ args: ['.', arg], env: electronEnv({ TIDYSPACE_USER_DATA: userData }) });
    try {
      const page = await app.firstWindow();
      await expect(page.locator('.statusbar')).toContainText(label);
      if (arg === '--engine=node') await expect(page.locator('.statusbar')).not.toContainText('fallback');
    } finally {
      await app.close();
      rmSync(userData, { recursive: true, force: true });
    }
  });
}
