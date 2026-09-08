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
import MobileTabBar, { type MobileTab } from './components/MobileTabBar'

const MAX_TEAMS = 10

export default function App() {
  const data = useMemo(() => buildFixtureData(), [])
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [captainRoute, setCaptainRoute] = useState(false)
  const [rangeStart, setRangeStart] = useState(1)
  const [rangeEnd, setRangeEnd] = useState(data.matchdays.length)
  const [activeTab, setActiveTab] = useState<MobileTab>('select')
  const [hintDismissed, setHintDismissed] = useState(false)

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

  const clearAll = () => {
    setSelectedCodes([])
    setActiveTab('select')
  }
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

      <div className="workspace" data-tab={activeTab}>
        <main className="workspace__main">
          {!hasSelection ? (
            <div className="empty">
              <div className="empty__icon">⚽</div>
              <div className="empty__title">
                <span className="empty--desktop">先在右侧选择球队</span>
                <span className="empty--mobile">先选你关注的球队</span>
              </div>
              <div className="empty__sub">
                <span className="empty--desktop">
                  勾选右侧的球队，赛程矩阵横向铺开 8 个 Matchday，3 秒看清谁先踢、谁后踢、谁撞车
                </span>
                <span className="empty--mobile">最多 10 支，勾选后切到「赛程」看对阵安排</span>
              </div>
            </div>
          ) : (
            <>
              {!hintDismissed && (
                <div className="landscape-hint" role="status">
                  <span className="landscape-hint__icon" aria-hidden="true">
                    ⟳
                  </span>
                  <span className="landscape-hint__text">建议旋转手机，横屏查看赛程更完整</span>
                  <button
                    type="button"
                    className="landscape-hint__close"
                    onClick={() => setHintDismissed(true)}
                    aria-label="关闭提示"
                  >
                    ×
                  </button>
                </div>
              )}
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
          {hasSelection && (
            <button
              type="button"
              className="mobile-view-fixtures"
              onClick={() => setActiveTab('fixtures')}
            >
              查看赛程 →
            </button>
          )}
        </aside>
      </div>

      {captainRoute && hasSelection && (
        <CaptainRouteOverlay
          matchdays={visibleMatchdays}
          selectedTeams={selectedTeams}
          onClose={() => setCaptainRoute(false)}
        />
      )}

      <MobileTabBar
        activeTab={activeTab}
        selectedCount={selectedCodes.length}
        maxTeams={MAX_TEAMS}
        onChange={setActiveTab}
      />

      <footer className="footer">
        数据来源：UEFA 欧冠联赛阶段赛程 · 开球时间为北京时间（UTC+8，已由欧洲时间 CET/CEST 转换）·
        非官方工具，仅供 Fantasy 参考
        <br />
        B站 微博 小红书 公众号 请关注FPL 紫葱酱
      </footer>
    </div>
  )
}
