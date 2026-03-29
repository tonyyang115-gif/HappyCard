const { getAppMeta } = require('./utils/versionMeta');

App({
    onLaunch: function () {
        if (!wx.cloud) {
            console.error('请使用 2.2.3 或以上的基础库以使用云能力')
        } else {
            wx.cloud.init({
                env: 'cloud1-7go9rrf32b9c9cbc',
                traceUser: true,
            })
        }

        // Global User Data Management
        // We try to get user info from storage or generate a random one
        let userInfo = wx.getStorageSync('hdpj_user_profile');
        if (!userInfo) {
            // Generate similar to original helper
            const MOCK_NAMES = ["快乐小狗", "熬夜冠军", "打牌高手", "雀神", "养生达人", "暴富", "锦鲤", "风清扬", "扫地僧"];
            const PRESET_AVATARS = [
                "https://api.dicebear.com/7.x/avataaars/svg?seed=Sunny&backgroundColor=ffdfbf",
                "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
                "https://api.dicebear.com/7.x/pixel-art/svg?seed=Aneka",
                "https://api.dicebear.com/7.x/pixel-art/svg?seed=Zack",
                "https://api.dicebear.com/7.x/bottts/svg?seed=Trouble",
                "https://api.dicebear.com/7.x/bottts/svg?seed=Bandit",
                "https://api.dicebear.com/7.x/notionists/svg?seed=Ginger",
                "https://api.dicebear.com/7.x/notionists/svg?seed=Midnight",
                "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo&backgroundColor=c0aede",
            ];

            userInfo = {
                id: Math.random().toString(36).substr(2, 9),
                name: MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)],
                avatarUrl: PRESET_AVATARS[Math.floor(Math.random() * PRESET_AVATARS.length)],
                isHost: false, // Default false, will be true if they create a room
                totalScore: 0
            };
            // Ensure openid exists (using id as fallback for dev)
            userInfo.openid = userInfo.id;
            wx.setStorageSync('hdpj_user_profile', userInfo);
        }

        // Backward compatibility: If existing user from storage lacks openid, add it
        if (!userInfo.openid && userInfo.id) {
            userInfo.openid = userInfo.id;
            wx.setStorageSync('hdpj_user_profile', userInfo);
        }

        this.globalData = {
            userInfo: userInfo,
            isConnected: true,
            appMeta: getAppMeta()
        };

        // Connectivity Monitoring
        wx.onNetworkStatusChange((res) => {
            this.globalData.isConnected = res.isConnected;
            if (!res.isConnected) {
                wx.showToast({ title: '网络已断开，进入离线模式', icon: 'none', duration: 3000 });
            } else {
                wx.showToast({ title: '网络已恢复', icon: 'success', duration: 2000 });
                this.emit('networkResume');
            }
        });
    },
    globalData: {
        userInfo: null,
        isConnected: true,
        appMeta: getAppMeta()
    },

    // Stage 3: Reactive Event Bus (P0)
    // Allows cross-page communication for instant UI updates
    events: {},
    on(name, callback) {
        if (!this.events[name]) this.events[name] = [];
        this.events[name].push(callback);
    },
    off(name, callback) {
        if (!this.events[name]) return;
        if (!callback) {
            this.events[name] = [];
        } else {
            this.events[name] = this.events[name].filter(cb => cb !== callback);
        }
    },
    emit(name, data) {
        if (this.events[name]) {
            this.events[name].forEach(cb => cb(data));
        }
    },

    // --- Security Isolation (P2) ---
    ejectFromClub(clubId, reason = '圈子已解散') {
        console.warn(`Ejecting from club ${clubId}: ${reason}`);

        // 1. Clear local cache to prevent re-entry
        const cached = wx.getStorageSync('hdpj_cache_club_list') || [];
        const filtered = cached.filter(c => c._id !== clubId);
        wx.setStorageSync('hdpj_cache_club_list', filtered);

        // 2. Visual Alert
        wx.showModal({
            title: '提示',
            content: reason,
            showCancel: false,
            confirmText: '返回首页',
            success: () => {
                // 3. Force re-route to prevent further execution on ghost pages
                wx.reLaunch({
                    url: '/pages/index/index'
                });
            }
        });
    }
})
