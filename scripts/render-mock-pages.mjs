import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const manifestPath = path.join(root, 'resource/js/dist-vite/.vite/manifest.json')
const outDir = path.join(root, 'pages-rendered')

const pages = [
  {
    source: 'pages/home.html',
    output: 'home.html',
    entries: [
      'dev/home/searchbox/index.js',
      'dev/home/skin/index.js',
      'dev/homeAI/main.js',
    ],
  },
  {
    source: 'pages/result.html',
    output: 'result.html',
    entries: [
      'dev/result/ai-searchbox/index.js',
    ],
  },
]

function readManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(
      `Cannot read Vite manifest at ${manifestPath}. Run npm run build:vite first.`
    )
  }
}

function cssLinksForEntries(manifest, entries) {
  const seen = new Set()
  const cssFiles = []

  for (const entry of entries) {
    const chunk = manifest[entry]
    if (!chunk) {
      throw new Error(`Missing manifest entry: ${entry}`)
    }

    for (const cssFile of chunk.css || []) {
      if (!seen.has(cssFile)) {
        seen.add(cssFile)
        cssFiles.push(cssFile)
      }
    }
  }

  return cssFiles
    .map((cssFile) => `  <link rel="stylesheet" href="../resource/js/dist-vite/${cssFile}">`)
    .join('\n')
}

function renderPage(manifest, page) {
  const sourcePath = path.join(root, page.source)
  const outputPath = path.join(outDir, page.output)
  const html = readFileSync(sourcePath, 'utf8')
  const links = cssLinksForEntries(manifest, page.entries)

  if (!html.includes('<!--CSS_LINKS-->')) {
    throw new Error(`Missing <!--CSS_LINKS--> placeholder in ${page.source}`)
  }

  writeFileSync(outputPath, html.replace('<!--CSS_LINKS-->', links))
  return {
    output: path.relative(root, outputPath),
    links: links ? links.split('\n').length : 0,
  }
}

mkdirSync(outDir, { recursive: true })

const manifest = readManifest()
const rendered = pages.map((page) => renderPage(manifest, page))

for (const page of rendered) {
  console.log(`[render-mock-pages] ${page.output}: injected ${page.links} CSS link(s)`)
}
