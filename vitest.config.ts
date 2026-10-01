import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const alias = { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/{shared,engine,main}/**/*.test.ts'],
          setupFiles: ['src/shared/i18n/testSetup.ts'],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['src/shared/i18n/testSetup.ts', 'src/renderer/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/renderer/test/**',
        'src/shared/i18n/testSetup.ts',
        'src/**/index.ts',
        'src/native/**',
      ],
    },
  },
});
