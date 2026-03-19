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

function getIdentityCandidates(entity) {
    if (!entity) return [];
    return [entity.id, entity.openId, entity.openid]
        .filter(value => value !== undefined && value !== null && value !== '')
        .map(value => String(value));
}

exports.main = async (event, context) => {
    // [DEBUG] Loud Log to confirm code update
    console.log('!!! updateRoom EXECUTION STARTED (INLINED ADAPTER) !!!');
    console.log('Event received:', JSON.stringify(event, null, 2));

    const wxContext = cloud.getWXContext();
    // 增加 openId 的鲁棒性获取：有些本地调试环境可能字段不一致
    const openId = wxContext.OPENID || wxContext.FROM_OPENID || event.userInfo?.openId;

    if (!openId) {
        console.error('[updateRoom] No OpenID found in context or event');
        // 在本地调试时，如果没有登录态，collection.get 可能因为缺少凭证而报 missing secretId
        // 建议用户开启本地调试的“在此处登录”或确保 IDE 已登录
    }

    // 1. 初始化数据库适配器
    const db = new DBAdapter(cloud, event.__env);
    
    // 2. Destructure parameters
    const { action, roomId, settings } = event;

    if (!roomId) {
        return { success: false, msg: 'Missing roomId' };
    }

    try {
        if (action === 'updateSettings') {
            const { baseScore } = settings;
            
            if (baseScore === undefined || baseScore === null) {
                return { success: false, msg: 'Missing setting value' };
            }

            console.log(`[updateRoom] Updating logic for room ${roomId} by ${openId}`);

            // 直接获取房间文档进行校验，移除事务以支持本地调试
            let roomDoc;
            try {
                roomDoc = await db.collection('rooms').doc(roomId).get();
            } catch (e) {
                const queryRes = await db.collection('rooms').where({ roomId: roomId }).get();
                if (queryRes.data.length > 0) {
                    roomDoc = { data: queryRes.data[0] };
                } else {
                    throw new Error('Room not found');
                }
            }

            const room = roomDoc.data;

            // 增强权限校验逻辑
            const hostIds = getIdentityCandidates(room.host);
            if (!hostIds.includes(String(openId))) {
                throw new Error('Permission denied: Only host can change settings');
            }

            const targetDocId = room._id;

            await db.collection('rooms').doc(targetDocId).update({
                data: {
                    baseScore: Number(baseScore)
                }
            });

            return { success: true, baseScore: Number(baseScore) };
        }

        return { success: false, msg: 'Unknown action' };

    } catch (err) {
        console.error(err);
        return { success: false, msg: err.message || 'Internal Error' };
    }
};
