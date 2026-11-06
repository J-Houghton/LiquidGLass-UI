import { defineConfig } from 'vite';

// Library build: ESM only, one chunk set per public entry, no runtime dependencies.
// Declarations are emitted separately by `tsc -p tsconfig.dts.json` (see the build script):
// per-file .d.ts mirroring src/, so dist/index.d.ts, dist/core/index.d.ts and
// dist/elements/index.d.ts line up with the JS entries and `declare global` survives.
// scripts/check-dist.mjs verifies the result after every build.
export default defineConfig({
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        core: 'src/core/index.ts',
        elements: 'src/elements/index.ts',
        motion: 'src/motion/index.ts',
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    sourcemap: true,
    minify: false,
  },
});
