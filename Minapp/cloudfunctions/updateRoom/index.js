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
    const openId = wxContext.OPENID; // Secure ID

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

            return await db.runTransaction(async transaction => {
                // Get Room Doc
                // If roomId is 6 digits, we need to query first or assume it's passed as DocID?
                // The frontend passes Doc ID usually for safety in cloud functions, but check `roomId` parameter usage.
                // In manageClub/createRoom logic, we often use DocId if available.
                // Let's assume `roomId` passed here is the DocID (_id) for direct access.
                // If not, we have to query.
                
                // Let's try to get by Doc ID
                let roomDoc;
                try {
                    roomDoc = await transaction.collection('rooms').doc(roomId).get();
                } catch(e) {
                    // Try querying by display ID if Doc Get fails
                    const queryRes = await transaction.collection('rooms').where({ roomId: roomId }).get();
                    if (queryRes.data.length > 0) {
                        roomDoc = { data: queryRes.data[0] };
                    } else {
                         throw new Error('Room not found');
                    }
                }
                
                const room = roomDoc.data;

                // Validate Permissions: Only Host can update settings
                const hostIds = getIdentityCandidates(room.host);
                if (!hostIds.includes(String(openId))) {
                    throw new Error('Permission denied: Only host can change settings');
                }

                // Construct Update Data
                // If using Doc ID, we update by roomId (DocID)
                // If resolved by query, we use room._id
                const targetDocId = room._id;

                await transaction.collection('rooms').doc(targetDocId).update({
                    data: {
                        baseScore: Number(baseScore)
                    }
                });

                return { success: true, baseScore: Number(baseScore) };
            });
        }

        return { success: false, msg: 'Unknown action' };

    } catch (err) {
        console.error(err);
        return { success: false, msg: err.message || 'Internal Error' };
    }
};
