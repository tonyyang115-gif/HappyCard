// cloudfunctions/migrateStats/index.js
const cloud = require('wx-server-sdk');

cloud.init({
    env: 'cloud1-7go9rrf32b9c9cbc' // FORCE CORRECT ENV for debugging
});

exports.main = async (event, context) => {
    const db = cloud.database();
    const _ = db.command;

    // 1. Get ClubId and Env
    const { clubId, env } = event;
    const isDev = env === 'dev' || event.__env === 'dev';
    const ROOMS_COL = isDev ? 'dev_rooms' : 'rooms';
    const MEMBERS_COL = isDev ? 'dev_club_members' : 'club_members';

    if (!clubId) return { success: false, msg: 'Missing clubId' };

    console.log(`Rebuilding stats for Club: ${clubId} in ${ROOMS_COL} -> ${MEMBERS_COL}`);

    // 2. Fetch all rooms for this club (Status Agnostic Debugging)
    const cmd = db.command;
    const query = db.collection(ROOMS_COL).where(cmd.or([
        { clubId: String(clubId) },
        { clubId: Number(clubId) }
    ]));

    const totalCheck = await query.count();
    console.log(`[Debug] Total rooms for club ${clubId} (any status): ${totalCheck.total}`);

    const roomsRes = await query
        .limit(1000)
        .get();

    const rooms = roomsRes.data;
    console.log(`Found ${rooms.length} rooms (Raw). Statuses:`, rooms.map(r => r.status));

    // Filter for processing in memory to see what we skipped
    const endedRooms = rooms.filter(r => r.status === 'ended');
    console.log(`Filtered to ${endedRooms.length} 'ended' rooms.`);

    // Continue with endedRooms
    const roomsToProcess = endedRooms;

    // 3. Aggregate Stats in Memory
    const statsMap = {}; // openId -> { totalScore, gameCount, winCount, ... }

    roomsToProcess.forEach(room => {
        if (!room.players || !room.scores) return;

        room.players.forEach((player, index) => {
            const openId = player.openid || player.id; // Fallback
            if (!openId) return;

            if (!statsMap[openId]) {
                statsMap[openId] = {
                    totalScore: 0,
                    gameCount: 0,
                    winCount: 0,
                    drawCount: 0, // Not explicitly used but good to have
                    lostCount: 0  // Not explicitly used but good to have
                };
            }

            const score = room.scores[index] || 0;
            const stat = statsMap[openId];

            stat.totalScore += score;
            stat.gameCount += 1;

            if (score > 0) stat.winCount += 1;
            else if (score < 0) stat.lostCount += 1;
            else stat.drawCount += 1;
        });
    });

    // 4. Update Member Records
    const updates = [];
    const openIds = Object.keys(statsMap);
    console.log(`Aggregated stats for ${openIds.length} players.`);

    for (const openId of openIds) {
        // Construct the composite _id for club_members
        // Try both possible keys just in case? Usually it's `${clubId}_${openId}`
        // Ideally we should query by clubId + openId to be safe, but let's try strict ID first.
        // We actually need to know the exact numeric ClubId to form the ID.
        // But the input clubId might be string.
        // Let's Find the member doc first to be safe.

        const memberQuery = db.collection(MEMBERS_COL).where({
            openId: openId,
            clubId: cmd.or([cmd.eq(String(clubId)), cmd.eq(Number(clubId))])
        });

        const p = memberQuery.get().then(async (mRes) => {
            if (mRes.data.length > 0) {
                const memberDoc = mRes.data[0];
                const newStats = statsMap[openId];

                // Calculate winRate for completeness
                newStats.winRate = newStats.gameCount > 0
                    ? Math.floor((newStats.winCount / newStats.gameCount) * 10000)
                    : 0;

                await db.collection(MEMBERS_COL).doc(memberDoc._id).update({
                    data: {
                        stats: newStats
                    }
                });
                return { openId, status: 'updated' };
            } else {
                return { openId, status: 'not_found' };
            }
        });
        updates.push(p);
    }

    const results = await Promise.all(updates);

    return {
        success: true,
        totalFound: rooms.length,
        rebuiltCount: roomsToProcess.length,
        updatedMembers: results.filter(r => r.status === 'updated').length,
        details: results
    };
};
