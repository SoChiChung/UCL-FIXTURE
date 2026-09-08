import { useMemo, useState } from 'react'
import type { Team } from '../types'

interface TeamSelectorProps {
  teams: Team[]
  selectedCodes: string[]
  maxTeams: number
  onToggle: (code: string) => void
}

/** 36 队勾选面板（右侧常驻），搜索框实时过滤，与矩阵双向联动 */
export default function TeamSelector({
  teams,
  selectedCodes,
  maxTeams,
  onToggle,
}: TeamSelectorProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return teams
    return teams.filter(
      (t) => t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q),
    )
  }, [query, teams])

  // 按抽签档次分组
  const groups = useMemo(() => {
    const map = new Map<string, Team[]>()
    for (const t of filtered) {
      const arr = map.get(t.pot) ?? []
      arr.push(t)
      map.set(t.pot, arr)
    }
    return Array.from(map.entries())
  }, [filtered])

  const full = selectedCodes.length >= maxTeams
  const isDisabled = (code: string) => !selectedCodes.includes(code) && full

  return (
    <div className="selector">
      <div className="selector__head">
        <span className="selector__title">球队选择</span>
        <span className="selector__count">
          {selectedCodes.length}/{maxTeams}
        </span>
      </div>
      <input
        className="search__input selector__search"
        placeholder="搜索球队 / 缩写，如 ARS"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="搜索球队"
      />
      <div className="selector__list">
        {filtered.length === 0 ? (
          <div className="search__empty">未找到匹配球队</div>
        ) : (
          groups.map(([pot, list]) => (
            <div className="selector__group" key={pot}>
              <div className="selector__group-title">{pot}</div>
              {list.map((t) => {
                const checked = selectedCodes.includes(t.code)
                return (
                  <label
                    className={`selector__item ${checked ? 'selector__item--checked' : ''}`}
                    key={t.code}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isDisabled(t.code)}
                      onChange={() => onToggle(t.code)}
                    />
                    <span className="selector__code">{t.code}</span>
                    <span className="selector__name">{t.name}</span>
                  </label>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
