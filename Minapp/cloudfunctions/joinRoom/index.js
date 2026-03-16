// cloudfunctions/joinRoom/index.js
const cloud = require('wx-server-sdk');
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

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

function getIdentityCandidates(entity) {
    if (!entity) return [];
    return [entity.id, entity.openId, entity.openid]
        .filter(value => value !== undefined && value !== null && value !== '')
        .map(value => String(value));
}

function isSameUser(left, right) {
    const leftIds = getIdentityCandidates(left);
    const rightIds = getIdentityCandidates(right);
    return leftIds.some(id => rightIds.includes(id));
}

function syncHostFlags(players, hostPlayer) {
    return players.map(player => ({
        ...player,
        isHost: hostPlayer ? isSameUser(player, hostPlayer) : false
    }));
}

exports.resolveRoomDocId = async (db, inputId) => {
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
    try {
        const res = await db.collection('rooms').doc(strId).get();
        if (res.data) return strId;
    } catch (e) {
        return null;
    }
    return null;
};

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;

    // 1. 初始化数据库适配器
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    const { roomId, userInfo, checkOnly, targetClubId } = event; // roomId can be 6-digit Display ID or Doc ID

    if (!roomId || !userInfo) {
        return { success: false, msg: 'Missing parameters' };
    }

    try {
        // --- 1. ID Standardization (New Resolver) ---
        const docId = await exports.resolveRoomDocId(db, roomId);
        if (!docId) {
            return { success: false, msg: 'Room not found' };
        }

        // Fetch room using UUID (Standardized)
        const roomRes = await db.collection('rooms').doc(docId).get();
        let foundRoom = roomRes.data;
        if (!foundRoom) throw new Error('Room not found');

        // --- 1.5 Club Ownership Validation (Harden Security) ---
        // If targetClubId is passed, we MUST ensure the room is part of this club.
        const reqClubId = targetClubId ? String(targetClubId).trim() : '';
        if (reqClubId && reqClubId !== '---') {
            if (!foundRoom) {
                const fetchRes = await db.collection('rooms').doc(docId).get();
                foundRoom = fetchRes.data;
            }
            if (!foundRoom) throw new Error('Room not found');

            // Normalize IDs to strings for robust comparison
            const actClubId = foundRoom.clubId ? String(foundRoom.clubId).trim() : '';

            if (actClubId !== reqClubId) {
                return {
                    success: false,
                    msg: actClubId ? '该房间属于其他牌友圈' : '该房间为自由对局（散房），请前往首页加入'
                };
            }
        }

        // --- 1.6 Status Check (Lifecycle Stage 1) ---
        if (!foundRoom) {
            const fetchRes = await db.collection('rooms').doc(docId).get();
            foundRoom = fetchRes.data;
        }
        if (foundRoom && foundRoom.status && foundRoom.status !== 'active') {
            return {
                success: false,
                msg: foundRoom.status === 'finished' ? '该对局已结束' : '该房间已关闭'
            };
        }

        // --- 2. CheckOnly Mode (P1 Support) ---
        if (checkOnly) {
            const roomRes = await db.collection('rooms').doc(docId).get();
            const room = roomRes.data;
            if (!room) throw new Error('Room not found');

            let clubInfo = null;
            let needsClubJoin = false;

            if (room.clubId) {
                const clubRes = await db.collection('clubs').doc(room.clubId).get();
                const club = clubRes.data;
                if (club) {
                    clubInfo = { name: club.name, id: club._id };
                    needsClubJoin = !club.members.some(m => m.openId === openId);
                }
            }

            return {
                success: true,
                checkOnly: true,
                docId: docId,
                roomStatus: room.status,
                clubInfo,
                needsClubJoin
            };
        }

        // --- 3. Atomic Join (P0 Support) ---
        const result = await db.runTransaction(async transaction => {
            const roomRes = await transaction.collection('rooms').doc(docId).get();
            if (!roomRes.data) throw new Error('Room not found');

            const room = roomRes.data;
            const players = room.players || [];

            // Ownership Double Check (Inside Transaction)
            const requiredId = targetClubId ? String(targetClubId).trim() : '';
            if (requiredId && requiredId !== '---') {
                const roomClubId = room.clubId ? String(room.clubId).trim() : '';
                if (roomClubId !== requiredId) {
                    throw new Error(roomClubId ? '该房间属于其他对局圈' : '该房间为自由对局');
                }
            }
            if (room.status && room.status !== 'active') {
                throw new Error('房间当前状态不允许加入');
            }

            // A. Implicit Club Join (P0)
            if (room.clubId) {
                const clubRes = await transaction.collection('clubs').doc(room.clubId).get();
                const club = clubRes.data;

                // 新增: 检查圈子是否正在删除
                if (!club || club.status === 'deleting') {
                    throw new Error('关联圈子已解散或正在解散中');
                }

                if (club) {
                    const isClubMember = club.members.some(m => m.openId === openId);
                    if (!isClubMember) {
                        console.log(`Implicitly adding ${openId} to club ${room.clubId}`);
                        // Legacy Write
                        await transaction.collection('clubs').doc(room.clubId).update({
                            data: {
                                members: _.push({
                                    openId: openId,
                                    name: userInfo.name,
                                    avatar: userInfo.avatarUrl,
                                    joinedAt: new Date()
                                })
                            }
                        });

                        // New Scalable Write: Use Doc ID for O(1) lookup
                        const derivedDocId = `${club.clubId}_${openId}`;
                        const memberRef = transaction.collection('club_members').doc(derivedDocId);
                        const memberSnapshot = await memberRef.get();

                        if (!memberSnapshot.data) {
                            await memberRef.set({
                                data: {
                                    clubId: club.clubId,
                                    openId: openId,
                                    name: userInfo.name,
                                    avatar: userInfo.avatarUrl,
                                    role: 'member',
                                    joinedAt: db.serverDate(),
                                    stats: {
                                        totalScore: 0,
                                        gameCount: 0,
                                        winCount: 0,
                                        drawCount: 0,
                                        lostCount: 0
                                    }
                                }
                            });
                        }
                    }
                }
            }

            // B. Room Capacity & Idempotency
            const currentPlayerIdentity = { id: openId, openId: openId, openid: openId };
            const existingPlayer = players.find(p => isSameUser(p, currentPlayerIdentity));

            if (existingPlayer) {
                // 如果玩家已存在，检查是否是重新加入（hasLeft = true）
                if (existingPlayer.hasLeft === true) {
                    // 重新加入：将 hasLeft 改为 false
                    let updatedPlayers = players.map(p => {
                        if (isSameUser(p, currentPlayerIdentity)) {
                            return { ...p, hasLeft: false };
                        }
                        return p;
                    });

                    updatedPlayers = syncHostFlags(updatedPlayers, room.host);

                    await transaction.collection('rooms').doc(docId).update({
                        data: { players: updatedPlayers }
                    });

                    console.log(`Player ${openId} re-joined room ${room.roomId} (was hasLeft=true)`);
                    return {
                        joined: true,
                        docId: docId,
                        rejoined: true,
                        openId: openId
                    };
                }
                // 玩家已在房间且活跃，幂等返回
                return { joined: true, docId: docId };
            }

            // 检查房间容量（只统计活跃玩家）
            const activePlayerCount = players.filter(p => p.hasLeft !== true).length;
            if (activePlayerCount >= 10) throw new Error('Room is full (Max 10 active players)');

            // C. Check for historical score (for free rooms re-entry)
            let recoveredScore = 0;
            let recoveredRoundsCount = 0;

            if (!room.clubId) {
                // 仅自由房间支持积分恢复
                console.log(`Checking historical scores for player ${openId} in room ${room.roomId}`);

                // 查询所有包含该玩家积分的rounds（不使用limit，确保获取完整历史）
                const roundsRes = await transaction.collection('rounds')
                    .where({
                        roomDocId: docId,
                        [`scores.${openId}`]: _.exists(true)
                    })
                    .field({ scores: true, timestamp: true })
                    .get();

                if (roundsRes.data && roundsRes.data.length > 0) {
                    // 计算历史累计积分和局数
                    roundsRes.data.forEach(round => {
                        if (round.scores && round.scores[openId] !== undefined) {
                            recoveredScore += round.scores[openId];
                            recoveredRoundsCount++;
                        }
                    });
                    console.log(`Recovered ${recoveredScore} points from ${recoveredRoundsCount} rounds for player ${openId} re-joining room ${room.roomId}`);
                }
            }

            // D. Add Player to Room (with recovered score if applicable)
            const newPlayer = {
                ...userInfo,
                id: openId,
                openId: openId,
                totalScore: recoveredScore, // 恢复历史积分
                isHost: false
            };

            const updatedPlayers = syncHostFlags([...players, newPlayer], room.host);

            await transaction.collection('rooms').doc(docId).update({
                data: { players: updatedPlayers }
            });

            return {
                joined: true,
                docId: docId,
                openId: openId,
                recoveredScore: recoveredScore > 0 ? recoveredScore : undefined,
                recoveredRoundsCount: recoveredRoundsCount > 0 ? recoveredRoundsCount : undefined
            };
        });

        return { success: true, ...result };

    } catch (err) {
        console.error(err);
        return { success: false, msg: err.message || 'Join failed' };
    }
};
