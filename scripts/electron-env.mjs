#!/usr/bin/env node
/**
 * Executa um comando sem ELECTRON_RUN_AS_NODE no ambiente. O terminal integrado do VS Code
 * (e outros apps Electron) exporta essa variável, o que faz o Electron rodar como Node puro e
 * quebra `import { BrowserWindow } from 'electron'`.
 *
 * Uso: node scripts/electron-env.mjs electron-vite dev
 */
import { spawn } from 'node:child_process';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('uso: electron-env.mjs <comando> [args...]');
  process.exit(2);
}
const child = spawn(cmd, args, { env, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 0)));
