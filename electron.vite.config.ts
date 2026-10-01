import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const alias = { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) };

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      rollupOptions: {
        // O "engine" roda num utilityProcess separado (scanner + índice da árvore).
        input: { index: 'src/main/index.ts', engine: 'src/engine/index.ts' },
      },
    },
  },
  preload: {
    resolve: { alias },
    build: {
      // Preloads com sandbox precisam ser CommonJS.
      rollupOptions: { input: 'src/preload/index.ts', output: { format: 'cjs', entryFileNames: '[name].cjs' } },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias },
    plugins: [react()],
    build: { minify: 'esbuild', sourcemap: false, rollupOptions: { input: 'src/renderer/index.html' } },
  },
});
