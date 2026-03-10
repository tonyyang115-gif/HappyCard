// utils/cacheManager.js
/**
 * 智能缓存管理系统
 * 支持TTL、自动清理、滑动窗口延期
 */
class CacheManager {
    constructor(defaultTTL = 5 * 60 * 1000) { // 默认5分钟
        this.cache = new Map();
        this.defaultTTL = defaultTTL;
        this.maxSize = 100; // 最大缓存数量
    }

    /**
     * 设置缓存
     * @param {string} key - 缓存键
     * @param {any} value - 缓存值
     * @param {number} ttl - 过期时间（毫秒），可选
     */
    set(key, value, ttl = this.defaultTTL) {
        // 检查缓存大小，超过则删除最旧的
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys()[0];
            this.cache.delete(oldestKey);
            console.log(`Cache limit reached, deleted oldest: ${oldestKey}`);
        }
        
        const now = Date.now();
        this.cache.set(key, {
            value,
            expireAt: now + ttl,
            createdAt: now
        });
    }

    /**
     * 获取缓存
     * @param {string} key - 缓存键
     * @returns {any|null} 缓存值或null
     */
    get(key) {
        const item = this.cache.get(key);
        
        if (!item) return null;
        
        // 检查是否过期
        if (Date.now() > item.expireAt) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }

    /**
     * 获取缓存并自动延期（滑动窗口）
     * @param {string} key - 缓存键
     * @param {number} extendTTL - 延期时间（毫秒）
     * @returns {any|null} 缓存值或null
     */
    getAndRefresh(key, extendTTL) {
        const item = this.cache.get(key);
        
        if (!item) return null;
        
        const now = Date.now();
        if (now > item.expireAt) {
            this.cache.delete(key);
            return null;
        }
        
        // 延期过期时间
        item.expireAt = now + extendTTL;
        return item.value;
    }

    /**
     * 删除缓存
     * @param {string} key - 缓存键
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * 清空所有缓存
     */
    clear() {
        this.cache.clear();
    }

    /**
     * 获取缓存统计
     * @returns {object} 缓存统计信息
     */
    getStats() {
        const now = Date.now();
        let expiredCount = 0;
        let totalSize = this.cache.size;

        this.cache.forEach((item, key) => {
            if (now > item.expireAt) {
                expiredCount++;
            }
        });

        return {
            totalCount: totalSize,
            expiredCount,
            validCount: totalSize - expiredCount
        };
    }
}

// 导出单例
const cacheManager = new CacheManager();

module.exports = {
    cacheManager,
    CacheManager
};


