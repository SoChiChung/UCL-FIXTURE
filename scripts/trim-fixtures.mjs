#!/usr/bin/env node
/**
 * 裁剪 fixtures.json：只保留 normalize.ts 实际读取的字段，删除死数据。
 *
 * normalize.ts 的 RawMatch 仅使用以下 13 个字段，其余（含 stadiumThumb 外部 URL、
 * 比分、锁定状态、抽签 id 等约 28 个字段）均为打包进 bundle 的死数据。
 * 按 performance-budget §2「只保留完成核心功能必需的字段」裁剪，去除外部 URL 引用。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'src', 'data', 'fixtures.json')

const KEEP = new Set([
  'mId',
  'dateTime',
  'gdId',
  'htId',
  'htName',
  'htCCode',
  'htPtName',
  'atId',
  'atName',
  'atCCode',
  'atPtName',
  'stadiumName',
  'venueName',
])

const data = JSON.parse(fs.readFileSync(src, 'utf8'))

let droppedFields = 0
let droppedUrls = 0
for (const round of data.data.value) {
  for (const m of round.match) {
    for (const key of Object.keys(m)) {
      if (!KEEP.has(key)) {
        if (typeof m[key] === 'string' && /^https?:/.test(m[key])) droppedUrls++
        delete m[key]
        droppedFields++
      }
    }
  }
}

fs.writeFileSync(src, JSON.stringify(data, null, 2) + '\n', 'utf8')
const before = fs.statSync(src).size
console.log(`trim-fixtures: dropped ${droppedFields} dead fields (${droppedUrls} external URLs)`)
