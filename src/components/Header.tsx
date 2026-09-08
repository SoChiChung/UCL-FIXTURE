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
        <div className="brand__logo" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
            <defs>
              <linearGradient id="lg-gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e9cb7e" />
                <stop offset="1" stopColor="#d4af37" />
              </linearGradient>
              <linearGradient id="lg-ice" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#a5d8ff" />
                <stop offset="1" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
            <ellipse
              cx="24"
              cy="8.5"
              rx="18"
              ry="4.2"
              stroke="#a5d8ff"
              strokeOpacity="0.5"
              strokeWidth="1"
            />
            <path
              d="M16 15.5h16v4.5a8 8 0 0 1-16 0z"
              stroke="url(#lg-gold)"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M13.5 15.5h21" stroke="url(#lg-gold)" strokeWidth="1.8" strokeLinecap="round" />
            <path
              d="M15.5 17.5c-3.3 0-4.5 3.5-2.6 6.2"
              stroke="url(#lg-ice)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M32.5 17.5c3.3 0 4.5 3.5 2.6 6.2"
              stroke="url(#lg-ice)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M20 24.5h8l1.1 3.6h-10.2z"
              stroke="url(#lg-gold)"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path d="M17.5 29.5h13" stroke="url(#lg-gold)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <div className="brand__title">紫葱酱 · 欧冠 Fantasy 赛程规划器</div>
          <div className="brand__sub">UCL FIXTURE PLANNER</div>
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
