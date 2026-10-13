/**
 * 选队 / 球员数约束（纯函数，无 UI）
 *
 * 三条硬约束：
 *   1. 同时勾选的球队数 ≤ MAX_TEAMS
 *   2. 单支球队可选用的球员数 1 ~ MAX_PLAYERS_PER_TEAM
 *   3. 单个 Matchday（整轮）的参赛球员合计 ≤ MAX_PLAYERS_PER_MATCHDAY
 *
 * 关键前提：欧冠联赛阶段每支球队在每个 Matchday 恰好有 1 场比赛
 * （由 scripts/verify-logic.mjs 的「每队每轮恰好 1 场」断言保证）。
 * 因此整轮合计 = Σ 各已选球队球员数，与轮次无关 —— 按可见轮次计算等价于全局。
 */

import type { Matchday } from '../types'

/** 可同时勾选的球队数上限 */
export const MAX_TEAMS = 15

/** 单支球队最多可选用的球员数 */
export const MAX_PLAYERS_PER_TEAM = 3

/** 单个 Matchday（整轮）参赛球员合计上限 */
export const MAX_PLAYERS_PER_MATCHDAY = 15

/**
 * 某轮参赛球员合计：该轮有比赛的已选球队，其球员数之和。
 * 同队在一轮只可能有一场，故按球队去重后累加。
 */
export function playersInMatchday(
  md: Matchday,
  selectedCodes: string[],
  playerCounts: Record<string, number>,
): number {
  const sel = new Set(selectedCodes)
  const codes = new Set<string>()
  for (const m of md.matches) {
    if (sel.has(m.home.code)) codes.add(m.home.code)
    if (sel.has(m.away.code)) codes.add(m.away.code)
  }
  let sum = 0
  for (const c of codes) sum += playerCounts[c] ?? 1
  return sum
}

/** 传入的轮次中，存在合计超限的轮次数 */
export function countOverCapMatchdays(
  matchdays: Matchday[],
  selectedCodes: string[],
  playerCounts: Record<string, number>,
): number {
  let n = 0
  for (const md of matchdays) {
    if (playersInMatchday(md, selectedCodes, playerCounts) > MAX_PLAYERS_PER_MATCHDAY) n++
  }
  return n
}

/** 是否可以新增这支球队（默认按 1 名球员计） */
export function canAddTeam(
  matchdays: Matchday[],
  selectedCodes: string[],
  playerCounts: Record<string, number>,
  code: string,
): boolean {
  if (selectedCodes.includes(code)) return true
  const next = [...selectedCodes, code]
  return countOverCapMatchdays(matchdays, next, playerCounts) === 0
}

/** 把某队设为 n 名球员是否仍满足整轮上限 */
export function canSetPlayerCount(
  matchdays: Matchday[],
  selectedCodes: string[],
  playerCounts: Record<string, number>,
  code: string,
  n: number,
): boolean {
  const next = { ...playerCounts, [code]: n }
  return countOverCapMatchdays(matchdays, selectedCodes, next) === 0
}

/**
 * 该队当前最多能设到几名球员（1 ~ MAX_PLAYERS_PER_TEAM）。
 * 从上限往下找第一个可行值；若当前值已超限（例如范围收窄后）返回 1。
 */
export function maxPlayersForTeam(
  matchdays: Matchday[],
  selectedCodes: string[],
  playerCounts: Record<string, number>,
  code: string,
): number {
  for (let n = MAX_PLAYERS_PER_TEAM; n >= 1; n--) {
    if (canSetPlayerCount(matchdays, selectedCodes, playerCounts, code, n)) return n
  }
  return 1
}