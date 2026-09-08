export default function Legend() {
  return (
    <div className="legend">
      <span className="legend__item">
        <span className="legend__swatch legend__swatch--home" />
        主场 (H)
      </span>
      <span className="legend__item">
        <span className="legend__swatch legend__swatch--away" />
        客场 (A)
      </span>
      <span className="legend__item">
        <span className="legend__swatch legend__swatch--conflict" />
        同刻撞车
      </span>
      <span className="legend__item">
        <span className="legend__swatch legend__swatch--route" />
        队长路线序号
      </span>
    </div>
  )
}
