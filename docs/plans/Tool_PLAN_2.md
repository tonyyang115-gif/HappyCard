## 麻将算翻工具完整架构文档（V1+V2整合版）

### Summary
- 架构目标：实现“手牌+副露+和牌方式+上下文 -> 总番数+番种明细+结果说明”的本地高性能计算工具。
- 设计原则：**模板驱动、统一入口、分阶段判定、冲突可解释、结果可追溯**。
- 版本策略：以 `sc_bloodwar_v1` 为默认实战模板，`sc_competition_v1` 为标准对照模板，`placeholder_v1` 为扩展占位模板。
- UI策略：对齐你提供的截图形态（规则配置弹窗、底部值选择器、主计分页、说明书页），并保持与现有 `package_tools` 视觉系统一致。

### Key Changes

#### 1) 总体分层与职责
1. **UI Layer**
- 页面：麻将算翻主页、规则配置弹窗、底部 picker、说明书页。
- 职责：输入采集、模板编辑、结果渲染，不承载规则判定逻辑。

2. **Application Layer**
- 统一编排入口：`calculateMahjongFan(request, options)`。
- 职责：调用分析器、规则引擎、冲突裁决、结果解释器，输出可展示 DTO。

3. **Domain Layer**
- `hand-analyzer`：牌合法性、牌型特征、上下文特征提取。
- `rule-engine`：按模板执行 detector。
- `conflict-resolver`：按冲突组策略裁决。
- `fan-calculator`：番数、加底、封顶汇总。
- `result-explainer`：生成说明和决策链。

4. **Template Layer**
- 模板定义、版本、规则清单、冲突组、UI元数据。
- 支持系统模板只读和自定义模板扩展。

5. **Infra Layer**
- 本地存储模板与默认模板（`wx.setStorageSync`）。
- 预留云同步接口，但首版不依赖云。

---

#### 2) 统一接口与数据结构（V2定稿）
1. **计算接口**
- `calculateMahjongFan(request, options): ScoreResult`

2. **ScoreRequest**
- `concealedTiles: number[]`
- `exposedMelds: { type: 'chi'|'peng'|'gang'; tiles: number[] }[]`
- `winTile: number`
- `winMode: 'zimo'|'dianpao'`
- `context: { menqing?, gangShangHua?, gangShangPao?, qiangGangHu?, haiDi?, tianHu?, diHu? }`

3. **CalculateOptions**
- `templateId: string`
- `overrides?: Partial<TemplateConfig>`
- `debug?: boolean`

4. **TemplateConfig**
- `id/name/version/isSystem`
- `baseScore`（打好大）
- `maxFan`（最多几番）
- `hardCap`（好多封顶）
- `rules: RuleItem[]`
- `conflictGroups: ConflictGroup[]`
- `uiMeta`

5. **RuleItem**
- `id/name/enabled`
- `valueType: 'fan'|'addBase'`
- `value: number`
- `scoreSemantics: 'fan'|'add_base'|'mul_base'`
- `detectorKey`
- `phase: 'base_pattern'|'timing'|'bonus'`
- `priority`
- `requires?: string[]`
- `excludes?: string[]`
- `conflictGroup?: string`
- `uiOrder/desc`

6. **ConflictGroup**
- `id`
- `strategy: 'exclusive'|'highest'|'stackable'`
- `members: string[]`
- `reason`

7. **ScoreResult**
- `ok`
- `totalFan`
- `totalScore`
- `appliedRules`
- `removedByConflict`
- `summary`
- `explain: string[]`
- `warnings: string[]`
- `templateId/templateVersion/templateHash`
- `decisionTrace: DecisionTrace[]`
- `debug?: { allRuleStates }`

---

#### 3) 规则执行顺序（固定流水线）
1. 输入校验（牌码、张数、物理上限≤4、上下文完整性）。
2. 手牌分析（胡牌成立与特征提取）。
3. 分阶段执行：
- `base_pattern`（平胡/大对子/七对/龙七对/金钩钓等）
- `timing`（自摸/杠上花/杠上炮/抢杠/海底/天地胡等）
- `bonus`（带根/杠相关扩展）
4. 依赖约束处理（`requires`）。
5. 排斥约束处理（`excludes`）。
6. 冲突组裁决（exclusive/highest/stackable）。
7. 番与底分汇总（按 `scoreSemantics`）。
8. 应用 `maxFan`。
9. 应用 `hardCap`。
10. 生成 `summary/explain/decisionTrace`。

---

#### 4) 模板策略与治理
1. **`sc_bloodwar_v1`（默认）**
- 对齐实战体验，可配置项包括截图中常见规则与分值模式（加底/番数、封顶等）。

2. **`sc_competition_v1`（标准对照）**
- 固定标准口径，作为验算与回归基线。

3. **`placeholder_v1`**
- 扩展骨架模板，用于后续地区玩法接入。

4. **模板治理规则**
- 系统模板不可删除、不可改规则ID结构。
- 自定义模板可保存/复制/删除，建议最多 5 个。
- 历史结果绑定 `templateVersion + templateHash`，保证可追溯复算。

---

#### 5) UI层设计规范（整合版）
1. **布局结构**
- 主页面：总分区 + 收/出分区 + 番种chips + 操作按钮。
- 规则配置：标题栏 + 固定三项（打好大/最多几番/好多封顶）+ 规则列表 + `+添加规则` + 底部三按钮（取消/存模板/开始）。
- 值选择器：底部弹层（加底、1番、2番...）。
- 说明书：按章节长页滚动（功能简介、默认规则、算分逻辑、记录、模板管理、操作说明、特别说明）。

2. **交互规范**
- 点击规则行打开值选择器。
- 长按规则名删除（仅自定义规则）。
- 运行中按钮禁用并显示加载态。
- 默认结果显示命中规则，支持展开“全量规则状态”。

3. **视觉规范**
- 继承现有工具风格：白卡片、24rpx圆角、轻阴影、蓝紫主色，关键操作用绿/红按钮。
- 保证触控最小 44px（约88rpx），文本对比度≥4.5:1。
- z-index：导航10，遮罩45，弹窗/选择器50。

---

#### 6) 关键ADR结论（并入文档）
1. 采用模板驱动引擎而非 if-else 硬编码。
2. 采用分阶段判定与依赖/排斥约束，避免同名规则歧义。
3. 引入决策链与模板哈希，确保可审计与可追溯。
4. 默认实战模板 + 标准模板并存，兼顾体验与权威对照。

### Test Plan

#### A. 引擎正确性
1. 合法和牌、非法输入、边界牌数。
2. 副露场景与门清互斥。
3. 自摸/点炮/时机番命中准确。
4. `scoreSemantics` 三语义计算一致。
5. `maxFan + hardCap` 叠加场景正确。

#### B. 冲突与依赖
1. exclusive/highest/stackable 三策略覆盖。
2. requires 未满足时禁止命中。
3. excludes 生效并产出淘汰原因。
4. `decisionTrace` 完整记录裁决路径。

#### C. 模板治理
1. 系统模板只读约束。
2. 自定义模板增删改查。
3. 默认模板持久化与重进恢复。
4. 历史记录可用 `templateVersion/templateHash` 复算。

#### D. UI/交互
1. 弹窗、picker、按钮布局与截图一致。
2. 规则值变更即时反映结果。
3. 说明书章节结构和内容映射正确。
4. iPhone/安卓常见分辨率无错位。

#### E. 黄金样例回归
- 建立 `golden_cases.json`（每模板≥30条：普通/边界/冲突/上下文）。
- 回归校验 `totalFan + appliedRules + removedByConflict + templateHash`。

### Assumptions
- 首版仅本地计算与本地模板存储，不引入云端依赖。
- 默认模板为 `sc_bloodwar_v1`，同时保留 `sc_competition_v1` 作为标准基线。
- UI默认展示命中规则；`debug` 模式展示全量规则状态与决策链。
- 现有听牌工具逻辑保持不变，新增算翻能力作为并行工具接入。
