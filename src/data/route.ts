/**
 * 队长路线派生
 * 按北京日期 + 开球时刻升序，为每个 (dateKey, kickoffTime) 槽位分配序号，
 * 并生成「可切换对」的链条（先踢 → 后踢）。
 * 撞车 = 同一槽位内 >= 2 支已选球队。
 */

import type { Matchday, Team } from '../types'

export interface RouteTeam {
  code: string
  isHome: boolean
  opp: string
}

export interface RouteSlot {
  key: string // "dateKey|kickoffTime"
  dateKey: string
  weekday: string
  gdId: number // 比赛日内部键（供浮层按比赛日分组）
  kickoffTime: string
  no: number // 1-based 开球先后序号
  teams: RouteTeam[]
  conflict: boolean // >=2 队同时刻
}

export interface CaptainRoute {
  slots: RouteSlot[]
  chain: string[] // 可切换链，如 ["MCI", "BAR", "(ARS|PSG)", "BAY"]
}

export function computeCaptainRoute(matchday: Matchday, selectedTeams: Team[]): CaptainRoute {
  const codes = new Set(selectedTeams.map((t) => t.code))
  const bySlot = new Map<
    string,
    { dateKey: string; weekday: string; gdId: number; kickoffTime: string; teams: RouteTeam[] }
  >()

  for (const m of matchday.matches) {
    const hasHome = codes.has(m.home.code)
    const hasAway = codes.has(m.away.code)
    if (!hasHome && !hasAway) continue

    const key = m.dateKey + '|' + m.kickoffTime
    let slot = bySlot.get(key)
    if (!slot) {
      slot = {
        dateKey: m.dateKey,
        weekday: m.weekday,
        gdId: m.gdId,
        kickoffTime: m.kickoffTime,
        teams: [],
      }
      bySlot.set(key, slot)
    }
    if (hasHome) slot.teams.push({ code: m.home.code, isHome: true, opp: m.away.code })
    if (hasAway) slot.teams.push({ code: m.away.code, isHome: false, opp: m.home.code })
  }

  const keys = Array.from(bySlot.keys()).sort()
  const slots: RouteSlot[] = keys.map((key, i) => {
    const s = bySlot.get(key)!
    return { key, ...s, no: i + 1, conflict: s.teams.length >= 2 }
  })

  const chain = slots.map((s) =>
    s.teams.length === 1 ? s.teams[0].code : `(${s.teams.map((t) => t.code).join('|')})`,
  )

  return { slots, chain }
}
