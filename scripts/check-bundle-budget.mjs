import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const KIBIBYTE = 1024
const MAX_INITIAL_RAW_BYTES = 450 * KIBIBYTE
const MAX_INITIAL_GZIP_BYTES = 150 * KIBIBYTE
const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const distDirectory = path.join(repositoryRoot, 'dist')
const manifestPath = path.join(distDirectory, '.vite', 'manifest.json')

const expectedLazyRoutes = [
  'src/routes/login.tsx?tsr-split=component',
  'src/routes/_authenticated/applications/index.tsx?tsr-split=component',
  'src/routes/_authenticated/applications.$name.tsx?tsr-split=component',
  'src/routes/_authenticated/applications.$name/diff.tsx?tsr-split=component',
  'src/routes/_authenticated/applications.$name/tree.tsx?tsr-split=component',
]

const expectedLazyFeatures = [
  'src/components/create-application-panel.tsx',
  'src/components/resource-details-panel.tsx',
  'src/components/sync-progress-sheet.tsx',
]

function formatKibibytes(bytes) {
  return `${(bytes / KIBIBYTE).toFixed(1)} KiB`
}

function fail(message) {
  console.error(`Bundle budget failed: ${message}`)
  process.exitCode = 1
}

let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (error) {
  console.error(`Unable to read ${manifestPath}. Run the production build first.`)
  throw error
}

const entryRecord = Object.entries(manifest).find(([, chunk]) => chunk.isEntry)
if (!entryRecord) {
  throw new Error('Vite manifest does not contain a JavaScript entry')
}

const [entryKey, entryChunk] = entryRecord
const initialChunkKeys = new Set()

function collectInitialChunks(chunkKey) {
  if (initialChunkKeys.has(chunkKey)) return
  initialChunkKeys.add(chunkKey)

  const chunk = manifest[chunkKey]
  if (!chunk) throw new Error(`Manifest references missing chunk ${chunkKey}`)
  for (const importedChunk of chunk.imports || []) collectInitialChunks(importedChunk)
}

collectInitialChunks(entryKey)

let initialRawBytes = 0
let initialGzipBytes = 0
for (const chunkKey of initialChunkKeys) {
  const chunk = manifest[chunkKey]
  const contents = readFileSync(path.join(distDirectory, chunk.file))
  initialRawBytes += contents.byteLength
  initialGzipBytes += gzipSync(contents).byteLength
}

console.log(
  `Initial JavaScript: ${initialChunkKeys.size} chunk(s), ${formatKibibytes(initialRawBytes)} raw / ${formatKibibytes(initialGzipBytes)} gzip`,
)
console.log(
  `Budget: ${formatKibibytes(MAX_INITIAL_RAW_BYTES)} raw / ${formatKibibytes(MAX_INITIAL_GZIP_BYTES)} gzip`,
)

if (initialRawBytes > MAX_INITIAL_RAW_BYTES) {
  fail(`initial raw JavaScript is ${formatKibibytes(initialRawBytes)}`)
}
if (initialGzipBytes > MAX_INITIAL_GZIP_BYTES) {
  fail(`initial gzip JavaScript is ${formatKibibytes(initialGzipBytes)}`)
}

const dynamicImports = new Set(entryChunk.dynamicImports || [])
for (const route of expectedLazyRoutes) {
  if (!dynamicImports.has(route)) fail(`route is not lazy: ${route}`)
}
for (const feature of expectedLazyFeatures) {
  if (!manifest[feature]?.isDynamicEntry) fail(`feature is not lazy: ${feature}`)
}

const productionJavaScript = new Set(
  Object.values(manifest)
    .map((chunk) => chunk.file)
    .filter((file) => file.endsWith('.js')),
)
const includesRouterDevtools = [...productionJavaScript].some((file) =>
  readFileSync(path.join(distDirectory, file), 'utf8').includes('Open TanStack Router Devtools'),
)
if (includesRouterDevtools) fail('TanStack Router Devtools are present in production output')

if (!process.exitCode) {
  console.log(
    `Verified ${expectedLazyRoutes.length} representative lazy routes, ${expectedLazyFeatures.length} lazy features, and production devtools exclusion.`,
  )
}
