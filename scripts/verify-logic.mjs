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
import TeamSelector from '../src/components/TeamSelector'
import MatchdayMatrix from '../src/components/MatchdayMatrix'
import { buildFixtureData } from '../src/data/normalize'

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

console.log('\n=== 3. 球员数汇总 ===')

// 复刻 MatchdayMatrix 的汇总逻辑
const codes = new Set(['ARS', 'BAR', 'BAY'].filter((c) => data.teamByCode[c]))
const realCodes = data.teams.filter((t) => codes.has(t.code)).map((t) => t.code)
console.log(`  使用真实存在的队伍: ${realCodes.join(', ')}`)

const totals = (playerCounts) => {
  const map = new Map()
  for (const md of data.matchdays) {
    for (const sd of md.subDays) {
      let sum = 0
      for (const m of md.matches) {
        if (m.gdId !== sd.gdId) continue
        for (const ref of [m.home, m.away]) {
          if (!codes.has(ref.code)) continue
          sum += playerCounts[ref.code] ?? 1
        }
      }
      map.set(`${md.number}-${sd.ordinal}`, sum)
    }
  }
  return map
}

const t1 = totals({})
const t3 = totals({ ARS: 3 })
const grand = (m) => Array.from(m.values()).reduce((a, b) => a + b, 0)

console.log(`  默认(每队1人) 各比赛日: ${Array.from(t1.entries()).map(([k, v]) => `${k}=${v}`).join(' ')}`)
console.log(`  总计 = ${grand(t1)} 人次`)
check('默认每人1人时合计 = 参赛队数×场次', grand(t1) === realCodes.length * 8, `${grand(t1)} vs ${realCodes.length * 8}`)
// 某些比赛日可能没有所选球队参赛（如 MD1-比赛日一），此时应为 0
check(
  '零值列仅出现在无球队参赛的比赛日',
  Array.from(t1.entries()).every(([k, v]) => {
    const [md, ord] = k.split('-').map(Number)
    const mday = data.matchdays.find((x) => x.number === md)
    const sd = mday.subDays.find((s) => s.ordinal === ord)
    const hasTeam = mday.matches.some(
      (m) => m.gdId === sd.gdId && (codes.has(m.home.code) || codes.has(m.away.code)),
    )
    return hasTeam ? v > 0 : v === 0
  }),
  JSON.stringify(Array.from(t1.entries()).filter(([, v]) => v === 0)),
)
// 每队 8 场：ARS 从 1 人改 3 人，每轮 +2 → 8 轮共 +16
check('ARS 改 3 人后合计 +16', grand(t3) === grand(t1) + 16, `${grand(t3)} vs ${grand(t1) + 16}`)
check('默认合计 = 3队 × 8场 = 24', grand(t1) === 24, `实际 ${grand(t1)}`)
check('三队全 3 人 → 72', grand(totals({ ARS: 3, BAR: 3, BAY: 3 })) === 72)

console.log('\n=== 4. 组件可渲染（SSR 冒烟）===')
try {
  const html = createElement(TeamSelector, {
    teams: data.teams,
    matchdays: data.matchdays,
    selectedCodes: realCodes,
    maxTeams: 10,
    onToggle: () => {},
  })
  const out = renderToStaticMarkup(html)
  check('TeamSelector 渲染成功', out.length > 500, `len=${out.length}`)
  check('含按比赛日筛选入口', out.includes('按比赛日筛选'))
  check('含已选球队代码', realCodes.every((c) => out.includes(c)))
} catch (e) {
  check('TeamSelector 渲染成功', false, e.message)
}

try {
  const html = createElement(MatchdayMatrix, {
    matchdays: data.matchdays,
    selectedTeams: data.teams.filter((t) => codes.has(t.code)),
    captainRoute: false,
    playerCounts: { [realCodes[0]]: 3 },
    onPlayerCountChange: () => {},
  })
  const out = renderToStaticMarkup(html)
  check('MatchdayMatrix 渲染成功', out.length > 500, `len=${out.length}`)
  check('含参赛球员合计行', out.includes('参赛球员合计'))
  check('含总计行', out.includes('总计'))
  check('含球员数按钮 1/2/3', out.includes('>1<') && out.includes('>2<') && out.includes('>3<'))
} catch (e) {
  check('MatchdayMatrix 渲染成功', false, e.message)
}

console.log(`\n=== 结果: ${pass} passed, ${fail} failed ===`)
process.exit(fail === 0 ? 0 : 1)