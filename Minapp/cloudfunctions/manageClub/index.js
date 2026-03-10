// cloudfunctions/manageClub/index.js
const cloud = require('wx-server-sdk');

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

// [DEBUG] Inlined DBAdapter to avoid module resolution issues
class DBAdapter {
    constructor(cloud, env) {
        this.cloud = cloud;
        this.db = cloud.database();
        // 如果 env 是 dev，则添加 dev_ 前缀
        // 健壮性修复: 确保 envPrefix 总是字符串
        this.envPrefix = (env === 'dev') ? 'dev_' : '';
        console.log(`[DBAdapter] Initialized with env: ${env}, prefix: "${this.envPrefix}"`);

        this.command = this.db.command;
        this.serverDate = this.db.serverDate;
        this.RegExp = this.db.RegExp;
        this.Geo = this.db.Geo;
    }

    collection(name) {
        const targetName = this.envPrefix + name;
        console.log(`[DB] Using collection: ${targetName}`);
        return this.db.collection(targetName);
    }

    async runTransaction(callback) {
        return this.db.runTransaction(async (transaction) => {
            const transactionProxy = {
                collection: (name) => {
                    const targetName = this.envPrefix + name;
                    console.log(`[DB][Transaction] Using collection: ${targetName}`);
                    return transaction.collection(targetName);
                },
                rollback: (reason) => transaction.rollback(reason)
            };
            return await callback(transactionProxy);
        });
    }
}

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;

    console.log('[manageClub] Event:', event);
    console.log('[manageClub] Env:', event.__env);

    // Initialize DB Adapter
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    const { action, clubId, targetOpenId } = event;

    if (!action || !clubId) {
        return { success: false, msg: 'Missing parameters' };
    }

    try {
        if (action === 'sync') {
            return { success: true, openId: openId };
        }

        return await db.runTransaction(async transaction => {
            // Lazy Query: Only fetch Club Doc if NOT in repair mode
            let club = null;
            let numericClubId = null;

            if (action !== 'updateMemberStats') {
                console.log(`[manageClub] Quering doc with id: ${clubId}`);
                const clubRes = await transaction.collection('clubs').doc(clubId).get();
                if (!clubRes.data) throw new Error('Club not found');
                club = clubRes.data;
                numericClubId = club.clubId;
            } else {
                // For updateMemberStats, we don't need the club doc, just the member doc
                console.log('[manageClub] Skipping Club Doc lookup for updateMemberStats');
            }

            let finalTargetOpenId = '';

            // --- Action Handler ---

            if (action === 'join') {
                finalTargetOpenId = openId;
                const memberDocId = `${numericClubId}_${openId}`;

                // 1. Idempotency Check (Check club_members directly)
                try {
                    const memberStats = await transaction.collection('club_members').doc(memberDocId).get();
                    if (memberStats.data) {
                        return { success: true, msg: 'Already a member', action: 'join' };
                    }
                } catch (e) {
                    // Document not found is expected, continue
                }

                // 2. Create Member Document
                await transaction.collection('club_members').doc(memberDocId).set({
                    data: {
                        clubId: numericClubId,
                        openId: openId,
                        name: event.name || '玩家',
                        avatar: event.avatar || '',
                        role: 'member',
                        joinedAt: db.serverDate(),
                        stats: { totalScore: 0, gameCount: 0, winCount: 0, drawCount: 0, lostCount: 0 }
                    }
                });

                // 3. Update Aggregate Data (Clubs Doc)
                const updates = {
                    memberCount: _.inc(1)
                };

                // Update Preview Cache if needed (Max 6)
                const currentPreview = club.memberPreview || [];
                // Check legacy array length as fallback if preview missing
                const currentLen = currentPreview.length > 0 ? currentPreview.length : (club.members ? club.members.length : 0);

                if (currentLen < 6) {
                    updates.memberPreview = _.push({
                        openId: openId,
                        avatar: event.avatar || ''
                    });
                }

                await transaction.collection('clubs').doc(clubId).update({ data: updates });

                return { success: true, action: 'join' };
            }

            else if (action === 'leave' || action === 'kick') {
                if (action === 'leave') {
                    // Check if 'mockId' is provided (e.g. from local storage transition)
                    finalTargetOpenId = event.mockId || openId;
                } else {
                    // Kick: Owner only
                    if (club.ownerId !== openId) throw new Error('Permission denied');
                    finalTargetOpenId = targetOpenId;
                }

                if (!finalTargetOpenId) throw new Error('Target OpenID missing');

                const memberDocId = `${numericClubId}_${finalTargetOpenId}`;

                // 1. Remove Member Document
                try {
                    await transaction.collection('club_members').doc(memberDocId).remove();
                } catch (e) {
                    // Ignore if not found, but log it
                    console.warn('Member doc not found during remove:', memberDocId);
                }

                // 2. Update Aggregate Data
                const updates = {
                    memberCount: _.inc(-1),
                    // Remove from preview if present
                    memberPreview: _.pull({
                        openId: finalTargetOpenId
                    })
                };

                // Also remove from legacy array to keep it clean (optional, but good for uniformity)
                updates.members = _.pull({
                    openId: finalTargetOpenId
                });

                await transaction.collection('clubs').doc(clubId).update({ data: updates });

                return { success: true, action: action };
            }

            else if (action === 'reconcileMembers') {
                // Migration Logic: Legacy Array -> Collection
                const members = club.members || [];
                const preview = [];
                let count = 0;

                // We can't batch create easily in a transaction loop efficiently if list is huge, 
                // but for < 100 members it's fine. 
                // Limitation: Transaction has limit of operations. 
                // Better strategy: Just do aggregations update here, Assume independent script does the inserts?
                // No, sticking to simple list iteration for now.

                for (const m of members) {
                    const mOpenId = m.openId;
                    if (!mOpenId) continue;

                    const mDocId = `${numericClubId}_${mOpenId}`;

                    // Upsert member doc
                    // Note: set() overwrites. using update() or checking existence is better to preserve stats?
                    // Migration assumption: legacy members live in array, new stats live in doc. 
                    // Safe approach: set if not exists, or update basic info.
                    // Transaction read limit is small (20 usually?). Iterating 100 members will fail transaction quota.
                    // STRATEGY CHANGE: 
                    // reconcileMembers just fixes the 'memberCount' and 'memberPreview' in the club doc based on the COLLECTION count.
                    // Actual data migration should be a separate batched job or assumed done.
                    // BUT, let's assume this is a "Repair" for small clubs.

                    if (count < 6) {
                        preview.push({ openId: mOpenId, avatar: m.avatar || '' });
                    }
                    count++;
                }

                // If we want to fully migrate legacy array to collection, we need a separate loop outside transaction?
                // Or assume this is just fixing the Club Doc metadata.
                // Let's implement Metadata Repair primarily.

                const realCountRes = await transaction.collection('club_members').where({ clubId: numericClubId }).count();
                const realCount = realCountRes.total;

                // If realCount is 0 but we have legacy members, we SHOULD migrate them.
                // But doing it inside transaction is risky for limits.
                // Let's just update the aggregates for now as confirmed safe Op.

                await transaction.collection('clubs').doc(clubId).update({
                    data: {
                        memberCount: realCount,
                        memberPreview: preview.length > 0 ? preview : _.literal(undefined) // Don't clear if we didn't calculate it right? 
                        // Actually better to trust legacy members list for preview if collection is empty.
                    }
                });

                return { success: true, msg: 'Aggregates reconciled', count: realCount };
            }

            else if (action === 'updateIdentity') {
                // Keep existing identity update logic
                const mockId = event.mockId;
                if (!mockId) throw new Error('Mock ID missing');

                // 1. Update Legacy Array (for consistency)
                const updatedMembers = (club.members || []).map(m => {
                    if (m.openId === mockId) return { ...m, openId: openId };
                    return m;
                });
                await transaction.collection('clubs').doc(clubId).update({
                    data: { members: updatedMembers }
                });

                // 2. Migrate Document
                const oldDocId = `${numericClubId}_${mockId}`;
                const newDocId = `${numericClubId}_${openId}`;

                const oldSnapshot = await transaction.collection('club_members').doc(oldDocId).get();
                if (oldSnapshot.data) {
                    const data = oldSnapshot.data;
                    delete data._id;
                    data.openId = openId;
                    await transaction.collection('club_members').doc(newDocId).set({ data });
                    await transaction.collection('club_members').doc(oldDocId).remove();
                }

                return { success: true, synced: true };
            }

            else if (action === 'updateInfo') {
                // Permission Check
                if (club.ownerId !== openId) throw new Error('Permission denied: Only owner can update info');

                // Validate inputs
                const { name, description } = event;
                if (!name || name.trim().length === 0) throw new Error('Info Error: Name is required');
                if (name.length > 20) throw new Error('Info Error: Name too long (max 20)');
                if (description && description.length > 200) throw new Error('Info Error: Description too long (max 200)');

                await transaction.collection('clubs').doc(clubId).update({
                    data: {
                        name: name.trim(),
                        description: description ? description.trim() : '',
                        updatedAt: db.serverDate()
                    }
                });

                return { success: true, action: 'updateInfo' };
            }

            else if (action === 'updateMemberStats') {
                // Action: Direct Stats Update (Repair Mode)
                const { memberId, stats } = event;
                if (!memberId || !stats) throw new Error('Missing memberId or stats');

                await transaction.collection('club_members').doc(memberId).update({
                    data: {
                        stats: stats,
                        updatedAt: db.serverDate()
                    }
                });

                return { success: true, memberId };
            }

            else if (action === 'reconcileStats') {
                // Fix: transaction.collection().count() might not be supported or stable.
                // Use standard DB query outside of transaction context for counting.
                // FIX[2026-01-21]: Handle both String and Number types for clubId to prevent 0 count.
                const cmd = db.command;
                const actualCountRes = await db.collection('rooms').where(
                    cmd.or([
                        { clubId: String(clubId) },
                        { clubId: Number(clubId) }
                    ])
                ).count();

                const actualTotal = actualCountRes.total;
                console.log(`[reconcileStats] Counted rooms for club ${clubId}: ${actualTotal}`);

                await transaction.collection('clubs').doc(clubId).update({
                    data: {
                        'stats.totalGames': actualTotal,
                        'stats.updatedAt': db.serverDate(),
                        'stats.reconciled': true
                    }
                });

                return {
                    success: true,
                    action: 'reconcileStats',
                    oldValue: club.stats ? club.stats.totalGames : 0,
                    newValue: actualTotal
                };
            }

            throw new Error(`Unknown action: ${action}`);
        });
    } catch (err) {
        console.error('ManageClub Error:', err);
        return { success: false, msg: err.message || 'Operation failed' };
    }
};
