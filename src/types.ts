/**
 * 领域类型定义
 * 与 Design.md v1.1 的数据结构设计一一对应
 */

/** 球队引用（冗余存储，避免渲染时跨表查找） */
export interface TeamRef {
  id: number
  code: string // 三字缩写，如 "ARS"
  name: string // 全称，如 "Arsenal"
}

/** 球队（全局唯一，来自全量数据的 code 聚合） */
export interface Team {
  id: number
  code: string
  name: string
  pot: string // 抽签档次，如 "Pot 1"
}

/** 扩展徽标（预留：FDR / 球队评分 / 赛程评分 / 攻防评分），无数据时为空数组 */
export interface ExtensionBadge {
  key: string // 维度标识，如 "fdr" / "rating"
  label: string // 展示文案，如 "FDR 2" / "★★"
  tone: 'warm' | 'primary' | 'muted' // 色相
  order: number // 排序优先级
}

/** 比赛（时间字段均为北京时间 UTC+8） */
export interface Match {
  id: number // mId
  matchday: number // 1~8
  gdId: number // Game Day ID（内部分组键，禁止在界面展示）
  dateKey: string // 北京自然日期 YYYY-MM-DD
  weekday: string // 北京星期标签，如 "Wed"
  kickoffTime: string // 北京开球时刻 HH:mm，如 "03:00"
  home: TeamRef
  away: TeamRef
  stadium: string
  venue: string
  extensions: ExtensionBadge[] // 扩展槽（默认空）
}

/** 比赛日（一个 Matchday 内的子分组，由 GDID 聚类；与北京日期 1:1 对应） */
export interface SubDay {
  gdId: number // 内部键（禁止展示）
  dateKey: string // 北京自然日期
  weekday: string // 星期标签
  ordinal: number // 本轮内序数 1..k（按北京日期升序）
  label: string // 显示名，如 "比赛日一"
}

/** 比赛日（一轮） */
export interface Matchday {
  number: number // 1~8
  matches: Match[]
  dateKeys: string[] // 该轮所有北京日期（升序、去重）
  weekdayByDate: Record<string, string> // dateKey -> 星期标签
  dateRangeLabel: string // 北京日期范围，如 "09-09 ~ 09-11"
  subDays: SubDay[] // 比赛日子分组（GDID 聚类，矩阵列维度）
}

/** 全局数据模型 */
export interface FixtureData {
  teams: Team[] // 36 队，按 code 排序
  teamByCode: Record<string, Team>
  matchdays: Matchday[] // 1~8
  currentMatchday: number // 默认展开的轮次
}
