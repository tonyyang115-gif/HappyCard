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
        this.envPrefix = (env === 'dev') ? 'dev_' : '';
        console.log(`[DBAdapter] Initialized with env: ${env}, prefix: ${this.envPrefix}`);

        this.command = this.db.command;
        this.serverDate = this.db.serverDate;
        this.RegExp = this.db.RegExp;
        this.Geo = this.db.Geo;
    }

    collection(name) {
        const targetName = this.envPrefix + name;
        console.log(`[DB] Use collection: ${targetName}`);
        return this.db.collection(targetName);
    }

    async runTransaction(callback) {
        return this.db.runTransaction(async (transaction) => {
            const transactionProxy = {
                collection: (name) => {
                    const targetName = this.envPrefix + name;
                    console.log(`[DB][Transaction] Use collection: ${targetName}`);
                    return transaction.collection(targetName);
                },
                rollback: (reason) => transaction.rollback(reason)
            };
            return await callback(transactionProxy);
        });
    }
}

/**
 * settleRoom: Transitions a room from 'active' to 'settled'
 * Once settled, no more scores can be submitted.
 * Also updates club and member statistics if applicable.
 */
exports.main = async (event, context) => {
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    const { docId } = event;
    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;

    if (!docId) return { success: false, msg: 'Missing docId' };

    try {
        const roomRes = await db.collection('rooms').doc(docId).get();
        if (!roomRes.data) return { success: false, msg: 'Room not found' };

        const room = roomRes.data;

        // Security: Only host can settle
        if (room.host.id !== openId && room.host.openId !== openId) {
            return { success: false, msg: '仅房主可结算对局' };
        }

        if (room.status === 'settled' || room.status === 'finished') {
            return { success: true, msg: '对局已在结算状态' };
        }

        // Update room status
        await db.collection('rooms').doc(docId).update({
            data: {
                status: 'settled',
                settledAt: db.serverDate(),
                settledBy: openId
            }
        });

        // Distinguish room types and handle statistics accordingly
        const isClubRoom = room.clubId && room.clubId !== null;
        const isValidRoom = room.players && room.players.length >= 2;

        if (!isValidRoom) {
            console.log('Skipping stats: invalid room (less than 2 players)');
            return {
                success: true,
                msg: '对局已结算（参与人数不足，无统计更新）',
                roomType: isClubRoom ? 'club' : 'free',
                statsUpdated: false
            };
        }

        // Free room: No club statistics to update
        if (!isClubRoom) {
            console.log(`Free room ${room.roomId} settled, no club stats to update`);
            return {
                success: true,
                msg: '自由对局已成功结算',
                roomType: 'free',
                statsUpdated: false
            };
        }

        // Club room: Update statistics only for multi-player rooms (≥2 players) in a club
        console.log(`Club room ${room.roomId} with ${room.players.length} players - updating stats`);

        // Get club info
        const club = clubRes.data;
        const numericClubId = club.clubId;

        // --- Phase 2: Personal Stats Persistence (New Architecture) ---
        // Regardless of club room or free room, update personal stats for all players
        console.log(`[Stats] Updating personal stats for ${room.players.length} players`);
        const personalStatsPromises = room.players.map(async player => {
            try {
                const uid = String(player.id);
                const score = player.totalScore || 0;

                // Determine record: win (1/0/0), draw (0/1/0), lose (0/0/1)
                const isWin = score > 0 ? 1 : 0;
                const isDraw = score === 0 ? 1 : 0;
                const isLose = score < 0 ? 1 : 0;

                // Update profile stats using atomic increments
                // Note: using 'profiles' collection for persistent user data
                return db.collection('profiles').doc(uid).update({
                    data: {
                        'stats.totalGames': _.inc(1),
                        'stats.winCount': _.inc(isWin),
                        'stats.drawCount': _.inc(isDraw),
                        'stats.loseCount': _.inc(isLose),
                        'stats.lastPlayedAt': db.serverDate(),
                        'stats.updatedAt': db.serverDate()
                    }
                }).catch(async (e) => {
                    // If document doesn't exist, create it with initial stats
                    if (e.message.includes('not exist') || e.errCode === -1) {
                        return db.collection('profiles').doc(uid).set({
                            data: {
                                stats: {
                                    totalGames: 1,
                                    winCount: isWin,
                                    drawCount: isDraw,
                                    loseCount: isLose,
                                    lastPlayedAt: db.serverDate(),
                                    updatedAt: db.serverDate()
                                },
                                name: player.name,
                                avatarUrl: player.avatarUrl,
                                id: player.id
                            }
                        });
                    }
                    throw e;
                });
            } catch (err) {
                console.error(`[Stats] Failed to update personal stats for ${player.id}`, err);
            }
        });

        // Wait for all personal stats to be updated (Non-blocking for the main flow)
        await Promise.all(personalStatsPromises);

        // --- Continue with Club Logic ---

        //1. Update club total games (房间数) and increment version
        await db.collection('clubs').doc(room.clubId).update({
            data: {
                'stats.totalGames': _.inc(1),
                'stats.version': 'v3',
                'stats.lastUpdatedAt': db.serverDate(),
                'stats.dataVersion': _.inc(1)  // 数据版本号，用于冲突检测
            }
        });
        console.log(`Updated club ${numericClubId} totalGames`);

        // 2. 获取该房间的所有轮次记录，按轮次统计胜负
        const roundsRes = await db.collection('rounds')
            .where({
                roomDocId: docId,
                type: 'game'  // 只统计对局，不统计转账
            })
            .get();

        const rounds = roundsRes.data || [];
        console.log(`Found ${rounds.length} game rounds for room ${room.roomId}`);

        // 3. 为每个玩家统计轮次级别的胜负
        const playerStats = {};

        // 初始化每个玩家的统计
        room.players.forEach(player => {
            playerStats[player.id] = {
                gameCount: 0,    // 参与的轮次数
                winCount: 0,     // 赢的轮次数
                drawCount: 0,    // 平的轮次数
                lostCount: 0,    // 输的轮次数
                totalScore: player.totalScore || 0  // 房间总分
            };
        });

        // 统计每一轮的输赢
        rounds.forEach(round => {
            const scores = round.scores || {};
            Object.keys(scores).forEach(playerId => {
                if (playerStats[playerId]) {
                    const score = scores[playerId];
                    playerStats[playerId].gameCount++;

                    if (score > 0) {
                        playerStats[playerId].winCount++;
                    } else if (score === 0) {
                        playerStats[playerId].drawCount++;
                    } else {
                        playerStats[playerId].lostCount++;
                    }
                }
            });
        });

        // 4. 更新每个玩家的统计数据
        let potentialNewChampion = null;
        const currentChampionWins = (club.stats && club.stats.champion && club.stats.champion.wins) || 0;

        for (const player of room.players) {
            const memberDocId = `${numericClubId}_${player.id}`;
            const statsDelta = playerStats[player.id];

            // 只有参与了对局的玩家才更新统计
            if (statsDelta.gameCount > 0) {
                try {
                    // Step 1: Read current stats (Read-Modify-Write for derived fields)
                    let currentData = {};
                    try {
                        const res = await db.collection('club_members').doc(memberDocId).get();
                        currentData = res.data || {};
                    } catch (e) {
                        // Not found, will initialize
                    }

                    const oldStats = currentData.stats || {
                        gameCount: 0, winCount: 0, drawCount: 0, lostCount: 0, totalScore: 0
                    };

                    // Step 2: Calculate new values
                    const newStats = {
                        gameCount: (oldStats.gameCount || 0) + statsDelta.gameCount,
                        winCount: (oldStats.winCount || 0) + statsDelta.winCount,
                        drawCount: (oldStats.drawCount || 0) + statsDelta.drawCount,
                        lostCount: (oldStats.lostCount || 0) + statsDelta.lostCount,
                        totalScore: (oldStats.totalScore || 0) + statsDelta.totalScore,
                        lastPlayedAt: db.serverDate()
                    };

                    // Step 3: Calculate Derived Field (Win Rate)
                    newStats.winRate = newStats.gameCount > 0
                        ? Math.floor((newStats.winCount / newStats.gameCount) * 10000)
                        : 0;

                    // [Aggegation Check] Loop-level max check
                    if (newStats.winCount > currentChampionWins) {
                        // Check against local best in this loop
                        if (!potentialNewChampion || newStats.winCount > potentialNewChampion.wins) {
                            potentialNewChampion = {
                                openId: player.id,
                                name: player.name,
                                avatar: player.avatarUrl,
                                wins: newStats.winCount,
                                games: newStats.gameCount,
                                winRate: newStats.winRate
                            };
                        }
                    }

                    // Step 4: Write back
                    const memberData = {
                        clubId: numericClubId,
                        openId: player.id,
                        name: player.name,
                        avatar: player.avatarUrl,
                        role: currentData.role || 'member',
                        joinedAt: currentData.joinedAt || db.serverDate(),
                        stats: newStats
                    };

                    if (currentData._id) {
                        // Update existing
                        await db.collection('club_members').doc(memberDocId).update({
                            data: {
                                stats: newStats,
                                name: player.name, // Fresh name
                                avatar: player.avatarUrl // Fresh avatar
                            }
                        });
                        console.log(`Updated member ${player.name}: WinRate ${newStats.winRate}`);
                    } else {
                        // Create new
                        await db.collection('club_members').doc(memberDocId).set({
                            data: memberData
                        });
                        console.log(`Created member ${player.name}: WinRate ${newStats.winRate}`);
                    }

                } catch (err) {
                    console.error(`Failed to update member ${player.name}`, err);
                    // Non-blocking error? ideally we should throw but let's log for robustness
                }
            } else {
                console.log(`Skipping ${player.name}: no game rounds participated`);
            }
        }

        // 5. [Architecture Optimization] Real-time Champion Aggregation
        if (potentialNewChampion) {
            console.log(`[Aggregation] New Champion Detected: ${potentialNewChampion.name} with ${potentialNewChampion.wins} wins`);
            await db.collection('clubs').doc(room.clubId).update({
                data: {
                    'stats.champion': potentialNewChampion
                }
            });
        }

        return {
            success: true,
            msg: '圈子对局已成功结算',
            roomType: 'club',
            statsUpdated: true
        };

    } catch (err) {
        console.error('Settle Error:', err);
        return { success: false, msg: err.message || '结算失败' };
    }
};
