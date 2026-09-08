#!/usr/bin/env node
/**
 * normalize-fixtures.mjs
 * ------------------------------------------------------------------
 * 原始欧冠赛程 JSON → 前端标准化 JSON 的独立数据转换脚本。
 *
 * 输入：fixtures_90_en.json（UEFA 原始结构，data.value[] → match[]）
 * 输出：src/data/fixtures_normalized.json（前端可直接读取的静态 JSON）
 *
 * 运行方式（零依赖，Node >= 18）：
 *   node scripts/normalize-fixtures.mjs
 *   （或） npm run normalize
 *
 * 设计原则（对齐 Design.md 与现有 normalize.ts 的既定约定）：
 *   1. Matchday 以原始 mdId 为准（1..8），不通过比赛日期反推。
 *   2. 一个 Matchday 内可能含多个「实际比赛日」，由 gdId 分组；
 *      原始 gdId 是全局单调递增的整数字符串，仅在轮内作为分组键使用，
 *      绝不出现在前端展示名中。
 *   3. gdId → day 序号：每个 Matchday 内，按「北京时间」对各 gdId 分组
 *      从早到晚排序，依次编号 day=1/2/3…，并生成中文名「比赛日一/二/三…」。
 *   4. 原始 dateTime 为欧洲本地时间（Europe/Paris，CET/CEST），
 *      统一转换为北京时间（UTC+8），跨天日期正确进位；前端不再做时区换算。
 *   5. 球队三字母代码严格使用 htCCode / atCCode（禁用 htShortName / atShortName）。
 *   6. 所有可提前计算的索引（Matchday、day、gdId→day 映射、北京时间、
 *      主客场、球队索引、Fixture 索引、coverage）均在本脚本一次算完。
 *
 * 输出结构（顶层）：
 *   meta       生成信息与统计
 *   matchdays  Matchday 视角（Matchday → 比赛日 → 比赛）
 *   fixtures   Fixture 扁平索引（按 matchday/day/时间 排序）
 *   teams      Team 视角（球队 → Matchday → Fixture）
 *   coverage   球队赛程覆盖索引（球队 → Matchday → day）
 *
 * 本脚本只做数据转换，不修改前端、UI、Design.md，也不修改原始 JSON。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const INPUT_FILE = resolve(__dirname, '..', 'fixtures_90_en.json')
const OUTPUT_FILE = resolve(__dirname, '..', 'src', 'data', 'fixtures_normalized.json')

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** 中文序数：一..十，超出回退为数字 */
function cnOrdinal(n) {
  const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  return CN[n - 1] ?? String(n)
}

/**
 * Europe/Paris（CET/CEST）相对 UTC 的偏移小时数。
 * 欧盟夏令时规则：3 月最后一个周日 02:00 CET 起 +2h（CEST），
 * 10 月最后一个周日 03:00 CEST 起回落 +1h（CET）。
 * 比赛均为晚间 18:45 / 21:00 开球，远离凌晨切换点，按「日」判定即可。
 * （与现有 src/data/normalize.ts 保持同一套换算，保证输出一致。）
 */
function europeOffsetHours(year, month0, day) {
  const lastSunday = (m0) => {
    const lastDay = new Date(Date.UTC(year, m0 + 1, 0)) // 该月最后一天
    return lastDay.getUTCDate() - lastDay.getUTCDay()
  }
  const startDay = lastSunday(2) // March
  const endDay = lastSunday(9) // October
  const key = (month0 + 1) * 100 + day
  const startKey = 3 * 100 + startDay
  const endKey = 10 * 100 + endDay
  return key >= startKey && key < endKey ? 2 : 1 // 2=CEST, 1=CET
}

/**
 * "MM/DD/YYYY HH:mm:ss"（欧洲本地时间）→ 北京时间结构化字段。
 * 跨天自动进位：例如 09/08 18:45 (CEST) → 北京时间 09/09 00:45。
 * 解析失败抛错，交由上层校验统一收集。
 */
function parseToBeijing(dateTime) {
  const [datePart, timePart] = dateTime.split(' ')
  if (!datePart || !timePart) throw new Error(`unparseable dateTime: "${dateTime}"`)

  const [m, d, y] = datePart.split('/').map(Number)
  const [hh, mm, ss] = timePart.split(':').map(Number)
  if ([m, d, y, hh, mm].some((v) => !Number.isFinite(v))) {
    throw new Error(`unparseable dateTime: "${dateTime}"`)
  }

  // 欧洲本地时间 → UTC → 北京时间（UTC+8）
  const utcMs = Date.UTC(y, m - 1, d, hh, mm, ss ?? 0) - europeOffsetHours(y, m - 1, d) * 3600 * 1000
  const bj = new Date(utcMs + 8 * 3600 * 1000)

  const pad = (n) => String(n).padStart(2, '0')
  const date = `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())}`
  const time = `${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}`
  const datetime = `${date}T${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}+08:00`
  const weekday = WEEKDAYS[bj.getUTCDay()]

  return { date, time, datetime, weekday }
}

/** 生成北京时间的 ISO 时间戳（用于 meta.generatedAt，本地展示用） */
function beijingNowIso() {
  const bj = new Date(Date.now() + 8 * 3600 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())}T${pad(
    bj.getUTCHours(),
  )}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}+08:00`
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const errors = []
const warnings = []

console.log('== 欧冠赛程数据标准化 ==\n')

// 1. 读取原始 JSON
const raw = JSON.parse(readFileSync(INPUT_FILE, 'utf-8'))
const rounds = raw?.data?.value
if (!Array.isArray(rounds)) {
  console.error(`[ERROR] 原始数据缺少 data.value[] 结构：${INPUT_FILE}`)
  process.exit(1)
}

const allRawMatches = rounds.flatMap((r) => r.match ?? [])
console.log(`Loaded ${allRawMatches.length} matches`)

// 2. 归一化每场比赛（含北京时间、matchday、gdId 分组）
const seenIds = new Set()
const missingHomeCode = []
const missingAwayCode = []

const normalized = allRawMatches.map((m, idx) => {
  // matchday：以 matchday 对象为准（由 rounds 反查）
  const mdIndex = rounds.findIndex((r) => (r.match ?? []).includes(m))
  const md = rounds[mdIndex]
  const matchday = md?.mdId ?? mdIndex + 1

  let bj
  try {
    bj = parseToBeijing(m.dateTime)
  } catch (e) {
    errors.push(e.message)
    return null
  }

  const id = Number(m.mId)
  if (seenIds.has(id)) {
    warnings.push(`重复比赛 ID：${m.mId}（第 ${idx} 场）`)
  }
  seenIds.add(id)

  const homeCode = m.htCCode
  const awayCode = m.atCCode
  if (!homeCode) missingHomeCode.push(m.mId)
  if (!awayCode) missingAwayCode.push(m.mId)

  return {
    id,
    matchday,
    gdId: Number.parseInt(m.gdId, 10),
    date: bj.date,
    weekday: bj.weekday,
    time: bj.time,
    datetime: bj.datetime,
    home: { id: m.htId, code: homeCode, name: m.htName },
    away: { id: m.atId, code: awayCode, name: m.atName },
    stadium: m.stadiumName,
    venue: m.venueName,
  }
})

if (missingHomeCode.length) errors.push(`缺少主队代码的比赛：${missingHomeCode.join(', ')}`)
if (missingAwayCode.length) errors.push(`缺少客队代码的比赛：${missingAwayCode.join(', ')}`)
if (normalized.some((m) => m === null)) {
  errors.push('存在无法解析的比赛时间，已在上方逐条列出')
}

// 3. 球队聚合（code 去重，取首次出现的 id/name/pot）
const teamMap = new Map()
for (const m of allRawMatches) {
  if (!teamMap.has(m.htCCode)) {
    teamMap.set(m.htCCode, { id: m.htId, code: m.htCCode, name: m.htName, pot: m.htPtName })
  }
  if (!teamMap.has(m.atCCode)) {
    teamMap.set(m.atCCode, { id: m.atId, code: m.atCCode, name: m.atName, pot: m.atPtName })
  }
}
console.log(`Found ${teamMap.size} teams`)

// 4. Matchday 视角 + gdId → day 映射
const validMatches = normalized.filter(Boolean)
const matchdays = rounds.map((md, i) => {
  const mdNumber = md.mdId ?? i + 1
  const mdMatches = validMatches
    .filter((m) => m.matchday === mdNumber)
    .sort((a, b) => a.datetime.localeCompare(b.datetime))

  // 按 gdId 分组（轮内分组键）
  const byGdId = new Map()
  for (const m of mdMatches) {
    if (!byGdId.has(m.gdId)) byGdId.set(m.gdId, [])
    byGdId.get(m.gdId).push(m)
  }

  // 各组取最早北京时间，作为该比赛日排序依据
  const groups = Array.from(byGdId.entries()).map(([gdId, matches]) => {
    const sorted = matches.sort((a, b) => a.datetime.localeCompare(b.datetime))
    return { gdId, matches: sorted, minDate: sorted[0].date, maxDate: sorted[sorted.length - 1].date }
  })
  // 关键逻辑：按北京日期从早到晚排序 → 依次编号 day=1/2/3…
  groups.sort((a, b) => a.minDate.localeCompare(b.minDate) || a.gdId - b.gdId)

  const days = groups.map((g, di) => ({
    day: di + 1,
    name: `比赛日${cnOrdinal(di + 1)}`,
    date: g.minDate,
    gdId: g.gdId, // 内部字段，禁止前端展示
    matches: g.matches,
  }))

  // 该轮日期范围（升序去重），供前端标题使用
  const dateKeys = Array.from(new Set(mdMatches.map((m) => m.date))).sort()
  const start = dateKeys[0] ?? ''
  const end = dateKeys[dateKeys.length - 1] ?? ''
  const dateRange = start === end ? start.slice(5) : `${start.slice(5)} ~ ${end.slice(5)}`

  return {
    id: mdNumber,
    name: `Matchday ${mdNumber}`,
    dateRange,
    days,
  }
})

console.log(`Found ${matchdays.length} matchdays`)

// 5. Fixture 扁平索引（matchday → day → 时间 排序）
const fixtures = validMatches
  .slice()
  .sort((a, b) => a.matchday - b.matchday || a.datetime.localeCompare(b.datetime))

// 6. Team 视角（球队 → Matchday → Fixture） + coverage（球队 → Matchday → day）
const teams = {}
const coverage = {}
for (const [code, t] of teamMap) {
  const entry = {
    id: t.id,
    code: t.code,
    name: t.name,
    pot: t.pot,
    fixtures: {},
  }
  const cov = {}
  for (const m of validMatches) {
    const isHome = m.home.code === code
    const isAway = m.away.code === code
    if (!isHome && !isAway) continue

    const opp = isHome ? m.away : m.home
    const key = `MD${m.matchday}`
    entry.fixtures[key] = {
      matchday: m.matchday,
      matchId: m.id,
      day: daysOf(matchdays, m.matchday, m.id),
      date: m.date,
      time: m.time,
      datetime: m.datetime,
      opponent: opp.code,
      opponentName: opp.name,
      homeAway: isHome ? 'H' : 'A',
      fdr: null, // 预留：FDR 数据后续填充
    }
    cov[key] = entry.fixtures[key].day
  }
  teams[code] = entry
  coverage[code] = cov
}

// 小工具：反查某场比赛在所属 Matchday 内的 day 序号
function daysOf(matchdays, matchday, matchId) {
  const md = matchdays.find((x) => x.id === matchday)
  if (!md) return null
  for (const day of md.days) {
    if (day.matches.some((m) => m.id === matchId)) return day.day
  }
  return null
}

// 7. 数据校验
function validate() {
  // 1) 必须存在 8 个 Matchday
  if (matchdays.length !== 8) {
    errors.push(`Matchday 数量异常：期望 8，实际 ${matchdays.length}`)
  }
  // 2) 重复比赛 ID（已在归一化阶段记录为 warning，这里兜底）
  const idCount = new Map()
  for (const m of validMatches) idCount.set(m.id, (idCount.get(m.id) ?? 0) + 1)
  for (const [id, c] of idCount) if (c > 1) errors.push(`重复比赛 ID：${id} 出现 ${c} 次`)

  // 6) 每场比赛归属 Matchday
  for (const m of validMatches) {
    if (!matchdays.some((md) => md.id === m.matchday)) {
      errors.push(`比赛 ${m.id} 未归属任何 Matchday`)
    }
  }
  // 7) 每场比赛归属实际比赛日
  for (const m of validMatches) {
    const md = matchdays.find((x) => x.id === m.matchday)
    const hasDay = md?.days.some((day) => day.matches.some((x) => x.id === m.id))
    if (!hasDay) errors.push(`比赛 ${m.id} 未归属任何实际比赛日`)
  }
  // 8) 同一球队在同一 Matchday + day 出现超过一场
  const slotCount = new Map()
  for (const m of validMatches) {
    const md = matchdays.find((x) => x.id === m.matchday)
    const day = md?.days.find((d) => d.matches.some((x) => x.id === m.id))
    if (!day) continue
    for (const code of [m.home.code, m.away.code]) {
      const k = `${code}|${m.matchday}|${day.day}`
      slotCount.set(k, (slotCount.get(k) ?? 0) + 1)
    }
  }
  for (const [k, c] of slotCount) {
    if (c > 1) warnings.push(`球队在 ${k} 出现 ${c} 场比赛（正常应仅 1 场）`)
  }
  // 9) 球队 fixture 反向对应回原始比赛
  const idSet = new Set(validMatches.map((m) => m.id))
  for (const [code, t] of Object.entries(teams)) {
    for (const [mdKey, fx] of Object.entries(t.fixtures)) {
      if (!idSet.has(fx.matchId)) {
        errors.push(`球队 ${code} 的 ${mdKey} fixture 反查失败：matchId ${fx.matchId} 不存在`)
        continue
      }
      const src = validMatches.find((m) => m.id === fx.matchId)
      const inHome = src.home.code === code && src.away.code === fx.opponent
      const inAway = src.away.code === code && src.home.code === fx.opponent
      if (!inHome && !inAway) {
        errors.push(`球队 ${code} 的 ${mdKey} fixture 与原始比赛 ${fx.matchId} 不一致`)
      }
    }
  }
}

validate()

// 8. 组装最终 JSON
const seasonStartYear = Math.min(...validMatches.map((m) => Number(m.date.slice(0, 4))))
const seasonEndYear = Math.max(...validMatches.map((m) => Number(m.date.slice(0, 4))))
const totalDays = matchdays.reduce((n, md) => n + md.days.length, 0)

const output = {
  meta: {
    generatedAt: beijingNowIso(),
    sourceFile: 'fixtures_90_en.json',
    outputFile: 'src/data/fixtures_normalized.json',
    timezone: 'Asia/Shanghai',
    timezoneOffset: '+08:00',
    season: `${seasonStartYear}/${seasonEndYear}`,
    stats: {
      matches: validMatches.length,
      teams: Object.keys(teams).length,
      matchdays: matchdays.length,
      days: totalDays,
    },
  },
  matchdays,
  fixtures,
  teams,
  coverage,
}

// 9. 输出
if (errors.length) {
  console.error('\n[ERROR] 校验未通过，未写入输出文件：')
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}

writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n', 'utf-8')

if (warnings.length) {
  console.warn('\n[WARNING] 存在非致命告警：')
  for (const w of warnings) console.warn(`  ⚠ ${w}`)
}

// 10. 统计结果（动态计算，不硬编码）
const dayLabels = matchdays.map((md) => `${md.name}: ${md.days.map((d) => d.name).join('/')}`)
console.log('\nConverted kickoff times to Beijing Time (UTC+8)')
console.log(`Generated game days: ${totalDays} days across ${matchdays.length} matchdays`)
console.log(`Generated team fixture index: ${Object.keys(teams).length} teams`)
console.log(`Generated coverage index: ${Object.keys(coverage).length} teams`)
console.log('\nGame day mapping (gdId → day):')
for (const md of matchdays) {
  const parts = md.days.map((d) => `gdId ${d.gdId} → day ${d.day} (${d.name}, ${d.date})`)
  console.log(`  ${md.name}: ${parts.join('  |  ')}`)
}
console.log(`\n✔ 已生成：${OUTPUT_FILE}`)
console.log(
  `  尺寸：${(JSON.stringify(output).length / 1024).toFixed(1)} KB · 比赛 ${validMatches.length} 场 · 球队 ${
    Object.keys(teams).length
  } 支 · 比赛日 ${totalDays} 个`,
)
