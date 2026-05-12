import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

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
  plugins: [vue()],
  build: {
    rollupOptions: {
      input,
    },
  },
})
