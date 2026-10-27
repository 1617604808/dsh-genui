/** Build first, then copy the complete offline runtime into a Flutter app. */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2]
if (!target) throw new Error('Usage: node scripts/install-mobile.mjs /path/to/flutter/app/assets/genui')
const files = ['mobile-runtime.js', 'mermaid.js', 'three.js', 'echarts-core.js', 'echarts-full.js', 'icons.js']
const bytes = await Promise.all(files.map(file => readFile(resolve(root, 'lib/assets', file))))
await mkdir(target, { recursive: true })
const hashes = {}
for (const [index, file] of files.entries()) {
  await copyFile(resolve(root, 'lib/assets', file), resolve(target, file))
  hashes[file] = createHash('sha256').update(bytes[index]).digest('hex')
}
await writeFile(resolve(target, 'index.html'), `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; font-src data:; img-src data: blob: https: http:; media-src data: blob: https: http:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>GenUI</title></head><body><main id="genui-root"></main><script src="mobile-runtime.js"></script></body></html>\n`)
await copyFile(resolve(root, 'LICENSE'), resolve(target, 'LICENSE'))
await copyFile(resolve(root, 'THIRD_PARTY_NOTICES.md'), resolve(target, 'THIRD_PARTY_NOTICES.md'))
await writeFile(resolve(target, 'manifest.json'), JSON.stringify({ protocol: 1, package: '@changfenhuang/dsh-genui', version: JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version, sha256: hashes }, null, 2) + '\n')
console.log(`Installed ${files.length} GenUI bundles in ${resolve(target)}`)
