import { useMemo, useState } from 'react'
import { MAX_PLAYERS_PER_MATCHDAY } from '../data/selection'
import type { Matchday, Team } from '../types'

/** 从 "Pot 4" 提取数字 4（用于 Pot 升序排序，不依赖字符串/JSON 原始顺序） */
function potNum(pot: string): number {
  const m = pot.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : 0
}

/** 比赛日筛选条件的稳定 key：形如 "轮次-轮内序数"（ordinal 为轮内第几个比赛日，从 1 起） */
export interface DayFilter {
  matchday: number
  ordinal: number
}

function filterKey(f: DayFilter): string {
  return `${f.matchday}-${f.ordinal}`
}

interface TeamSelectorProps {
  teams: Team[]
  matchdays: Matchday[]
  selectedCodes: string[]
  maxTeams: number
  /**
   * 返回某队当前不可勾选的原因；返回 null 表示可勾选。
   * 由 App 传入，内含「球队数上限」与「单轮 15 人上限」两条约束的合并判定。
   */
  blockReason?: (code: string) => string | null
  onToggle: (code: string) => void
}

/**
 * 36 队勾选面板（右侧常驻）。
 * 两种筛选条件可叠加：
 *   1) 搜索框：按球队全称 / 三字缩写
 *   2) 比赛日筛选：多选「MDn 的比赛日k」，球队需在**每个**选中组合上都有比赛才保留
 *      （例：同时勾 MD2-比赛日一 与 MD3-比赛日一 → 只留两天都开赛的队）
 */
export default function TeamSelector({
  teams,
  matchdays,
  selectedCodes,
  maxTeams,
  blockReason,
  onToggle,
}: TeamSelectorProps) {
  const [query, setQuery] = useState('')
  const [dayFilters, setDayFilters] = useState<DayFilter[]>([])
  const [dayPanelOpen, setDayPanelOpen] = useState(false)

  /**
   * 预索引：code -> Set<`${matchday}-${ordinal}`>，避免每次筛选重扫 72 场比赛。
   * 一支球队每轮只有一场，故「是否有比赛」= 该轮存在任一 subDay 命中即可。
   */
  const playDaysByCode = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const add = (code: string, key: string) => {
      let s = map.get(code)
      if (!s) {
        s = new Set()
        map.set(code, s)
      }
      s.add(key)
    }
    for (const md of matchdays) {
      for (const sd of md.subDays) {
        for (const m of md.matches) {
          if (m.gdId === sd.gdId) {
            add(m.home.code, `${md.number}-${sd.ordinal}`)
            add(m.away.code, `${md.number}-${sd.ordinal}`)
          }
        }
      }
    }
    return map
  }, [matchdays])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return teams.filter((t) => {
      if (q && !t.code.toLowerCase().includes(q) && !t.name.toLowerCase().includes(q)) {
        return false
      }
      if (dayFilters.length > 0) {
        const days = playDaysByCode.get(t.code)
        if (!days) return false
        // 需覆盖全部选中的比赛日组合（AND 语义）
        for (const f of dayFilters) {
          if (!days.has(filterKey(f))) return false
        }
      }
      return true
    })
  }, [query, teams, dayFilters, playDaysByCode])

  // 按抽签档次分组，并强制 Pot 数字升序 + 同 Pot 内 code 升序
  const groups = useMemo(() => {
    const map = new Map<string, Team[]>()
    for (const t of filtered) {
      const arr = map.get(t.pot) ?? []
      arr.push(t)
      map.set(t.pot, arr)
    }
    return Array.from(map.entries())
      .sort((a, b) => potNum(a[0]) - potNum(b[0]))
      .map(
        ([pot, list]) =>
          [pot, [...list].sort((x, y) => x.code.localeCompare(y.code))] as [string, Team[]],
      )
  }, [filtered])

  const toggleDay = (f: DayFilter) => {
    setDayFilters((prev) => {
      const key = filterKey(f)
      return prev.some((x) => filterKey(x) === key)
        ? prev.filter((x) => filterKey(x) !== key)
        : [...prev, f]
    })
  }

  const isDayActive = (f: DayFilter) =>
    dayFilters.some((x) => filterKey(x) === filterKey(f))

  const full = selectedCodes.length >= maxTeams
  /** 优先用外部传入的完整判定（含 15 人上限），否则退回「仅球队数上限」 */
  const reasonOf = (code: string): string | null => {
    if (selectedCodes.includes(code)) return null
    if (blockReason) return blockReason(code)
    return full ? `最多同时选 ${maxTeams} 支` : null
  }

  return (
    <div className="selector">
      <div className="selector__head">
        <span className="selector__title">球队选择</span>
        <span className="selector__count">
          {selectedCodes.length}/{maxTeams}
        </span>
      </div>
      <div className="selector__rule">
        最多 {maxTeams} 支 · 每个 Matchday 参赛球员合计 ≤ {MAX_PLAYERS_PER_MATCHDAY} 人
      </div>
      <input
        className="search__input selector__search"
        placeholder="搜索球队 / 缩写，如 ARS"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="搜索球队"
      />

      {/* 比赛日筛选：可折叠面板，多选 AND 生效 */}
      <div className="dayfilter">
        <button
          type="button"
          className="dayfilter__toggle"
          onClick={() => setDayPanelOpen((v) => !v)}
          aria-expanded={dayPanelOpen}
        >
          <span className="dayfilter__toggle-label">按比赛日筛选</span>
          {dayFilters.length > 0 && (
            <span className="dayfilter__badge">{dayFilters.length}</span>
          )}
          <span className={`dayfilter__caret ${dayPanelOpen ? 'is-open' : ''}`}>
            ▾
          </span>
        </button>

        {dayPanelOpen && (
          <div className="dayfilter__panel">
            <div className="dayfilter__hint">
              勾选多个「MD·比赛日」组合，仅显示<b>全部组合都有比赛</b>的球队
            </div>
            {matchdays.map((md) => (
              <div className="dayfilter__row" key={md.number}>
                <span className="dayfilter__md">MD{md.number}</span>
                <div className="dayfilter__chips">
                  {md.subDays.map((sd) => {
                    const f = { matchday: md.number, ordinal: sd.ordinal }
                    const active = isDayActive(f)
                    return (
                      <button
                        type="button"
                        key={`${md.number}-${sd.ordinal}`}
                        className={`dayfilter__chip ${active ? 'dayfilter__chip--on' : ''}`}
                        onClick={() => toggleDay(f)}
                        title={`${md.number} 轮 · ${sd.label} · ${sd.dateKey}`}
                        aria-pressed={active}
                      >
                        {sd.label.replace('比赛日', '')}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {dayFilters.length > 0 && (
              <button
                type="button"
                className="dayfilter__clear"
                onClick={() => setDayFilters([])}
              >
                清空比赛日筛选（{dayFilters.length}）
              </button>
            )}
          </div>
        )}
      </div>

      <div className="selector__list">
        {filtered.length === 0 ? (
          <div className="search__empty">未找到匹配球队</div>
        ) : (
          groups.map(([pot, list]) => (
            <div className="selector__group" key={pot}>
              <div className="selector__group-title">{pot}</div>
              {list.map((t) => {
                const checked = selectedCodes.includes(t.code)
                const why = reasonOf(t.code)
                return (
                  <label
                    className={`selector__item ${checked ? 'selector__item--checked' : ''} ${why ? 'selector__item--blocked' : ''}`}
                    key={t.code}
                    title={why ?? undefined}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={why !== null}
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