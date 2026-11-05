import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// Library build: ESM only, one chunk set per public entry, no runtime dependencies.
export default defineConfig({
  plugins: [
    dts({
      rollupTypes: true,
      include: ['src'],
      exclude: ['src/components/**'],
    }),
  ],
  build: {
    lib: {
      entry: {
        index: 'src/index.ts',
        core: 'src/core/index.ts',
        elements: 'src/elements/index.ts',
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    sourcemap: true,
    minify: false,
  },
});
