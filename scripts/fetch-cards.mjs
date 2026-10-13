/**
 * 抓取欧冠黄牌 / 红牌榜（球员级）→ src/data/cards.json
 *
 * 数据源：FotMob 公开统计端点（非官方 API，免 key）
 *   https://data.fotmob.com/stats/42/season/<seasonId>/yellow_card.json   球员黄牌榜
 *   https://data.fotmob.com/stats/42/season/<seasonId>/red_card.json      球员红牌榜
 *   https://data.fotmob.com/stats/42/season/<seasonId>/total_yel_card_team.json  球队黄牌
 *   https://data.fotmob.com/stats/42/season/<seasonId>/total_red_card_team.json  球队红牌
 *
 * 端点命名注意：球员级是 `yellow_card` / `red_card`，
 * **不是** `total_yel_card_player`（那个会返回 403）。
 * 端点 URL 可从联赛页 JSON 的 stats.players[].fetchAllUrl 复核。
 *
 * 说明：
 *   - 42 = Champions League 模板 id；seasonId 为 FotMob 的 TournamentId
 *     （26/27 赛季 = 47760，可用 https://www.fotmob.com/api/data/leagues?id=42 复核）
 *   - 响应为 gzip，Node 的 fetch 会自动解压；需带 UA + Referer，否则 403/404
 *   - 只保留 StatValue > 0 的记录
 *   - 结果落盘为静态 JSON，前端不直连第三方（CORS + 稳定性）
 *
 * 用法：node scripts/fetch-cards.mjs [seasonId]
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'src', 'data', 'cards.json')

/** FotMob 欧冠模板 id（固定） */
const LEAGUE_ID = 42
/** 26/27 赛季 TournamentId，可用命令行参数覆盖 */
const DEFAULT_SEASON = 47760

/** 榜单展示上限（题目要求前十） */
const TOP_N = 10

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Referer: 'https://www.fotmob.com/leagues/42/overview/champions-league',
  Accept: 'application/json',
}

/** 单个统计端点 → 精简后的记录数组 */
async function fetchStat(seasonId, statName) {
  const url = `https://data.fotmob.com/stats/${LEAGUE_ID}/season/${seasonId}/${statName}.json`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${statName}: HTTP ${res.status} ${url}`)
  const json = await res.json()

  const list = json?.TopLists?.[0]?.StatList
  if (!Array.isArray(list)) throw new Error(`${statName}: 响应缺少 TopLists[0].StatList`)

  return list
    .filter((r) => (r.StatValue ?? 0) > 0)
    .map((r) => ({
      player: r.ParticipantName,
      playerId: r.ParticiantId,
      team: r.TeamName ?? null,
      teamId: r.TeamId ?? null,
      color: r.TeamColor ?? null,
      country: r.ParticipantCountryCode ?? null,
      count: r.StatValue,
      // 副统计：黄牌榜里的 SubStatValue 是红牌数，反之亦然
      other: r.SubStatValue ?? 0,
      appearances: r.MatchesPlayed ?? 0,
      minutes: r.MinutesPlayed ?? 0,
    }))
}

/** 探测赛季 id 是否有效（避免把 404 HTML 当 JSON 解析） */
async function assertSeason(seasonId) {
  try {
    const res = await fetch(`https://www.fotmob.com/api/data/leagues?id=${LEAGUE_ID}`, {
      headers: HEADERS,
    })
    if (!res.ok) return
    const json = await res.json()
    const ids = (json?.stats?.seasonStatLinks ?? []).map((s) => s.TournamentId).filter(Boolean)
    if (ids.length && !ids.includes(seasonId)) {
      console.warn(`⚠️  赛季 ${seasonId} 不在 FotMob 已知列表：${ids.join(', ')}`)
      console.warn(`   最新可用赛季：${ids[0]}`)
    }
  } catch {
    // 探测失败不阻断，交给后续抓取报错
  }
}

const seasonId = Number(process.argv[2] ?? DEFAULT_SEASON)

try {
  await assertSeason(seasonId)
  const [yellowPlayers, redPlayers, yellowTeams, redTeams] = await Promise.all([
    fetchStat(seasonId, 'yellow_card'),
    fetchStat(seasonId, 'red_card'),
    fetchStat(seasonId, 'total_yel_card_team'),
    fetchStat(seasonId, 'total_red_card_team'),
  ])

  const payload = {
    season: '2026/2027',
    seasonId,
    updatedAt: new Date().toISOString().slice(0, 10),
    source: 'FotMob (data.fotmob.com)',
    topN: TOP_N,
    /** 球员级：只保留牌数最多的 TOP_N 位 */
    yellowPlayers: yellowPlayers.slice(0, TOP_N),
    redPlayers: redPlayers.slice(0, TOP_N),
    /** 球队级总量（参考用，不做停赛推算） */
    yellowTeams: yellowTeams.slice(0, TOP_N),
    redTeams: redTeams.slice(0, TOP_N),
  }
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8')

  console.log(`✅ 球员黄牌 TOP${payload.yellowPlayers.length} / 红牌 TOP${payload.redPlayers.length}`)
  console.log(`   球队黄牌 ${yellowTeams.length} 队 / 球队红牌 ${redTeams.length} 队`)
  console.log(`   → ${OUT}`)
  const maxY = payload.yellowPlayers[0]
  if (maxY) {
    console.log(`   黄牌 TOP1: ${maxY.player} (${maxY.team}) ${maxY.count} 黄`)
  }
  const maxR = payload.redPlayers[0]
  if (maxR) {
    console.log(`   红牌 TOP1: ${maxR.player} (${maxR.team}) ${maxR.count} 红`)
  }
} catch (err) {
  console.error('❌ 抓取失败：', err.message)
  process.exitCode = 1
}