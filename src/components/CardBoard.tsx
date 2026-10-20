import { useMemo, useState } from 'react'
import cardsData from '../data/cards.json'

interface PlayerCardRow {
  player: string
  playerId: number
  team: string | null
  teamId: number | null
  color: string | null
  country: string | null
  count: number
  other: number
  appearances: number
  minutes: number
  /** ── 以下为红牌专用（黄牌行为 undefined）── */
  /** 红牌发生轮次；null = 未能定位（数据缺失） */
  redAtMatchday?: number | null
  redMinute?: number | null
  redReason?: string | null
  /** 是否为两黄变红 */
  redSecondYellow?: boolean | null
  /** 停赛执行轮次 = 红牌轮次 + 1 */
  banMatchday?: number | null
  /** 停赛是否已执行完毕（true = 下一轮可出战） */
  banServed?: boolean | null
}

interface TeamCardRow {
  team: string | null
  teamId: number | null
  count: number
  other: number
  color: string | null
}

interface CardData {
  season: string
  /** 数据快照时间（北京时间 YYYY-MM-DD HH:mm） */
  updatedAt: string
  /** 更新规则说明 */
  updatePolicy: string
  source: string
  topN: number
  /** 数据覆盖到的轮次 */
  roundsCovered: number
  yellowPlayers: PlayerCardRow[]
  redPlayers: PlayerCardRow[]
  yellowTeams: TeamCardRow[]
  redTeams: TeamCardRow[]
}

const CARDS = cardsData as CardData

/**
 * 26/27 赛季停赛阈值：联赛阶段起累计 4 张黄牌停赛一场，
 * 之后每再累计 2 张（第 6、8、10 张…）继续停赛。
 * 依据 UEFA 竞赛规程 63.02+ 2026-08-04 第 51/2026 号通函。
 */
const SUSPEND_THRESHOLDS = [4, 6, 8, 10]

/** 下一档停赛阈值：已达 4 → 下一档 6；已达 2 → 4 */
function nextThreshold(yellow: number): number | null {
  return SUSPEND_THRESHOLDS.find((t) => yellow < t) ?? null
}

/**
 * 黄牌进度台阶。
 *
 * 规程 63.02：累计 4 张（未导致红牌）停赛一场，之后每再 2 张（6/8/10）再停一场。
 * 因此进度条不能按「距榜首的占比」画——那样 2 黄就会占满整条，语义错误。
 * 这里按「当前档位的容量」画格子：第 1 档 4 格（0→4），之后每档 2 格（4→6、6→8…），
 * 2 黄就只亮 2 格。
 */
function yellowProgress(count: number): {
  filled: number
  total: number
  tier: number
  capped: boolean
} {
  const idx = SUSPEND_THRESHOLDS.findIndex((t) => count < t)
  // 已越过最后一档（10 黄），按满格 + 封顶展示
  if (idx === -1) return { filled: 2, total: 2, tier: SUSPEND_THRESHOLDS.length, capped: true }
  const floor = idx === 0 ? 0 : SUSPEND_THRESHOLDS[idx - 1]
  const ceiling = SUSPEND_THRESHOLDS[idx]
  return { filled: count - floor, total: ceiling - floor, tier: idx + 1, capped: false }
}

/**
 * 红牌停赛文案。
 *
 * 关键点：红牌只自动停「下一场」，执行完毕即可出场。
 * MD1 吃红牌的人 MD2 停赛、MD3 就能打；只有 MD{n} 吃红牌的人才是 MD{n+1} 停赛。
 * 因此不能对红牌榜统一标注「停赛中」——必须看停赛是否已执行。
 */
function describeRedBan(r: PlayerCardRow): { label: string; title: string; tone: 'ok' | 'warn' | 'muted' } {
  const at =
    r.redAtMatchday == null
      ? ''
      : `（${r.redSecondYellow ? '两黄变红' : '直接红牌'}，MD${r.redAtMatchday}${r.redMinute ? ` ${r.redMinute}'` : ''}）`

  if (r.banMatchday == null) {
    return {
      label: '停赛 1 场',
      title: `该球员吃到红牌${at}，自动停赛 1 场；具体执行轮次未能定位`,
      tone: 'muted',
    }
  }
  if (r.banServed) {
    return {
      label: `MD${r.banMatchday} 已停赛`,
      title: `红牌${at}，停赛已在 MD${r.banMatchday} 执行完毕 —— 下一轮可以出战`,
      tone: 'ok',
    }
  }
  return {
    label: `MD${r.banMatchday} 停赛`,
    title: `红牌${at}，将在 MD${r.banMatchday} 停赛`,
    tone: 'warn',
  }
}

/**
 * FotMob 用球队全称，本项目 fixtures.json 用另一套官方名 + 三字缩写。
 * 这里把 FotMob 队名映射到本项目缩写，仅用于「已选球队高亮」；
 * 一个球队名可对应多个别名（同一队的不同写法），故用数组。
 */
const NAME_TO_CODE: Record<string, string[]> = {
  Arsenal: ['ARS'],
  'Aston Villa': ['AVL'],
  'Atlético Madrid': ['ATM'],
  Atletico: ['ATM'],
  'Bayern München': ['BAY'],
  Bayern: ['BAY'],
  'Borussia Dortmund': ['BVB'],
  Dortmund: ['BVB'],
  'Club Brugge': ['BRU'],
  ClubBrugge: ['BRU'],
  Como: ['COM'],
  'FC Porto': ['POR'],
  Porto: ['POR'],
  Feyenoord: ['FEY'],
  Fenerbahçe: ['FEN'],
  'Galatasaray': ['GAL'],
  Inter: ['INT'],
  'Inter Milan': ['INT'],
  Internazionale: ['INT'],
  Lille: ['LIL'],
  Liverpool: ['LIV'],
  'Manchester City': ['MCI'],
  'Man City': ['MCI'],
  'Manchester United': ['MUN'],
  'Man Utd': ['MUN'],
  ManUnited: ['MUN'],
  Napoli: ['NAP'],
  'Paris Saint-Germain': ['PSG'],
  'Paris SG': ['PSG'],
  'PSV Eindhoven': ['PSV'],
  PSV: ['PSV'],
  Barcelona: ['BAR'],
  'FC Barcelona': ['BAR'],
  Roma: ['ROM'],
  'RB Leipzig': ['RBL'],
  Leipzig: ['RBL'],
  'Real Madrid': ['RMA'],
  'Real Betis': ['BET'],
  Betis: ['BET'],
  'Shakhtar Donetsk': ['SHK'],
  Shakhtar: ['SHK'],
  'Slavia Prague': ['SLA'],
  'Slavia Praha': ['SLA'],
  'Slovan Bratislava': ['SBR'],
  'Sporting CP': ['SPO'],
  Sporting: ['SPO'],
  Stuttgart: ['STU'],
  'AEK Athens': ['AEK'],
  AEK: ['AEK'],
  Viking: ['VFK'],
  VikingFK: ['VFK'],
  'Sabah FK': ['SAB'],
  Sabah: ['SAB'],
  LASK: ['LASK'],
  'Bodø/Glimt': ['BOD'],
  'Bodo/Glimt': ['BOD'],
  'Villarreal CF': ['VIL'],
  Villarreal: ['VIL'],
  Lens: ['LEN'],
}

interface CardBoardProps {
  /** 与球队缩写做匹配，命中的球员所属球队高亮（用户已关注的队） */
  selectedCodes: string[]
}

/**
 * 欧冠球员黄牌榜 / 红牌榜（各取前十）+ 停赛规则说明。
 *
 * 数据说明：球员姓名、所属球队、牌数、出场数与分钟数抓自 FotMob 公开统计端点
 * （scripts/fetch-cards.mjs），落盘为静态 JSON；前端不直连第三方。
 */
export default function CardBoard({ selectedCodes }: CardBoardProps) {
  const [tab, setTab] = useState<'yellow' | 'red'>('yellow')

  const selected = useMemo(() => new Set(selectedCodes), [selectedCodes])

  /** FotMob 队名 → 本项目缩写（多别名取首个命中） */
  const codeOf = (name: string | null): string | null => {
    if (!name) return null
    const hit = NAME_TO_CODE[name]
    return hit && hit.length ? hit[0] : null
  }

  const isYellow = tab === 'yellow'
  const rows = isYellow ? CARDS.yellowPlayers : CARDS.redPlayers

  return (
    <section className="cards" aria-label="欧冠球员黄红牌榜">
      <div className="cards__head">
        <span className="cards__title">球员黄红牌榜</span>
        <span className="cards__meta">
          {CARDS.season} 第 {CARDS.roundsCovered} 轮后数据 · 更新于 {CARDS.updatedAt}（北京时间）
        </span>
      </div>

      <div className="cards__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={isYellow}
          className={`cards__tab cards__tab--yellow ${isYellow ? 'is-on' : ''}`}
          onClick={() => setTab('yellow')}
        >
          <span className="cards__dot cards__dot--yellow" aria-hidden="true" />
          黄牌榜 TOP{CARDS.yellowPlayers.length}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isYellow}
          className={`cards__tab cards__tab--red ${!isYellow ? 'is-on' : ''}`}
          onClick={() => setTab('red')}
        >
          <span className="cards__dot cards__dot--red" aria-hidden="true" />
          红牌榜 TOP{CARDS.redPlayers.length}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="cards__empty">本赛季暂无{isYellow ? '黄牌' : '红牌'}记录</div>
      ) : (
        <ol className="cards__list">
          {rows.map((r, i) => {
            const code = codeOf(r.team)
            const hit = code != null && selected.has(code)
            const prog = yellowProgress(r.count)
            const next = isYellow ? nextThreshold(r.count) : null
            const gapToNext = next == null ? null : next - r.count
            const risky = gapToNext != null && gapToNext <= 1
            const redBan = isYellow ? null : describeRedBan(r)
            /** 黄牌右侧提示：已停赛过的球员要说明「再停一次」的语义 */
            const yellowHint = !isYellow
              ? null
              : prog.capped
                ? { label: '已封顶', title: '已达最后一档（10 黄），继续累计只会累积更多停赛' }
                : r.count >= 4
                  ? {
                      label: `再${gapToNext}张停赛`,
                      title: `已触发过停赛；再吃 ${gapToNext} 张（累计 ${next} 张）将再次停赛一场`,
                    }
                  : {
                      label: `差${gapToNext}张停赛`,
                      title: `再吃 ${gapToNext} 张黄牌即累计 ${next} 张，将停赛一场`,
                    }
            return (
              <li
                className={`cards__row ${hit ? 'cards__row--mine' : ''} ${risky ? 'cards__row--warn' : ''}`}
                key={`${r.playerId}-${r.player}`}
              >
                <span className="cards__rank">{i + 1}</span>
                <span
                  className="cards__swatch"
                  style={{ background: r.color ?? 'var(--line)' }}
                  aria-hidden="true"
                />
                <span className="cards__player" title={r.player}>
                  {r.player}
                  {code && <span className="cards__code">{code}</span>}
                </span>
                <span className="cards__team" title={r.team ?? ''}>
                  {r.team ?? '—'}
                </span>
                {isYellow ? (
                  <span
                    className="cards__pips"
                    role="img"
                    aria-label={`第 ${prog.tier} 档：已累计 ${r.count} 张黄牌，本档共 ${prog.total} 格`}
                  >
                    {Array.from({ length: prog.total }, (_, k) => (
                      <span
                        key={k}
                        className={`cards__pip${k < prog.filled ? ' cards__pip--on' : ''}`}
                      />
                    ))}
                  </span>
                ) : (
                  <span className="cards__bar" aria-hidden="true">
                    <span className="cards__bar-fill cards__bar-fill--red" style={{ width: '100%' }} />
                  </span>
                )}
                {yellowHint && (
                  <span className={`cards__gap ${risky ? 'cards__gap--warn' : ''}`} title={yellowHint.title}>
                    {yellowHint.label}
                  </span>
                )}
                {redBan && (
                  <span
                    className={`cards__gap${
                      redBan.tone === 'ok'
                        ? ' cards__gap--ok'
                        : redBan.tone === 'warn'
                          ? ' cards__gap--warn'
                          : ''
                    }`}
                    title={redBan.title}
                  >
                    {redBan.label}
                  </span>
                )}
                <span className="cards__count">{r.count}</span>
              </li>
            )
          })}
        </ol>
      )}

      <details className="cards__rule">
        <summary className="cards__rule-summary">欧冠黄牌停赛规则（26/27 新规）</summary>
        <div className="cards__rule-body">
          <p className="cards__rule-lead">
            <b>本赛季起，联赛阶段由「累计 3 黄」改为「累计 4 黄」停赛。</b>
            此后每再累计 2 张（第 6、8、10 张…）继续停赛一场。
          </p>
          <div className="cards__thresholds">
            {SUSPEND_THRESHOLDS.map((n) => (
              <span className="cards__threshold" key={n}>
                {n} 黄
              </span>
            ))}
          </div>
          <ul className="cards__rules">
            <li>
              <b>联赛阶段前</b>：仍是累计 3 张黄牌停赛一场，此后按奇数张（第 5、7 张…）触发。
            </li>
            <li>
              <b>联赛阶段起</b>：累计 4 张未导致红牌的黄牌，停赛下一场；此后每再 2 张（第
              6、8、10 张…）停赛一场。
            </li>
            <li>
              <b>黄牌不过期到淘汰赛</b>：单张黄牌与已生效的停赛一律带入下一轮。
            </li>
            <li>
              <b>四分之一决赛结束后清零</b>：黄牌不累积带入半决赛（已触发的停赛仍需执行）。
            </li>
            <li>
              <b>不会因黄牌缺席决赛</b>：半决赛两回合各吃一张也不会被停赛——除非半决赛后再吃牌导致
              触发，或两回合各一张后又因点球大战吃牌。
            </li>
            <li>
              <b>赛季末清零</b>：所有黄牌及待执行停赛在赛季结束时失效。
            </li>
            <li>
              <b>红牌</b>：直接红牌或两黄变红，自动停赛<b>下一场</b>欧战比赛，<b>执行完毕即可出场</b>
              —— 例如 MD1 吃红牌，MD2 停赛，MD3 就能打。情节严重者可能被纪律委员会追加停赛，本表不含追加场次。
            </li>
            <li>
              <b>红牌不清黄牌</b>：红牌停赛只是一次独立的「执行停赛」，<b>黄牌累计原封不动保留</b>。
              例如已累计 2 黄的人吃红牌停赛一场，复出后仍是 2 黄，还要再吃 2 张才会触发黄牌停赛。
            </li>
            <li>
              <b>但导致红牌的黄牌不计入累计</b>：规程 63.02 明确限定为「未导致红牌的黄牌」，
              所以两黄变红的那两张、以及直接红牌同场的黄牌，都不进黄牌累计。
            </li>
            <li>
              <b>进度格怎么看</b>：一格 = 一张黄牌。第 1 档 4 格（4 黄触发停赛），
              之后每档缩为 2 格（第 6、8、10 张各触发一次）。
            </li>
          </ul>
          <p className="cards__rule-foot">
            数据来源 {CARDS.source} · {CARDS.updatePolicy}。
            规则依据 UEFA 竞赛规程第 63.01–63.05 条及 2026-08-04 欧足联第 51/2026 号通函。
          </p>
        </div>
      </details>
    </section>
  )
}