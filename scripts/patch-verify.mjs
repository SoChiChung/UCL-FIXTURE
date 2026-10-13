/**
 * esbuild 把 fixtures.json 当作模块注入，但 normalize.ts 需要的是**文本**（Vite 的 ?raw 语义）。
 * 本脚本把打包产物里的 `JSON.parse(fixtures_default)` 换成真实的 JSON 文本，
 * 使 scripts/.verify.mjs 可在 Node 中直接运行（无浏览器环境）。
 *
 * 由 `npm run verify` 自动调用。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE = join(HERE, '.verify.mjs')
const FIXTURES = join(HERE, '..', 'src', 'data', 'fixtures.json')

if (!existsSync(BUNDLE)) {
  console.error('❌ 未找到 scripts/.verify.mjs，请先执行 npm run verify（而非单独运行本脚本）')
  process.exit(1)
}

const NEEDLE = 'var typed = JSON.parse(fixtures_default);'
const code = readFileSync(BUNDLE, 'utf8')

if (!code.includes(NEEDLE)) {
  console.error('❌ 打包产物结构与预期不符（未找到 JSON.parse(fixtures_default)），请检查 esbuild 版本')
  process.exit(1)
}

const raw = readFileSync(FIXTURES, 'utf8')
writeFileSync(BUNDLE, code.replace(NEEDLE, `var typed = JSON.parse(${JSON.stringify(raw)});`), 'utf8')
console.log('✅ 已注入 fixtures.json 原文')