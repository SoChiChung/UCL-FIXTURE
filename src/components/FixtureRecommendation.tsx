import { useEffect, useMemo, useState } from 'react'
import {
  recommendNextTeam,
  computeTiedRemaining,
  getTeamFixtures,
} from '../data/fixtureRecommendation'
import { circledNo } from '../constants'

interface FixtureRecommendationProps {
  selectedCodes: string[]
  rangeStart: number
  rangeEnd: number
  onAddToCompare?: (code: string) => void
}

/**
 * 赛程推荐（推荐下一支球队）
 * - 触发条件：已选 1~9 支（有已选择且未满 10 支上限）
 * - 只推荐 1 支（Top 1），「换一个推荐」按排序继续查看下一支
 * - 无坑时显示空态，不强行推荐
 */
export default function FixtureRecommendation({
  selectedCodes,
  rangeStart,
  rangeEnd,
  onAddToCompare,
}: FixtureRecommendationProps) {
  const n = selectedCodes.length
  const [open, setOpen] = useState(false)
const [cursor, setCursor] = useState(0)
const [viewing, setViewing] = useState(false)

  const result = useMemo(
    () => recommendNextTeam(selectedCodes, rangeStart, rangeEnd),
    [selectedCodes, rangeStart, rangeEnd],
  )

  // 已选球队 / 范围变化时，重置候选序号与赛程明细
  useEffect(() => {
    setCursor(0)
    setViewing(false)
  }, [selectedCodes, rangeStart, rangeEnd])

  // 触发条件：1 <= n <= 9，否则连 DOM 都不挂
  if (n < 1 || n >= 10) return null

  const hasResult = result.top !== null
  const safeCursor =
    result.rankings.length > 0 ? Math.min(cursor, result.rankings.length - 1) : 0
  const current = result.rankings[safeCursor] ?? null
  const tied = current ? computeTiedRemaining(result.rankings, safeCursor) : null

  const handleSwap = () => {
    if (result.rankings.length === 0) return
    setCursor((c) => (c + 1) % result.rankings.length)
    setViewing(false)
  }

  const fixtures = current && viewing ? getTeamFixtures(current.code, rangeStart, rangeEnd) : []

  return (
    <section className="recommend" aria-label="赛程推荐">
      <div className="recommend__card">
        <p className="recommend__hint">
          <span className="recommend__bulb" aria-hidden>
            💡
          </span>
          已经选了几支球队，不知道下一支该选谁？试试赛程推荐。
        </p>
        <div className="recommend__foot">
          <span className="recommend__count">已选择 {n} 支球队</span>
          <button className="recommend__cta" onClick={() => setOpen((v) => !v)}>
            {open ? '收起推荐' : `推荐第${n + 1}支`}
          </button>
        </div>
      </div>

      {open && (
        <div className="recommend__result">
          {!hasResult || !current ? (
            <p className="recommend__empty">当前范围内没有明显的赛程空缺。</p>
          ) : (
            <>
              <p className="recommend__subtitle">建议下一支选择：</p>
              <div className="recommend__candidate">
                <span className="recommend__no">{circledNo(safeCursor + 1)}</span>
                <span className="recommend__team">
                  <span className="recommend__code">{current.code}</span>
                  <span className="recommend__name">{current.name}</span>
                </span>
                <span className="recommend__holes">填补 {current.filledHoles} 个赛程空缺</span>
              </div>
              <div className="recommend__actions">
                <button
                  className="recommend__btn"
                  onClick={() => setViewing((v) => !v)}
                >
                  {viewing ? '收起赛程' : '查看赛程'}
                </button>
                <button className="recommend__btn" onClick={handleSwap}>
                  换一个推荐
                </button>
                {onAddToCompare && (
                  <button
                    className="recommend__btn recommend__btn--ghost"
                    onClick={() => onAddToCompare(current.code)}
                  >
                    加入选择
                  </button>
                )}
              </div>
              {viewing && fixtures.length > 0 && (
                <ul className="recommend__schedule">
                  {fixtures.map((f) => (
                    <li key={f.matchday} className="recommend__line">
                      <span className="recommend__line-md">MD{f.matchday}</span>
                      <span className="recommend__line-meta">
                        {f.homeAway === 'H' ? '主' : '客'} vs {f.opponent} · {f.date.slice(5)} {f.time}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {tied && (
                <p className="recommend__tied">
                  另有 {tied.count} 支球队同样可以填补 {tied.score} 个赛程空缺
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
