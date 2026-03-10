// cloudfunctions/autoSettleRoom/index.js
const cloud = require('wx-server-sdk');

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const DBAdapter = require('../common/dbWrapper');

/**
 * autoSettleRoom: 自动结算房间
 * 避免房间卡死，自动清理超时或异常的房间
 * 
 * 自动结算条件（满足任一即触发）：
 * 1. 最后对局时间超过1小时
 * 2. 所有活跃玩家都退出（只剩房主或完全无活跃玩家）
 * 3. 房主1小时无记分操作（且房间有对局记录）
 */
exports.main = async (event, context) => {
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    const { docId } = event;
    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;

    if (!docId) {
        return { success: false, msg: 'Missing docId', reason: null };
    }

    try {
        // 获取房间信息
        const roomRes = await db.collection('rooms').doc(docId).get();
        if (!roomRes.data) {
            return { success: false, msg: 'Room not found', reason: null };
        }

        const room = roomRes.data;

        // 已结算的房间不处理
        if (room.status === 'settled' || room.status === 'finished') {
            return { success: true, msg: '房间已结算', reason: 'already_settled', settledAt: room.settledAt };
        }

        // ─────────────────────────────────────
        // 获取对局记录
        // ─────────────────────────────────────

        const roundsRes = await db.collection('rounds')
            .where({
                roomDocId: docId,
                type: 'game'  // 只统计对局，不统计转账
            })
            .orderBy('timestamp', 'desc')
            .get();

        const rounds = roundsRes.data || [];

        // 获取活跃玩家（未退出的玩家）
        const activePlayers = room.players.filter(p => p.hasLeft !== true);
        const activePlayerCount = activePlayers.length;

        console.log(`自动结算检查：房间${room.roomId}，对局数${rounds.length}，活跃玩家${activePlayerCount}`);

        // ─────────────────────────────────────
        // 检查自动结算条件（满足任一即触发）
        // ─────────────────────────────────────

        let settleReason = null;
        let shouldSettle = false;

        // 条件1：最后对局时间超过1小时
        if (rounds.length > 0) {
            const lastRoundTime = new Date(rounds[0].timestamp).getTime();
            const now = Date.now();
            const hoursSinceLastRound = (now - lastRoundTime) / (1000 * 60 * 60); // 转换为小时

            if (hoursSinceLastRound >= 1) {
                shouldSettle = true;
                settleReason = `最后对局已超过${Math.floor(hoursSinceLastRound)}小时`;
                console.log(`条件1满足：${settleReason}`);
            }
        }

        // 条件2：所有活跃玩家都退出
        if (!shouldSettle) {
            if (activePlayerCount === 0) {
                shouldSettle = true;
                settleReason = '所有活跃玩家都已退出';
                console.log(`条件2满足：${settleReason}`);
            } else if (activePlayerCount === 1) {
                // 只有1个活跃玩家，不判断是否是房主，自动结算
                shouldSettle = true;
                settleReason = '活跃玩家数量不足';
                console.log(`条件2满足：${settleReason}`);
            }
        }

        // 条件3：房主1小时无记分操作
        if (!shouldSettle && rounds.length > 0 && activePlayerCount >= 2) {
            const lastRoundTime = new Date(rounds[0].timestamp).getTime();
            const now = Date.now();
            const hoursSinceLastRound = (now - lastRoundTime) / (1000 * 60 * 60);

            if (hoursSinceLastRound >= 1) {
                // 检查房主是否是最后一个操作者
                const lastRound = rounds[0];
                const lastOperatorIsHost = lastRound._openid === openId;

                if (lastOperatorIsHost) {
                    shouldSettle = true;
                    settleReason = `房主1小时未操作（${Math.floor(hoursSinceLastRound)}小时）`;
                    console.log(`条件3满足：${settleReason}`);
                }
            }
        }

        // 不满足任何条件，不结算
        if (!shouldSettle) {
            return {
                success: true,
                needSettle: false,
                msg: '房间状态正常，无需自动结算',
                reason: null
            };
        }

        // ─────────────────────────────────────
        // 执行结算逻辑
        // ─────────────────────────────────────

        // 更新房间状态
        await db.collection('rooms').doc(docId).update({
            data: {
                status: 'settled',
                settledAt: db.serverDate(),
                settledBy: openId,
                autoSettled: true,  // 标记为自动结算
                settleReason: settleReason  // 记录结算原因
            }
        });

        // 区分房间类型
        const isClubRoom = room.clubId && room.clubId !== null;
        const isValidRoom = room.players && room.players.length >= 2;

        let result = {
            success: true,
            msg: '自动结算成功',
            reason: settleReason,
            roomType: isClubRoom ? 'club' : 'free',
            statsUpdated: false
        };

        // 不满足统计条件的不更新统计
        if (!isValidRoom) {
            console.log('房间参与人数不足，无统计更新');
            return result;
        }

        // 自由房间不更新统计
        if (!isClubRoom) {
            console.log('自由房间，无统计更新');
            return result;
        }

        // 圈子房间：更新统计（完全复用 settleRoom 的统计逻辑）
        console.log(`圈子房间，执行统计更新`);

        // 1. 更新圈子统计
        const clubRes = await db.collection('clubs').doc(room.clubId).get();
        if (!clubRes.data) {
            console.warn('圈子不存在，跳过统计更新');
            return result;
        }

        const club = clubRes.data;
        const numericClubId = club.clubId;

        await db.collection('clubs').doc(room.clubId).update({
            data: {
                'stats.totalGames': _.inc(1),
                'stats.version': 'v3',
                'stats.lastUpdatedAt': db.serverDate(),
                'stats.dataVersion': _.inc(1)
            }
        });
        console.log(`Updated club ${numericClubId} totalGames`);

        // 2. 获取房间的所有轮次记录
        const roomRoundsRes = await db.collection('rounds')
            .where({
                roomDocId: docId,
                type: 'game'
            })
            .get();

        const roomRounds = roomRoundsRes.data || [];
        console.log(`Found ${roomRounds.length} game rounds for room ${room.roomId}`);

        // 3. 为每个玩家统计轮次级别的胜负
        const playerStats = {};

        room.players.forEach(player => {
            playerStats[player.id] = {
                gameCount: 0,
                winCount: 0,
                drawCount: 0,
                lostCount: 0,
                totalScore: player.totalScore || 0
            };
        });

        roomRounds.forEach(round => {
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

        // 4. 更新每个玩家的统计数据到 club_members
        for (const player of room.players) {
            const memberDocId = `${numericClubId}_${player.id}`;
            const stats = playerStats[player.id];

            if (stats.gameCount > 0) {
                const updateData = {
                    'stats.gameCount': _.inc(stats.gameCount),
                    'stats.winCount': _.inc(stats.winCount),
                    'stats.drawCount': _.inc(stats.drawCount),
                    'stats.lostCount': _.inc(stats.lostCount),
                    'stats.totalScore': _.inc(stats.totalScore),
                    'stats.lastPlayedAt': db.serverDate(),
                    name: player.name,
                    avatar: player.avatarUrl
                };

                try {
                    await db.collection('club_members').doc(memberDocId).update({
                        data: updateData
                    });
                    console.log(`Updated member ${player.name}: ${stats.gameCount}局 ${stats.winCount}胜 ${stats.drawCount}平 ${stats.lostCount}负`);
                } catch (err) {
                    if (err.errCode === -1) {
                        await db.collection('club_members').doc(memberDocId).set({
                            data: {
                                clubId: numericClubId,
                                openId: player.id,
                                name: player.name,
                                avatar: player.avatarUrl,
                                role: 'member',
                                joinedAt: db.serverDate(),
                                stats: {
                                    gameCount: stats.gameCount,
                                    winCount: stats.winCount,
                                    drawCount: stats.drawCount,
                                    lostCount: stats.lostCount,
                                    totalScore: stats.totalScore,
                                    lastPlayedAt: db.serverDate()
                                }
                            }
                        });
                        console.log(`Created new member ${player.name}: ${stats.gameCount}局 ${stats.winCount}胜`);
                    } else {
                        throw err;
                    }
                }
            } else {
                console.log(`Skipping ${player.name}: no game rounds participated`);
            }
        }

        result.statsUpdated = true;
        return result;

    } catch (err) {
        console.error('Auto settle error:', err);
        return {
            success: false,
            msg: err.message || '自动结算失败',
            reason: null,
            error: err
        };
    }
};
