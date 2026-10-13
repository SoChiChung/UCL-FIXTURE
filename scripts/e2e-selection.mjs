/**
 * 端到端交互验证：用 headless Chrome 实际点击，验证「选到第 11 支」是否可用。
 * 覆盖：连续选 15 支 → 第 16 支被封 → 增设球员数被拦 → 减员后恢复可选。
 *
 * 前置：先 `npm run build`，再另开终端跑 `npx vite preview --port 4173 --strictPort`，
 * 然后 `npm run verify:e2e`。
 * 依赖 puppeteer-core（本机全局 workspace 已装）+ 本机 Chrome。
 */
import puppeteer from 'puppeteer-core'

const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL_ = process.env.PREVIEW_URL ?? 'http://localhost:4173/'
/** 截图输出路径（避开变量名 URL，避免打包后与内建 URL 冲突） */
const SHOT = 'D:/code/UCL FIXTURE/.e2e-shot.png'

let pass = 0
let fail = 0
const check = (name, cond, detail = '') => {
  if (cond) {
    pass++
    console.log(`  PASS  ${name}`)
  } else {
    fail++
    console.log(`  FAIL  ${name} ${detail}`)
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000 })

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(URL_, { waitUntil: 'networkidle0' })
await page.waitForSelector('.selector__item input[type=checkbox]')

/** 读取选队面板状态 */
const readState = () =>
  page.evaluate(() => {
    const items = [...document.querySelectorAll('.selector__item')]
    const labels = items.map((el) => ({
      code: el.querySelector('.selector__code')?.textContent ?? '',
      checked: el.querySelector('input')?.checked ?? false,
      disabled: el.querySelector('input')?.disabled ?? false,
      title: el.getAttribute('title') ?? '',
    }))
    return {
      countText: document.querySelector('.selector__count')?.textContent?.trim() ?? '',
      rule: document.querySelector('.selector__rule')?.textContent?.trim() ?? '',
      labels,
      checkedCount: labels.filter((l) => l.checked).length,
      disabledCount: labels.filter((l) => l.disabled).length,
      // 表头角标：该轮参赛球员合计 x/15（约束判定口径）
      headCaps: [...document.querySelectorAll('.matrix__th-cap')].map((el) => ({
        text: el.textContent?.trim() ?? '',
        over: el.className.includes('is-over'),
        full: el.className.includes('is-full'),
      })),
      // 表尾明细：按比赛日子列统计（每列文本）
      footCells: (() => {
        const cells = [
          ...document.querySelectorAll(
            'tfoot .matrix__td-total-cell:not(.matrix__td-total-cell--grand)',
          ),
        ].map((el) => ({ text: el.textContent?.trim() ?? '', over: el.className.includes('is-over') }))
        // 按 Matchday 的 colspan 把子列分组：每轮子列之和应 = 该轮整轮合计
        const heads = [...document.querySelectorAll('.matrix__th--md')]
        let cursor = 0
        const grouped = heads.map((th) => {
          const span = Number(th.getAttribute('colspan') ?? 1)
          const slice = cells.slice(cursor, cursor + span)
          cursor += span
          return {
            cap: th.querySelector('.matrix__th-cap')?.textContent?.trim() ?? '',
            cols: slice.map((c) => c.text),
            sum: slice.reduce((a, c) => a + (c.text === '—' ? 0 : Number(c.text || 0)), 0),
          }
        })
        return { cells, grouped }
      })(),
      footLabel: document.querySelector('tfoot .matrix__td-total')?.textContent?.trim() ?? '',
      grandText:
        document.querySelector('.matrix__td-total-cell--grand')?.textContent?.trim() ?? '',
      // 每行的球员数按钮禁用态
      pickRows: [...document.querySelectorAll('.matrix__td-count')].map((el) => ({
        team: el.parentElement?.querySelector('.matrix__td-code')?.textContent ?? '',
        blocked: [...el.querySelectorAll('.matrix__pick--blocked')].length,
        on: el.querySelector('.matrix__pick--on')?.textContent ?? '',
      })),
      matrixRows: document.querySelectorAll('.matrix__tbody tr, tbody tr').length,
    }
  })

/** 点击第 idx 个 checkbox（idx 为当前 DOM 顺序），返回点击后的状态 */
const clickAt = async (idx) => {
  await page.evaluate((i) => {
    const inputs = [...document.querySelectorAll('.selector__item input[type=checkbox]')]
    inputs[i].click()
  }, idx)
  await new Promise((r) => setTimeout(r, 60))
  return readState()
}

console.log('\n=== E2E. 初始状态 ===')
let s = await readState()
console.log(`  面板计数: ${s.countText} | 规则: ${s.rule}`)
check('初始无球队被选中', s.checkedCount === 0)
check('初始无球队被禁用', s.disabledCount === 0, `${s.disabledCount}`)
check('计数上限显示 15', s.countText.endsWith('/15'), s.countText)

console.log('\n=== E2E1. 连续勾选 15 支（原 bug：第 11 支被拒）===')
// 先把搜索框清空，用列表顺序点前 15 个可用项
const clickable = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.selector__item input[type=checkbox]')].map((el, i) => ({
      i,
      checked: el.checked,
      disabled: el.disabled,
      code: el.parentElement.querySelector('.selector__code').textContent,
    })),
  )

let picked = []
for (let n = 1; n <= 15; n++) {
  const items = await clickable()
  const target = items.find((x) => !x.checked && !x.disabled)
  if (!target) {
    check(`第 ${n} 支可勾选`, false, '找不到可勾选项')
    break
  }
  await clickAt(target.i)
  picked.push(target.code)
  s = await readState()
  check(
    `勾选第 ${n} 支（${target.code}）后计数为 ${n}/15`,
    s.countText === `${n}/15`,
    `实际 ${s.countText}`,
  )
}
check('已选满 15 支', s.checkedCount === 15, `${s.checkedCount}`)
check('矩阵渲染 15 行球队', s.matrixRows === 15, `${s.matrixRows}`)
check('第 11 支确实可选（回归点）', picked.length === 15 && picked[10] !== undefined, `picked=${picked.length}`)

console.log('\n=== E2E2. 选满后其余球队被封 ===')
s = await readState()
check('剩余 21 支全部禁用', s.disabledCount === 21, `${s.disabledCount}`)
const blockedTitle = s.labels.find((l) => l.disabled)?.title ?? ''
check('禁用项带原因提示', blockedTitle.includes('15 支'), blockedTitle)
console.log(`  禁用提示: ${blockedTitle}`)

console.log('\n=== E2E3. 15 人触顶：不能再加球员 ===')
s = await readState()
check(
  '表头角标为 15/15',
  s.headCaps.length > 0 && s.headCaps[0].text === '15/15 人',
  JSON.stringify(s.headCaps[0]),
)
check('触顶角标带 is-full 标记', s.headCaps.every((c) => c.full))
check('无轮次超限', s.headCaps.every((c) => !c.over))
check('表尾回到按比赛日明细', s.footLabel.includes('参赛球员合计') && s.footLabel.includes('按比赛日'), s.footLabel)
check(
  '每轮子列之和 = 15（明细与整轮角标同源）',
  s.footCells.grouped.length > 0 && s.footCells.grouped.every((g) => g.sum === 15),
  JSON.stringify(s.footCells.grouped),
)
console.log(
  `  各轮明细: ${s.footCells.grouped.map((g) => `[${g.cols.join('+')}=${g.sum}]`).join(' ')}`,
)
check('总计 60 人次（15 × 4 轮）', s.grandText === '60 人次', s.grandText)
check('每行 2/3 人档被灰显', s.pickRows.length === 15 && s.pickRows.every((r) => r.blocked === 2), JSON.stringify(s.pickRows[0]))

console.log('\n=== E2E4. 减员后可再加人 ===')
// 取消第一支球队
await clickAt(0)
s = await readState()
check('取消后计数 14/15', s.countText === '14/15', s.countText)
check('第一行 2 档恢复可点', s.pickRows[0].blocked === 1, JSON.stringify(s.pickRows[0]))
const blockedNow = s.disabledCount
check('有球队恢复可选（不再因人头上限被封）', blockedNow === 0 || s.labels.some((l) => !l.disabled && !l.checked), `${blockedNow}`)

console.log('\n=== E2E5. 把某队设为 2 人后，人头上限重新封禁 ===')
// 点第一行的「2」
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.matrix__td-count')][0].querySelectorAll('.matrix__pick')
  btns[1].click()
})
await new Promise((r) => setTimeout(r, 80))
s = await readState()
check('首队已设为 2 人', s.pickRows[0].on === '2', JSON.stringify(s.pickRows[0]))
check(
  '表头角标仍为 15/15（14 队：1 队 2 人 + 13 队 1 人 = 15）',
  s.headCaps[0]?.text === '15/15 人',
  JSON.stringify(s.headCaps[0]),
)
check('所有未选球队被封', s.disabledCount === 36 - s.checkedCount, `${s.disabledCount} / 未选 ${36 - s.checkedCount}`)
const t2 = s.labels.find((l) => l.disabled)?.title ?? ''
check('封禁原因切换为 15 人上限', t2.includes('15 人'), t2)
console.log(`  封禁提示: ${t2}`)

console.log('\n=== E2E6. 点击被封的 2 档无效 ===')
const before = (await readState()).pickRows[0].on
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.matrix__td-count')][1].querySelectorAll('.matrix__pick')
  btns[2].click() // 点第 2 行的「3」—— 应被 disabled 拦住
})
await new Promise((r) => setTimeout(r, 80))
s = await readState()
check('第二行仍为 1 人（点击被禁按钮无效果）', s.pickRows[1].on === before || s.pickRows[1].on === '1', JSON.stringify(s.pickRows[1]))

console.log('\n=== E2E7. 无功能性控制台报错 ===')
// favicon.ico 404 与本次改动无关（项目本就未提供 favicon），单独排除
const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('404'))
check('无 console error / pageerror', realErrors.length === 0, realErrors.slice(0, 3).join(' | '))
if (errors.some((e) => e.includes('favicon'))) console.log('  （已忽略 favicon.ico 404，与本次改动无关）')

await page.screenshot({ path: SHOT })
console.log('\n  截图已存 .e2e-shot.png')
await browser.close()

console.log(`\n=== E2E 结果: ${pass} passed, ${fail} failed ===`)
process.exit(fail === 0 ? 0 : 1)