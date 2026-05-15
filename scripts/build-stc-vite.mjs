import { rmSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outDir = path.join(root, 'resource/js/dist')

const DEV = {
  HOME: path.join(root, 'dev/home'),
  RESULT: path.join(root, 'dev/result'),
  HOME_AI: path.join(root, 'dev/homeAI'),
}

function scanModules(devDir, areaName) {
  return readdirSync(devDir)
    .filter((m) => statSync(path.join(devDir, m)).isDirectory())
    .map((m) => ({
      entry: path.join(devDir, m, 'index.js'),
      file: `${areaName}/${m}.js`,
      cssFile: `assets/${areaName}-${m}.css`,
      name: `Mock_${areaName}_${m}`.replace(/[^a-zA-Z0-9_$]/g, '_'),
    }))
}

const entries = [
  ...scanModules(DEV.HOME, 'home'),
  ...scanModules(DEV.RESULT, 'result'),
  {
    entry: path.join(DEV.HOME_AI, 'main.js'),
    file: 'homeAI/homeAI.js',
    cssFile: 'assets/homeAI-homeAI.css',
    name: 'Mock_homeAI_homeAI',
  },
]

function extractIifeCss(cssFile) {
  return {
    name: 'mock-extract-iife-css',
    enforce: 'post',
    renderChunk(code) {
      const pattern = /var __vite_style__ = document\.createElement\('style'\);__vite_style__\.textContent = ([\s\S]*?);document\.head\.appendChild\(__vite_style__\);?/
      const match = code.match(pattern)
      if (!match) return null

      const css = new Function(`return ${match[1]}`)()
      this.emitFile({
        type: 'asset',
        fileName: cssFile,
        source: css,
      })

      return {
        code: code.replace(pattern, ''),
        map: null,
      }
    },
  }
}

rmSync(outDir, { recursive: true, force: true })

for (const item of entries) {
  await build({
    root,
    configFile: false,
    plugins: [vue(), extractIifeCss(item.cssFile)],
    build: {
      outDir,
      emptyOutDir: false,
      cssCodeSplit: true,
      target: 'es2015',
      rollupOptions: {
        input: item.entry,
        external: ['vue'],
        output: {
          format: 'iife',
          name: item.name,
          globals: { vue: 'Vue' },
          entryFileNames: item.file,
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  })
}

console.log(`[build-stc-vite] built ${entries.length} IIFE entry file(s) into resource/js/dist/`)
