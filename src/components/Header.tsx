interface HeaderProps {
  captainRoute: boolean
  hasSelection: boolean
  onToggleCaptainRoute: () => void
  onClear: () => void
}

export default function Header({
  captainRoute,
  hasSelection,
  onToggleCaptainRoute,
  onClear,
}: HeaderProps) {
  return (
    <header className="header">
      <div className="brand">
        <div className="brand__logo">🧅</div>
        <div>
          <div className="brand__title">紫葱酱 · 欧冠 Fantasy 赛程规划器</div>
          <div className="brand__sub">3 秒看清谁先踢、谁后踢、谁撞车</div>
        </div>
      </div>
      <div className="header__actions">
        <button
          className={`toggle ${captainRoute ? 'toggle--on' : ''}`}
          onClick={onToggleCaptainRoute}
          aria-pressed={captainRoute}
          title="开启后叠加队长路线浮层与开球先后序号，不改变矩阵结构"
        >
          <span className="toggle__dot" />
          队长路线
        </button>
        <button className="btn-ghost" onClick={onClear} disabled={!hasSelection}>
          清空
        </button>
      </div>
    </header>
  )
}
