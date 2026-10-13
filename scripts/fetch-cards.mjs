/**
 * 抓取欧冠黄牌 / 红牌榜（球队级）→ src/data/cards.json
 *
 * 数据源：FotMob 公开统计端点（非官方 API，免key）
 *   https://data.fotmob.com/stats/42/season/<seasonId>/total_yel_card_team.json
 *   https://data.fotmob.com/stats/42/season/<seasonId>/total_red_card_team.json
 *
 * 说明：
 *   - 42 = Champions League 模板 id；seasonId 为 FotMob 的 TournamentId
 *     （26/27 赛季 = 47760，可用 https://www.fotmob.com/api/data/leagues?id=42 复核）
 *   - 响应为 gzip，必须 --compressed；需带 UA + Referer，否则 403/404
 *   - 只保留 StatValue > 0 的球队，避免榜单塞满 0 张的队
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
/** 26/27 赛季 TournamentId，可用默认参数覆盖 */
const DEFAULT_SEASON = 47760

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Referer: 'https://www.fotmob.com/',
}

/** 单个统计端点 → 精简后的球队数组 */
async function fetchTeamStat(seasonId, statName) {
  const url = `https://data.fotmob.com/stats/${LEAGUE_ID}/season/${seasonId}/${statName}.json`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${statName}: HTTP ${res.status} ${url}`)
  const json = await res.json()

  const list = json?.TopLists?.[0]?.StatList
  if (!Array.isArray(list)) throw new Error(`${statName}: 响应缺少 TopLists[0].StatList`)

  return list
    .filter((r) => (r.StatValue ?? 0) > 0)
    .map((r) => ({
      team: r.ParticipantName,
      teamId: r.TeamId,
      count: r.StatValue,
      // 副统计：黄牌榜里的 SubStatValue 是红牌数，反之亦然
      other: r.SubStatValue ?? 0,
      color: r.TeamColor ?? null,
    }))
}

/** 探测赛季 id 是否有效（避免把 404 HTML 当 JSON 解析） */
async function assertSeason(seasonId) {
  const url = `https://www.fotmob.com/api/data/leagues?id=${LEAGUE_ID}`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) return // 探测失败不阻断，交给后续抓取报错
  const json = await res.json()
  const ids = (json?.stats?.seasonStatLinks ?? [])
    .map((s) => s.TournamentId)
    .filter(Boolean)
  if (ids.length && !ids.includes(seasonId)) {
    console.warn(`⚠️  赛季 ${seasonId} 不在 FotMob 已知列表：${ids.join(', ')}`)
    console.warn(`   最新可用赛季：${ids[0]}`)
  }
}

const seasonId = Number(process.argv[2] ?? DEFAULT_SEASON)

try {
  await assertSeason(seasonId)
  const [yellow, red] = await Promise.all([
    fetchTeamStat(seasonId, 'total_yel_card_team'),
    fetchTeamStat(seasonId, 'total_red_card_team'),
  ])

  const payload = {
    season: '2026/2027',
    seasonId,
    updatedAt: new Date().toISOString().slice(0, 10),
    source: 'FotMob (data.fotmob.com)',
    yellow,
    red,
  }
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8')

  console.log(`✅ 黄牌榜 ${yellow.length} 队 / 红牌榜 ${red.length} 队`)
  console.log(`   → ${OUT}`)
  if (yellow.length) {
    const t = yellow[0]
    console.log(`   黄牌 TOP1: ${t.team} ${t.count} 黄 ${t.other} 红`)
  }
  if (red.length) {
    const t = red[0]
    console.log(`   红牌 TOP1: ${t.team} ${t.count} 红`)
  }
} catch (err) {
  console.error('❌ 抓取失败：', err.message)
  process.exitCode = 1
}