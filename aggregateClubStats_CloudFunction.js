const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * Cloud Function to aggregate global statistics for a club.
 * Trigger this manually or via a backend trigger when a room is settled.
 */
exports.main = async (event, context) => {
    const { clubId } = event
    if (!clubId) return { success: false, msg: 'clubId required' }

    try {
        // 1. Fetch ALL rooms for this club (limit 1000 for safety, add pagination if needed)
        const roomRes = await db.collection('rooms')
            .where({ clubId: clubId })
            .field({ players: true })
            .limit(1000)
            .get()

        const rooms = roomRes.data
        const playerMap = {}
        const playerWins = {}
        const playerGames = {}
        const playerInfo = {}

        rooms.forEach(r => {
            if (r.players) {
                r.players.forEach(p => {
                    const uid = p.openid || p.id
                    if (!playerMap[uid]) {
                        playerMap[uid] = 0
                        playerWins[uid] = 0
                        playerGames[uid] = 0
                        playerInfo[uid] = { name: p.name, avatar: p.avatarUrl }
                    }
                    playerMap[uid] += (p.totalScore || 0)
                    playerGames[uid]++
                    if ((p.totalScore || 0) > 0) {
                        playerWins[uid]++
                    }
                })
            }
        })

        let maxScore = -99999
        let championId = null
        let maxWinRate = -1
        let winRateKingId = null

        // Threshold: Need at least 3 games to be the King
        const MIN_GAMES = 3

        Object.keys(playerMap).forEach(uid => {
            // Big Winner logic
            if (playerMap[uid] > maxScore) {
                maxScore = playerMap[uid]
                championId = uid
            }

            // Win Rate logic
            if (playerGames[uid] >= MIN_GAMES) {
                const rate = playerWins[uid] / playerGames[uid]
                if (rate > maxWinRate) {
                    maxWinRate = rate
                    winRateKingId = uid
                }
            }
        })

        const stats = {
            version: 'v2', // Indicate Cloud Aggregated
            totalGames: rooms.length,
            champion: championId ? playerInfo[championId] : { name: '暂无数据', avatar: '' },
            winRateKing: winRateKingId ? {
                ...playerInfo[winRateKingId],
                rate: Math.round(maxWinRate * 100) + '%'
            } : { name: '场次不足', avatar: '', rate: '-' },
            updatedAt: db.serverDate()
        }

        // 2. Update the Club document with pre-calculated stats
        await db.collection('clubs').doc(clubId).update({
            data: {
                stats: stats
            }
        })

        return {
            success: true,
            stats: stats
        }

    } catch (err) {
        console.error(err)
        return { success: false, err: err }
    }
}
