# Club Statistics Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement ADR-003 to persist `winRate` in `club_members`, enabling accurate "Best Player" (Frequent Winner) rankings via direct database queries.

**Architecture:** 
- **Write-Path:** Update `settleRoom` cloud function to calculate and store `stats.winRate` (scaled integer) when updating member stats.
- **Migration:** Create a one-off cloud function `migrateStats` to backfill `winRate` for existing members.
- **Read-Path:** Update `club/detail/index.js` to specific DB queries for Top Wins and Best Rate, removing client-side calculation.

**Tech Stack:** Cloud Functions (Node.js), Miniapp Frontend (JS/WXML).

---

### Task 1: Update `settleRoom` Cloud Function

**Files:**
- Modify: `Minapp/cloudfunctions/settleRoom/index.js`

**Step 1: Modify `settleRoom` to calculate `winRate`**

Update the logic where `club_members` are updated.
Formula: `winRate = Math.floor((winCount / gameCount) * 10000)`

```javascript
// In Minapp/cloudfunctions/settleRoom/index.js

// ... inside the loop updating player stats ...

const newGameCount = stats.gameCount + 1; // Logic inside runTransaction or update block
// Note: In current settleRoom, it uses _.inc. 
// We need to fetch-calculate-set OR use a more complex update if possible.
// Actually, settleRoom currently does ONE update using _.inc. 
// Adding a derived field based on the RESULT of an increment is hard with just _.inc.
// We must READ the current doc first to calculate the new rate accurately?
// OR: Since we already read `playerStats` (which are deltas for THIS room), 
// and we assume we might Create OR Update. 
// WAIT: The current implementation attempts `update` first, then `set` on catch.
// BUT `update` with `_.inc` doesn't let us know the final value to calculate rate derived from it.
//
// STRATEGY CHANGE for stability: 
// 1. Transaction is safer. But settleRoom currently uses `update` optimistically.
// 2. To keep it simple and performant: We can't do proper derived field with just _.inc.
//    We need to read the current member stats to calculate the new total and new rate.
//    However, reading N members might be slow.
//    
//    ADR CHECK: Is it acceptable to just calculate rate based on "eventual consistency" or use a trigger? No triggers in this env.
//    
//    BETTER APPROACH: Use `db.command.aggregate`? No.
//    
//    Let's switch `settleRoom` member update to a READ-MODIFY-WRITE pattern for accuracy.
//    OR: Just rely on the periodical "Migration/Repair" for the rate? No, that's bad UX.
//
//    DECISION: Modify the loop to `transaction.get` -> `calculate` -> `transaction.update`.
//    But `settleRoom` implementation currently is NOT a full transaction for members (it iterates).
//    
//    Let's refine the plan: 
//    Inside `settleRoom`, for each player:
//    1. Get the current `club_member` doc.
//    2. Calculate new totals in memory.
//    3. Calculate new `winRate`.
//    4. `set` (overwrite) or `update` with absolute values.
```

**Step 2: Commit Changes**

```bash
git add Minapp/cloudfunctions/settleRoom/index.js
git commit -m "feat(backend): calculate and persist winRate in settleRoom"
```

---

### Task 2: Create Data Migration Script

**Files:**
- Create: `Minapp/cloudfunctions/migrateStats/index.js`
- Create: `Minapp/cloudfunctions/migrateStats/package.json`

**Step 1: Create `migrateStats` Cloud Function**

This function will iterate over all `club_members` (or batch process) to calculate `winRate` for existing records.

```javascript
// Minapp/cloudfunctions/migrateStats/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
    const db = cloud.database();
    const _ = db.command;
    const { clubId } = event; // Optional filter

    // 1. Query Members (Batching needed for large sets, but start with limit 1000 for MVP fix)
    const MAX_LIMIT = 1000;
    const collection = db.collection('club_members'); // Handle env prefix via simple string arithmetic if needed or trust context
    // Actually, cloud functions usually need the env logic. Copy DBAdapter? 
    // Simplify: Just use 'club_members' for now, assuming standard environment.
    
    // Better: Reuse DBAdapter pattern if possible, or keep it simple script.
    
    // Logic:
    // fetch all members where stats.winRate exists: false
    // calculate rate
    // update
};
```

**Step 2: Execute Migration (Manual Trigger)**

Run this function via IDE "Cloud Functions" panel or a temporary button in frontend.

**Step 3: Commit**

```bash
git add Minapp/cloudfunctions/migrateStats/
git commit -m "feat(backend): add migrateStats function for winRate backfill"
```

---

### Task 3: Update Frontend Query Logic

**Files:**
- Modify: `Minapp/pages/club/detail/index.js`

**Step 1: Update `fetchStats` or `calculateStats`**

Change `initStatsWatcher` or `fetchDetail` to query specific leaders.

```javascript
// Minapp/pages/club/detail/index.js

// Replace the client-side sorting in calculateStatsFromClubMembers
// Instead of depending on the watcher for ALL members (which is capped at 50 anyway),
// We should probably setup TWO watchers or Queries?
//
// Actually, `initStatsWatcher` currently queries `orderBy('stats.winCount', 'desc').limit(50)`.
// This is exactly the source of the bug for "Best Player".
//
// We need to fetch "Best Player" separately.
//
// Plan:
// 1. Keep `statsWatcher` for the member list (Top Winners).
// 2. Add a specific one-off query (or watcher) for `Best Player` (Top Rate).
//    `db.collection('club_members').where({ clubId, 'stats.gameCount': _.gte(5) }).orderBy('stats.winRate', 'desc').limit(1)`
//
// 3. Merge this result into `this.data.stats`.
```

**Step 2: Commit**

```bash
git add Minapp/pages/club/detail/index.js
git commit -m "feat(frontend): query best player by winRate from db"
```

---

### Task 4: Verification

**Step 1: Test Settle**
1. Play a game in a Club Room.
2. Settle.
3. Check Database: Ensure `club_members` doc has `stats.winRate` (e.g. 5000 for 50%).

**Step 2: Test Ranking**
1. Open Club Detail.
2. Ensure "Champion" and "Frequent Winner" are displayed correctly.
3. Validate "Frequent Winner" is truly the highest rate (even if not in Top 50 wins).

