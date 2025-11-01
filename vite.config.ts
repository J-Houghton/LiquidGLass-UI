// <reference types="node" />
import { defineConfig } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
    base: '/LiquidGLass-UI/',
    build: {
        rollupOptions: {
            input: {
                main: resolve(rootDir, 'index.html'),
                'glass-components': resolve(rootDir, 'src/plugins/index.ts'),
            },
        },
    },
})