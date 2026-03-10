/**
 * 历史数据局数对账脚本 - 一次性运行
 * 使用方法：在微信开发者工具中创建一个临时云函数，粘贴此代码并运行。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const DBAdapter = require('../common/dbWrapper');

exports.main = async (event, context) => {
    const db = new DBAdapter(cloud, event.__env);
    const _ = db.command;

    console.log('--- 启动全站局数统计对账 ---');

    // 1. 获取所有圈子 (分页处理以防超时)
    const MAX_LIMIT = 100;
    const countRes = await db.collection('clubs').count();
    const totalClubs = countRes.total;
    const batchCount = Math.ceil(totalClubs / MAX_LIMIT);

    let processed = 0;
    let fixed = 0;

    for (let i = 0; i < batchCount; i++) {
        const res = await db.collection('clubs').skip(i * MAX_LIMIT).limit(MAX_LIMIT).get();

        for (const club of res.data) {
            const clubId = club._id;

            // 2. 查询物理房间数
            const actualCountRes = await db.collection('rooms').where({
                clubId: clubId
            }).count();

            const actualTotal = actualCountRes.total;
            const cachedTotal = (club.stats && club.stats.totalGames) || 0;

            // 3. 只有在不一致时才更新
            if (actualTotal !== cachedTotal) {
                console.log(`圈子 ${club.name} (${clubId}): 缓存 ${cachedTotal} -> 实际 ${actualTotal}. 修复中...`);
                await db.collection('clubs').doc(clubId).update({
                    data: {
                        'stats.totalGames': actualTotal,
                        'stats.updatedAt': db.serverDate(),
                        'stats.reconciledByScript': true
                    }
                });
                fixed++;
            }
            processed++;
        }
    }

    return {
        success: true,
        totalClubs,
        processed,
        fixedWays: fixed,
        msg: `对账完成。共处理 ${processed} 个圈子，修复了 ${fixed} 个偏差项。`
    };
};
