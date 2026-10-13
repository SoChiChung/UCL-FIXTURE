import { useMemo, useState } from 'react'
import cardsData from '../data/cards.json'

interface CardRow {
  team: string
  teamId: number
  count: number
  other: number
  color: string | null
}

interface CardData {
  season: string
  updatedAt: string
  source: string
  yellow: CardRow[]
  red: CardRow[]
}

const CARDS = cardsData as CardData

/**
 * 停赛阈值：4 / 6 / 8 / 10 张（26/27 赛季起由 3 / 5 / 7 改为偶数张）
 * 球员级牌数 FotMob 未开放免费端点，故阈值标尺只按规则说明展示，
 * 不对球队总数做「距离停赛还差几张」的推算（球队牌 ≠ 球员牌）。
 */
const SUSPEND_THRESHOLDS = [4, 6, 8, 10]

interface CardBoardProps {
  /** 与球队缩写做匹配，命中的球队高亮（用户已关注的队） */
  selectedCodes: string[]
}

/** FotMob 用全称，此处按常见别名映射到本项目三字缩写，仅用于高亮匹配 */
const NAME_TO_CODE: Record<string, string> = {
  Arsenal: 'ARS',
  'Aston Villa': 'AVL',
  'Atalanta BC': 'ATA',
  'Atlético Madrid': 'ATM',
  'Bayern München': 'BAY',
  'Borussia Dortmund': 'BVB',
  'Club Brugge': 'CLB',
  Como: 'COM',
  'FC Porto': 'POR',
  Feyenoord: 'FEY',
  Fenerbahçe: 'FEN',
  Galatasaray: 'GAL',
  Inter: 'INT',
  Lille: 'LIL',
  'Liverpool': 'LIV',
  'Manchester City': 'MCI',
  'Manchester United': 'MUN',
  Napoli: 'NAP',
  'Paris Saint-Germain': 'PSG',
  'PSV Eindhoven': 'PSV',
  Roma: 'ROM',
  'RB Leipzig': 'RBL',
  'Real Madrid': 'RMA',
  'Real Betis': 'BET',
  'Shakhtar Donetsk': 'SHA',
  'Sporting CP': 'SCP',
  Stuttgart: 'STU',
  'Slovan Bratislava': 'SLO',
  'AEK Athens': 'AEK',
  Viking: 'VIK',
  'Sabah FK': 'SAB',
  LASK: 'LAS',
  'Bodø/Glimt': 'BOD',
  Villarreal: 'VIL',
  Lens: 'LEN',
}

/**
 * 欧冠黄红牌榜 + 停赛规则说明。
 *
 * 数据说明：球队级牌数抓自 FotMob 公开统计端点（scripts/fetch-cards.mjs），
 * 落盘为静态 JSON；球员级数据 FotMob 未开放免费端点。
 */
export default function CardBoard({ selectedCodes }: CardBoardProps) {
  const [tab, setTab] = useState<'yellow' | 'red'>('yellow')

  const selected = useMemo(() => new Set(selectedCodes), [selectedCodes])

  const codeOf = (name: string): string | null => NAME_TO_CODE[name] ?? null

  const rows = tab === 'yellow' ? CARDS.yellow : CARDS.red

  const max = rows.length ? Math.max(...rows.map((r) => r.count)) : 0

  return (
    <section className="cards" aria-label="欧冠黄红牌榜">
      <div className="cards__head">
        <span className="cards__title">黄红牌榜</span>
        <span className="cards__meta">
          {CARDS.season} · 更新 {CARDS.updatedAt}
        </span>
      </div>

      <div className="cards__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'yellow'}
          className={`cards__tab cards__tab--yellow ${tab === 'yellow' ? 'is-on' : ''}`}
          onClick={() => setTab('yellow')}
        >
          <span className="cards__dot cards__dot--yellow" aria-hidden="true" />
          黄牌榜
          <span className="cards__tab-count">{CARDS.yellow.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'red'}
          className={`cards__tab cards__tab--red ${tab === 'red' ? 'is-on' : ''}`}
          onClick={() => setTab('red')}
        >
          <span className="cards__dot cards__dot--red" aria-hidden="true" />
          红牌榜
          <span className="cards__tab-count">{CARDS.red.length}</span>
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="cards__empty">本赛季暂无{tab === 'yellow' ? '黄牌' : '红牌'}记录</div>
      ) : (
        <ol className="cards__list">
          {rows.map((r, i) => {
            const code = codeOf(r.team)
            const hit = code != null && selected.has(code)
            return (
              <li
                className={`cards__row ${hit ? 'cards__row--mine' : ''}`}
                key={`${r.team}-${r.teamId}`}
              >
                <span className="cards__rank">{i + 1}</span>
                <span
                  className="cards__swatch"
                  style={{ background: r.color ?? 'var(--border)' }}
                  aria-hidden="true"
                />
                <span className="cards__team" title={r.team}>
                  {r.team}
                  {code && <span className="cards__code">{code}</span>}
                </span>
                {tab === 'yellow' && r.other > 0 && (
                  <span className="cards__sub" title="红牌数">
                    {r.other} 红
                  </span>
                )}
                <span className="cards__bar" aria-hidden="true">
                  <span
                    className={`cards__bar-fill cards__bar-fill--${tab}`}
                    style={{ width: max ? `${(r.count / max) * 100}%` : '0%' }}
                  />
                </span>
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
            规则依据 UEFA 竞赛规程第 63.01–63.05 条及 2026-08-04 欧足联第51/2026号通函。
            注：本榜为<b>球队</b>累计牌数，球员级牌数暂无可用免费数据源，因此
            「距停赛还差几张」需以球员个人累计为准。
          </p>
        </div>
      </details>
    </section>
  )
}