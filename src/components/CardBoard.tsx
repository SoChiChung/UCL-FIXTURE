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
  updatedAt: string
  source: string
  topN: number
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
  const max = rows.length ? Math.max(...rows.map((r) => r.count)) : 0

  // 赛季已进行轮次（以出场数最大值为准），用于说明榜单覆盖范围
  const maxApps = rows.length ? Math.max(...rows.map((r) => r.appearances)) : 0

  return (
    <section className="cards" aria-label="欧冠球员黄红牌榜">
      <div className="cards__head">
        <span className="cards__title">球员黄红牌榜</span>
        <span className="cards__meta">
          {CARDS.season} · 截至 {CARDS.updatedAt} · 更新于第 {maxApps} 轮后
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
            const next = isYellow ? nextThreshold(r.count) : null
            const risky = next != null && next - r.count <= 1
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
                <span className="cards__bar" aria-hidden="true">
                  <span
                    className={`cards__bar-fill cards__bar-fill--${tab}`}
                    style={{ width: max ? `${(r.count / max) * 100}%` : '0%' }}
                  />
                </span>
                {isYellow && next != null && (
                  <span
                    className={`cards__gap ${risky ? 'cards__gap--warn' : ''}`}
                    title={`再吃 ${next - r.count} 张黄牌即累计 ${next} 张，将停赛一场`}
                  >
                    差{next - r.count}张停赛
                  </span>
                )}
                {!isYellow && <span className="cards__gap cards__gap--warn">停赛中</span>}
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
              <b>红牌</b>：被直接罚下者自动停赛下一场欧战比赛；情节严重可被追加停赛。
            </li>
          </ul>
          <p className="cards__rule-foot">
            规则依据 UEFA 竞赛规程第 63.01–63.05 条及 2026-08-04 欧足联第 51/2026 号通函。
            榜单数据来自 {CARDS.source}，赛前会随赛程推进更新，建议每轮后重新运行
            <code> npm run fetch:cards </code>刷新。
          </p>
        </div>
      </details>
    </section>
  )
}