/** 星期中文标签 */
export const WEEKDAY_CN: Record<string, string> = {
  Sun: '周日',
  Mon: '周一',
  Tue: '周二',
  Wed: '周三',
  Thu: '周四',
  Fri: '周五',
  Sat: '周六',
}

/** 开球先后序号 ①~⑳（队长路线用），超出回退为 #n */
export function circledNo(n: number): string {
  if (n >= 1 && n <= 20) return String.fromCodePoint(0x245f + n)
  return `#${n}`
}

/** 中文序数 一~十（比赛日命名用），超出回退为数字 */
export function cnOrdinal(n: number): string {
  const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  return CN[n - 1] ?? String(n)
}
