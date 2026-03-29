/**
 * 个人中心页面
 *
 * 功能概览：
 * 1. 展示用户基本信息（头像、昵称）
 * 2. 展示对局统计数据（历史场次、胜/平/负局数、胜率）
 * 3. 提供个人信息编辑功能（头像、昵称）
 * 4. 提供关于和免责声明
 *
 * 数据流：
 * - 用户信息：从 storage 或 app.globalData 读取，修改后同步到云端
 * - 统计数据：从数据库实时查询，缓存5秒
 * - 资料同步：调用 updateProfile 云函数，支持自动重试
 *
 * 优化记录：
 * - P0: 修复字段名不一致，添加 winRate 初始化
 * - P1: 优化云函数性能，添加空状态、错误重试、下拉刷新
 * - P2: 统一交互样式，完善代码注释
 */
const app = getApp();
const cloudApi = require('../../utils/cloudApi');
const { getAppMeta } = require('../../utils/versionMeta');
const { getEnvLabel } = cloudApi;

Page({
    /**
     * 页面数据初始化
     * 包含用户信息、统计数据、加载状态、模态框状态等
     */
    data: {
        userInfo: null,  // 当前用户信息（从 storage 读取）
        envLabel: '',    // 环境标签 (Dev/Trial)
        stats: {
            totalGames: 0,       // 历史场次（总房间数）
            // freeRooms: 0,       // 自由房间数 - 已移除
            // clubRooms: 0,       // 圈子房间数 - 已移除
            winCount: 0,         // 胜局数（轮次数），从 rounds 集合计算
            drawCount: 0,        // 平局数（轮次数），从 rounds 集合计算
            loseCount: 0,         // 负局数（轮次数）
            winRate: 0,          // 胜率（百分比）
            // totalRounds: 0,       // 总轮次数（对局 + 转账） - 已移除
            gameRounds: 0         // 对局轮次数（用于胜率计算）
        },
        // 加载状态管理
        isLoadingStats: false,    // 统计数据加载中状态
        statsLoadFailed: false,   // 统计数据加载失败状态
        lastStatsFetch: 0,      // 上次拉取时间戳，用于5秒缓存策略
        // 模态框状态管理
        showAvatarModal: false,   // 头像选择模态框显示状态
        showNameModal: false,    // 昵称编辑模态框显示状态
        showDisclaimerModal: false, // 免责声明弹层显示状态
        tempName: '',           // 临时昵称（用于编辑）
        tempAvatar: '',         // 临时头像（用于选择）
        // 预设主题列表
        themes: [
            { id: 'classic', label: '经典卡通', collection: 'avataaars' },
            { id: 'lucky', label: '招财像素', collection: 'pixel-art' },
            { id: 'god', label: '赌神致敬', collection: 'fun-emoji' },
            { id: 'robot', label: '酷炫机器', collection: 'bottts' }
        ],
        currentTheme: 'classic', // 当前选择的主题 ID
        presetAvatars: [], // 动态生成的头像列表
        disclaimerSections: [
            {
                title: '1. 信息收集与使用',
                paragraphs: [
                    '本小程序为个人开发的学习与交流项目，不要求用户授权通讯录、短信、通话记录、地理位置、相册读写等与核心功能无关的权限。',
                    '开发者不会主动收集、上传、分析或出售任何可识别用户身份的个人信息。'
                ]
            },
            {
                title: '2. 头像与昵称说明',
                paragraphs: [
                    '用户可在页面内设置头像与昵称，仅用于当前小程序内的页面展示、对局身份区分与交互标识，不用于站外传播、广告投放或商业画像。',
                    '若你不希望使用自定义信息，可直接使用系统默认头像与默认昵称。'
                ]
            },
            {
                title: '3. 数据存储边界',
                paragraphs: [
                    '程序运行中产生的数据仅用于实现必要功能与页面显示，不用于建立用户画像，不与第三方共享个人资料。',
                    '开发者不会基于用户个人身份信息进行追踪、匹配或精准营销。'
                ]
            },
            {
                title: '4. 使用限制与责任',
                paragraphs: [
                    '本小程序仅用于学习、技术演示与娱乐交流，请勿用于任何违法违规用途。',
                    '因不当使用产生的风险与后果由使用者自行承担，开发者不承担由违规使用引发的责任。'
                ]
            },
            {
                title: '5. 意见反馈',
                paragraphs: [
                    '若你对隐私说明、头像昵称使用或其他功能有疑问，可通过“问题反馈”入口提交意见，开发者会持续优化说明与体验。'
                ]
            }
        ]
    },

    /**
     * 页面加载生命周期
     * 执行：初始化用户信息、设置返回按钮位置、加载统计数据
     */
    onLoad() {
        this.updateUserInfo();      // 从 storage 更新用户信息
        this.setBackButtonPos();   // 设置自定义导航栏返回按钮位置
        this.generateThemedAvatars(); // 初始化生成第一批主题头像
        this.fetchStats();         // 首次加载统计数据

        // 设置环境标签
        const label = getEnvLabel();
        if (label) {
            this.setData({ envLabel: `${label} Environment` });
        }
    },

    /**
     * 设置返回按钮位置
     * 根据设备的安全区域动态调整返回按钮的 top 值
     */
    setBackButtonPos() {
        try {
            const rect = wx.getMenuButtonBoundingClientRect();
            this.setData({
                backButtonTop: rect.top
            });
        } catch (e) {
            // 如果获取失败，使用默认值
            this.setData({ backButtonTop: 44 });
        }
    },

    /**
     * 页面显示生命周期
     * 缓存策略：只在数据可能过期时刷新（5秒缓存）
     * 避免频繁查询数据库，提升性能
     */
    onShow() {
        const lastFetch = this.data.lastStatsFetch || 0;
        const now = Date.now();
        if (now - lastFetch > 5000) {
            this.updateUserInfo();  // 确保用户信息最新
            this.fetchStats();     // 刷新统计数据
        }
    },

    /**
     * 下拉刷新处理
     * 允许用户手动强制刷新数据和统计，不遵循5秒缓存规则
     */
    onPullDownRefresh() {
        console.log('Pull down refresh triggered');
        this.updateUserInfo();
        this.fetchStats().then(() => {
            wx.stopPullDownRefresh();  // 停止下拉动画
            wx.showToast({ title: '刷新成功', icon: 'success', duration: 1000 });
        }).catch((err) => {
            console.error('Refresh failed:', err);
            wx.stopPullDownRefresh();  // 停止下拉动画
            wx.showToast({ title: '刷新失败', icon: 'none', duration: 1500 });
        });
    },

    /**
     * 获取用户统计数据
     * P0优化：修复自由房间统计缺失，从 rounds 集合实时计算胜平负
     * 数据来源：
     * 1. 历史场次：从 rooms 集合查询用户参与的所有已结算房间
     * 2. 胜/平/负局：从 rounds 集合实时计算（覆盖自由房间和圈子房间）
     *
     * 特殊处理：
     * - 处理本地 ID 与云端 OpenID 不一致的情况
     * - 数据库使用 lostCount，页面使用 loseCount 保持一致性
     */
    async fetchStats() {
        // 双重保险：从 data 或 storage 获取用户信息
        const userInfo = this.data.userInfo || wx.getStorageSync('hdpj_user_profile') || app.globalData.userInfo;
        if (!userInfo) {
            console.warn('fetchStats: userInfo not available');
            return;
        }

        // 设置加载状态
        this.setData({ isLoadingStats: true, statsLoadFailed: false });

        const db = wx.cloud.database();
        const _ = db.command;

        const uidStr = String(userInfo.id);
        const uidNum = Number(userInfo.id);

        try {
            // --- Phase 2: Switch to Pre-calculated Stats ---
            // 1. Fetch user profile document for O(1) stats retrieval
            const profileRes = await db.collection(cloudApi.collectionName('profiles')).doc(uidStr).get().catch(() => ({ data: null }));
            const profile = profileRes.data;

            // 2. If pre-calculated stats exist, use them directly
            if (profile && profile.stats && profile.stats.totalGames > 0) {
                console.log('[Stats] Using pre-calculated O(1) stats');
                const { stats } = profile;
                const winRate = stats.totalGames > 0 ? Math.round((stats.winCount / stats.totalGames) * 100) : 0;

                this.setData({
                    'stats.totalGames': stats.totalGames,
                    'stats.winCount': stats.winCount,
                    'stats.drawCount': stats.drawCount,
                    'stats.loseCount': stats.loseCount,
                    'stats.winRate': winRate,
                    'stats.gameRounds': stats.totalGames,
                    isLoadingStats: false,
                    lastStatsFetch: Date.now()
                });
                return;
            }

            // --- Fallback: Manual aggregation for non-migrated users ---
            console.log('[Stats] Falling back to manual aggregation');

            // 1. 统计所有房间
            const countRes = await db.collection(cloudApi.collectionName('rooms')).where({
                'players.id': _.or([uidStr, uidNum])
            }).count();
            const totalRooms = countRes.total;

            // 2. 获取胜平负详情
            const roomsQuery = await db.collection(cloudApi.collectionName('rooms'))
                .where({ 'players.id': _.or([uidStr, uidNum]) })
                .field({ players: true })
                .limit(1000)
                .get();

            let winCount = 0;
            let drawCount = 0;
            let loseCount = 0;

            roomsQuery.data.forEach(room => {
                const currentPlayer = (room.players || []).find(p => String(p.id) === uidStr || Number(p.id) === uidNum);
                if (currentPlayer) {
                    const score = currentPlayer.totalScore || 0;
                    if (score > 0) winCount++;
                    else if (score === 0) drawCount++;
                    else loseCount++;
                }
            });

            const winRate = totalRooms > 0 ? Math.round((winCount / totalRooms) * 100) : 0;

            this.setData({
                'stats.totalGames': totalRooms,
                'stats.winCount': winCount,
                'stats.drawCount': drawCount,
                'stats.loseCount': loseCount,
                'stats.winRate': winRate,
                'stats.gameRounds': totalRooms,
                isLoadingStats: false,
                lastStatsFetch: Date.now()
            });

        } catch (err) {
            console.error('Failed to fetch stats:', err);
            this.setData({ isLoadingStats: false, statsLoadFailed: true });
        }
    },

    /**
     * 更新用户信息
     * 从 storage 或 app.globalData 读取用户信息并更新到页面
     */
    updateUserInfo() {
        const userInfo = wx.getStorageSync('hdpj_user_profile') || app.globalData.userInfo;
        this.setData({ userInfo });
    },

    /**
     * 处理返回按钮点击
     * 智能判断：如果有上一页则返回，否则导航到首页
     */
    handleBack() {
        const pages = getCurrentPages();
        if (pages.length > 1) {
            wx.navigateBack();
        } else {
            // 使用 navigateTo 而非 reLaunch，避免清空页面栈
            wx.navigateTo({ url: '/pages/index/index' });
        }
    },

    // ===== 头像编辑相关方法 =====
    /**
     * 打开头像选择模态框
     */
    openAvatarModal() {
        this.setData({
            showAvatarModal: true,
            tempAvatar: this.data.userInfo.avatarUrl || ''
        });
    },

    /**
     * 关闭头像选择模态框
     */
    closeAvatarModal() {
        this.setData({ showAvatarModal: false });
    },

    /**
     * 选择头像
     * @param {Object} e - 事件对象，包含选中的头像 URL
     */
    selectAvatar(e) {
        this.setData({ tempAvatar: e.currentTarget.dataset.url });
    },

    /**
     * 保存头像
     * 更新本地数据并同步到云端
     */
    saveAvatar() {
        if (!this.data.tempAvatar) return;
        this.updateProfile({ avatarUrl: this.data.tempAvatar });
        this.closeAvatarModal();
    },

    // ===== 昵称编辑相关方法 =====
    /**
     * 打开昵称编辑模态框
     */
    openNameModal() {
        this.setData({
            showNameModal: true,
            tempName: this.data.userInfo.name || ''
        });
    },

    /**
     * 生成/刷新主题头像
     * 基于所选主题和随机种子生成 16 个头像 URL
     */
    generateThemedAvatars() {
        const { themes, currentTheme } = this.data;
        const theme = themes.find(t => t.id === currentTheme);
        const collection = theme ? theme.collection : 'avataaars';

        // 使用时间戳和随机数生成基础种子，确保每次“换一批”都不同
        const baseSeed = Math.random().toString(36).substring(7);

        const newAvatars = Array.from({ length: 16 }).map((_, i) => {
            // 为每个格子增加独立索引，防止 16 个格子长得一模一样
            return `https://api.dicebear.com/7.x/${collection}/svg?seed=${baseSeed}_${i}`;
        });

        this.setData({ presetAvatars: newAvatars });
    },

    /**
     * 切换头像主题
     */
    switchTheme(e) {
        const themeId = e.currentTarget.dataset.id;
        if (themeId === this.data.currentTheme) return;

        this.setData({ currentTheme: themeId }, () => {
            this.generateThemedAvatars();
        });

        // 增加触感反馈
        if (wx.vibrateShort) wx.vibrateShort();
    },

    /**
     * 换一批头像
     */
    refreshAvatars() {
        this.generateThemedAvatars();
        if (wx.vibrateShort) wx.vibrateShort();
    },

    /**
     * 关闭昵称编辑模态框
     * 清空临时状态以避免残留
     */
    closeNameModal() {
        this.setData({
            showNameModal: false,
            tempName: ''  // 清空临时状态
        });
    },

    /**
     * 昵称输入处理
     * @param {Object} e - 事件对象，包含输入的昵称
     */
    onNameInput(e) {
        this.setData({ tempName: e.detail.value });
    },

    /**
     * 保存昵称
     * 验证昵称长度和内容后更新
     */
    saveName() {
        const name = this.data.tempName.trim();
        if (!name) {
            wx.showToast({ title: '昵称不能为空', icon: 'none' });
            return;
        }
        if (name.length > 12) {
            wx.showToast({ title: '昵称过长', icon: 'none' });
            return;
        }
        this.updateProfile({ name: name });
        this.closeNameModal();
    },

    // ===== 资料更新通用方法 =====
    /**
     * 更新用户资料
     * 流程：
     * 1. 本地同步：更新 storage 和 app.globalData，立即更新 UI
     * 2. 云端同步：调用 updateProfile 云函数，支持自动重试（最多2次）
     * 3. 反馈提示：显示成功或失败信息
     *
     * @param {Object} updates - 需要更新的字段（name 或 avatarUrl）
     * @param {Number} retryCount - 当前重试次数（内部使用）
     */
    async updateProfile(updates, retryCount = 0) {
        const newUser = { ...this.data.userInfo, ...updates };

        // 1. 本地同步：立即更新 UI，给用户即时反馈
        wx.setStorageSync('hdpj_user_profile', newUser);
        app.globalData.userInfo = newUser;
        this.setData({ userInfo: newUser });

        // 增加震动反馈，提升交互体验
        wx.vibrateShort();

        wx.showLoading({ title: '资料同步中...', mask: true });

        // 2. 云端同步：调用云函数更新全站资料
        try {
            const res = await wx.cloud.callFunction({
                name: 'updateProfile',
                data: {
                    type: 'sync',
                    userInfo: {
                        name: newUser.name,
                        avatarUrl: newUser.avatarUrl
                    }
                }
            });
            wx.hideLoading();
            if (res.result && res.result.success) {
                const { updatedCounts, note } = res.result;
                let msg = '全站资料已更新';
                if (updatedCounts) {
                    msg += `\n已同步: ${updatedCounts.members}个圈子成员记录`;
                }
                if (note) {
                    msg += `\n${note}`;
                }
                wx.showToast({ title: msg, icon: 'success', duration: 2000 });

                // 延迟刷新统计数据（因为统计中可能包含用户名/头像）
                setTimeout(() => {
                    this.fetchStats();
                }, 500);
            } else {
                throw new Error(res.result.msg);
            }
        } catch (e) {
            console.error('Sync failed', e);
            wx.hideLoading();

            // 错误处理：提供重试选项
            const errorMessage = e.message || '网络错误，同步失败';
            const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('超时');

            // 如果是超时或网络错误，且重试次数 < 2，则自动重试
            if ((isTimeout || errorMessage.includes('network')) && retryCount < 2) {
                console.log(`自动重试 (${retryCount + 1}/2)...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // 延迟1秒后重试
                return this.updateProfile(updates, retryCount + 1);
            }

            // 显示详细错误信息，并提供重试选项
            wx.showModal({
                title: '云端同步失败',
                content: `资料已保存在本地，但云端同步失败。\n\n错误信息：${errorMessage}\n\n您可以稍后在设置中手动重试。`,
                confirmText: '重试',
                cancelText: '稍后',
                success: (modalRes) => {
                    if (modalRes.confirm) {
                        // 手动重试
                        this.updateProfile(updates, retryCount + 1);
                    }
                }
            });
        }
    },

    // ===== 其他功能方法 =====
    /**
     * 打开关于我们弹窗
     */
    openAbout() {
        const globalMeta = app.globalData && app.globalData.appMeta;
        const configMeta = getAppMeta();
        const appMeta = globalMeta || configMeta;
        const appName = appMeta.appName;
        const displayVersion = appMeta.displayLower;
        const aboutLine = displayVersion ? `${appName} ${displayVersion}` : appName;
        wx.showModal({
            title: '关于我们',
            content: `${aboutLine}\n仅供娱乐学习使用`,
            showCancel: false
        });
    },

    /**
     * 打开免责声明弹窗
     */
    openDisclaimer() {
        this.setData({ showDisclaimerModal: true });
    },

    /**
     * 关闭免责声明弹层
     */
    closeDisclaimerModal() {
        this.setData({ showDisclaimerModal: false });
    },

    /**
     * 打开历史记录页面
     */
    openHistory() {
        wx.navigateTo({
            url: '/subpackages/package_game/pages/history/index'
        });
    }

});
