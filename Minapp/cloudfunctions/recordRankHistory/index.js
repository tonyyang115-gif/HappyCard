// cloudfunctions/recordRankHistory/index.js
const cloud = require('wx-server-sdk');

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

const DBAdapter = require('../common/dbWrapper');

/**
 * 记录排名历史
 * @param {string} clubId - 圈子ID
 * @param {number} rank - 排名
 * @returns {object} 操作结果
 */
exports.main = async (event, context) => {
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    const wxContext = cloud.getWXContext();
    const openId = wxContext.OPENID;

    const { clubId, rank } = event;

    if (!clubId || rank === undefined || rank === null) {
        return { success: false, msg: 'Missing required parameters: clubId or rank' };
    }

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 检查今天是否已记录该圈子的排名
        const recordRes = await db.collection('rank_history')
            .where({
                clubId: clubId,
                date: db.serverDate({
                    gte: today
                })
            })
            .get();

        if (recordRes.data.length === 0) {
            // 首次记录，创建新记录
            await db.collection('rank_history').add({
                data: {
                    clubId: clubId,
                    date: db.serverDate(),
                    ranks: [
                        {
                            openId: openId,
                            rank: rank,
                            timestamp: db.serverDate()
                        }
                    ]
                }
            });

            console.log(`Created new rank history for club ${clubId}, rank: ${rank}`);
        } else {
            // 更新现有记录
            const existing = recordRes.data[0];
            const ranks = existing.ranks || [];

            // 检查是否已经记录过该用户的排名
            const existingUserIndex = ranks.findIndex(r => r.openId === openId);

            if (existingUserIndex >= 0) {
                // 更新现有用户的排名（只保留最新一次）
                ranks[existingUserIndex] = {
                    openId: openId,
                    rank: rank,
                    timestamp: db.serverDate()
                };
            } else {
                // 添加新用户的排名
                ranks.push({
                    openId: openId,
                    rank: rank,
                    timestamp: db.serverDate()
                });
            }

            await db.collection('rank_history').doc(existing._id).update({
                data: { ranks: ranks }
            });

            console.log(`Updated rank history for club ${clubId}, openId: ${openId}, rank: ${rank}`);
        }

        return { success: true };

    } catch (err) {
        console.error('Record rank history failed:', err);
        return {
            success: false,
            msg: err.message || 'Record failed',
            error: err
        };
    }
};
