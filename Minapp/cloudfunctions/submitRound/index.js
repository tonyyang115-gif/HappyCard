// cloudfunctions/submitRound/index.js
const cloud = require('wx-server-sdk');
const Validator = require('./validator');
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

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;

    // Initialize DB Adapter
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    // input: docId (Room ID), scores (Object {uid: score}), type ('game'|'transfer')
    const { docId, scores, type } = event;

    try {
        // ===== 输入验证 =====
        if (!docId) {
            throw new Error('房间ID不能为空');
        }

        // 验证type
        if (type && !['game', 'transfer'].includes(type)) {
            throw new Error('记分类型错误');
        }

        // 验证scores对象
        Validator.validateScores(scores);

        const keys = Object.keys(scores);
        const now = Date.now();

        // 转账特殊限制
        if (type === 'transfer' && keys.length > 3) {
            throw new Error('单次转账最多涉及3人');
        }

        const result = await db.runTransaction(async transaction => {
            // 1. Get Room State (Atomic)
            const roomRes = await transaction.collection('rooms').doc(docId).get();
            if (!roomRes.data) throw new Error('房间不存在');
            const room = roomRes.data;

            // Lifecycle Lock: Prevent adding scores to finished/abandoned rooms
            if (room.status && room.status !== 'active') {
                throw new Error('房间已结算或关闭');
            }

            // 2. Security Validation
            if (type === 'transfer') {
                // 验证所有涉及玩家都在房间内且是活跃玩家
                for (const uid of keys) {
                    const player = room.players.find(p =>
                        String(p.id) === String(uid)
                    );
                    if (!player) {
                        throw new Error(`玩家不在房间内`);
                    }
                    // 禁止向已退出玩家转账
                    if (player.hasLeft === true) {
                        throw new Error(`该玩家已退出房间，无法转账`);
                    }
                }

                // Security: Must be authorized to deduct points
                const unauthorized = keys.some(uid => {
                    const amount = scores[uid];
                    if (amount >= 0) return false;
                    // Check if openId matches the uid being deducted
                    // Standard: player.id === openId
                    if (String(uid) === String(openId)) return false;

                    const p = room.players.find(player => String(player.id) === String(uid));
                    if (!p) return true;
                    return (p.openId !== openId && p._openid !== openId);
                });
                if (unauthorized) throw new Error('权限不足:只能从自己的账号扣分');
            } else {
                // Game type: 禁止给已退出玩家记分
                const leftPlayers = keys.filter(uid => {
                    const player = room.players.find(p => String(p.id) === String(uid));
                    return player && player.hasLeft === true;
                });

                if (leftPlayers.length > 0) {
                    throw new Error(`无法给已退出房间的玩家记分`);
                }
            }

            // 3. Create Round Record
            const newRound = {
                roomId: room.roomId, // 6-digit ID
                roomDocId: docId,
                clubId: room.clubId || null,
                scores: scores,
                type: type || 'game',
                timestamp: now,
                playerCount: Object.keys(scores).length,
                _openid: openId
            };

            // 4. Update Players (Scores)
            const updatedPlayers = room.players.map(p => {
                const s = scores[p.id];
                if (s) {
                    return { ...p, totalScore: (p.totalScore || 0) + s };
                }
                return p;
            });

            // 5. Execute Writes
            // A. Add Round Record
            await transaction.collection('rounds').add({ data: newRound });

            // B. Update Room (Only update players' scores, no stats)
            const roomUpdate = {
                players: updatedPlayers,
                updatedAt: db.serverDate()
            };
            await transaction.collection('rooms').doc(docId).update({ data: roomUpdate });

            // C. Security Check: Ensure club exists (if room belongs to a club)
            if (room.clubId) {
                const clubRes = await transaction.collection('clubs').doc(room.clubId).get();
                if (!clubRes.data) {
                    throw new Error('关联圈子已解散，无法执行操作');
                }
            }

            return { success: true };
        });

        return { success: true, ...result };

    } catch (err) {
        console.error('Submit Error:', err);
        return {
            success: false,
            msg: err.message || '提交失败,请重试'
        };
    }
};
