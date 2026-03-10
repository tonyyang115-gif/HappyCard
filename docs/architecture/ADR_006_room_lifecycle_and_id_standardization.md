# ADR 006: 房间生命周期管理与 ID 标准化设计

## 状态
拟议中 / 待实现

## 背景
在 `ADR_005` 的架构审查中，我们识别出了两个关键改进点：
1.  **ID 双轨制风险**：混用 6位短码 (`roomId`) 和 32位 UUID (`_id`) 导致后端逻辑复杂且易错。
2.  **幽灵房间问题**：缺乏过期清理机制，导致无效的活跃房间堆积，污染数据库索引。

本设计文档旨在提供这两项改进的详细架构方案。

---

## 一、ID 标准化策略 (ID Standardization Strategy)

### 1. 核心原则：内外分离
严格区分“对外展示标识”与“内部关联标识”。

*   **Public ID (`roomId`)**: 
    *   **格式**: 6位数字 (e.g., `123456`)。
    *   **用途**: **仅用于** 用户搜索、分享链接、界面展示。
    *   **禁止**: 禁止在数据库关联字段（如 Foreign Keys）中使用。

*   **Internal ID (`_id` / `docId`)**:
    *   **格式**: 32位 UUID (e.g., `b7bd8fdc...`).
    *   **用途**: **所有** 数据库查询、关联、云函数参数传递。
    *   **强制**: `rounds` 表的 `roomDocId`、`club_members` 的 `clubId` 等关联字段必须存储此 ID。

### 2. 标准化实施模式 (Implementation Pattern)

#### A. 云函数入口层的 "ID Resolver" 模式
所有接收 `roomId` 的云函数（如 `joinRoom`, `getRoomDetail`），必须在入口处立即将 Public ID 解析为 Internal ID。后续逻辑只认 Internal ID。

```javascript
// 伪代码示例：Standard ID Resolution Pattern
exports.main = async (event) => {
    let { roomId } = event; // 可能是 '123456' 或 'UUID'
    
    // 1. Resolve to UUID immediately
    const docId = await resolveRoomDocId(roomId);
    
    // 2. Business Logic uses UUID only
    const room = await db.collection('rooms').doc(docId).get();
    const rounds = await db.collection('rounds').where({ roomDocId: docId }).get();
}
```

#### B. 数据库关联规范
*   `rooms.clubId`: 存储圈子 UUID (目前混杂，需迁移清洗)。
*   `rounds.roomDocId`: 存储房间 UUID (已符合)。
*   `club_members._id`: 组合键 `ClubUUID_OpenId` (已符合)。

---

## 二、幽灵房间自动清理 (Zombie Room Cleanup)

### 1. 设计目标
自动识别并关闭超过 **24小时** 未活动的“活跃”房间，防止数据堆积。

### 2. 架构设计

新增云函数 `cleanupRooms`，作为一个无状态的定时任务。

#### A. 判定规则 (Policy)
一个房间被视为“幽灵”并应当被关闭，当且仅当：
1.  `status` == `'active'` (处于活跃状态)
2.  `updatedAt` < `NOW - 24 hours` (过去24小时无任何状态变更)
3.  (可选增强) `rounds` 集合中该房间最后一次对局时间也超过 24小时。

#### B. 执行动作 (Action)
*   **状态变更**: 将 `status` 更新为 `'settled'` (结算) 或新增状态 `'expired'` (过期)。建议直接使用 `'settled'` 保持现有前端兼容性。
*   **审计字段**: 设置 `settledBy: 'system_auto_cleanup'`。
*   **结束时间**: 设置 `settledAt: NOW`。

#### C. 数据流图

```mermaid
graph TD
    A[定时触发 (每晚 04:00)] -->|调用| B(cleanupRooms 云函数)
    B -->|查询| C{查找过期房间}
    C -- 查询条件: active & updatedAt < 24h --> D[房间列表]
    
    D -->|遍历| E(执行清理)
    E -->|更新| F[DB: rooms]
    F -- set status='settled' --> G(结束)
    F -- set settledBy='system' --> G
```

### 3. 具体实现规格

*   **云函数名**: `cleanupRooms`
*   **触发器**: `confg.json` 配置 `0 0 4 * * * *` (每天凌晨 4 点)。
*   **批处理**: 每次执行处理上限 100 条 (MongoDB `limit(100)`)，避免超时。如果积压过多，依靠第二天继续通过。
*   **安全性**: 
    *   使用 `db.serverDate()` 比较时间。
    *   不需要事务（单文档更新原子性即可）。

## 三、迁移计划 (Migration Plan)

1.  **阶段一：清理脚本上线**
    *   部署 `cleanupRooms` 云函数。
    *   手动触发一次，观察日志，确认清理了多少历史遗留房间。

2.  **阶段二：ID 规范化重构**
    *   审查 `joinRoom`, `manageClub` 等核心函数。
    *   提取 `ensureDocId` 工具函数，统一下沉 ID 解析逻辑。、

## 结论
通过实施 ID 标准化，我们将消除“找不到房间/统计遗漏”的根本原因。
通过自动清理机制，我们将保持数据库的健康轻量，避免无效数据对索引性能的影响。
这一设计是低成本、高收益的架构优化。
