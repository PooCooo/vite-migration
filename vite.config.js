import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// _loader_res.js 已在 HTML 中静态加载（pages/*.html）。
// 此配置主要服务 dev server；生产 STC 兼容构建见 scripts/build-stc-vite.mjs。
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
    host: true,
    cors: true,
    hmr: { host: 'localhost', port: 5173, protocol: 'ws' },
  },
  plugins: [
    vue(),
    htmlInjector(),
  ],
  build: {
    outDir: 'resource/js/dist',
    emptyOutDir: true,
    manifest: false,
    rollupOptions: {
      input,
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
