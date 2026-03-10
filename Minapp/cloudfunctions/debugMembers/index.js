const cloud = require('wx-server-sdk');

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
});

exports.main = async (event, context) => {
    const db = cloud.database();
    const { clubId } = event;

    if (!clubId) return { success: false, msg: 'Missing clubId' };

    console.log(`[DebugMembers] scanning members for clubId: ${clubId}`);

    try {
        const collections = ['club_members', 'dev_club_members'];
        const results = {};

        for (const col of collections) {
            try {
                // Find members for this club
                // Note: club_members _id is typically `${clubId}_${openId}`
                // Queries strictly by clubId field
                const cmd = db.command;
                const membersRes = await db.collection(col).where(
                    cmd.or([
                        { clubId: String(clubId) },
                        { clubId: Number(clubId) }
                    ])
                ).get();

                results[col] = membersRes.data.map(m => ({
                    _id: m._id,
                    name: m.name,
                    role: m.role,
                    stats: m.stats || 'MISSING'
                }));

            } catch (e) {
                results[col] = `Error: ${e.message}`;
            }
        }

        return {
            success: true,
            env: cloud.getWXContext().ENV,
            analysis: results
        };

    } catch (e) {
        return { success: false, msg: e.message, stack: e.stack };
    }
};
