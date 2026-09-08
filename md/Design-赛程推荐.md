# 紫葱酱的欧冠 Fantasy 赛程规划器 — 赛程推荐功能设计文档（v1.2）

> **版本**：v1.2（由 v1.1 小幅修订，纯文档，不含代码）
> **版本历史**：v1.0（固定 4→5，Top 3）→ v1.1（通用 N→N+1，Top 1，「换一个推荐」，Pot 排序）→ v1.2（本次：统一「已选择」概念、明确「换一个」行为、新增排除清单、DAYS 动态化、修正错误）
> **性质**：本文件描述「赛程推荐」功能的产品与算法设计，只写规范、数据结构与算法流程，不含 React/TypeScript/Tailwind 实现代码。
> **目标读者**：前端工程师、后端数据工程师
> **核心原则（一句话）**：用户已选 **N** 支球队时，系统帮他找到「最适合作为第 **N+1** 支」的球队——这是一个**赛程排列组合 / 覆盖优化**工具，**每次只推荐 1 支**，**不是**队长推荐、不是球员推荐，不考虑 Captain、价格、积分、FDR、球队强弱。

---

## 0. 结论速览（先给结论）

| # | 主题 | 结论 |
| --- | --- | --- |
| 1 | 功能本质 | 纯前端的「赛程覆盖补缺」计算，无后端、无网络 |
| 2 | 数据来源 | 直接使用 `fixtures_normalized.json` 的 `coverage`、`teams` 与 `matchdays`，**不解析** `fixtures_90_en.json`、**不遍历** 144 场比赛 |
| 3 | 触发条件 | 已选球队 **1 ~ 9 支**（即「有已选择、且未满 10 支上限」）时显示入口，推荐第 `N+1` 支；0 支或 10 支不显示 |
| 4 | 赛程坑定义 | `Matchday + day` 组合（如 `MD1-D2`），该组合当前无任何已选球队覆盖 |
| 5 | 唯一评分 | `filledHoles`（候选能填补的坑数量），越高越靠前；不加任何外部因子 |
| 6 | 计算范围 | 严格等于当前 Matchday Range Filter 的 `[start, end]` 区间 |
| 7 | 推荐结果数量 | **只推荐 1 支**（Top 1），通过「换一个推荐」逐个查看下一名，不并排展示多个候选 |
| 8 | 并列处理 | 稳定排序取 1 个展示 + 动态提示「另有 X 支同样可填补 N 坑」，不丢失并列信息 |
| 9 | 无坑处理 | 采用「无坑即不推荐」：显示「当前范围内没有明显的赛程空缺」，**不因已选 1~9 支而强推** |
| 10 | 代码结构 | 算法独立成模块（`recommendNextTeam`），UI 组件只负责展示与交互 |
| 11 | Pot 排序 | 右侧球队选择栏严格按 `Pot 1 → Pot 2 → Pot 3 → Pot 4` 从上到下，同 Pot 内按 `code` 稳定排序 |
| 12 | 每轮比赛日 | **动态**从 `fixtures_normalized.json` 的 `matchdays[].days` 派生，**不硬编码** `DAYS_PER_MD` |
| 13 | 未来 FDR | 「Slot 覆盖」与「Slot 价值」分离，当前价值恒为 1，未来 FDR 只改权重层 |
| 14 | 明确排除 | 不做「最终数量选择 / 一次多支 / 多球队组合优化 / 球员或门将推荐」（见 §3.5） |

---

## 0.5 v1.1 → v1.2 修订说明（本版变更点）

| 变更项 | v1.1（旧） | v1.2（新） |
| --- | --- | --- |
| 用词统一 | 混用「锁定」「已选择」两个概念 | 全文统一「**已选择 N 支球队**」，不设 `lockedCount`、不设「锁定数量选择器」 |
| 产品定位 | 「推荐第 N+1 支」 | 明确为「**推荐下一支球队**」，1→2 … 9→10，每次只推荐 1 支 |
| 入口按钮 | 「推荐第 N+1 支」 | 动态「推荐第 2 支」…「推荐第 10 支」，**无固定「推荐第 5 支」** |
| 换一个推荐 | 仅写「取下一名，循环」 | 明确**非随机**：按排序继续查看下一支 + 明确三种重算触发（§7.2） |
| 无坑处理 | 方案 A | 保留方案 A，明确**不因已选 1~9 支而强行给结果**（§9） |
| 排除清单 | 无 | 新增 §3.5，明确不做最终数量 / 多支 / 组合优化 / 球员推荐 |
| 每轮比赛日 | 硬编码 `DAYS_PER_MD = [3,2,2,2,2,2,2,1]` | **动态**从 `matchdays[].days` 派生 `daysByMatchday`，不硬编码（§5.4、§12.1） |
| 边界错误 | 第 12 行含自我纠正文字 | 修正为「已选 9 支仍有 27 支候选，不存在候选不足」（§15） |

---

## 1. 现状盘点（开发前检查结论）

### 1.1 `fixtures_normalized.json` 真实结构（已核对）

文件为单份 JSON，四层结构：

```
fixtures_normalized.json
├── meta        { generatedAt, sourceFile:"fixtures_90_en.json", timezone:"Asia/Shanghai",
│                 stats:{ matches:144, teams:36, matchdays:8, days:16 } }
├── matchdays[] 8 轮，每轮 { id, name, dateRange, days[] }
│   └── days[]  每轮的比赛日，{ day, name:"比赛日X", date, gdId, matches[] }  ← matches 是 144 场，推荐不用
├── teams{}     36 队（按 code 键），每队 { id, code, name, pot, fixtures{} }
│   └── fixtures{}  按 "MD1"~"MD8" 键，每场 { matchday, day, date, time, opponent, homeAway, fdr:null }
└── coverage{}  36 队 → { "MD1": day, "MD2": day, ..., "MD8": day }   ← 推荐算法核心依赖
```

**关键事实**：

1. `coverage[code]` 是一份**紧凑映射**：每支球队在每一轮踢**第几个比赛日（day）**。这是推荐算法唯一需要的数据，体积极小（36 队 × 8 轮）。
2. `day` 值域：**MD1 有 1/2/3 三个比赛日，MD2~MD7 各 1/2 两个比赛日，MD8 只有 1 一个比赛日**（合计 16 个 day，与 `stats.days=16` 一致）。**本版不将此规律硬编码**，而是从 `matchdays[].days` 动态派生（见 §5.4、§12.1）。
3. `teams[code].fixtures.MD{n}.fdr` 已是 `null` —— 数据层已为 FDR 预留字段，但**本次不实现 FDR**。
4. `fixtures_normalized.json` 已完成北京时间（`Asia/Shanghai`）转换，与现有运行时 `normalize.ts` 的时区结果**一致**，`coverage` 的 `day` 与现有矩阵的 `subDays` 对齐。
5. `teams[].pot` 的取值是**字符串** `"Pot 1"` ~ `"Pot 4"`（与原始 `fixtures.json` 的 `htPtName`/`atPtName` 一致），排序时需提取数字，不能按字符串排序（见 §11）。

### 1.2 当前代码架构与接入点（已核对）

| 关注点 | 位置 | 说明 |
| --- | --- | --- |
| 已选球队状态 | `src/App.tsx` → `selectedCodes: string[]` | 存三字码数组，上限 10 |
| Range Filter 状态 | `src/App.tsx` → `rangeStart` / `rangeEnd` | 默认 `1` / `8`，`visibleMatchdays` 由它过滤 |
| 球队选择逻辑 | `src/components/TeamSelector.tsx` → `onToggle(code)` | 读写同一 `selectedCodes` |
| 矩阵组件 | `src/components/MatchdayMatrix.tsx` | 行=球队、列=Matchday→比赛日 |
| 数据构建 | `src/data/normalize.ts` | **读 `fixtures.json`（原始）**，非 `fixtures_normalized.json` |
| 常量工具 | `src/constants.ts` | `cnOrdinal` / `circledNo` / `WEEKDAY_CN` |

**已确认的 Pot 排序 bug（本版需修复，见 §11）**：

- `TeamSelector.tsx` 中 `groups = Array.from(map.entries())` 直接按 `Map` 的**插入顺序**渲染分组。
- 而 `teams` 数组在 `normalize.ts` 里按 `code` 字母序排序，故 Map 的插入顺序 = 「各 Pot 中 code 字母序最小那支球队」首次出现的先后，**与 Pot 数字无关**。
- 结果：Pot 的显示顺序取决于数据里各队 code 的相对顺序，可能把 **Pot 4 排在 Pot 1 之上**。
- 正确做法：分组后按 Pot 数字升序 + 同 Pot 内 code 升序（见 §11），**不依赖 JSON 原始顺序**。

### 1.3 关键结论

1. `fixtures_normalized.json` 当前**未被任何代码引用**，是「已生成好、待接入」的新文件。
2. 现有运行时代码读的是 `fixtures.json`（原始 90 结构），与 `fixtures_normalized.json` 是**两条并行数据源**。为遵循「最小改动、不重写现有赛程系统」，推荐功能**独立导入** `fixtures_normalized.json` 的 `coverage` + `teams` + `matchdays`，**不动** `normalize.ts`、**不动**矩阵、**不动** Range Filter。
3. 推荐功能所需的全部信息（已选球队、筛选范围）都已存在于 `App.tsx` 的既有 state 中，无需新增全局状态。

---

## 2. 核心概念定义

### 2.1 赛程 Slot（唯一标识）

赛程位置统一用 **`MD{n}-D{day}`** 字符串表示，例如 `MD1-D1`、`MD1-D2`、`MD1-D3`、`MD2-D1`、`MD2-D2`、`MD8-D1`。

- `n` = Matchday 序号（1~8）
- `day` = 该 Matchday 内的比赛日序号（1/2/3）

一个 Slot 就是「某轮的第几个比赛日」，**不区分开球时刻**。这是判断坑的唯一维度。

### 2.2 赛程坑（Missing Slot）

「坑」= 在当前筛选范围内，**没有任何已选球队覆盖**的 Slot。

示例：

- 范围 = MD1，已选 ARS/MCI/BAR，其中
  - `MD1-D1`：ARS、MCI 有比赛 → 已覆盖
  - `MD1-D2`：无人有比赛 → **坑**
  - `MD1-D3`：BAR 有比赛 → 已覆盖

  则 `MD1-D2` 是一个赛程坑。

- 若 `MD1-D1` 有 ARS/MCI、`MD1-D2` 有 BAR/PSG，则 MD1 **没有坑**。

**判断唯一维度 = Matchday + day**，不看开球时间，不重算 GDID（`day` 与 GDID 已由生成脚本整理好）。

### 2.3 coverage 语义

`coverage[code]` = `{ "MD1": 1, "MD2": 2, ..., "MD8": 1 }`，表示该队在 MD1 踢第 1 比赛日、MD2 踢第 2 比赛日、MD8 踢第 1 比赛日。

由它可直接得到该队的 **candidateCoverage**（slot 集合）：

```
candidateCoverage(code) = { "MD1-D1", "MD2-D2", ..., "MD8-D1" }
```

---

## 3. 功能定位与触发条件

### 3.1 功能定位

赛程推荐是一个**逐步构建球队组合的辅助工具**，不是「一键补满到 5 支」的自动完成器。

- 用户**自己决定**当前已选择几支球队。
- 系统只回答一个问题：**「下一支选谁？」**，即找到最适合作为第 N+1 支的球队。
- **每次只推荐 1 支**，用户决定接受与否、何时停止。
- 用户每接受一支，就能再次推荐「再下一支」，如此循环，直至满 10 支或用户主动停止。

### 3.2 触发条件（统一规则）

**原则：只要「有已选择」且「仍有候选可选」，就提供推荐入口。**

- 设 `N = selectedCodes.length`（当前已选球队数），上限 `MAX = 10`。
- **显示入口**：`1 <= N <= MAX - 1`（即 1 ~ 9 支）。
- **不显示入口**：
  - `N = 0`：尚未选择任何球队，无从「补缺」，不显示。
  - `N = MAX`（10 支）：已满员，无候选可加，不显示。

| 已选球队数 N | 行为 |
| --- | --- |
| 0 | 不显示推荐入口 |
| 1 | 显示入口，推荐第 2 支 |
| 2 | 显示入口，推荐第 3 支 |
| 3 | 显示入口，推荐第 4 支 |
| 4 | 显示入口，推荐第 5 支 |
| … | …（通用递推） |
| 9 | 显示入口，推荐第 10 支 |
| 10 | 不显示推荐入口（已满） |

- 触发条件就是单一布尔判断：`1 <= selectedCodes.length && selectedCodes.length < MAX_TEAMS`。
- **不另设**任何独立的数量状态：`selectedCodes.length` 就是唯一的「已选择数量」（见 §3.4）。

### 3.3 提示文案

正式文案（已选定）：

> `已经选了几支球队，不知道下一支该选谁？试试赛程推荐。`

理由：直白点出「下一支」这一核心动作，且「试试赛程推荐」给出明确行动引导，最不易产生「补满 5 支」「队长推荐」之类的误解。

**按钮文案动态生成**，随 `N` 变化：

- `N=1` → `推荐第 2 支`
- `N=2` → `推荐第 3 支`
- `N=3` → `推荐第 4 支`
- `N=4` → `推荐第 5 支`
- … 递推 …
- `N=9` → `推荐第 10 支`

**禁止**出现固定的「推荐第 5 支」硬编码。

### 3.4 「已选择数量」设计决策（已确认）

**结论：已选择数量 = `selectedCodes.length`，不额外建立独立的 `lockedCount`，也不设计单独的「锁定数量选择器」。**

全文统一使用「**已选择 N 支球队**」这一种表述，例如「已选择 3 支球队 → 推荐第 4 支」。**避免**出现「用户锁定 3 支，但准备推荐第 4 支」这种可能产生两个数量概念的表述。

理由：

1. **单一数据源，避免状态不一致**：若另设独立数量状态，用户勾选/取消球队时二者可能脱节（如用户取消了 1 支，独立状态却没减），产生「实际 3 支却说已选择 4 支」的矛盾。
2. **语义天然一致**：用户右侧勾选的球队就是「已选择的球队」，勾到几支就选择几支，无需二次声明。
3. **增减自动同步**：`selectedCodes` 增删时，`length` 即时反映，推荐入口显隐与按钮文案自动更新，无需额外同步逻辑。

用户如何「增加/减少已选择数量」：

- 增加 = 在右侧勾选更多球队（含「接受推荐」的加入动作）。
- 减少 = 取消勾选（含清空）。
- 二者都直接作用于 `selectedCodes`，`length` 随之变化，推荐逻辑自动适配。

**默认状态**：`selectedCodes = []`（0 支），不显示推荐入口，等用户先选。

### 3.5 明确不属于本版本的功能（排除清单）

本版本**不实现**以下功能，后续版本也不应误将其纳入「赛程推荐」：

- 最终球队数量选择 / 「我要选满 5 支」之类的目标数量设定；
- 一次推荐多支球队；
- 一次推荐多个组合；
- 多球队组合优化（同时寻找两支、三支或更多球队）；
- 组合爆炸 / 搜索剪枝等组合搜索逻辑；
- 球员推荐、门将推荐；
- 队长 / 队长路线 / 阵容推荐。

本功能始终是：**已选 N 支 → 推荐第 N+1 支 → 用户决定是否接受 → 接受后继续推荐下一支**，每次只推荐 1 支。

---

## 4. 用户场景

### 4.1 核心场景（逐步构建）

1. 用户先选几支心仪球队（如 ARS、MCI、BAR，共 3 支）。
2. 看到推荐入口提示「已选择 3 支球队」，按钮「推荐第 4 支」。
3. 点击「赛程推荐」→ 系统给出 **1 个**推荐：Inter，填补 4 个赛程空缺。
4. 用户点「查看赛程」看 Inter 在矩阵中的位置，决定是否接受。
5. 接受 → 勾选 Inter，现为 4 支 → 入口自动变为「推荐第 5 支」。
6. 用户继续「推荐下一支」，如此循环，直到满意或满 10 支。

### 4.2 分支场景

- **换一个**：用户不喜欢当前推荐 → 点「换一个推荐」→ 看下一名候选（同分或次分），不改已选状态。
- **无坑**：当前已选已覆盖范围全部 Slot → 显示「当前范围内没有明显的赛程空缺」，不强推。
- **范围联动**：用户把 Range Filter 收窄到 `MD2→MD4` → 推荐只在这 3 轮内找坑，结果实时重算。

---

## 5. 推荐算法（核心）

### 5.1 输入 / 输出

**输入**：
- `selectedCodes: string[]`（长度 N，1 <= N <= 9）
- `rangeStart: number`（Range Filter 起始，含）
- `rangeEnd: number`（Range Filter 结束，含）

**输出**：
- `missingSlots: string[]`（当前范围的赛程坑，供展示/调试）
- `rankings: Ranking[]`（按 filledHoles 降序的**全量**候选排序，供「换一个推荐」遍历）
- `top: Ranking | null`（第 1 名，即本次推荐）
- `tiedRemaining: { count: number; score: number } | null`（相对当前 top 的同分提示，见 §8）

### 5.2 八步流程

1. **取已选 N 队** → `selectedCodes`。
2. **算当前覆盖** `currentCoverage`：并集 N 队的 `candidateCoverage`（用 `coverage` 映射）。
3. **算范围全部 Slot** `rangeSlots`：由 `rangeStart..rangeEnd` 与 `daysByMatchday`（动态派生，见 §5.4）生成。
4. **求坑** `missingSlots = rangeSlots - currentCoverage`。
5. **遍历剩余候选**（`teams` 中不在 `selectedCodes` 的 `36 - N` 队）。
6. **算新增填补数**：对每队算 `filledHoles = | candidateCoverage(code) ∩ missingSlots |`。
7. **排序**：`filledHoles` 降序；同分按 `code` 字母序稳定排序。
8. **取第 1 名**：`top = rankings[0]`，只展示这 1 支；并附 `tiedRemaining`。

**本版本不加入任何组合搜索**：不尝试同时寻找两支、三支或更多球队的组合，也不做多球队组合优化或搜索剪枝。

### 5.3 评分规则（唯一评分 = filledHoles）

- 第一阶段**唯一评分** = `filledHoles`（候选新增覆盖的坑数量）。
- **禁止**加入：Captain Route、球员、球员价格、球员积分、球队强弱、FDR、球队排名、现实比赛结果、任何外部因子。
- `filledHoles` 越高，排名越靠前。

示例：

```
坑 = { MD1-D2, MD2-D1, MD3-D3 }
候选 A 覆盖 { MD1-D2, MD2-D3, MD3-D3 }  → filledHoles = 2（MD1-D2、MD3-D3）
候选 B 覆盖 { MD1-D1, MD2-D1, MD3-D1 }  → filledHoles = 1（MD2-D1）
→ A 排在 B 前，A 为本次推荐
```

### 5.4 数据结构（伪代码）

```
# —— 初始化（一次性，从 fixtures_normalized.json 动态派生并缓存，不硬编码）——
daysByMatchday = {}
for md in matchdays:              # matchdays[] 来自 fixtures_normalized.json
    days = []
    for d in md.days:             # md.days[] 是该轮的比赛日数组
        days.add(d.day)
    daysByMatchday[md.id] = sorted(days)
# 结果示例：daysByMatchday = { 1:[1,2,3], 2:[1,2], ..., 8:[1] }

function recommendNextTeam(selectedCodes, rangeStart, rangeEnd):
    # 1. 当前覆盖
    currentCoverage = {}
    for code in selectedCodes:
        for (mdKey, day) in coverage[code]:
            currentCoverage.add(mdKey + "-D" + day)

    # 2. 范围全部 Slot（动态，不硬编码每轮比赛日数量）
    rangeSlots = {}
    for md in rangeStart .. rangeEnd:
        for day in daysByMatchday[md]:
            rangeSlots.add("MD" + md + "-D" + day)

    # 3. 坑 = 范围 - 已覆盖
    missingSlots = rangeSlots - currentCoverage

    # 4/5/6. 遍历候选，算新增填补数
    if missingSlots 为空:
        return { missingSlots: [], rankings: [], top: null, tiedRemaining: null }   # 无坑

    rankings = []
    for (code, team) in teams:
        if code in selectedCodes: continue
        filled = | candidateCoverage(code) ∩ missingSlots |
        rankings.push({ code, name, pot, filledHoles: filled })

    # 7/8. 排序 + Top 1
    rankings.sort(by filledHoles desc, then code asc)
    top = rankings[0]
    tiedRemaining = 计算 top 之后仍同 filledHoles 的候选数（见 §8）
    return { missingSlots, rankings, top, tiedRemaining }
```

**复杂度**：`coverage` 共 36 队 × 8 轮 = 288 个键值对；一次推荐最多做几百次字符串集合运算，**毫秒级**。

---

## 6. 与 Matchday Range Filter 联动

- 推荐算法**严格只分析** `rangeStart..rangeEnd` 区间内的 Matchday。
- `rangeSlots` 只由该区间 + 动态派生的 `daysByMatchday` 生成，区间外的 MD 一律不参与。
- 例：用户设 `Start=MD2, End=MD4`，则 `rangeSlots` 只含 `MD2-D1/D2、MD3-D1/D2、MD4-D1/D2`；`MD1`、`MD5~MD8` 全部忽略。
- 推荐结果随 Range Filter 变化**实时重算**（复用同样的计算函数，无额外缓存复杂度）。
- 「换一个推荐」的候选序列同样基于当前 Range Filter 的 `rankings`，切换范围后序列整体重置。

---

## 7. 推荐结果数量与「换一个推荐」

### 7.1 只推荐 1 支（Top 1）

- 默认只展示**第 1 名**（`filledHoles` 最高、同分 code 最小者）。
- **不并排展示**第 2、3 名，不做后台表格式的多候选列表。

### 7.2 「换一个推荐」按钮

- 结果区提供一个 **「换一个推荐」** 按钮。
- **行为本质**：**不是随机重新生成**推荐，而是按照当前排序，从当前候选**继续查看下一支**球队。
- **点击行为**：
  1. **不改变** `selectedCodes`（已选球队不变）。
  2. 从 `rankings`（完整排序序列）中取**下一名**作为当前推荐。
  3. 遍历到末尾后**回绕到第 1 名**（循环），用户可无限次翻看。
- 候选序列：`rankings = [第1名, 第2名, 第3名, ...]`，由 `filledHoles` 降序 + `code` 升序稳定确定，故「换一个」的结果可复现、可预期。

**候选排序规则保持不变**。仅以下情况发生时才**重新计算**推荐结果：

1. 已选择球队发生变化（`selectedCodes` 增删）；
2. Matchday Range Filter 发生变化（`rangeStart` / `rangeEnd` 改变）；
3. 赛程数据发生变化（`fixtures_normalized.json` 更新）。

「换一个推荐」只移动本地 `cursor`，**不触发重算**。

### 7.3 展示示例

```
┌─ 赛程推荐 ──────────────────────────────┐
│ 建议下一支选择：                         │
│                                          │
│   ①  Inter                               │
│      填补 4 个赛程空缺                    │
│                                          │
│   [ 查看赛程 ]   [ 换一个推荐 ]           │
│   另有 2 支球队同样可以填补 4 个空缺      │
└──────────────────────────────────────────┘
```

---

## 8. 并列处理规则（简单、稳定、易懂）

### 8.1 稳定排序

- 按 `filledHoles` 降序，**同分按 `code` 字母序**保证序列稳定可复现。

### 8.2 只展示 1 个 + 并列提示

- 当前展示候选 `rankings[i]`，其 `filledHoles = f`。
- 设 `T` = `rankings` 中 `filledHoles === f` 的候选总数，`k` = 当前候选在这些同分候选中的序号（0-based，按稳定排序）。
- `tiedRemaining = T - k - 1`。
- 若 `tiedRemaining > 0`，在结果底部显示：**`另有 {tiedRemaining} 支球队同样可以填补 {f} 个赛程空缺`**。
- 若 `tiedRemaining = 0`，不显示并列提示。

示例（`Inter 4 / Real Madrid 4 / Barcelona 4 / Liverpool 3`）：

- 当前展示 Inter（第 1 个 4 分候选）→ 提示「另有 2 支球队同样可以填补 4 个赛程空缺」。
- 点「换一个」→ Real Madrid（第 2 个 4 分候选）→ 提示「另有 1 支球队同样可以填补 4 个赛程空缺」。
- 再点 → Barcelona（第 3 个 4 分候选）→ 无并列提示。
- 再点 → Liverpool（3 分）→ 无并列提示（3 分独此一家）。

### 8.3 关键原则

- **不因并列而展示多个候选**：始终只展示 1 个，并列信息用文案承载，翻看靠「换一个推荐」。
- 并列提示**动态跟随当前展示的候选**（而非固定针对某个名次），保证信息精确不丢失。

---

## 9. 无赛程坑时的处理（含 A/B 方案决策）

### 9.1 两种方案讨论

**方案 A：没有坑就不推荐**

- `missingSlots` 为空时，不展示任何候选，显示 `当前范围内没有明显的赛程空缺。`
- 优点：符合「填补空缺」的核心定位，逻辑简单、可预期，不引入额外评分维度。
- 缺点：用户「没坑但仍想加一支」时得不到建议。

**方案 B：没有坑也推荐一个「最互补」球队**

- 即使无坑，也从候选中挑一个「最均衡」的球队（如主客场分布最均衡、开球时间最分散等）。
- 优点：任何状态下都有输出。
- 缺点：「最互补」需要**新的评分维度**，破坏「唯一评分 = filledHoles」的简洁原则，第一版会显著增加复杂度与解释成本。

### 9.2 第一版决策（明确建议）

**采用方案 A：没有坑就不推荐。**

理由：

1. 功能定位是「填补赛程空缺」，无空缺时推荐失去核心意义，强行推荐反而误导用户。
2. 保持「唯一评分 = filledHoles」的简洁、稳定、易懂原则，避免第一版引入模糊的「互补度」。
3. **不要因为用户已选择 1~9 支球队，就为了「始终给出一个结果」而强行推荐**——没有坑时如实告知「当前范围内没有明显的赛程空缺」，即符合本功能定位。
4. 未来若确有需求，可在 §14 的「价值层」扩展里引入「Slot 权重 / 互补度」，届时再启用方案 B，**覆盖层与 UI 不动**。

---

## 10. UI 设计

### 10.1 推荐入口（含「已选择 N 支」状态）

- **位置**：`workspace__main` 顶部，位于 Matchday Range Filter 下方、赛程矩阵上方。
- **显隐**：`1 <= selectedCodes.length <= 9` 时渲染；`0` 或 `10` 时不渲染（连 DOM 都不挂）。
- **形态**：一张轻量提示卡片 + 按钮：

```
┌─ 💡 赛程推荐 ─────────────────────────────────────────────┐
│ 已经选了几支球队，不知道下一支该选谁？试试赛程推荐。       │
│                                                          │
│ 已选择 3 支球队                        [ 推荐第 4 支 ]     │
└──────────────────────────────────────────────────────────┘
```

- 卡片内实时展示「已选择 `N` 支球队」，按钮文案为「推荐第 `N+1` 支」。
- `N` 随 `selectedCodes.length` 自动变化，按钮文案用中文序数（复用 `cnOrdinal`：`第 2/3/4/5/6/7/8/9/10 支`），**无固定文案**。
- 点击按钮展开推荐结果区（可再次点击收起）。

### 10.2 推荐结果卡片（卡通卡片化，Top 1）

- 沿用现有视觉风格与主题色：`#427AB5`（primary）、`#406AAF`（secondary）、`#F7DD7D`（accent）、`#FFE8BE`（accent-light）。
- 卡片化呈现，**只展示 1 支候选**，**不做后台表格**：

```
┌─ 赛程推荐 ──────────────────────────────┐
│ 建议下一支选择：                         │
│                                          │
│  ①  Inter                               │
│     填补 4 个赛程空缺                    │
│                                          │
│  [ 查看赛程 ]   [ 换一个推荐 ]           │
│  另有 2 支球队同样可以填补 4 个空缺      │
└──────────────────────────────────────────┘
```

- 候选卡片：`①` 角标 + 队名（code + 全称）+ 主指标 `填补 N 个赛程空缺`。
- 可选轻量标注该候选 `pot`（增强可读，非必需）。

### 10.3 点击交互（防误操作）

- 点击候选**不会**自动把该队加入 `selectedCodes`。
- 主交互 **「查看赛程」**：
  - 点击后高亮/提示该候选在矩阵中的位置（或弹出该队在当前范围内的赛程小浮层：`MD2-D1 主 vs X · 01:45` 等）。
  - 不改动任何已选状态。
- 次交互 **「换一个推荐」**：按排序翻看下一名候选（见 §7.2），不改已选状态。
- 可选次级入口 **「加入选择」**：等同于点击右侧 Team Selector 勾选该队（复用现有 `onToggle(code)`），**不新建逻辑**；加入后 `N` 自动 +1，入口刷新为「推荐第 N+2 支」。
- 目标：让用户看清候选赛程后自己决定是否加入，避免误操作。

### 10.4 无坑空态

- `missingSlots` 为空时，结果区显示 `当前范围内没有明显的赛程空缺。`，不出现候选卡片与「换一个推荐」按钮。

### 10.5 Wireframe（桌面，已选 3 队）

```
┌────────────────────────────────────────────────────────────────────┐
│ 🧅 紫葱酱 Fantasy 赛程规划器             [队长路线 ⚪] [清空]        │
├────────────────────────────────────────────────────────────────────┤
│ 比赛日范围：[MD1▼] → [MD8▼] 共 8 轮                                │
│ ┌─ 💡 赛程推荐 ─────────────────────────────────────────────────┐  │
│ │ 已经选了几支球队，不知道下一支该选谁？试试赛程推荐。           │  │
│ │ 已选择 3 支球队                        [ 推荐第 4 支 ]         │  │
│ └────────────────────────────────────────────────────────────────┘  │
│ ┌─ 赛程推荐 ──────────────────────────────┐                        │
│ │ 建议下一支选择：                         │                        │
│ │  ①  Inter        填补 4 个赛程空缺      │                        │
│ │  [ 查看赛程 ]  [ 换一个推荐 ]           │                        │
│ │  另有 2 支球队同样可以填补 4 个空缺      │                        │
│ └──────────────────────────────────────────┘                        │
│ ┌ 赛程矩阵（行=球队，列=Matchday→比赛日）─────────┐                 │
│ ...                                                        │          │
│ └────────────────────────────────────────────────┘                 │
│                                  ┌ 球队选择（Pot1→Pot4）┐           │
└────────────────────────────────────────────────────────────────────┘
```

---

## 11. 右侧球队选择栏 Pot 排序规范

### 11.1 目标

右侧球队选择栏必须**严格按抽签档次从上到下排列**：

```
Pot 1
Pot 2
Pot 3
Pot 4
```

**绝对禁止**出现 `Pot 4 / Pot 1 / Pot 3 / Pot 2` 之类的乱序。

### 11.2 排序规则

- 排序依据 = 球队数据中的 `pot` 字段（取值字符串 `"Pot 1"` ~ `"Pot 4"`）。
- **主键**：Pot 数字升序（`Pot 1 → Pot 2 → Pot 3 → Pot 4`）。实现时提取 `pot` 中的数字部分（`"Pot 4"` → `4`），**不要**直接按字符串排序（否则 `"Pot 10"` 会排在 `"Pot 2"` 前；当前只有 1~4 无此问题，但提取数字更稳健、更可维护）。
- **次键**：同一 Pot 内按 `code` 字母序稳定排序（也可用 `name`，二者选一并在实现中固定，推荐 `code`）。
- **不依赖 JSON 原始出现顺序**：无论数据文件顺序如何变化，前端都始终显示 `Pot 1 → Pot 2 → Pot 3 → Pot 4`。

### 11.3 与现有实现的差异（需修复）

- 现有 `TeamSelector.tsx` 用 `Array.from(map.entries())` 直接按 Map 插入顺序渲染，未按 Pot 数字排序，是本 bug 根源。
- 修复方向：分组后先 `Array.from(map.entries()).sort(按 Pot 数字升序)`，再渲染；同 Pot 内列表在分组时或渲染前按 `code` 排序一次。
- 该改动属于**本版规范要求**，但实际代码修改不在此文档范围内（见 §0.5 与「本次只改文档」约束）。

---

## 12. 代码结构（模块划分）

### 12.1 推荐算法模块（独立，纯函数）

新增 `src/data/fixtureRecommendation.ts`（命名示例，最终按项目惯例），**不含任何 UI**：

- 内部导入 `fixtures_normalized.json` 的 `coverage`、`teams` 与 `matchdays`（只取这三块，不遍历 `matchdays[].days[].matches`）。
- 导出纯函数：
  - `recommendNextTeam(selectedCodes, rangeStart, rangeEnd): RecommendationResult`
  - 辅助：`candidateCoverage(code) → Set<string>`、`computeMissingSlots(...)`、`sortRankings(...)`、`buildDaysByMatchday(matchdays) → Map<number, number[]>`。
- **每轮比赛日数量不硬编码**：初始化时调用 `buildDaysByMatchday(matchdays)` 从 `matchdays[].days` 派生并缓存 `daysByMatchday`（如 `{1:[1,2,3], 2:[1,2], …, 8:[1]}`），`rangeSlots` 据此动态生成。这样赛程数据若变化，无需改算法。

### 12.2 UI 组件（薄，只负责展示与交互）

新增 `src/components/FixtureRecommendation.tsx`：

- Props 只收：`selectedCodes`、`rangeStart`、`rangeEnd`、`onViewSchedule(code)`（可选）、`onAddToCompare(code)`（可选）。
- 内部调用 `recommendNextTeam`（用 `useMemo` 缓存，依赖 `selectedCodes/rangeStart/rangeEnd`）。
- 维护本地 `cursor`（当前展示候选在 `rankings` 中的序号，初始 0），实现「换一个推荐」循环翻看。
- 负责：入口显隐（`1 <= N <= 9`）、展开/收起、Top 1 卡片渲染、并列提示、空坑提示、点击处理。

### 12.3 接入改动清单（最小改动）

| 文件 | 改动 |
| --- | --- |
| `src/data/fixtureRecommendation.ts` | **新增**：推荐算法模块（`recommendNextTeam`，含 `buildDaysByMatchday`） |
| `src/components/FixtureRecommendation.tsx` | **新增**：推荐 UI 组件 |
| `src/App.tsx` | 在 `workspace__main` 顶部（Range Filter 下）挂载 `FixtureRecommendation`，传入 `selectedCodes/rangeStart/rangeEnd`；`onAddToCompare` 复用 `toggleTeam` |
| `src/index.css` | 新增 `.recommend` 系列样式（复用现有 token） |
| `src/components/TeamSelector.tsx` | **修复 Pot 排序**（按 Pot 数字升序 + 同 Pot code 升序，见 §11） |

**不改**：`normalize.ts`、`MatchdayMatrix.tsx`、`MatchdayRangeFilter.tsx`、`CaptainRouteOverlay.tsx`、`fixtures_normalized.json` 数据结构。

> 注：`TeamSelector.tsx` 的 Pot 排序修复属于本版规范要求，但「本次只改文档」，该改动将在后续编码阶段落地，此处仅列入清单。

---

## 13. 数据结构定义

```ts
type Slot = string   // "MD1-D2"

interface Ranking {
  code: string
  name: string
  pot: string
  filledHoles: number
}

interface RecommendationResult {
  missingSlots: Slot[]
  rankings: Ranking[]                          // 全量候选，filledHoles 降序 + code 升序
  top: Ranking | null                          // 第 1 名，即本次推荐
  tiedRemaining: { count: number; score: number } | null   // 相对当前 top 的同分提示
}
```

- `currentCoverage` / `candidateCoverage` / `rangeSlots` / `missingSlots` 均为 `Set<Slot>`。
- Slot 字符串直接由 `coverage` 的 key（`"MD1"`）与 value（`day`）拼接：`"MD1" + "-D" + 1 = "MD1-D1"`，无需解析数字。
- `top` 只取 1 个；`rankings` 完整保留，供「换一个推荐」遍历。
- `daysByMatchday: Map<number, number[]>` 为独立缓存结构，从 `matchdays[].days` 派生，不硬编码。

---

## 14. 未来 FDR 扩展（Slot 覆盖与价值分离）

当前「填补一个坑」价值恒为 1。为便于未来引入 FDR，算法结构上已把两件事**分离**：

- **覆盖层**（本次实现）：候选覆盖了哪些 Slot → `candidateCoverage(code)`。
- **价值层**（本次恒为 1，未来扩展）：每个 Slot 的价值/权重 → `slotWeight(slot)`。

未来 FDR 落地时的改动点：

1. 新增 `slotWeight(slot): number`，初始返回 1。
2. 评分从 `filledHoles = |覆盖 ∩ 坑|` 改为 `加权总分 = Σ slotWeight(s) for s in (覆盖 ∩ 坑)`。
3. 权重来源可读 `fixtures_normalized.json` 的 `teams[code].fixtures.MD{n}.fdr`（已预留 `null`）或未来在 `coverage` 旁新增 `slotWeights` 映射。

**只需改「价值层」，覆盖层与 UI 均不动。**（未来若要启用 §9 的方案 B「无坑也推荐最互补球队」，同样在此价值层扩展「互补度权重」，不另起炉灶。）

> 说明：本节仅涉及**评分权重（FDR）**的技术预留，不涉及 §3.5 排除的「多球队组合优化 / 球员推荐」等功能扩展。

---

## 15. 边界情况清单

| # | 场景 | 处理 |
| --- | --- | --- |
| 1 | 未选球队（0 支） | 不显示入口 |
| 2 | 选 1~9 支 | 显示入口，推荐第 N+1 支 |
| 3 | 选满 10 支 | 不显示入口（已满，无候选可加） |
| 4 | 当前范围无坑 | 方案 A：显示「当前范围内没有明显的赛程空缺」，不展示候选，不强推 |
| 5 | 多候选同分 | 只展示 1 个 + 「另有 X 支同样可填补 N 坑」，换一个看下一名 |
| 6 | 候选在范围内完全无比赛 | `filledHoles = 0`，排末尾，通常不是首选 |
| 7 | 范围只有 1 个 MD | `rangeSlots` 只含该 MD 的 day（由 `daysByMatchday` 动态派生），算法照常 |
| 8 | 范围 = MD1→MD8 | `rangeSlots` = 全部 16 个 Slot，算法照常 |
| 9 | 某 MD 只有 2 个比赛日 | 由 `daysByMatchday` 动态派生，正确生成 2 个 Slot |
| 10 | 某 MD 有 3 个比赛日（如 MD1） | 由 `daysByMatchday` 动态派生，正确生成 3 个 Slot（含 `MD1-D3`） |
| 11 | 「换一个推荐」翻到末尾 | 回绕到第 1 名，循环翻看 |
| 12 | 已选 9 支球队 | 仍有 27 支未选择球队（36 − 9 = 27），因此不存在候选不足的问题 |
| 13 | 切换 Range Filter | `rankings` 与 `cursor` 整体重置，重新按新范围推荐 |

---

## 16. 性能说明

- 全程前端计算，无后端、无网络请求。
- 不解析 `fixtures_90_en.json`，不遍历 144 场比赛。
- 只读 `fixtures_normalized.json` 的 `coverage`（288 键值）、`teams`（36 队元信息）与 `matchdays`（8 轮比赛日结构，仅用于派生 `daysByMatchday`）。
- 一次推荐为「集合求差 + 求交」的 O(范围 × 候选) 运算，毫秒级。
- `daysByMatchday` 初始化时派生一次并缓存，不参与每次重算。
- 用 `useMemo` 缓存 `recommendNextTeam` 结果，仅在 `selectedCodes / rangeStart / rangeEnd` 变化时重算；「换一个推荐」只改本地 `cursor`，**不触发重算**。

---

## 17. 完成说明（对应开发要求）

1. **修改文件**：新增 `fixtureRecommendation.ts`、`FixtureRecommendation.tsx`，改 `App.tsx`、`index.css`、`TeamSelector.tsx`（Pot 排序修复，见 §12.3）。
2. **新增模块/组件**：推荐算法模块（`recommendNextTeam`）+ 推荐 UI 组件（见 §12）。
3. **算法如何算**：八步——取已选 → 算覆盖 → 生成范围 Slot → 求坑 → 遍历候选 → 算 `filledHoles` → 排序 → 只展示第 1 名（见 §5.2）。
4. **赛程坑定义**：`Matchday + day` 组合无已选队覆盖（见 §2.2）。
5. **与 Range Filter 联动**：`rangeSlots` 只由 `[start, end]` + 动态派生的 `daysByMatchday` 生成（见 §6）。
6. **并列处理**：只展示 1 个 + 动态「另有 X 支同样可填补 N 坑」，同分按 code 字母序稳定排序（见 §8）。
7. **触发条件**：`1 <= selectedCodes.length <= 9`（见 §3.2）。
8. **结果展示**：卡通卡片化，单候选 + 「查看赛程」「换一个推荐」，非后台表格（见 §10）。
9. **是否纯前端**：是，无后端、无网络（见 §16）。
10. **是否直接用 `fixtures_normalized.json`**：是，用其 `coverage` + `teams` + `matchdays`（见 §1、§16）。
11. **未来 FDR 改哪里**：改「价值层」`slotWeight()`，覆盖层与 UI 不动（见 §14）。
12. **推荐对象**：只有球队，不推荐球员/门将/队长/阵容（见 §3.1、§3.5）。
13. **Pot 排序**：Pot 数字升序 + 同 Pot code 升序，不依赖原始顺序（见 §11）。
14. **每轮比赛日**：动态从 `matchdays[].days` 派生，不硬编码 `DAYS_PER_MD`（见 §5.4、§12.1）。
