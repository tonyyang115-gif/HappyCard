// cloudfunctions/updateProfile/index.js
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

    const { roomId, userInfo, type } = event; // roomId is optional for global sync

    if (!userInfo) {
        return { success: false, msg: 'Missing userInfo' };
    }

    try {
        // --- Mode 1: Global Profile Sync (New Architecture) ---
        // Triggered when type is 'sync' or roomId is missing
        if (type === 'sync' || !roomId) {
            const { name, avatarUrl } = userInfo;

            // 0. Safety Check
            if (name && name.length > 12) {
                return { success: false, msg: 'Nickname too long' };
            }

            // A. Update club_members collection (Scalable)
            const memberUpdateRes = await db.collection('club_members').where({
                openId: openId
            }).update({
                data: {
                    name: name,
                    avatar: avatarUrl
                }
            });

            // B. Update clubs snapshot (Legacy compat)
            // 优化：限制为最近10个圈子，避免超时
            const clubsToUpdate = await db.collection('clubs').where({
                'members.openId': openId
            }).field({ _id: true, members: true }).limit(10).get();

            const clubUpdatePromises = clubsToUpdate.data.map(club => {
                const updatedMembers = (club.members || []).map(m => {
                    if (m.openId === openId) {
                        return { ...m, name: name, avatar: avatarUrl };
                    }
                    return m;
                });

                return db.collection('clubs').doc(club._id).update({
                    data: { members: updatedMembers }
                });
            });

            // C. Update Recent Rooms (History Sync)
            // 优化：限制为最近10个房间，避免超时
            const roomsToUpdate = await db.collection('rooms').where({
                'players.id': openId
            }).orderBy('_createTime', 'desc').limit(10).field({ _id: true, players: true, hostInfo: true, hostId: true }).get();

            const roomUpdatePromises = roomsToUpdate.data.map(room => {
                const updateData = {};

                // Update players array
                const updatedPlayers = (room.players || []).map(p => {
                    if (p.id === openId) {
                        return { ...p, name: name, avatarUrl: avatarUrl };
                    }
                    return p;
                });
                updateData.players = updatedPlayers;

                // Update hostInfo if the player is the host
                if (room.hostId === openId || (room.hostInfo && room.hostInfo.openid === openId)) {
                    updateData.hostInfo = {
                        ...(room.hostInfo || {}),
                        nickName: name,
                        avatarUrl: avatarUrl,
                        openid: openId
                    };
                }

                return db.collection('rooms').doc(room._id).update({
                    data: updateData
                });
            });

            // 批量执行更新，添加超时控制（15秒超时）
            const UPDATE_TIMEOUT = 15000;
            await Promise.race([
                Promise.all([...clubUpdatePromises, ...roomUpdatePromises]),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Update timeout')), UPDATE_TIMEOUT)
                )
            ]);

            return {
                success: true,
                mode: 'global',
                updatedCounts: {
                    members: memberUpdateRes.stats.updated,
                    clubs: clubsToUpdate.data.length,
                    rooms: roomsToUpdate.data.length,
                    note: '已优化为最近10个圈子和10个房间，剩余历史将在下次同步'
                }
            };
        }

        // --- Mode 2: Room-Specific Profile Update (Old Logic) ---
        const res = await db.collection('rooms').where({
            _id: roomId,
            'players.id': openId
        }).update({
            data: {
                'players.$.name': userInfo.name,
                'players.$.avatarUrl': userInfo.avatarUrl
            }
        });

        return {
            success: true,
            mode: 'room',
            stats: res.stats
        };

    } catch (err) {
        console.error('Update Profile Error:', err);
        return { success: false, msg: err.message || 'Update failed' };
    }
};
