/**
 * 赛程推荐算法模块（纯函数，无 UI）
 *
 * 核心逻辑（见 Design-赛程推荐.md v1.2 §5）：
 *   已选 N 支球队 → 计算当前覆盖 → 根据 Range Filter 生成范围 Slot
 *   → 找 Missing Slots（赛程坑）→ 遍历未选球队算 filledHoles
 *   → 排序 → 只取第 1 名（推荐下一支）。
 *
 * 数据来源：只读 fixtures_normalized.json 的 coverage / teams / matchdays，
 * 不解析 fixtures_90_en.json，不遍历 144 场比赛。
 * 每轮比赛日数量「动态」从 matchdays[].days 派生，不硬编码。
 */

import rawText from './fixtures_normalized.json?raw'

// ---------- 宽松类型（仅推荐功能使用） ----------
interface NormalizedMatchdayDay {
  day: number
  name: string
  date: string
  gdId: number
}

interface NormalizedMatchday {
  id: number
  name: string
  dateRange: string
  days: NormalizedMatchdayDay[]
}

interface NormalizedTeamFixture {
  matchday: number
  day: number
  date: string
  time: string
  opponent: string
  opponentName: string
  homeAway: 'H' | 'A'
  fdr: number | null
}

interface NormalizedTeam {
  id: number
  code: string
  name: string
  pot: string
  fixtures: Record<string, NormalizedTeamFixture>
}

interface NormalizedData {
  matchdays: NormalizedMatchday[]
  teams: Record<string, NormalizedTeam>
  coverage: Record<string, Record<string, number>>
}

const data = JSON.parse(rawText) as NormalizedData

// ---------- 对外类型 ----------
export interface Ranking {
  code: string
  name: string
  pot: string
  filledHoles: number
}

export interface RecommendationResult {
  missingSlots: string[]
  rankings: Ranking[] // 全量候选，filledHoles 降序 + code 升序
  top: Ranking | null // 第 1 名，即本次推荐
  tiedRemaining: { count: number; score: number } | null // 相对第 1 名的同分提示
}

export interface TeamFixtureLine {
  matchday: number
  day: number
  date: string
  time: string
  opponent: string
  homeAway: 'H' | 'A'
}

// ---------- 每轮比赛日数量（动态派生，一次性缓存，不硬编码） ----------
const daysByMatchday: Map<number, number[]> = (() => {
  const map = new Map<number, number[]>()
  for (const md of data.matchdays) {
    const days = md.days.map((d) => d.day).sort((a, b) => a - b)
    map.set(md.id, days)
  }
  return map
})()

/** 获取每轮包含的比赛日序号（如 {1:[1,2,3], 2:[1,2], …, 8:[1]}） */
export function buildDaysByMatchday(): Map<number, number[]> {
  return daysByMatchday
}

/** 某球队覆盖的赛程 Slot 集合，如 { "MD1-D1", "MD2-D2", ... } */
export function candidateCoverage(code: string): Set<string> {
  const cov = data.coverage[code]
  const set = new Set<string>()
  if (!cov) return set
  for (const [mdKey, day] of Object.entries(cov)) {
    set.add(`${mdKey}-D${day}`)
  }
  return set
}

/**
 * 推荐下一支球队（唯一评分 = filledHoles）。
 * @param selectedCodes 当前已选球队 code 数组（长度 1~9）
 * @param rangeStart   Matchday Range Filter 起始（含）
 * @param rangeEnd     Matchday Range Filter 结束（含）
 */
export function recommendNextTeam(
  selectedCodes: string[],
  rangeStart: number,
  rangeEnd: number,
): RecommendationResult {
  // 1. 当前覆盖（并集已选球队的 candidateCoverage）
  const currentCoverage = new Set<string>()
  for (const code of selectedCodes) {
    for (const slot of candidateCoverage(code)) currentCoverage.add(slot)
  }

  // 2. 范围全部 Slot（动态派生，不硬编码每轮比赛日数量）
  const rangeSlots = new Set<string>()
  for (let md = rangeStart; md <= rangeEnd; md++) {
    const days = daysByMatchday.get(md) ?? []
    for (const day of days) rangeSlots.add(`MD${md}-D${day}`)
  }

  // 3. 坑 = 范围 Slot - 已覆盖
  const missingSlots = Array.from(rangeSlots)
    .filter((s) => !currentCoverage.has(s))
    .sort()

  // 无坑 → 不推荐
  if (missingSlots.length === 0) {
    return { missingSlots: [], rankings: [], top: null, tiedRemaining: null }
  }

  // 4/5/6. 遍历未选球队，算 filledHoles
  const rankings: Ranking[] = []
  for (const [code, team] of Object.entries(data.teams)) {
    if (selectedCodes.includes(code)) continue
    const cov = candidateCoverage(code)
    let filled = 0
    for (const s of missingSlots) if (cov.has(s)) filled++
    rankings.push({ code, name: team.name, pot: team.pot, filledHoles: filled })
  }

  // 7. 排序：filledHoles 降序，同分按 code 字母序稳定
  rankings.sort((a, b) => b.filledHoles - a.filledHoles || a.code.localeCompare(b.code))

  // 8. 只取第 1 名
  const top = rankings[0] ?? null
  const tiedRemaining = top ? computeTiedRemaining(rankings, 0) : null
  return { missingSlots, rankings, top, tiedRemaining }
}

/**
 * 计算某候选的并列提示：与当前候选 filledHoles 相同、且排在它之后的候选数。
 * @param rankings 稳定排序后的全量候选
 * @param index    当前展示候选在 rankings 中的序号
 */
export function computeTiedRemaining(
  rankings: Ranking[],
  index: number,
): { count: number; score: number } | null {
  const cur = rankings[index]
  if (!cur) return null
  const same = rankings.filter((r) => r.filledHoles === cur.filledHoles)
  const k = same.findIndex((r) => r.code === cur.code)
  const count = same.length - k - 1
  return count > 0 ? { count, score: cur.filledHoles } : null
}

/** 某球队在指定范围内的赛程明细（供「查看赛程」展示） */
export function getTeamFixtures(
  code: string,
  rangeStart: number,
  rangeEnd: number,
): TeamFixtureLine[] {
  const team = data.teams[code]
  if (!team) return []
  const lines: TeamFixtureLine[] = []
  for (let md = rangeStart; md <= rangeEnd; md++) {
    const f = team.fixtures[`MD${md}`]
    if (!f) continue
    lines.push({
      matchday: md,
      day: f.day,
      date: f.date,
      time: f.time,
      opponent: f.opponentName || f.opponent,
      homeAway: f.homeAway,
    })
  }
  return lines
}
