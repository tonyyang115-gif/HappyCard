const cloud = require('wx-server-sdk');

// Hardcoded Env ID for stability in timers
const CLOUD_ENV = 'cloud1-7go9rrf32b9c9cbc';

cloud.init({
    env: CLOUD_ENV
});

exports.main = async (event, context) => {
    const db = cloud.database();
    const _ = db.command;
    const now = new Date();
    // 24 hours ago
    const threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    console.log(`[Cleanup] Starting zombie room cleanup. Threshold: ${threshold.toISOString()}`);

    try {
        // Query for Zombie Rooms
        // 1. Status is 'active'
        // 2. updatedAt is older than 24 hours
        // Limit 100 per run to match system limits
        const zombiesSnap = await db.collection('rooms')
            .where({
                status: 'active',
                updatedAt: _.lt(threshold)
            })
            .limit(100)
            .get();

        const zombies = zombiesSnap.data || [];
        console.log(`[Cleanup] Found ${zombies.length} zombie rooms.`);

        if (zombies.length === 0) {
            return { success: true, count: 0 };
        }

        const tasks = zombies.map(async (room) => {
            console.log(`[Cleanup] Settling room ${room._id} (Last active: ${room.updatedAt})`);
            return await db.collection('rooms').doc(room._id).update({
                data: {
                    status: 'settled',
                    settledAt: db.serverDate(),
                    settledBy: 'system_auto_cleanup',
                    autoSettled: true
                }
            });
        });

        await Promise.all(tasks);

        return {
            success: true,
            count: zombies.length,
            ids: zombies.map(r => r._id)
        };

    } catch (err) {
        console.error('[Cleanup] Error:', err);
        return { success: false, error: err };
    }
};
