import { defineConfig } from 'vite';

export default defineConfig({
  root: 'demo',
  base: './', // Critical for GitHub Pages to handle relative paths correctly
  build: {
    outDir: '../dist-demo', // distinct from the library 'dist'
    emptyOutDir: true,
    target: 'esnext'
  }
});