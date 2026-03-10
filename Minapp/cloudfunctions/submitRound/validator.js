// 通用验证工具
class Validator {
    // 验证分数对象
    static validateScores(scores) {
        if (!scores || typeof scores !== 'object') {
            throw new Error('分数数据格式错误');
        }

        const keys = Object.keys(scores);
        if (keys.length === 0) {
            throw new Error('分数数据不能为空');
        }

        if (keys.length > 10) {
            throw new Error('单次记分最多支持10名玩家');
        }

        // 验证每个分数值
        for (const uid of keys) {
            const score = scores[uid];
            
            // 类型检查
            if (typeof score !== 'number' || isNaN(score)) {
                throw new Error(`玩家 ${uid} 的分数格式错误`);
            }

            // 范围检查(-10000 到 10000,防止极端值)
            if (score < -10000 || score > 10000) {
                throw new Error('单次记分范围:-10000 到 10000');
            }

            // 精度检查(最多2位小数)
            if (!Number.isInteger(score * 100)) {
                throw new Error('分数最多支持2位小数');
            }
        }

        // 零和检验(整数化避免浮点误差)
        const totalInCents = keys.reduce((sum, uid) => 
            sum + Math.round(scores[uid] * 100), 0
        );
        
        if (totalInCents !== 0) {
            throw new Error('总分必须为零(当前总分:' + (totalInCents / 100) + ')');
        }

        return true;
    }

    // 验证房间ID
    static validateRoomId(roomId) {
        if (!roomId) {
            throw new Error('房间ID不能为空');
        }

        const idStr = String(roomId);
        
        // 6位数字ID或24位MongoDB ObjectId
        if (!/^\d{6}$/.test(idStr) && idStr.length !== 24) {
            throw new Error('房间ID格式错误');
        }

        return idStr;
    }

    // 验证用户信息
    static validateUserInfo(userInfo) {
        if (!userInfo || typeof userInfo !== 'object') {
            throw new Error('用户信息格式错误');
        }

        // 必需字段
        const required = ['name', 'avatarUrl'];
        for (const field of required) {
            if (!userInfo[field] || typeof userInfo[field] !== 'string') {
                throw new Error(`用户${field}信息缺失或格式错误`);
            }
        }

        // 长度限制
        if (userInfo.name.length > 20) {
            throw new Error('用户名长度不能超过20字符');
        }

        if (userInfo.avatarUrl && userInfo.avatarUrl.length > 500) {
            throw new Error('头像URL长度异常');
        }

        return true;
    }

    // 验证圈子ID
    static validateClubId(clubId) {
        if (!clubId) {
            throw new Error('圈子ID不能为空');
        }

        const idStr = String(clubId).trim();
        if (idStr.length === 0) {
            throw new Error('圈子ID不能为空');
        }

        return idStr;
    }

    // 验证操作类型
    static validateAction(action, allowedActions) {
        if (!action || typeof action !== 'string') {
            throw new Error('操作类型错误');
        }

        if (!allowedActions.includes(action)) {
            throw new Error(`不支持的操作:${action}`);
        }

        return action;
    }
}

module.exports = Validator;
