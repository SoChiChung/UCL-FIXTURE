/**
 * 数据归一化层
 * 将 UEFA 原始 fixtures.json（data.value[] 嵌套结构）解析为扁平领域模型，
 * 并将源数据（欧洲本地时间 CET/CEST）统一转换为北京时间（UTC+8）。
 *
 * 关键映射（见 Design.md v1.1 §1 / §15）：
 *   - 轮次 = data.value 数组索引 + 1（gameday/gamedayNew 不可靠，忽略）
 *   - 3 字母缩写 = htCCode / atCCode（htShortName 实为全称变体）
 *   - 时间 "MM/DD/YYYY HH:mm:ss"（欧洲本地）→ 北京时间 dateKey / weekday / kickoffTime
 */

import rawText from './fixtures.json?raw'
import type { FixtureData, Match, Matchday, SubDay, Team, TeamRef } from '../types'
import { cnOrdinal } from '../constants'

/** 原始数据字段（宽松类型，仅归一化时使用） */
interface RawMatch {
  mId: number
  dateTime: string
  gdId: string // Game Day ID（字符串，需转整数）
  htId: number
  htName: string
  htCCode: string
  htPtName: string
  atId: number
  atName: string
  atCCode: string
  atPtName: string
  stadiumName: string
  venueName: string
}

interface RawRound {
  match: RawMatch[]
}

interface RawData {
  data: {
    value: RawRound[]
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Europe/Paris（CET/CEST）相对 UTC 的偏移小时数。
 * 欧盟夏令时规则：3 月最后一个周日 02:00 CET → 10 月最后一个周日 03:00 CEST。
 * 比赛均为晚间 18:45/21:00，远离凌晨的转换点，故按「日」判定即可。
 */
function europeOffsetHours(year: number, month: number, day: number): number {
  const lastSunday = (m: number): number => {
    const lastDay = new Date(Date.UTC(year, m + 1, 0)) // 该月最后一天
    return lastDay.getUTCDate() - lastDay.getUTCDay()
  }
  const startDay = lastSunday(2) // March（0-based 2）
  const endDay = lastSunday(9) // October（0-based 9）
  const key = (month + 1) * 100 + day
  const startKey = 3 * 100 + startDay
  const endKey = 10 * 100 + endDay
  return key >= startKey && key < endKey ? 2 : 1 // CEST=+2h, CET=+1h
}

/** "MM/DD/YYYY HH:mm:ss"（欧洲本地时间）→ { dateKey, weekday, kickoffTime }（北京时间） */
function parseDateTime(dateTime: string): {
  dateKey: string
  weekday: string
  kickoffTime: string
} {
  const [datePart, timePart] = dateTime.split(' ')
  const [m, d, y] = datePart.split('/').map((s) => parseInt(s, 10))
  const [hh, mm] = timePart.split(':').map((s) => parseInt(s, 10))

  // 欧洲本地时间 → UTC（毫秒）
  const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0) - europeOffsetHours(y, m - 1, d) * 3600 * 1000
  // UTC → 北京时间（UTC+8）
  const bj = new Date(utcMs + 8 * 3600 * 1000)

  const pad = (n: number) => String(n).padStart(2, '0')
  const dateKey = `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())}`
  const weekday = WEEKDAYS[bj.getUTCDay()]
  const kickoffTime = `${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}`

  return { dateKey, weekday, kickoffTime }
}

function toTeamRef(id: number, code: string, name: string): TeamRef {
  return { id, code, name }
}

const typed = JSON.parse(rawText) as RawData

/** 聚合全局球队（按 code 去重，取首个出现的 id/name/pot） */
function buildTeams(rounds: RawRound[]): { teams: Team[]; teamByCode: Record<string, Team> } {
  const map = new Map<string, Team>()
  for (const round of rounds) {
    for (const m of round.match) {
      if (!map.has(m.htCCode)) {
        map.set(m.htCCode, { id: m.htId, code: m.htCCode, name: m.htName, pot: m.htPtName })
      }
      if (!map.has(m.atCCode)) {
        map.set(m.atCCode, { id: m.atId, code: m.atCCode, name: m.atName, pot: m.atPtName })
      }
    }
  }
  const teams = Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code))
  const teamByCode: Record<string, Team> = {}
  for (const t of teams) teamByCode[t.code] = t
  return { teams, teamByCode }
}

/** 构建扁平领域模型 */
export function buildFixtureData(): FixtureData {
  const rounds = typed.data.value

  const matchdays: Matchday[] = rounds.map((round, idx) => {
    const matches: Match[] = round.match
      .map((m) => {
        const { dateKey, weekday, kickoffTime } = parseDateTime(m.dateTime)
        return {
          id: m.mId,
          matchday: idx + 1,
          gdId: parseInt(m.gdId, 10),
          dateKey,
          weekday,
          kickoffTime,
          home: toTeamRef(m.htId, m.htCCode, m.htName),
          away: toTeamRef(m.atId, m.atCCode, m.atName),
          stadium: m.stadiumName,
          venue: m.venueName,
          extensions: [],
        }
      })
      // 按北京日期 + 开球时刻排序
      .sort((a, b) => (a.dateKey + a.kickoffTime).localeCompare(b.dateKey + b.kickoffTime))

    const dateKeys = Array.from(new Set(matches.map((m) => m.dateKey))).sort()
    const weekdayByDate: Record<string, string> = {}
    for (const m of matches) weekdayByDate[m.dateKey] = m.weekday

    // 比赛日分组：GDID 去重，按北京日期升序赋序数（gdId 全局递增，须轮内重编序）
    const byGdId = new Map<number, { dateKey: string; weekday: string }>()
    for (const m of matches) {
      if (!byGdId.has(m.gdId)) byGdId.set(m.gdId, { dateKey: m.dateKey, weekday: m.weekday })
    }
    const subDays: SubDay[] = Array.from(byGdId.entries())
      .map(([gdId, v]) => ({ gdId, dateKey: v.dateKey, weekday: v.weekday }))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
      .map((s, i) => ({ ...s, ordinal: i + 1, label: `比赛日${cnOrdinal(i + 1)}` }))

    const start = dateKeys[0] ?? ''
    const end = dateKeys[dateKeys.length - 1] ?? ''
    const dateRangeLabel =
      start === end ? start.slice(5) : `${start.slice(5)} ~ ${end.slice(5)}`

    return {
      number: idx + 1,
      matches,
      dateKeys,
      weekdayByDate,
      dateRangeLabel,
      subDays,
    }
  })

  const { teams, teamByCode } = buildTeams(rounds)

  // 当前比赛日：该轮最大北京日期 >= 今天 的最小轮次
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  let currentMatchday = matchdays.length
  for (const md of matchdays) {
    const last = md.dateKeys[md.dateKeys.length - 1]
    if (last && last >= todayKey) {
      currentMatchday = md.number
      break
    }
  }

  return { teams, teamByCode, matchdays, currentMatchday }
}
