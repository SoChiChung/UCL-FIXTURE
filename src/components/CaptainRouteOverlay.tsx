import type { Matchday, Team } from '../types'
import { WEEKDAY_CN, circledNo } from '../constants'
import { computeCaptainRoute } from '../data/route'

interface CaptainRouteOverlayProps {
  matchdays: Matchday[]
  selectedTeams: Team[]
  onClose: () => void
}

/** 队长路线浮层：不改矩阵结构，展示开球时间线与可切换链 */
export default function CaptainRouteOverlay({
  matchdays,
  selectedTeams,
  onClose,
}: CaptainRouteOverlayProps) {
  const hasTeams = selectedTeams.length > 0

  return (
    <div className="overlay" role="dialog" aria-label="队长路线">
      <div className="overlay__head">
        <div>
          <span className="overlay__title">队长路线</span>
          <span className="overlay__subtitle">比赛日顺序分析</span>
        </div>
        <button className="overlay__close" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </div>

      {!hasTeams ? (
        <div className="overlay__empty">请先选择球队</div>
      ) : (
        <div className="overlay__body">
          {matchdays.map((md) => {
            const route = computeCaptainRoute(md, selectedTeams)
            if (route.slots.length === 0) return null
            // 按比赛日（gdId）分组，段落标题 Route N · 比赛日X
            const byGdId = new Map<number, typeof route.slots>()
            for (const s of route.slots) {
              const arr = byGdId.get(s.gdId) ?? []
              arr.push(s)
              byGdId.set(s.gdId, arr)
            }
            return (
              <div className="overlay__md" key={md.number}>
                <div className="overlay__md-title">Matchday {md.number}</div>
                {md.subDays.map((sd) => {
                  const slots = byGdId.get(sd.gdId)
                  if (!slots || slots.length === 0) return null
                  return (
                    <div className="overlay__route" key={sd.gdId}>
                      <div className="overlay__route-title">
                        Route {sd.ordinal} · {sd.label}
                        <span className="overlay__route-date">
                          {sd.dateKey.slice(5)} {WEEKDAY_CN[sd.weekday] ?? sd.weekday}
                        </span>
                      </div>
                      {slots.map((s) => (
                        <div className="overlay__slot" key={s.key}>
                          <span className="overlay__no">{circledNo(s.no)}</span>
                          <span className="overlay__meta">{s.kickoffTime}</span>
                          <span className="overlay__teams">
                            {s.teams
                              .map((t) => `${t.code} ${t.isHome ? '主' : '客'}${t.opp}`)
                              .join(' / ')}
                            {s.conflict && <span className="overlay__warn"> ⚠</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })}
                <div className="overlay__chain">{route.chain.join(' → ')}</div>
              </div>
            )
          })}
        </div>
      )}

      <div className="overlay__foot">序号 = 北京开球先后 · 同序号 = 撞车，不可互切</div>
    </div>
  )
}
