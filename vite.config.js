import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// _loader_res.js / polyfills-legacy.js 已在 HTML 中静态加载（pages/*.html）。
// 此插件只负责在 dev 阶段额外注入 _loader_dev_shim.js；prod 下保持占位符为空。
function htmlInjector() {
  return {
    name: 'mock-html-injector',
    transformIndexHtml(html, ctx) {
      const isDev = ctx.server != null;
      const injection = isDev
        ? `<script src="/resource/js/common/_loader_dev_shim.js"></script>`
        : '';
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
    manifest: true,
    rollupOptions: {
      input,
      output: {
        entryFileNames: '[name]-[hash].js',
        chunkFileNames: 'vendor/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
