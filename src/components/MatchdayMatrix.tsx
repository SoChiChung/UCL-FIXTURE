import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Match, Matchday, Team } from '../types'
import { WEEKDAY_CN, circledNo } from '../constants'
import { computeCaptainRoute } from '../data/route'

interface MatchdayMatrixProps {
  matchdays: Matchday[]
  selectedTeams: Team[]
  captainRoute: boolean
}

interface TipState {
  match: Match
  isHome: boolean
  x: number
  y: number
}

function FixtureCell({
  match,
  isHome,
  conflict,
  badge,
  onHover,
}: {
  match: Match
  isHome: boolean
  conflict: boolean
  badge: string
  onHover: (t: TipState | null) => void
}) {
  const opp = isHome ? match.away : match.home
  const cls = `cell ${isHome ? 'cell--home' : 'cell--away'} ${conflict ? 'cell--conflict' : ''}`
  return (
    <span
      className={cls}
      onMouseEnter={(e) => onHover({ match, isHome, x: e.clientX, y: e.clientY })}
      onMouseLeave={() => onHover(null)}
    >
      {badge && <span className="cell__badge">{badge}</span>}
      <span className="cell__main">
        {opp.code}
        <span className="cell__ha">({isHome ? 'H' : 'A'})</span>
      </span>
      <span className="cell__time">{match.kickoffTime}</span>
      {match.extensions.length > 0 && (
        <span className="cell__ext">
          {match.extensions.map((e) => (
            <span key={e.key} className={`cell__chip cell__chip--${e.tone}`}>
              {e.label}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

/**
 * 统一赛程矩阵：行 = 所选球队，列 = Matchday 1~8（每个 Matchday 内按北京自然日期拆子列）。
 * 复用 computeCaptainRoute 派生每轮的「日期+时刻」序号与撞车标记。
 */
export default function MatchdayMatrix({
  matchdays,
  selectedTeams,
  captainRoute,
}: MatchdayMatrixProps) {
  const [tip, setTip] = useState<TipState | null>(null)
  const codes = new Set(selectedTeams.map((t) => t.code))

  // `${code}|${matchday}` -> { match, isHome }（每队每轮唯一一场）
  const matchByCodeMd = new Map<string, { match: Match; isHome: boolean }>()
  for (const md of matchdays) {
    for (const m of md.matches) {
      if (codes.has(m.home.code)) {
        matchByCodeMd.set(`${m.home.code}|${md.number}`, { match: m, isHome: true })
      }
      if (codes.has(m.away.code)) {
        matchByCodeMd.set(`${m.away.code}|${md.number}`, { match: m, isHome: false })
      }
    }
  }

  // 比赛日显示名（gdId -> label），供 tooltip 使用
  const subDayLabel = (match: Match): string => {
    const md = matchdays.find((x) => x.number === match.matchday)
    const sd = md?.subDays.find((s) => s.gdId === match.gdId)
    return sd?.label ?? ''
  }

  // matchday -> Map(`${dateKey}|${kickoffTime}` -> { no, conflict })
  const slotByMd = new Map<number, Map<string, { no: number; conflict: boolean }>>()
  for (const md of matchdays) {
    const route = computeCaptainRoute(md, selectedTeams)
    const map = new Map<string, { no: number; conflict: boolean }>()
    for (const s of route.slots) map.set(s.key, { no: s.no, conflict: s.conflict })
    slotByMd.set(md.number, map)
  }

  const tipLeft = tip ? Math.min(tip.x + 14, window.innerWidth - 260) : 0
  const tipTop = tip ? Math.min(tip.y + 14, window.innerHeight - 200) : 0

  return (
    <div className="matrix">
      <table className="matrix__table">
        <thead>
          <tr>
            <th rowSpan={2} className="matrix__th matrix__th--corner">
              球队
              <span className="matrix__th-sub">已选</span>
            </th>
            {matchdays.map((md) => (
              <th
                key={md.number}
                colSpan={md.subDays.length}
                className="matrix__th matrix__th--md"
              >
                Match Day {md.number}
              </th>
            ))}
          </tr>
          <tr>
            {matchdays.map((md) =>
              md.subDays.map((sd) => (
                <th
                  key={`${md.number}-${sd.gdId}`}
                  className="matrix__th matrix__th--date"
                  title={`${sd.label} · ${sd.dateKey}（北京时间）`}
                >
                  {sd.label}
                  <span className="matrix__th-sub">{sd.dateKey.slice(5)}</span>
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {selectedTeams.map((team) => (
            <tr key={team.code}>
              <th className="matrix__td-team" title={team.name}>
                {team.code}
              </th>
              {matchdays.map((md) =>
                md.subDays.map((sd) => {
                  const entry = matchByCodeMd.get(`${team.code}|${md.number}`)
                  if (!entry || entry.match.gdId !== sd.gdId) {
                    return (
                      <td key={`${md.number}-${sd.gdId}`}>
                        <span className="cell cell--empty" />
                      </td>
                    )
                  }
                  const slotMap = slotByMd.get(md.number)!
                  const info = slotMap.get(entry.match.dateKey + '|' + entry.match.kickoffTime)
                  const badge = captainRoute && info ? circledNo(info.no) : ''
                  return (
                    <td key={`${md.number}-${sd.gdId}`}>
                      <FixtureCell
                        match={entry.match}
                        isHome={entry.isHome}
                        conflict={info?.conflict ?? false}
                        badge={badge}
                        onHover={setTip}
                      />
                    </td>
                  )
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {tip &&
        createPortal(
          <div className="tooltip" style={{ left: tipLeft, top: tipTop }}>
            <div className="tooltip__title">
              {tip.isHome ? tip.match.home.name : tip.match.away.name} vs{' '}
              {tip.isHome ? tip.match.away.name : tip.match.home.name}
            </div>
            <div className="tooltip__row">
              <span className="tooltip__label">Matchday</span>
              <span>{tip.match.matchday}</span>
            </div>
            <div className="tooltip__row">
              <span className="tooltip__label">比赛日</span>
              <span>{subDayLabel(tip.match)}</span>
            </div>
            <div className="tooltip__row">
              <span className="tooltip__label">日期</span>
              <span>
                {tip.match.dateKey}（{WEEKDAY_CN[tip.match.weekday] ?? tip.match.weekday}）
              </span>
            </div>
            <div className="tooltip__row">
              <span className="tooltip__label">开球</span>
              <span>{tip.match.kickoffTime}（北京时间）</span>
            </div>
            <div className="tooltip__row">
              <span className="tooltip__label">身份</span>
              <span className={tip.isHome ? 'tooltip__home' : 'tooltip__away'}>
                {tip.isHome ? 'Home 主场' : 'Away 客场'}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
