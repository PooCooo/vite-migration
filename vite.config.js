import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

function htmlInjector() {
  return {
    name: 'mock-html-injector',
    transformIndexHtml(html, ctx) {
      const isDev = ctx.server != null;
      const injection = isDev
        ? `<script src="/resource/js/common/_loader_res.js"></script>
  <script src="/resource/js/common/_loader_dev_shim.js"></script>`
        : `<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script src="/resource/js/common/_loader_res.js"></script>`;
      return html.replace('<!--LOADER-->', injection);
    }
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DEV = {
  HOME: path.join(__dirname, 'dev/home'),
  RESULT: path.join(__dirname, 'dev/result'),
  HOME_AI: path.join(__dirname, 'dev/homeAI'),
}

function scanModules(devDir, areaName) {
  return readdirSync(devDir)
    .filter((m) => statSync(path.join(devDir, m)).isDirectory())
    .reduce((acc, m) => {
      acc[`${areaName}/${m}`] = path.join(devDir, m, 'index.js')
      return acc
    }, {})
}

const input = {
  ...scanModules(DEV.HOME, 'home'),
  ...scanModules(DEV.RESULT, 'result'),
  'homeAI/homeAI': path.join(DEV.HOME_AI, 'main.js'),
}

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
  },
  plugins: [
    vue(),
    legacy({
      targets: ['defaults', 'not IE 11'],
      renderLegacyChunks: true,
      polyfills: true,
      modernPolyfills: false,
    }),
    htmlInjector(),
  ],
  build: {
    outDir: 'resource/js/dist-vite',
    emptyOutDir: true,
    rollupOptions: {
      input,
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'vendor/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
