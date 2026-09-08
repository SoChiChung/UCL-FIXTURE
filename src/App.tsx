import { useMemo, useState } from 'react'
import { buildFixtureData } from './data/normalize'
import type { Team } from './types'
import Header from './components/Header'
import TeamSelector from './components/TeamSelector'
import Legend from './components/Legend'
import MatchdayMatrix from './components/MatchdayMatrix'
import MatchdayRangeFilter from './components/MatchdayRangeFilter'
import CaptainRouteOverlay from './components/CaptainRouteOverlay'
import FixtureRecommendation from './components/FixtureRecommendation'

const MAX_TEAMS = 10

export default function App() {
  const data = useMemo(() => buildFixtureData(), [])
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [captainRoute, setCaptainRoute] = useState(false)
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState(data.matchdays.length)

  const selectedTeams = useMemo(
    () => selectedCodes.map((c) => data.teamByCode[c]).filter(Boolean) as Team[],
    [selectedCodes, data],
  )

  const visibleMatchdays = useMemo(
    () => data.matchdays.filter((md) => md.number >= rangeStart && md.number <= rangeEnd),
    [data, rangeStart, rangeEnd],
  )

  const toggleTeam = (code: string) => {
    setSelectedCodes((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code)
      if (prev.length >= MAX_TEAMS) return prev
      return [...prev, code]
    })
  }

  const clearAll = () => setSelectedCodes([])
  const hasSelection = selectedCodes.length > 0

  return (
    <div className="app">
      <div className="bg-aura" aria-hidden="true">
        <div className="bg-aura__orb bg-aura__orb--1" />
        <div className="bg-aura__orb bg-aura__orb--2" />
        <div className="bg-aura__orb bg-aura__orb--3" />
        <div className="bg-aura__ring bg-aura__ring--1" />
        <div className="bg-aura__ring bg-aura__ring--2" />
        <div className="bg-aura__ring bg-aura__ring--3" />
        <div className="bg-aura__stars" />
      </div>

      <Header
        captainRoute={captainRoute}
        hasSelection={hasSelection}
        onToggleCaptainRoute={() => setCaptainRoute((v) => !v)}
        onClear={clearAll}
      />

      <div className="workspace">
        <main className="workspace__main">
          {!hasSelection ? (
            <div className="empty">
              <div className="empty__icon">⚽</div>
              <div className="empty__title">先在右侧选择球队</div>
              <div className="empty__sub">
                勾选右侧的球队，赛程矩阵横向铺开 8 个 Matchday，3 秒看清谁先踢、谁后踢、谁撞车
              </div>
            </div>
          ) : (
            <>
              <MatchdayRangeFilter
                start={rangeStart}
                end={rangeEnd}
                total={data.matchdays.length}
                onChange={(s, e) => {
                  setRangeStart(s)
                  setRangeEnd(e)
                }}
              />
              <FixtureRecommendation
                selectedCodes={selectedCodes}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
                onAddToCompare={toggleTeam}
              />
              <MatchdayMatrix
                matchdays={visibleMatchdays}
                selectedTeams={selectedTeams}
                captainRoute={captainRoute}
              />
              <Legend />
            </>
          )}
        </main>

        <aside className="workspace__side">
          <TeamSelector
            teams={data.teams}
            selectedCodes={selectedCodes}
            maxTeams={MAX_TEAMS}
            onToggle={toggleTeam}
          />
        </aside>
      </div>

      {captainRoute && hasSelection && (
        <CaptainRouteOverlay
          matchdays={visibleMatchdays}
          selectedTeams={selectedTeams}
          onClose={() => setCaptainRoute(false)}
        />
      )}

      <footer className="footer">
        数据来源：UEFA 欧冠联赛阶段赛程 · 开球时间为北京时间（UTC+8，已由欧洲时间 CET/CEST 转换）·
        非官方工具，仅供 Fantasy 参考
        <br />
        B站 微博 小红书 公众号 请关注FPL 紫葱酱
      </footer>
    </div>
  )
}
