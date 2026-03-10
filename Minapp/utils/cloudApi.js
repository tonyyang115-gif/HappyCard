/**
 * 云函数调用适配器
 * 用于自动注入开发环境标记
 */

const call = (name, data = {}) => {
    return new Promise((resolve, reject) => {
        let finalData = { ...data };

        // 1. 获取当前环境版本
        try {
            // 检查 wx.getAccountInfoSync 是否可用
            if (wx.getAccountInfoSync) {
                const accountInfo = wx.getAccountInfoSync();
                const envVersion = accountInfo.miniProgram.envVersion;

                // 2. 环境判断逻辑：只要不是 release，都视为开发/测试环境
                if (envVersion !== 'release') {
                    finalData.__env = 'dev';
                    console.log(`[CloudApi] Using DEV environment for function: ${name}`);
                }
                // Release 版不注入标记，保持静默和清洁
            }
        } catch (e) {
            console.error('[CloudApi] Environment detection failed:', e);
            // 降级处理：不注入标记，默认生产
        }

        // 3. 调用云函数
        wx.cloud.callFunction({
            name: name,
            data: finalData,
            success: res => {
                resolve(res);
            },
            fail: err => {
                console.error(`[CloudApi] Call ${name} failed:`, err);
                reject(err);
            }
        });
    });
};

/**
 * 获取当前环境版本信息，用于 UI 展示
 */
const getEnvLabel = () => {
    try {
        if (wx.getAccountInfoSync) {
            const accountInfo = wx.getAccountInfoSync();
            const env = accountInfo.miniProgram.envVersion;
            if (env === 'develop') return 'Dev';
            if (env === 'trial') return 'Trial';
            return ''; // Release 不返回标签
        }
    } catch (e) {
        return '';
    }
    return '';
}


/**
 * 获取环境自适应的集合名称
 * @param {string} name 原始集合名称
 */
const collectionName = (name) => {
    try {
        if (wx.getAccountInfoSync) {
            const accountInfo = wx.getAccountInfoSync();
            const env = accountInfo.miniProgram.envVersion;
            // 只要不是 release 环境，都使用 dev_ 前缀
            if (env !== 'release') {
                return 'dev_' + name;
            }
        }
    } catch (e) {
        console.error('[CloudApi] Collection env detection failed:', e);
    }
    return name;
};

module.exports = {
    call,
    getEnvLabel,
    collectionName
};
