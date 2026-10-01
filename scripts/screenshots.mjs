#!/usr/bin/env node
/**
 * Gera os prints do README em docs/screenshots a partir de uma pasta pessoal fictícia
 * (ver e2e/demo.ts). Requer `npm run build` antes; só funciona no Windows.
 */
import { spawnSync } from 'node:child_process';

const env = { ...process.env, SCREENSHOTS: 'docs/screenshots' };
delete env.ELECTRON_RUN_AS_NODE;
const r = spawnSync('npx', ['playwright', 'test', 'e2e/screenshots.spec.ts'], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
