# Room Lifecycle & ID Standardization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement automated "Zombie Room" cleanup and standardize ID usage (UUID vs ShortCode) across the Room Module to improve system health and prevent bugs.

**Architecture:** 
1.  **Cleanup**: New scheduled cloud function `cleanupRooms` scans for active rooms inactive > 24h and settles them.
2.  **ID Std**: Refactor `joinRoom` to use a dedicated "Resolver" pattern, ensuring internal logic only uses UUIDs.

**Tech Stack:** WeChat MiniProgram Cloud Functions (Node.js), Cloud Database.

---

### Task 1: Implement `cleanupRooms` Cloud Function

**Files:**
-   Create: `Minapp/cloudfunctions/cleanupRooms/index.js`
-   Create: `Minapp/cloudfunctions/cleanupRooms/package.json`
-   Create: `Minapp/cloudfunctions/cleanupRooms/config.json`

**Step 1: Create package.json and config.json**

`Minapp/cloudfunctions/cleanupRooms/package.json`:
```json
{
  "name": "cleanupRooms",
  "version": "1.0.0",
  "description": "Automatically settles inactive rooms",
  "main": "index.js",
  "author": "Antigravity",
  "license": "ISC",
  "dependencies": {
    "wx-server-sdk": "latest"
  }
}
```

`Minapp/cloudfunctions/cleanupRooms/config.json`:
```json
{
  "permissions": {
    "openapi": []
  },
  "triggers": [
    {
      "name": "daily_cleanup",
      "type": "timer",
      "config": "0 0 4 * * * *"
    }
  ]
}
```

**Step 2: Implement index.js (The Logic)**

`Minapp/cloudfunctions/cleanupRooms/index.js`:
```javascript
const cloud = require('wx-server-sdk');

// Hardcoded Env ID for stability in timers
const CLOUD_ENV = 'cloud1-7go9rrf32b9c9cbc';

cloud.init({
    env: CLOUD_ENV
});

exports.main = async (event, context) => {
    const db = cloud.database();
    const _ = db.command;
    const now = new Date();
    // 24 hours ago
    const threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    console.log(`[Cleanup] Starting zombie room cleanup. Threshold: ${threshold.toISOString()}`);

    try {
        // Query for Zombie Rooms
        // 1. Status is 'active'
        // 2. updatedAt is older than 24 hours
        // Limit 100 per run to match system limits
        const zombiesSnap = await db.collection('rooms')
            .where({
                status: 'active',
                updatedAt: _.lt(threshold)
            })
            .limit(100)
            .get();

        const zombies = zombiesSnap.data || [];
        console.log(`[Cleanup] Found ${zombies.length} zombie rooms.`);

        if (zombies.length === 0) {
            return { success: true, count: 0 };
        }

        const tasks = zombies.map(async (room) => {
            console.log(`[Cleanup] Settling room ${room._id} (Last active: ${room.updatedAt})`);
            return await db.collection('rooms').doc(room._id).update({
                data: {
                    status: 'settled',
                    settledAt: db.serverDate(),
                    settledBy: 'system_auto_cleanup',
                    autoSettled: true
                }
            });
        });

        await Promise.all(tasks);

        return {
            success: true,
            count: zombies.length,
            ids: zombies.map(r => r._id)
        };

    } catch (err) {
        console.error('[Cleanup] Error:', err);
        return { success: false, error: err };
    }
};
```

**Step 3: Deploy and Manual Test**
-   Deploy `cleanupRooms`.
-   Run local debug with defaults.
-   Check logs.

**Step 4: Commit**
```bash
git add Minapp/cloudfunctions/cleanupRooms/
git commit -m "feat(cleanup): add cleanupRooms function for zombie rooms"
```

---

### Task 2: Refactor `joinRoom` for ID Standardization

**Files:**
-   Modify: `Minapp/cloudfunctions/joinRoom/index.js`

**Step 1: Create 'resolveRoomId' Helper within joinRoom**

In `Minapp/cloudfunctions/joinRoom/index.js`, add helper function at the top (or inside `main` before logic):

```javascript
// Helper: Resolve Public ID (6-digit) or DocID (UUID) to a valid DocID
async function resolveRoomDocId(db, inputId) {
    if (!inputId) return null;
    let strId = String(inputId).trim();

    // If it looks like a Public ID (6 digits)
    if (strId.length === 6 && /^\d+$/.test(strId)) {
        const res = await db.collection('rooms').where(
            db.command.or([
                { roomId: strId },
                { roomId: Number(strId) }
            ])
        ).limit(1).get();
        
        if (res.data.length > 0) return res.data[0]._id;
        return null; // Not found by Public ID
    }

    // Assume it's a DocID/UUID
    // Verify existence? Or just return it? 
    // Safer to verify if we want robust resolution, but for speed we might return it.
    // Let's do a quick check to be safe as per ADR.
    try {
        const res = await db.collection('rooms').doc(strId).get();
        if (res.data) return strId;
    } catch (e) {
        // Doc not found
        return null;
    }
    return null;
}
```

**Step 2: Integrate into Main Flow**

Modify `exports.main` to use this resolver immediately.

```javascript
    // ... inside exports.main ...
    const { roomId, ... } = event;

    // 1. Resolve ID First
    const docId = await resolveRoomDocId(db, roomId);
    if (!docId) {
        return { success: false, msg: 'Room not found' };
    }

    // 2. Fetch Room using DocID (Standardized)
    const roomRes = await db.collection('rooms').doc(docId).get();
    // ... rest of logic relies ONLY on roomRes.data and docId ...
```
*Note: This simplifies the existing mixed logic significantly.*

**Step 3: Deploy and Test**
-   Test `joinRoom` with 6-digit ID.
-   Test `joinRoom` with UUID.

**Step 4: Commit**
```bash
git add Minapp/cloudfunctions/joinRoom/index.js
git commit -m "refactor(joinRoom): standardize ID resolution using UUID"
```

---

### Task 3: Final Verification

**Files:**
-   N/A (Operational)

**Step 1: Run Cleanup in Dry Run (or observe logs)**
-   Check cloud logs for `cleanupRooms`.

**Step 2: Verify Join Flow**
-   Use simulator to join a room.

**Step 3: Commit Plan Update**
-   Mark plan as complete.
