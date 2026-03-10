// cloudfunctions/createRoom/index.js
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

exports.main = async (event, context) => {
    // [DEBUG] Loud Log to confirm code update
    console.log('!!! createRoom EXECUTION STARTED (INLINED ADAPTER) !!!');
    console.log('Event received:', JSON.stringify(event, null, 2));

    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID; // Secure ID

    // 1. 初始化数据库适配器
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    const { clubId, userInfo } = event;

    if (!userInfo) {
        return { success: false, msg: 'Missing parameters' };
    }

    try {
        // 2. Generate Unique Room ID Candidate
        let roomId = null;
        let retries = 20;
        while (retries > 0) {
            const candidate = Math.floor(100000 + Math.random() * 900000).toString();
            // Rapid check outside transaction
            const check = await db.collection('rooms').where({ roomId: candidate }).count();
            if (check.total === 0) {
                roomId = candidate;
                break;
            }
            retries--;
        }

        if (!roomId) {
            return { success: false, msg: '服务器繁忙，请稍后再试' };
        }

        // 3. Transaction: Create Room & Final Collision Check
        const result = await db.runTransaction(async transaction => {
            // A. Identity/Status Check
            if (clubId) {
                const clubDoc = await transaction.collection('clubs').doc(clubId).get();
                if (!clubDoc.data) {
                    throw new Error('CLUB_NOT_FOUND');
                }
                if (clubDoc.data.status === 'deleting') {
                    throw new Error('CLUB_IS_DELETING');
                }
            }

            // B. Final collision check
            const collisionCheck = await transaction.collection('rooms').where({ roomId: roomId }).get();
            if (collisionCheck.data.length > 0) {
                throw new Error('ID_COLLISION_DURING_TRANSACTION');
            }

            const createTime = db.serverDate;
            const hostPlayer = {
                ...userInfo,
                id: openId,
                openId: openId,
                isHost: true,
                totalScore: 0,
                remainder: 0
            };

            const newRoom = {
                roomId: roomId,
                clubId: clubId || null,
                host: hostPlayer,
                players: [hostPlayer],
                rounds: [],
                status: 'active',
                totalRounds: 0,
                gameCount: 0,
                createdAt: createTime,
                updatedAt: createTime,
                _createTime: Date.now()
            };

            const roomRes = await transaction.collection('rooms').add({ data: newRoom });
            const docId = roomRes._id;

            if (clubId) {
                await transaction.collection('clubs').doc(clubId).update({
                    data: {
                        roomCount: _.inc(1)
                        // 'stats.totalGames': _.inc(1) // Removed to prevent double counting (handled in settleRoom)
                    }
                });
            }

            return docId;
        });

        return {
            success: true,
            roomId: roomId,
            docId: result,
            openId: openId
        };

    } catch (err) {
        console.error(err);
        return { success: false, msg: err.message || 'Internal Error' };
    }
};
