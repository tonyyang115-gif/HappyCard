// cloudfunctions/getClubDetail/index.js
const cloud = require('wx-server-sdk');

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

// [DEBUG] Inlined DBAdapter
class DBAdapter {
    constructor(cloud, env) {
        this.cloud = cloud;
        this.db = cloud.database();
        this.envPrefix = (env === 'dev') ? 'dev_' : '';
        console.log(`[DBAdapter] Initialized with env: ${env}, prefix: ${this.envPrefix}`);

        this.command = this.db.command;
    }

    collection(name) {
        const targetName = this.envPrefix + name;
        console.log(`[DB] Use collection: ${targetName}`);
        return this.db.collection(targetName);
    }
}

exports.main = async (event, context) => {
    const { clubId } = event; // This is the Document ID (_id)
    const db = new DBAdapter(cloud, event.__env);

    if (!clubId) {
        return { success: false, msg: 'Missing clubId' };
    }

    try {
        const res = await db.collection('clubs').doc(clubId).get();
        return {
            success: true,
            data: res.data
        };
    } catch (err) {
        console.error('getClubDetail failed', err);
        return {
            success: false,
            msg: err.message || '获取圈子详情失败',
            error: err
        };
    }
};
