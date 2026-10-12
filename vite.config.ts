import { defineConfig } from 'vite';

// base relativa: o mesmo build funciona no GitHub Pages (/Echoforge/) e local.
export default defineConfig({
  base: './',
  test: { include: ['tests/**/*.test.ts'] },
} as never);
