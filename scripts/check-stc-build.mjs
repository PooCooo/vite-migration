import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const expectedFiles = [
  'resource/js/dist/home/searchbox.js',
  'resource/js/dist/home/skin.js',
  'resource/js/dist/homeAI/homeAI.js',
  'resource/js/dist/result/ai-searchbox.js',
  'resource/js/dist/assets/home-searchbox.css',
  'resource/js/dist/assets/home-skin.css',
  'resource/js/dist/assets/homeAI-homeAI.css',
  'resource/js/dist/assets/result-ai-searchbox.css',
]

const expectedTemplateLiterals = [
  '/resource/js/dist/home/searchbox.js',
  '/resource/js/dist/home/skin.js',
  '/resource/js/dist/homeAI/homeAI.js',
  '/resource/js/dist/result/ai-searchbox.js',
  '/resource/js/dist/assets/home-searchbox.css',
  '/resource/js/dist/assets/home-skin.css',
  '/resource/js/dist/assets/homeAI-homeAI.css',
  '/resource/js/dist/assets/result-ai-searchbox.css',
]

const templateFiles = [
  'pages-php/home.php',
  'pages-php/result.php',
  'pages/home.html',
  'pages/result.html',
]

const errors = []

function rel(file) {
  return path.join(root, file)
}

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)
    const stat = statSync(file)
    return stat.isDirectory() ? walk(file) : [file]
  })
}

function assert(condition, message) {
  if (!condition) errors.push(message)
}

for (const file of expectedFiles) {
  assert(existsSync(rel(file)), `Missing expected build file: ${file}`)
}

const distFiles = walk(rel('resource/js/dist')).map((file) => path.relative(root, file))
const unexpectedDistFiles = distFiles.filter((file) => !expectedFiles.includes(file))
assert(
  unexpectedDistFiles.length === 0,
  `Unexpected files in resource/js/dist: ${unexpectedDistFiles.join(', ')}`
)

assert(!existsSync(rel('resource/js/dist/vendor')), 'Unexpected vendor directory in resource/js/dist')
assert(!existsSync(rel('resource/js/dist/.vite/manifest.json')), 'Unexpected Vite manifest in resource/js/dist')

for (const file of distFiles.filter((file) => file.endsWith('.js'))) {
  const code = readFileSync(rel(file), 'utf8')
  assert(!/__vite_style__/.test(code), `Inline Vite CSS marker found in ${file}`)
  assert(!/document\.createElement\(['"]style['"]\)/.test(code), `Inline style injection found in ${file}`)
  assert(!/\bimport\s*\(/.test(code), `Dynamic import found in production IIFE: ${file}`)
  assert(!/\bfrom\s+['"]vue['"]/.test(code), `Unresolved Vue ESM import found in ${file}`)
}

const templateSource = templateFiles
  .map((file) => readFileSync(rel(file), 'utf8'))
  .join('\n')

for (const literal of expectedTemplateLiterals) {
  assert(templateSource.includes(literal), `Missing STC template literal: ${literal}`)
}

assert(!/dist-vite/.test(templateSource), 'Template still references dist-vite')
assert(!/manifest_url|render_css_links|polyfills_legacy_url/.test(templateSource), 'Template still references manifest helpers')
assert(!/\{\s*stc\s*:[^}]*legacy/.test(templateSource), 'Template still uses unsupported { stc, legacy } object')

if (errors.length) {
  console.error('[check-stc-build] failed')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('[check-stc-build] ok')
