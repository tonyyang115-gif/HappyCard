const cloud = require('wx-server-sdk');

// Hardcoded Env ID for stability in Local Debug and Timers
const CLOUD_ENV = 'cloud1-7go9rrf32b9c9cbc';

cloud.init({
    env: CLOUD_ENV
});

// [Shared Code] DBAdapter for Environment Isolation
class DBAdapter {
    constructor(cloud, env) {
        this.cloud = cloud;
        this.db = cloud.database();
        // Default based on env, but mutable
        this.envPrefix = (env === 'dev') ? 'dev_' : '';
        console.log(`[DBAdapter] Initialized with env: ${env}, prefix: ${this.envPrefix}`);
        this.command = this.db.command;
    }

    collection(name) {
        const targetName = this.envPrefix + name;
        return this.db.collection(targetName);
    }

    setPrefix(prefix) {
        this.envPrefix = prefix;
        console.log(`[DBAdapter] Switched prefix to: '${prefix}'`);
    }
}

exports.main = async (event, context) => {
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    console.log('Starting Scheduled Aggregator...');

    try {
        // 0. Auto-Detect Environment (Prod vs Dev)
        // Check if 'clubs' has data
        const prodCount = await db.db.collection('clubs').count();
        const devCount = await db.db.collection('dev_clubs').count();

        console.log(`[EnvDetect] clubs: ${prodCount.total}, dev_clubs: ${devCount.total}`);

        if (prodCount.total === 0 && devCount.total > 0) {
            console.log("--> Detected DEV environment data. Switching to 'dev_' prefix.");
            db.setPrefix('dev_');
        } else {
            console.log("--> Defaulting to PROD environment (or 'clubs' has data).");
        }

        // [Repair Mode] Nuclear Option: Rebuild stats from Room History
        if (event.mode === 'rebuild') {
            console.log("⚠️ STARTING NUCLEAR REBUILD ⚠️");

            // 1. Get List of Clubs
            const clubsSnap = await db.collection('clubs').get();
            const clubsList = clubsSnap.data || [];

            for (const club of clubsList) {
                const cid = club.clubId;
                const clubDocId = club._id;

                if (!cid) continue;
                console.log(`[Rebuild] Processing Club: ${cid} (DocId: ${clubDocId})`);

                // 2. Fetch ALL Settled Rooms for this Club
                // CRITICAL FIX: rooms.clubId stores the Club's UUID (DocId), NOT the numeric ID.
                const roomsSnap = await db.collection('rooms')
                    .where({
                        clubId: String(clubDocId),
                        status: _.in(['settled', 'finished'])
                    })
                    .limit(1000)
                    .get();

                const rooms = roomsSnap.data || [];
                console.log(`[Rebuild] Found ${rooms.length} rooms for club ${cid}`);

                if (rooms.length === 0) continue;

                // 3. Fetch Rounds (The Source of Truth for Scores)
                const roomIds = rooms.map(r => r._id);
                console.log(`[Diagnostic] Querying rounds for rooms:`, roomIds.slice(0, 3));

                // Diagnostic: Check if rounds exist at all
                const roundsCount = await db.collection('rounds').count();
                console.log(`[Diagnostic] Total documents in 'rounds' collection: ${roundsCount.total}`);

                // Batch fetch rounds
                let allRounds = [];
                const CHUNK_SIZE = 100;
                for (let i = 0; i < roomIds.length; i += CHUNK_SIZE) {
                    const chunk = roomIds.slice(i, i + CHUNK_SIZE);
                    // Relaxed Query: Removed type: 'game' to catch everything
                    const roundsRes = await db.collection('rounds')
                        .where({
                            roomDocId: _.in(chunk)
                        })
                        .limit(1000)
                        .get();
                    if (roundsRes.data) allRounds = allRounds.concat(roundsRes.data);
                }
                console.log(`[Rebuild] Fetched ${allRounds.length} rounds for these rooms.`);

                // 4. Re-calculate Stats In-Memory
                const statsMap = {}; // openId -> { win, game, ... }

                // Helper to init player in map
                const initPlayer = (pid) => {
                    if (!statsMap[pid]) {
                        statsMap[pid] = {
                            gameCount: 0, winCount: 0, drawCount: 0, lostCount: 0, totalScore: 0,
                            name: 'Unknown', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=User&backgroundColor=c0aede'
                        };
                    }
                };

                // Fill basic info from rooms (for name/avatar)
                rooms.forEach(r => {
                    if (r.players) {
                        r.players.forEach(p => {
                            const pid = p.openid || p.id;
                            if (pid) {
                                initPlayer(pid);
                                // Check if p contains useful info
                                if (p.name) statsMap[pid].name = p.name;
                                if (p.avatarUrl) statsMap[pid].avatar = p.avatarUrl;
                            }
                        });
                    }
                });

                // Aggregate Scores from Rounds
                for (const round of allRounds) {
                    const scores = round.scores || {};
                    Object.keys(scores).forEach(pid => {
                        initPlayer(pid); // Safegaurd
                        const s = scores[pid];
                        statsMap[pid].gameCount++;
                        statsMap[pid].totalScore += s;
                        if (s > 0) statsMap[pid].winCount++;
                        else if (s === 0) statsMap[pid].drawCount++;
                        else statsMap[pid].lostCount++;
                    });
                }

                // 5. Force Update Club Members
                const pids = Object.keys(statsMap);
                console.log(`[Rebuild] Updating ${pids.length} members...`);

                for (const pid of pids) {
                    const s = statsMap[pid];
                    s.winRate = s.gameCount > 0 ? Math.floor((s.winCount / s.gameCount) * 10000) : 0;
                    const memberDocId = `${cid}_${pid}`;

                    // Update Name/Avatar from statsMap if available
                    const updatePayload = { stats: s };
                    if (s.name !== 'Unknown') updatePayload.name = s.name;
                    if (s.avatar) updatePayload.avatar = s.avatar;

                    // Update or Create
                    const check = await db.collection('club_members').doc(memberDocId).get().catch(() => ({ data: null }));
                    if (check.data) {
                        await db.collection('club_members').doc(memberDocId).update({
                            data: updatePayload
                        });
                    } else {
                        // Optional: Create missing doc if strictly needed
                        console.warn(`[Rebuild] Member ${memberDocId} not found in DB, skipping create.`);
                    }
                }
                console.log(`[Rebuild] Completed Club ${cid}`);
            }
        }

        // 1. Fetch all clubs (Scanning top 100 for now)
        // Optimization: In future, use skip/limit or map-reduce
        const clubsRes = await db.collection('clubs')
            .limit(100)
            .get();

        const clubs = clubsRes.data || [];
        console.log(`Found ${clubs.length} clubs to process.`);

        const results = [];

        for (const club of clubs) {
            const clubId = club.clubId || club._id; // Use numeric ID if available
            // Note: club_members uses numeric Club ID usually? 
            // Let's ensure we use the same ID that club_members uses.
            // In settleRoom, it used 'numericClubId'.
            const targetClubId = club.clubId;

            if (!targetClubId) {
                console.warn(`Skipping club ${club._id}: no numeric clubId`);
                continue;
            }

            console.log(`Processing Club: ${targetClubId}`);

            // 2. Query Champion (Most Wins)
            const championQuery = await db.collection('club_members')
                .where({ clubId: targetClubId })
                .orderBy('stats.winCount', 'desc')
                .orderBy('stats.gameCount', 'asc') // Tie-breaker
                .limit(1)
                .limit(1)
                .get();

            const championMember = (championQuery.data && championQuery.data.length > 0) ? championQuery.data[0] : null;

            // [Debug] Log what we found
            if (championMember) {
                console.log(`[Debug] Found potential champion: ${championMember.name}, Wins: ${championMember.stats ? championMember.stats.winCount : 'N/A'}`);
            } else {
                console.log(`[Debug] No members found for club ${targetClubId}`);
            }

            let championData = null;
            if (championMember && championMember.stats && championMember.stats.winCount > 0) {
                championData = {
                    openId: championMember.openId,
                    name: championMember.name,
                    avatar: championMember.avatar,
                    wins: championMember.stats.winCount,
                    games: championMember.stats.gameCount,
                    winRate: championMember.stats.winRate
                };
                console.log(`[Debug] Champion Validated: ${championData.name}`);
            } else {
                console.log(`[Debug] Champion Invalid: Missing stats or 0 wins`);
            }

            // 3. Query Best Player (Highest Win Rate, Min 3 Games)
            const bestPlayerQuery = await db.collection('club_members')
                .where({
                    clubId: targetClubId,
                    'stats.gameCount': _.gte(3)
                })
                .orderBy('stats.winRate', 'desc')
                .orderBy('stats.winCount', 'desc')
                .limit(1)
                .get();

            const bestMember = (bestPlayerQuery.data && bestPlayerQuery.data.length > 0) ? bestPlayerQuery.data[0] : null;
            let bestPlayerData = null;
            if (bestMember) {
                bestPlayerData = {
                    openId: bestMember.openId,
                    name: bestMember.name,
                    avatar: bestMember.avatar,
                    winRate: bestMember.stats.winRate,
                    wins: bestMember.stats.winCount,
                    games: bestMember.stats.gameCount
                };
            }

            // 4. Update Club Metadata
            const updateData = {};
            if (championData) updateData['stats.champion'] = championData;
            if (bestPlayerData) updateData['stats.bestPlayer'] = bestPlayerData;

            if (Object.keys(updateData).length > 0) {
                updateData['stats.lastAggregatedAt'] = db.db.serverDate();
                await db.collection('clubs').doc(club._id).update({
                    data: updateData
                });
                results.push({ id: targetClubId, status: 'updated' });
                console.log(`Club ${targetClubId} updated:`, updateData);
            } else {
                results.push({ id: targetClubId, status: 'no_data' });
            }
        }

        return {
            success: true,
            processed: clubs.length,
            details: results
        };

    } catch (e) {
        console.error('Aggregator Failed:', e);
        return { success: false, error: e };
    }
};
