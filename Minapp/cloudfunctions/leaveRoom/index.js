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

// Helper: Resolve Public ID (6-digit) or DocID (UUID) to a valid DocID
async function resolveRoomDocId(db, inputId) {
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

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;
    const { docId } = event;

    // 1. 初始化数据库适配器 (Environment Injection)
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    if (!docId) {
        return { success: false, msg: '缺少房间ID' };
    }

    // Resolve DocID Standardized
    const resolvedDocId = await resolveRoomDocId(db, docId);
    if (!resolvedDocId) {
        return { success: false, msg: '房间不存在' };
    }
    // Use resolvedDocId for the rest of the function
    const targetDocId = resolvedDocId;

    try {
        const result = await db.runTransaction(async transaction => {
            // 1. 获取房间信息
            const roomRes = await transaction.collection('rooms').doc(targetDocId).get();
            if (!roomRes.data) throw new Error('房间不存在');

            const room = roomRes.data;

            // 2. 安全检查：只有自由房间允许主动退出
            if (room.clubId) {
                throw new Error('圈子房间不允许中途退出，请返回圈子页面');
            }

            // 3. 安全检查：房间必须处于活跃状态
            if (room.status && room.status !== 'active') {
                throw new Error('房间已结束，无法执行退出操作');
            }

            // 4. 检查玩家是否在房间中
            const playerIndex = room.players.findIndex(p =>
                String(p.id) === String(openId) || String(p.openid) === String(openId)
            );

            if (playerIndex === -1) {
                return { success: true, msg: '您不在房间中' };
            }

            // 5. 软删除逻辑：标记玩家已退出（不删除，保留积分和历史）
            let newHostId = null;
            const isHost = getIdentityCandidates(room.host).includes(String(openId));

            // 软删除：将玩家标记为已退出，保留在数组中
            room.players[playerIndex].hasLeft = true;
            let updatedPlayers = room.players;

            let updateData = {
                players: updatedPlayers,
                updatedAt: db.serverDate()
            };

            // 6. 智能处理房主退出（新房主必须是活跃玩家）
            if (isHost) {
                // 过滤出所有活跃玩家（hasLeft !== true）
                const activePlayers = updatedPlayers.filter(p => p.hasLeft !== true);

                if (activePlayers.length > 0) {
                    // 自动转移房主权限给第一个活跃玩家
                    const newHost = activePlayers[0];
                    newHost.isHost = true;
                    newHostId = newHost.id;
                    updateData.host = newHost;
                    console.log(`Host transferred from ${openId} to ${newHost.id} (${newHost.name})`);
                } else {
                    // 房主是最后一人，允许退出（房间变空）
                    console.log(`Last player (host) leaving room ${room.roomId}`);
                }
            }

            // 6. 更新房间数据
            await transaction.collection('rooms').doc(targetDocId).update({
                data: updateData
            });

            console.log(`Player ${openId} marked as left in room ${room.roomId}, ${updatedPlayers.length} total players, ${updatedPlayers.filter(p => !p.hasLeft).length} active`);

            return {
                success: true,
                left: true,
                remainingPlayers: updatedPlayers.length,
                newHostId: newHostId // 返回新房主ID（如果有）
            };
        });

        return { success: true, ...result };

    } catch (err) {
        console.error('Leave Room Error:', err);
        return {
            success: false,
            msg: err.message || '退出失败，请重试'
        };
    }
};
