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
      css: `assets/${areaName}-${m}[extname]`,
      name: `Mock_${areaName}_${m}`.replace(/[^a-zA-Z0-9_$]/g, '_'),
    }))
}

const entries = [
  ...scanModules(DEV.HOME, 'home'),
  ...scanModules(DEV.RESULT, 'result'),
  {
    entry: path.join(DEV.HOME_AI, 'main.js'),
    file: 'homeAI/homeAI.js',
    css: 'assets/homeAI-homeAI[extname]',
    name: 'Mock_homeAI_homeAI',
  },
]

rmSync(outDir, { recursive: true, force: true })

for (const item of entries) {
  await build({
    root,
    configFile: false,
    plugins: [vue()],
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
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return item.css
            }
            return 'assets/[name][extname]'
          },
        },
      },
    },
  })
}

console.log(`[build-stc-vite] built ${entries.length} IIFE entry file(s) into resource/js/dist/`)
