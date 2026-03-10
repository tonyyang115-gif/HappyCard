class DatabaseAdapter {
    constructor(cloud, env) {
        this.cloud = cloud;
        this.db = cloud.database();
        // 如果 env 是 dev，则添加 dev_ 前缀，否则为空
        this.envPrefix = (env === 'dev') ? 'dev_' : '';

        // 透传常用对象，保持 API 一致性
        this.command = this.db.command;
        this.serverDate = this.db.serverDate;
        this.RegExp = this.db.RegExp;
        this.Geo = this.db.Geo;
    }

    /**
     * 获取集合引用，自动处理前缀
     * @param {string} name 集合名称
     */
    collection(name) {
        const targetName = this.envPrefix + name;
        if (this.envPrefix) {
            console.log(`[DB] Use collection: ${targetName}`);
        }
        return this.db.collection(targetName);
    }

    /**
     * 运行事务，注入带前缀的 transaction 对象
     * @param {function} callback 
     */
    async runTransaction(callback) {
        return this.db.runTransaction(async (transaction) => {
            // 创建一个代理 transaction 对象，拦截 collection调用
            const transactionProxy = {
                collection: (name) => {
                    const targetName = this.envPrefix + name;
                    // Transaction 内部也需要打印一下，方便调试
                    if (this.envPrefix) {
                        console.log(`[DB][Transaction] Use collection: ${targetName}`);
                    }
                    return transaction.collection(targetName);
                },
                rollback: (reason) => transaction.rollback(reason)
            };
            return await callback(transactionProxy);
        });
    }
}

module.exports = DatabaseAdapter;
