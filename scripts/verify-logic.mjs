/**
 * 无浏览器逻辑验证：用 react-dom/server 渲染 TeamSelector / MatchdayMatrix，
 * 断言比赛日多选筛选（AND 语义）与「按比赛日汇总球员数」是否符合预期。
 *
 * 运行（需先打包：normalize.ts 使用 Vite 的 ?raw 导入，Node 无法直接解析 TSX）：
 *   npx esbuild scripts/verify-logic.mjs --bundle --platform=node --format=esm \
 *     --outfile=scripts/.verify.mjs --external:react --external:react-dom
 *   node scripts/.verify.mjs
 *
 * 也可以直接 `npm run verify`（内部完成上述两步）。
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import TeamSelector from '../src/components/TeamSelector'
import MatchdayMatrix from '../src/components/MatchdayMatrix'
import CardBoard from '../src/components/CardBoard'
import cardsData from '../src/data/cards.json'
import { buildFixtureData } from '../src/data/normalize'
import {
  MAX_TEAMS,
  MAX_PLAYERS_PER_TEAM,
  MAX_PLAYERS_PER_MATCHDAY,
  playersInMatchday,
  canAddTeam,
  canSetPlayerCount,
  maxPlayersForTeam,
} from '../src/data/selection'

const data = buildFixtureData()

let pass = 0
let fail = 0

function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`  PASS  ${name}`)
  } else {
    fail++
    console.log(`  FAIL  ${name} ${detail}`)
  }
}

/** 渲染 TeamSelector，返回 html 字符串 */
function renderSelector(dayFilters) {
  // 直接用组件渲染，dayFilters 需通过 UI 交互设置；
  // 这里改为导出内部过滤逻辑不可行，故用真实交互路径：
  // 通过 props 传入初始值不可行，改为断言 playDaysByCode 的等价数据。
  return null
}

console.log('\n=== 1. 数据完整性 ===')
check('36 支球队', data.teams.length === 36, `实际 ${data.teams.length}`)
check('8 个 Matchday', data.matchdays.length === 8, `实际 ${data.matchdays.length}`)

// 当前轮次推算：MD1 已过（9/9~9/11），现在应落在 MD2
console.log(`  当前轮次推算 → MD${data.currentMatchday}`)
check('MD1 已结束后当前轮不是 MD1', data.currentMatchday >= 2, `得到 MD${data.currentMatchday}`)
check(
  '当前轮落在赛程区间内',
  data.currentMatchday >= 1 && data.currentMatchday <= data.matchdays.length,
)

// 复刻 addDays 并验证轮次推算在多个日期的行为
{
  const addDays = (k, n) => {
    const [y, m, d] = k.split('-').map(Number)
    const t = Date.UTC(y, m - 1, d) + n * 86400000
    const dt = new Date(t)
    const p = (x) => String(x).padStart(2, '0')
    return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
  }
  const SETTLE = 2
  const rounds = data.matchdays.map((md) => [md.number, md.dateKeys])
  const calc = (today) => {
    let cur = 1
    for (const [n, ks] of rounds) {
      const last = ks[ks.length - 1]
      if (addDays(last, SETTLE) < today) continue
      cur = n
      break
    }
    const all = rounds.every(([, ks]) => addDays(ks[ks.length - 1], SETTLE) < today)
    return all ? rounds[rounds.length - 1][0] : cur
  }
  const cases = [
    ['2026-09-09', 1, 'MD1 进行中'],
    ['2026-09-13', 1, 'MD1 结束+1天，缓冲内'],
    ['2026-09-14', 2, 'MD1 结束+2天，顺延'],
    ['2026-10-13', 2, 'MD2 前一天'],
    ['2026-10-18', 3, 'MD2 结束后'],
    ['2027-02-01', 8, '赛季已结束'],
  ]
  console.log('  轮次推表演算：')
  for (const [date, want, note] of cases) {
    const got = calc(date)
    console.log(`    ${date} → MD${got}（期望 MD${want}）${note}`)
    check(`轮次推算 ${date}`, got === want, `得到 MD${got}`)
  }
}

// 每支球队每轮恰好一场
const perTeam = new Map()
for (const md of data.matchdays) {
  for (const m of md.matches) {
    for (const ref of [m.home, m.away]) {
      const k = `${ref.code}|${md.number}`
      perTeam.set(k, (perTeam.get(k) ?? 0) + 1)
    }
  }
}
check(
  '每队每轮恰好 1 场',
  Array.from(perTeam.values()).every((n) => n === 1),
)
// 36 队 × 8 轮，每场 2 队 → 144 场
check('总场次 = 144', data.matchdays.reduce((a, md) => a + md.matches.length, 0) === 144)
check(
  '每轮 18 场',
  data.matchdays.every((md) => md.matches.length === 18),
)

console.log('\n=== 2. 比赛日筛选（AND 语义）===')

// 复刻 TeamSelector 内的索引逻辑
const playDaysByCode = new Map()
const add = (code, key) => {
  let s = playDaysByCode.get(code)
  if (!s) {
    s = new Set()
    playDaysByCode.set(code, s)
  }
  s.add(key)
}
for (const md of data.matchdays) {
  for (const sd of md.subDays) {
    for (const m of md.matches) {
      if (m.gdId === sd.gdId) {
        add(m.home.code, `${md.number}-${sd.ordinal}`)
        add(m.away.code, `${md.number}-${sd.ordinal}`)
      }
    }
  }
}

const filter = (codes, dayFilters) =>
  codes.filter((c) => {
    const days = playDaysByCode.get(c)
    if (!days) return false
    for (const f of dayFilters) if (!days.has(`${f.matchday}-${f.ordinal}`)) return false
    return true
  })

// 场景：MD2-比赛日一 AND MD3-比赛日一
const combos = [
  { matchday: 2, ordinal: 1 },
  { matchday: 3, ordinal: 1 },
]
const allCodes = data.teams.map((t) => t.code)
const both = filter(allCodes, combos)

console.log(`  MD2比赛日一 ∩ MD3比赛日一 → ${both.length} 队: ${both.slice(0, 8).join(', ')}`)
check('筛选结果非空', both.length > 0, `得到 ${both.length}`)
check('结果少于总队数', both.length < 36)
check(
  '每支命中队两个组合都有比赛',
  both.every((c) => {
    const d = playDaysByCode.get(c)
    return d.has('2-1') && d.has('3-1')
  }),
)

// 单个组合应比 AND 更宽
const only2 = filter(allCodes, [{ matchday: 2, ordinal: 1 }])
check('单条件 ⊇ 双条件', only2.length >= both.length, `${only2.length} vs ${both.length}`)

// 空条件 = 全部
check('空条件返回全部 36 队', filter(allCodes, []).length === 36)

// 不存在的组合应返回 0
check('不存在组合返回 0 队', filter(allCodes, [{ matchday: 1, ordinal: 9 }]).length === 0)

console.log('\n=== 3. 选队 / 球员数约束（回归：曾只能选 10 支）===')

check('球队数上限 = 15', MAX_TEAMS === 15, `实际 ${MAX_TEAMS}`)
check('单队球员数上限 = 3', MAX_PLAYERS_PER_TEAM === 3, `实际 ${MAX_PLAYERS_PER_TEAM}`)
check('单轮参赛上限 = 15', MAX_PLAYERS_PER_MATCHDAY === 15, `实际 ${MAX_PLAYERS_PER_MATCHDAY}`)

// 取前 15 支真实球队
const fifteen = data.teams.slice(0, 15).map((t) => t.code)
console.log(`  测试用 15 队: ${fifteen.join(', ')}`)

/** 整轮合计（与组件表尾口径一致） */
const roundTotal = (sel, pc = {}) => playersInMatchday(data.matchdays[0], sel, pc)
const overAnyRound = (sel, pc = {}) =>
  data.matchdays.some((md) => playersInMatchday(md, sel, pc) > MAX_PLAYERS_PER_MATCHDAY)

// 核心回归：每队 1 人时，选满 15 支恰好等于上限，且第 16 支必须被拦
check('每队 1 人 × 15 队 = 15 人（刚好触顶）', roundTotal(fifteen) === 15, `${roundTotal(fifteen)}`)
check('选满 15 支不超限', !overAnyRound(fifteen))
const sixteenth = data.teams[15].code
check('第 16 支被 canAddTeam 拦截', !canAddTeam(data.matchdays, fifteen, {}, sixteenth))
check(
  '只选 14 支时第 15 支可加',
  canAddTeam(data.matchdays, fifteen.slice(0, 14), {}, data.teams[14].code),
)

// 每轮合计与轮次无关（每队每轮恰好 1 场）→ 各轮数值必须完全相同
{
  const perRound = data.matchdays.map((md) => playersInMatchday(md, fifteen, {}))
  check(
    '各轮合计恒等（每队每轮 1 场）',
    perRound.every((v) => v === perRound[0]),
    perRound.join(','),
  )
}

// 球员数上限：已有 15 队时，任何一队都不能再加到 2 人
check('15 队已满时某队无法设 2 人', !canSetPlayerCount(data.matchdays, fifteen, {}, fifteen[0], 2))
check('该队最大可选降为 1', maxPlayersForTeam(data.matchdays, fifteen, {}, fifteen[0]) === 1)

// 13 队时：还有 2 个名额 → 某队可加到 3 人，但另一队就锁死在 1
{
  const sel = fifteen.slice(0, 13)
  check('13 队时首队可加到 3 人', canSetPlayerCount(data.matchdays, sel, {}, sel[0], 3))
  const pc = { ...sel.slice(0, 12).reduce((a, c) => ({ ...a, [c]: 3 }), {}), [sel[12]]: 1 }
  const after = playersInMatchday(data.matchdays[0], sel, pc)
  check('12 队 × 3 人 + 1 队 × 1 人 = 37 > 15，应被拦', !canSetPlayerCount(data.matchdays, sel, pc, sel[12], 2), `${after}`)
}

// 逐步加队：贪心加到不能再加，结果必然 = 15 人且不可再加
{
  const sel = []
  const pc = {}
  for (const t of data.teams) {
    if (sel.length >= MAX_TEAMS) break
    if (!canAddTeam(data.matchdays, sel, pc, t.code)) continue
    sel.push(t.code)
  }
  check('贪心选满 15 支', sel.length === 15, `${sel.length}`)
  check('贪心结果 = 15 人', roundTotal(sel) === 15, `${roundTotal(sel)}`)
  const anyLeft = data.teams.some((t) => !sel.includes(t.code) && canAddTeam(data.matchdays, sel, pc, t.code))
  check('贪心后无可再加入的队', !anyLeft)
}

// 边界：恰好 15 人时不能再加；14 人时可以
{
  const sel14 = fifteen.slice(0, 14)
  check('14 人状态下可再加 1 队', canAddTeam(data.matchdays, sel14, {}, fifteen[14]))
  // 14 队中已有一队设为 2 人 = 15 人触顶 → 该队再加到 3 须被拦
  const pc = { [sel14[0]]: 2 }
  check('14 人状态下首队确为 2 人', playersInMatchday(data.matchdays[0], sel14, pc) === 15)
  check('触顶后该队再加到 3 须拦', !canSetPlayerCount(data.matchdays, sel14, pc, sel14[0], 3))
  check('触顶后该队最大可选降为 2', maxPlayersForTeam(data.matchdays, sel14, pc, sel14[0]) === 2)
  check('触顶后不能再加第 15 队', !canAddTeam(data.matchdays, sel14, pc, fifteen[14]))
}

console.log('\n=== 3b. 组件汇总口径（SSR 冒烟前置）===')
const realCodes = fifteen.slice(0, 3)
console.log(`  组件渲染用 3 队: ${realCodes.join(', ')}`)
check('3 队每队 1 人 → 每轮 3 人', roundTotal(realCodes) === 3)
check('3 队全 3 人 → 每轮 9 人', roundTotal(realCodes, { [realCodes[0]]: 3, [realCodes[1]]: 3, [realCodes[2]]: 3 }) === 9)

console.log('\n=== 4. 组件可渲染（SSR 冒烟）===')
try {
  const html = createElement(TeamSelector, {
    teams: data.teams,
    matchdays: data.matchdays,
    selectedCodes: realCodes,
    maxTeams: MAX_TEAMS,
    onToggle: () => {},
  })
  const out = renderToStaticMarkup(html)
  check('TeamSelector 渲染成功', out.length > 500, `len=${out.length}`)
  check('含按比赛日筛选入口', out.includes('按比赛日筛选'))
  check('含已选球队代码', realCodes.every((c) => out.includes(c)))
  check('计数显示为 x/15', out.includes(`3/${MAX_TEAMS}`))
  check('含两条规则说明文案', out.includes('最多 15 支') && out.includes('15 人'))
  // 复刻 App 的 blockReason 判定：只选 3 队时，剩余球队全部可勾
  const blockReasonOf = (sel, pc) => (code) => {
    if (sel.includes(code)) return null
    if (sel.length >= MAX_TEAMS) return `最多同时选 ${MAX_TEAMS} 支`
    if (!canAddTeam(data.matchdays, sel, pc, code)) {
      return `该轮参赛球员已达 ${MAX_PLAYERS_PER_MATCHDAY} 人上限`
    }
    return null
  }
  const blockedNow = data.teams.filter((t) => blockReasonOf(realCodes, {})(t.code) !== null)
  check('3 队时无球队被封', blockedNow.length === 0, String(blockedNow.length))
  const blockedAt15 = data.teams.filter((t) => blockReasonOf(fifteen, {})(t.code) !== null)
  check('选满 15 支时其余 21 队被封', blockedAt15.length === 21, String(blockedAt15.length))
  // 14 队 + 一队 2 人 = 15 人触顶：未选球队应因「人头上限」而非「队数上限」被封
  const pcTop = { [fifteen[0]]: 2 }
  const sel14 = fifteen.slice(0, 14)
  const r = blockReasonOf(sel14, pcTop)(fifteen[14])
  check('触顶封禁原因是 15 人上限', typeof r === 'string' && r.includes('15 人上限'), String(r))
} catch (e) {
  check('TeamSelector 渲染成功', false, e.message)
}

try {
  const html = createElement(MatchdayMatrix, {
    matchdays: data.matchdays,
    selectedTeams: data.teams.filter((t) => realCodes.includes(t.code)),
    captainRoute: false,
    playerCounts: { [realCodes[0]]: 3 },
    maxPlayersByCode: {},
    onPlayerCountChange: () => {},
  })
  const out = renderToStaticMarkup(html)
  check('MatchdayMatrix 渲染成功', out.length > 500, `len=${out.length}`)
  check('含参赛球员合计行', out.includes('参赛球员合计'))
  check('表尾标注按比赛日统计', out.includes('按比赛日'))
  check('含总计行', out.includes('总计'))
  check('含球员数按钮 1/2/3', out.includes('>1<') && out.includes('>2<') && out.includes('>3<'))
  // 表头角标：整轮口径 x/15（约束判定口径）
  check('表头含整轮 x/15 角标', /\d+\/15 人/.test(out), '未见 x/15 角标')
  check('表头含 3 队时的整轮合计 5/15', out.includes('5/15 人'), '未见 5/15')

  // 表尾合计：每轮应为 3+3+1-1+1... = 首队 3 人 + 其余 1 人
  const expected = 3 + 1 + 1
  check('表尾口径与 playersInMatchday 一致', playersInMatchday(data.matchdays[0], realCodes, { [realCodes[0]]: 3 }) === expected)

  // 不变量：同一轮的「各比赛日之和」必须等于「整轮合计」（表尾明细 与 表头角标同源）
  {
    const pc = { [realCodes[0]]: 3 }
    const md0 = data.matchdays[0]
    const byDay = md0.subDays.reduce((sum, sd) => {
      let s = 0
      for (const m of md0.matches) {
        if (m.gdId !== sd.gdId) continue
        for (const ref of [m.home, m.away]) {
          if (realCodes.includes(ref.code)) s += pc[ref.code] ?? 1
        }
      }
      return sum + s
    }, 0)
    check(
      '各比赛日之和 = 整轮合计',
      byDay === playersInMatchday(md0, realCodes, pc),
      `${byDay} vs ${playersInMatchday(md0, realCodes, pc)}`,
    )
    // 且所有 8 轮都成立
    const allOk = data.matchdays.every((md) => {
      const daySum = md.subDays.reduce((sum, sd) => {
        let s = 0
        for (const m of md.matches) {
          if (m.gdId !== sd.gdId) continue
          for (const ref of [m.home, m.away]) {
            if (realCodes.includes(ref.code)) s += pc[ref.code] ?? 1
          }
        }
        return sum + s
      }, 0)
      return daySum === playersInMatchday(md, realCodes, pc)
    })
    check('8 轮均满足该不变量', allOk)
  }

  // 传 maxPlayersByCode=1 时，2/3 档必须带 disabled
  const locked = renderToStaticMarkup(
    createElement(MatchdayMatrix, {
      matchdays: data.matchdays,
      selectedTeams: data.teams.filter((t) => realCodes.includes(t.code)),
      captainRoute: false,
      playerCounts: {},
      maxPlayersByCode: Object.fromEntries(realCodes.map((c) => [c, 1])),
      onPlayerCountChange: () => {},
    }),
  )
  check('触顶时 2/3 人档被禁用', locked.includes('matrix__pick--blocked'))
  check('触顶提示文案存在', locked.includes('最多可选 1 名'))
} catch (e) {
  check('MatchdayMatrix 渲染成功', false, e.message)
}

console.log('\n=== 5. 球员黄红牌榜 ===')

check('黄牌球员榜非空', cardsData.yellowPlayers.length > 0, `${cardsData.yellowPlayers.length}`)
check('黄牌榜最多 10 条', cardsData.yellowPlayers.length <= 10)
check('红牌球员榜存在', Array.isArray(cardsData.redPlayers))
check('每条含球员名', cardsData.yellowPlayers.every((p) => typeof p.player === 'string' && p.player))
check('每条含所属球队', cardsData.yellowPlayers.every((p) => typeof p.team === 'string'))
check('每条含牌数>0', cardsData.yellowPlayers.every((p) => p.count > 0))
check('含更新时间（精确到分钟）', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(cardsData.updatedAt), cardsData.updatedAt)
check('含更新规则说明', typeof cardsData.updatePolicy === 'string' && cardsData.updatePolicy.includes('09:00'))
check('含覆盖轮次', typeof cardsData.roundsCovered === 'number' && cardsData.roundsCovered >= 1)
check(
  '黄牌榜按牌数降序',
  cardsData.yellowPlayers.every((p, i, a) => i === 0 || a[i - 1].count >= p.count),
)
check(
  '球队全称能映射到本项目缩写',
  cardsData.yellowPlayers.filter((p) =>
    ['Liverpool', 'Napoli', 'Barcelona', 'Real Madrid', 'PSV Eindhoven', 'Fenerbahçe'].includes(p.team),
  ).length > 0,
)

// 停赛推算：阈值 4/6/8/10
const THRESH = [4, 6, 8, 10]
const nextOf = (n) => THRESH.find((t) => n < t) ?? null
console.log(
  `  牌数分布: ${cardsData.yellowPlayers.map((p) => `${p.count}`).join(',')} → 距停赛 ${cardsData.yellowPlayers.map((p) => (nextOf(p.count) == null ? '已满' : nextOf(p.count) - p.count)).join(',')} 张`,
)
check('每条都能算出下一档阈值或已达上限', cardsData.yellowPlayers.every((p) => nextOf(p.count) === null || nextOf(p.count) > p.count))

// 红牌停赛推算：红牌只停下一场，执行完毕即可出场
{
  const reds = cardsData.redPlayers
  console.log(
    `  红牌停赛: ${reds
      .map(
        (r) =>
          `${r.player}:${r.redAtMatchday == null ? '—' : `MD${r.redAtMatchday}`}→${
            r.banMatchday == null ? '?' : `MD${r.banMatchday}`
          }${r.banServed === true ? '（已毕/可出战）' : r.banServed === false ? '（待停赛）' : '（未知）'}`,
      )
      .join('  ')}`,
  )
  check(
    '红牌条目含停赛推算字段',
    reds.every((r) => 'redAtMatchday' in r && 'banMatchday' in r && 'banServed' in r),
  )
  check(
    '停赛轮次 = 红牌轮次 + 1',
    reds.every((r) => r.banMatchday == null || r.banMatchday === r.redAtMatchday + 1),
  )
  check(
    '停赛是否执行与覆盖轮次一致',
    reds.every((r) => r.banServed == null || r.banServed === r.banMatchday <= cardsData.roundsCovered),
  )
  check(
    '停赛推算结果存在已执行完毕者',
    reds.some((r) => r.banServed === true),
    '若无此条，说明「已停赛完毕」与「下一场停赛」未被区分',
  )
}

try {
  const html = renderToStaticMarkup(createElement(CardBoard, { selectedCodes: ['LIV', 'BAR'] }))
  check('CardBoard 渲染成功', html.length > 500, `len=${html.length}`)
  check('含标题「球员黄红牌榜」', html.includes('球员黄红牌榜'))
  check('含 TOP1 球员名', html.includes(cardsData.yellowPlayers[0].player.split(' ')[0]))
  check('含所属球队', html.includes(cardsData.yellowPlayers[0].team.slice(0, 4)))
  check('含停赛规则标题', html.includes('黄牌停赛规则'))
  check('含 4 黄新规表述', html.includes('累计 4 黄'))
  check('含具体更新时间', html.includes(cardsData.updatedAt.slice(0, 16)))
  check('已移除「手动拉取」类文案', !html.includes('npm run fetch:cards') && !html.includes('手动'))
  check('规则说明含「执行完毕即可出场」', html.includes('执行完毕即可出场'))
  check('规则说明含「红牌不清黄牌」', html.includes('红牌不清黄牌'))

  // 黄牌进度必须是「格数制」而不是「占比制」：第一档 4 格，2 黄只亮 2 格
  const pipTotal = (html.match(/class="cards__pip[ "]/g) || []).length
  const pipOn = (html.match(/cards__pip--on/g) || []).length
  const yellowSum = cardsData.yellowPlayers.reduce((s, p) => s + p.count, 0)
  const allFirstTier = cardsData.yellowPlayers.every((p) => p.count < 4)
  check(
    '黄牌进度按 4 格绘制（每人 4 格）',
    pipTotal === cardsData.yellowPlayers.length * 4 || !allFirstTier,
    `实际 ${pipTotal} 格 / 期望 ${cardsData.yellowPlayers.length * 4} 格`,
  )
  if (allFirstTier) {
    check('亮格数等于黄牌数（2 黄只亮 2 格）', pipOn === yellowSum, `亮 ${pipOn} / 黄牌合计 ${yellowSum}`)
    check('未出现「占满整条」的 100% 进度条', !html.includes('cards__bar-fill--yellow'))
  }
} catch (e) {
  check('CardBoard 渲染成功', false, e.message)
}

// 球队名映射覆盖：把映射表也做成运行时断言，避免以后改别名改漏
{
  const src = readFileSync(new URL('../src/components/CardBoard.tsx', import.meta.url), 'utf8')
  // 只取 NAME_TO_CODE 这张表（从声明到闭合）
  const table = src.slice(src.indexOf('const NAME_TO_CODE'), src.indexOf('interface CardBoardProps'))
  const map = new Map()
  for (const m of table.matchAll(/^\s*'?([^':]+?)'?\s*:\s*\[\s*'([A-Z0-9]+)'\s*\]/gm)) {
    map.set(m[1].trim(), m[2])
  }
  const codes = new Set(data.teams.map((t) => t.code))
  const allRows = [...cardsData.yellowPlayers, ...cardsData.redPlayers]
  const unmapped = allRows.filter((p) => !p.team || !map.has(p.team))
  check(
    '球员所属球队全部可映射到本项目缩写',
    unmapped.length === 0,
    unmapped.map((p) => `${p.player}(${p.team})`).join(', '),
  )
  const badCode = allRows.filter((p) => map.has(p.team) && !codes.has(map.get(p.team)))
  check(
    '映射出的缩写都是真实存在的队',
    badCode.length === 0,
    badCode.map((p) => `${p.team}->${map.get(p.team)}`).join(', '),
  )
  console.log(`  映射表 ${map.size} 个别名，覆盖 ${allRows.length} 条球员记录`)
}

console.log(`\n=== 结果: ${pass} passed, ${fail} failed ===`)
process.exit(fail === 0 ? 0 : 1)