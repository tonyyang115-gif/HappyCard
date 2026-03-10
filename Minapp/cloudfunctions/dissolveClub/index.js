// cloudfunctions/dissolveClub/index.js
const cloud = require('wx-server-sdk');
const DBAdapter = require('../common/dbWrapper');

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;

    // Initialize DB Adapter
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    const { clubId } = event;

    if (!clubId) {
        return { success: false, msg: 'Missing clubId' };
    }

    try {
        // ===== 阶段1: 验证与锁定 =====
        const clubRes = await db.collection('clubs').doc(clubId).get();
        if (!clubRes.data) return { success: false, msg: 'Club not found' };

        const club = clubRes.data;
        if (club.ownerId !== openId) {
            return { success: false, msg: 'Permission denied' };
        }

        // 检查是否已在删除中
        if (club.status === 'deleting') {
            return { success: false, msg: '圈子正在解散中，请稍后' };
        }

        // 添加删除中标记，防止并发操作
        await db.collection('clubs').doc(clubId).update({
            data: {
                status: 'deleting',
                deletingAt: db.serverDate()
            }
        });

        const numericClubId = club.clubId;
        console.log(`Starting dissolution for Club Doc [${clubId}] (ID: ${numericClubId})`);

        const deletionLog = {
            clubDocId: clubId,
            clubId: numericClubId,
            ownerId: openId,
            startTime: new Date(),
            membersDeleted: 0,
            roomsDeleted: 0,
            roundsDeleted: 0
        };

        // ===== 阶段2: 级联删除(带进度记录) =====

        // A. Delete club_members (New Scalable Table)
        if (numericClubId) {
            let hasMoreMembers = true;
            while (hasMoreMembers) {
                const res = await db.collection('club_members')
                    .where({ clubId: numericClubId })
                    .limit(100)
                    .remove();
                deletionLog.membersDeleted += res.stats.removed;

                if (res.stats.removed === 0) hasMoreMembers = false;

                // 防止超时，分批提交
                if (deletionLog.membersDeleted % 500 === 0) {
                    console.log(`Progress: ${deletionLog.membersDeleted} members deleted`);
                }
            }
            console.log(`Deleted ${deletionLog.membersDeleted} club_members records.`);
        }

        // B. Delete rooms and rounds (批量，带回滚能力)
        let hasMoreRooms = true;

        while (hasMoreRooms) {
            const roomsBatch = await db.collection('rooms')
                .where({ clubId })
                .limit(50) // 减小批次避免超时
                .get();

            const rooms = roomsBatch.data;
            if (rooms.length === 0) {
                hasMoreRooms = false;
                break;
            }

            const roomDocIds = rooms.map(r => r._id);
            const displayRoomIds = rooms.map(r => r.roomId);

            // 先删除rounds
            if (displayRoomIds.length > 0) {
                const roundRes = await db.collection('rounds')
                    .where({ roomId: _.in(displayRoomIds) })
                    .remove();
                deletionLog.roundsDeleted += roundRes.stats.removed;
            }

            // 再删除rooms
            const roomRes = await db.collection('rooms')
                .where({ _id: _.in(roomDocIds) })
                .remove();
            deletionLog.roomsDeleted += roomRes.stats.removed;

            console.log(`Batch: ${roomRes.stats.removed} rooms, ${deletionLog.roundsDeleted} total rounds`);
        }

        // ===== 阶段3: 最终删除club元数据 =====
        await db.collection('clubs').doc(clubId).remove();

        // ===== 阶段4: 记录完成 =====
        deletionLog.endTime = new Date();
        deletionLog.success = true;

        return {
            success: true,
            summary: {
                members: deletionLog.membersDeleted,
                rooms: deletionLog.roomsDeleted,
                rounds: deletionLog.roundsDeleted
            }
        };

    } catch (err) {
        console.error('Dissolve Error:', err);

        // 尝试回滚状态标记
        try {
            await db.collection('clubs').doc(clubId).update({
                data: {
                    status: _.remove(),
                    deletingAt: _.remove()
                }
            });
            console.log('Status rollback successful');
        } catch (rollbackErr) {
            console.error('Rollback failed:', rollbackErr);
        }

        return {
            success: false,
            msg: err.message || '解散失败'
        };
    }
};
