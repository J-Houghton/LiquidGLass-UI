import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({ 
      // merge all declarations into one file for cleaner consumption
      rollupTypes: true 
    })
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'LiquidGlass',
      fileName: (format) => `liquid-glass.${format}.js`,
      formats: ['es', 'cjs']
    },
    rollupOptions: {
      external: ['lit'],
      output: {
        globals: {
          lit: 'Lit'
        }
      }
    }
  }
});