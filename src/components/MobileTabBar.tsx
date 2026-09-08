export type MobileTab = 'select' | 'fixtures'

interface MobileTabBarProps {
  activeTab: MobileTab
  selectedCount: number
  maxTeams: number
  onChange: (tab: MobileTab) => void
}

/**
 * 移动端竖屏底部双 Tab 导航（选队 / 赛程）
 * 仅在 `@media (orientation: portrait)` 下显示（CSS 控制），桌面/横屏隐藏。
 * 延续深色星空玻璃质感：半透明 surface + 顶部冰蓝→金色渐变指示条 + 金色 badge。
 */
export default function MobileTabBar({
  activeTab,
  selectedCount,
  maxTeams,
  onChange,
}: MobileTabBarProps) {
  return (
    <nav className="mobile-tabbar" aria-label="移动端主导航">
      <button
        type="button"
        className={`mobile-tabbar__tab ${activeTab === 'select' ? 'mobile-tabbar__tab--active' : ''}`}
        onClick={() => onChange('select')}
        aria-current={activeTab === 'select'}
      >
        <span className="mobile-tabbar__icon" aria-hidden="true">
          ⚽
        </span>
        <span className="mobile-tabbar__label">选队</span>
        {selectedCount > 0 && (
          <span className="mobile-tabbar__badge">
            {selectedCount}/{maxTeams}
          </span>
        )}
      </button>

      <button
        type="button"
        className={`mobile-tabbar__tab ${activeTab === 'fixtures' ? 'mobile-tabbar__tab--active' : ''}`}
        onClick={() => onChange('fixtures')}
        aria-current={activeTab === 'fixtures'}
      >
        <span className="mobile-tabbar__icon" aria-hidden="true">
          📅
        </span>
        <span className="mobile-tabbar__label">赛程</span>
      </button>
    </nav>
  )
}
