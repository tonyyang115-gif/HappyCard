## 掷骰子工具整体架构设计（Architect版：前端 / 后端 / 数据结构）

### Summary
- 目标工具：`掷骰子`（首批实现）
- 约束已确认：
  - `1-2颗快速掷骰`
  - `纯前端无后端`
  - `历史记录保存最近20条`
- 架构原则：本地计算、低延迟、可扩展到未来多人模式（但本期不实现）

### Architecture Design
- 前端分层（小程序页面内）
  - `View Layer`（页面渲染）
    - 页面：`subpackages/package_tools/pages/dice/index`
    - 组件职责：显示骰子、动画状态、结果总和、历史列表、模式切换（1颗/2颗）
  - `Interaction Layer`（交互控制）
    - 事件：`onRoll`, `onSwitchDiceCount`, `onClearHistory`
    - 防重入：动画期间锁按钮，避免连续触发造成状态冲突
  - `Domain Layer`（纯计算逻辑）
    - 模块：`subpackages/package_tools/utils/dice-engine.js`
    - 核心函数：
      - `rollDice(count)` -> 返回 count 个 `1..6` 随机值
      - `buildRollRecord(values, count)` -> 构造标准记录对象
    - 保证纯函数，可单测
  - `Persistence Layer`（本地存储）
    - Key：`tool_dice_history_v1`
    - 页面启动时加载历史，掷骰后追加并截断到20条

- 后端架构（本期）
  - 不接入云函数、不写云数据库。
  - 预留扩展位（未来若做“多人可信掷骰”）：
    - 可新增 `cloudfunctions/rollDice`，返回服务端签名结果
    - 当前数据结构保持可兼容（含 `source` 字段）

### Data Structures
- 页面状态（Page `data`）
  - `diceCount: 1 | 2`
  - `rolling: boolean`
  - `currentValues: number[]`（长度=1或2）
  - `currentSum: number`
  - `history: DiceRollRecord[]`（最多20）
- 记录结构 `DiceRollRecord`
  - `id: string`（时间戳+随机后缀）
  - `ts: number`（毫秒时间戳）
  - `diceCount: 1 | 2`
  - `values: number[]`（每项1..6）
  - `sum: number`
  - `source: 'local'`（预留未来 `'server'`）
- 本地存储结构
  - `tool_dice_history_v1: DiceRollRecord[]`

### ADR（关键决策）
- ADR-1：本期纯前端，不做后端  
  - 备选：服务端生成随机值  
  - 原因：当前场景以个人工具为主，纯前端延迟最低、实现最快
- ADR-2：历史记录保留最近20条  
  - 备选：不保存或无限保存  
  - 原因：兼顾可用性和存储控制
- ADR-3：引擎逻辑独立于页面  
  - 备选：逻辑写在 `Page` 内  
  - 原因：便于复用与单元测试，后续可接“房间内掷骰”

### Test Plan
- 功能
  - 1颗模式：结果始终在1..6
  - 2颗模式：数组长度=2，总和=两者之和
  - 历史最多20条，超出自动截断
- 状态一致性
  - 动画期间重复点击不产生多次记录
  - 切换模式不污染当前/历史数据
- 持久化
  - 退出重进页面，历史仍在
  - 清空历史后本地存储同步清空
- 回归
  - 工具中心与房间工具入口跳转正常
  - 不影响现有“麻将听牌”工具

### Assumptions
- 随机来源使用 `Math.random()`（满足娱乐工具场景）。
- 历史记录仅本地可见，不做多端同步。
- UI风格沿用工具中心现有卡片体系与视觉 token。
