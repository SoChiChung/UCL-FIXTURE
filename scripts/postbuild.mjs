#!/usr/bin/env node
/**
 * 小工具打包后处理：
 *   1) 剥离 HTML 中的 ESM 特征（type="module" / crossorigin / modulepreload），
 *      使入口成为经典脚本（离线 zip 无目录服务，type="module" 的相对 import 解析不可靠）。
 *   2) 把入口 <script src=...> 移到 </body> 之前 —— 关键修复：
 *      若脚本留在 <head> 内立即执行，此时 document.body 尚未解析完成，
 *      main.tsx 中 detectFlexGap() 的 document.body.appendChild() 会抛错，
 *      导致 React 永不渲染（表现恰为「只有样式、没有内容」）。
 *
 * 运行时机：`vite build` 之后（由 package.json 的 build 脚本串联）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const htmlPath = path.join(root, 'dist', 'index.html')

let html = fs.readFileSync(htmlPath, 'utf8')

const before = html

// 1) 剥离 <script ... type="module" crossorigin ...> → <script ...>
html = html.replace(/<script\b([^>]*)\btype="module"([^>]*)>/g, '<script$1$2>')
html = html.replace(/<script\b([^>]*)\s+crossorigin\s*([^>]*)>/g, '<script$1$2>')
// 清理可能残留的孤立 crossorigin 属性（无值情形）
html = html.replace(/<script\b([^>]*)\s+crossorigin="([^"]*)"([^>]*)>/g, '<script$1$3>')

// 2) 移除 <link rel="modulepreload" ...>
html = html.replace(/[ \t]*<link[^>]*rel=["']modulepreload["'][^>]*>\s*/gi, '')

// 3) 移除 <link rel="stylesheet" crossorigin ...> 的 crossorigin（样式外链无需该属性）
html = html.replace(/(<link[^>]*rel=["']stylesheet["'][^>]*)\s+crossorigin(?:\s*=\s*["'][^"']*["'])?([^>]*>)/gi, '$1$2')

// 4) 把入口 <script src=...> 移到 </body> 之前（确保 DOM 就绪后再执行）
const scriptRe = /<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/gi
const scripts = [...html.matchAll(scriptRe)].map((m) => m[0])
if (scripts.length > 0) {
  html = html.replace(scriptRe, '')
  html = html.replace('</body>', scripts.join('\n    ') + '\n  </body>')
}

if (html === before) {
  console.warn('postbuild: HTML unchanged')
} else {
  fs.writeFileSync(htmlPath, html, 'utf8')
  console.log('postbuild: stripped ESM attrs + moved <script> before </body>')
}
