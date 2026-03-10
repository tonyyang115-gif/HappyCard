// cloudfunctions/createClub/index.js
const cloud = require('wx-server-sdk');

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const DBAdapter = require('../common/dbWrapper');

exports.main = async (event, context) => {
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;

    const { name, desc, avatar } = event;

    if (!name) {
        return { success: false, msg: '名称不能为空' };
    }

    try {
        // 1. Generate Unique Club ID (Number)
        let clubId = null;
        let retries = 10;
        while (retries > 0) {
            const candidate = Math.floor(100000 + Math.random() * 900000);
            const check = await db.collection('clubs').where({ clubId: candidate }).count();
            if (check.total === 0) {
                clubId = candidate;
                break;
            }
            retries--;
        }

        if (!clubId) {
            return { success: false, msg: 'ID 分配失败，请重试' };
        }

        // 2. Add to Database
        // 2a. Create Club Document
        const res = await db.collection('clubs').add({
            data: {
                clubId: clubId,
                name: name,
                desc: desc || '',
                avatar: avatar,
                ownerId: openId,
                members: [{
                    openId: openId,
                    name: event.userInfo ? event.userInfo.name : '圈主',
                    avatar: event.userInfo ? event.userInfo.avatarUrl : avatar,
                    joinedAt: db.serverDate()
                }],
                roomCount: 0,
                createdAt: db.serverDate(),
                // ⭐ 初始化统计字段
                stats: {
                    totalGames: 0,
                    version: 'v3',
                    lastUpdatedAt: db.serverDate()
                }
            }
        });

        // 2b. Add to club_members collection (New Scalable Architecture)
        // Use Deterministic ID: {clubId}_{openId} for future O(1) lookups
        await db.collection('club_members').doc(`${clubId}_${openId}`).set({
            data: {
                clubId: clubId,
                openId: openId,
                name: event.userInfo ? event.userInfo.name : '圈主',
                avatar: event.userInfo ? event.userInfo.avatarUrl : avatar,
                role: 'owner',
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

        return {
            success: true,
            clubId: clubId,
            docId: res._id
        };

    } catch (err) {
        console.error(err);
        return { success: false, msg: err.message || '内部错误' };
    }
};
