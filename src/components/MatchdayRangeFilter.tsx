interface MatchdayRangeFilterProps {
  start: number
  end: number
  total: number // 总轮数（1..total）
  onChange: (start: number, end: number) => void
}

/**
 * Matchday Range Filter（修改九）
 * 顶部「起始 MD → 结束 MD」双下拉，控制赛程矩阵展示哪些轮。
 * start > end 时自动交换纠正，不阻断操作。
 */
export default function MatchdayRangeFilter({
  start,
  end,
  total,
  onChange,
}: MatchdayRangeFilterProps) {
  const options = Array.from({ length: total }, (_, i) => i + 1)

  const handleStart = (v: number) => {
    if (v > end) onChange(end, v) // 越界：交换
    else onChange(v, end)
  }

  const handleEnd = (v: number) => {
    if (v < start) onChange(v, start) // 越界：交换
    else onChange(start, v)
  }

  return (
    <div className="range" role="group" aria-label="比赛日范围">
      <span className="range__label">比赛日范围</span>
      <select
        className="range__select"
        value={start}
        onChange={(e) => handleStart(Number(e.target.value))}
        aria-label="起始 Matchday"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            MD{n}
          </option>
        ))}
      </select>
      <span className="range__arrow">→</span>
      <select
        className="range__select"
        value={end}
        onChange={(e) => handleEnd(Number(e.target.value))}
        aria-label="结束 Matchday"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            MD{n}
          </option>
        ))}
      </select>
      <span className="range__hint">共 {total} 轮</span>
    </div>
  )
}
