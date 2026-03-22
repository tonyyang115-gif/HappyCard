const app = getApp();
const cloudApi = require('../../utils/cloudApi');

Page({
    data: {
        userInfo: null,
        inputRoomId: '',
        showProfileModal: false,
        showJoinRoomModal: false, // New state for Join Modal
        joinError: '', // Error message for join room validation
        tempName: '',
        tempAvatar: '',
        // Avatar presets from original app
        // Avatar presets: mix of avataaars (people) and fun-emoji (animals/cartoons)
        presetAvatars: [
            "https://api.dicebear.com/7.x/avataaars/svg?seed=Sunny&backgroundColor=ffdfbf",
            "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
            "https://api.dicebear.com/7.x/pixel-art/svg?seed=Aneka",
            "https://api.dicebear.com/7.x/pixel-art/svg?seed=Zack",
            "https://api.dicebear.com/7.x/bottts/svg?seed=Trouble",
            "https://api.dicebear.com/7.x/bottts/svg?seed=Bandit",
            "https://api.dicebear.com/7.x/notionists/svg?seed=Ginger",
            "https://api.dicebear.com/7.x/notionists/svg?seed=Midnight",
            "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo&backgroundColor=c0aede",
            "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Bear",
            "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Cat",
            "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Mouse",
            "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Dog",
            "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Rabbit",
            "https://api.dicebear.com/7.x/fun-emoji/svg?seed=Panda"
        ],

        // Help Modal Data
        showHelpModal: false,
        helpIndex: 0,
        helpImages: [
            'cloud://cloud1-7go9rrf32b9c9cbc.636c-cloud1-7go9rrf32b9c9cbc-1390826004/assets/instructions/guide_1.jpg',
            'cloud://cloud1-7go9rrf32b9c9cbc.636c-cloud1-7go9rrf32b9c9cbc-1390826004/assets/instructions/guide_2.jpg',
            'cloud://cloud1-7go9rrf32b9c9cbc.636c-cloud1-7go9rrf32b9c9cbc-1390826004/assets/instructions/guide_3.jpg',
            'cloud://cloud1-7go9rrf32b9c9cbc.636c-cloud1-7go9rrf32b9c9cbc-1390826004/assets/instructions/guide_4.jpg'
        ],

        isProcessing: false, // Interaction Lock
        appIconUrl: '' // Cloud Icon URL
    },


    async createRoom() {
        if (!this.data.userInfo || this.data.isProcessing) return;
        this.setData({ isProcessing: true });

        wx.showLoading({ title: '创建房间中...', mask: true });

        try {
            const res = await cloudApi.call('createRoom', {
                userInfo: this.data.userInfo
            });

            wx.hideLoading();

            if (res.result && res.result.success) {
                if (res.result.openId) {
                    const realOpenId = res.result.openId;
                    const currentUser = this.data.userInfo;
                    if (currentUser.id !== realOpenId) {
                        currentUser.id = realOpenId;
                        currentUser.openid = realOpenId;
                        app.globalData.userInfo = currentUser;
                        wx.setStorageSync('hdpj_user_profile', currentUser);
                    }
                }
                wx.navigateTo({
                    url: `/subpackages/package_game/pages/room/index?roomId=${res.result.docId}&isHost=true`
                });
            } else {
                throw new Error(res.result ? res.result.msg : '创建失败');
            }
        } catch (err) {
            wx.hideLoading();
            console.error('Create Room Failed', err);
            wx.showToast({ title: err.message || '网络异常', icon: 'none' });
        } finally {
            this.setData({ isProcessing: false });
        }
    },

    // Join Modal Logic
    openJoinModal() {
        this.setData({
            showJoinRoomModal: true,
            joinError: '', // Reset error
            inputRoomId: '' // Reset input
        });
    },

    navigateToClubs() {
        wx.navigateTo({
            url: '/subpackages/package_club/pages/club/list/index'
        });
    },

    navigateToTools() {
        wx.navigateTo({
            url: '/subpackages/package_tools/pages/tools-hub/index'
        });
    },

    closeJoinModal() {
        this.setData({ showJoinRoomModal: false });
    },

    onRoomIdInput(e) {
        this.setData({
            inputRoomId: e.detail.value,
            joinError: '' // Clear error when typing
        });
    },

    async joinRoom() {
        const roomId = this.data.inputRoomId;
        if (!roomId || !/^\d{6}$/.test(roomId)) {
            this.setData({ joinError: '请输入6位数字房间号' });
            return;
        }

        if (this.data.isProcessing) return;
        this.setData({ isProcessing: true });

        wx.showLoading({ title: '确认中...', mask: true });

        try {
            // STEP 1: Pre-check Room Info (P1)
            const checkRes = await cloudApi.call('joinRoom', {
                roomId: roomId,
                userInfo: this.data.userInfo,
                checkOnly: true
            });

            if (!checkRes.result || !checkRes.result.success) {
                throw new Error(checkRes.result ? checkRes.result.msg : '查询失败');
            }

            const { docId, clubInfo, needsClubJoin } = checkRes.result;

            // STEP 2: Show Confirmation if it's a new club room (P1)
            if (needsClubJoin && clubInfo) {
                wx.hideLoading();
                const confirmed = await new Promise(resolve => {
                    wx.showModal({
                        title: '加入确认',
                        content: `该房间属于“${clubInfo.name}”，加入对局将同步加入该圈子，是否继续？`,
                        confirmText: '确定加入',
                        cancelText: '取消',
                        success: (sm) => resolve(sm.confirm)
                    });
                });
                if (!confirmed) return;
                wx.showLoading({ title: '加入中...', mask: true });
            } else {
                // If no modal, just update loading text
                wx.showLoading({ title: '加入中...', mask: true });
            }

            // STEP 3: Perform Actual Join (P0)
            const joinRes = await cloudApi.call('joinRoom', {
                roomId: docId, // Use Doc ID returned from check
                userInfo: this.data.userInfo
            });

            if (joinRes.result && joinRes.result.joined) {
                // Identity Sync
                if (joinRes.result.openId) {
                    const realOpenId = joinRes.result.openId;
                    const currentUser = this.data.userInfo;
                    if (currentUser.id !== realOpenId) {
                        currentUser.id = realOpenId;
                        currentUser.openid = realOpenId;
                        app.globalData.userInfo = currentUser;
                        wx.setStorageSync('hdpj_user_profile', currentUser);
                        this.setData({ userInfo: currentUser });
                    }
                }

                this.setData({ showJoinRoomModal: false });
                wx.navigateTo({
                    url: `/subpackages/package_game/pages/room/index?roomId=${joinRes.result.docId}`
                });
            } else {
                throw new Error(joinRes.result ? joinRes.result.msg : '加入失败');
            }

        } catch (err) {
            console.error(err);
            let msg = err.message || '加入失败';
            if (msg.includes('Room not found')) msg = '房间不存在';
            if (msg.includes('Room is full')) msg = '房间已满';
            wx.showToast({ title: msg, icon: 'none' });
        } finally {
            wx.hideLoading();
            this.setData({ isProcessing: false });
        }
    },

    onLoad(options) {
        this.updateUserInfo();
        this.fetchHelpImages();
        this.fetchAppIcon();
    },

    onShow() {
        this.updateUserInfo();
    },

    updateUserInfo() {
        const userInfo = wx.getStorageSync('hdpj_user_profile') || app.globalData.userInfo;
        if (userInfo) {
            this.setData({ userInfo });
        }
    },

    fetchHelpImages() {
        const fileList = this.data.helpImages;
        if (!fileList || fileList.length === 0) return;

        // Skip if already http (optimization)
        if (fileList[0].startsWith('http')) return;

        wx.cloud.getTempFileURL({
            fileList: fileList,
            success: res => {
                const newImages = res.fileList.map(f => {
                    if (f.status === 0) {
                        return f.tempFileURL;
                    } else {
                        console.error('Failed to get temp URL for', f.fileID, f.errMsg);
                        return f.fileID; // Fallback to original
                    }
                });
                this.setData({ helpImages: newImages });
            },
            fail: err => {
                console.error('Failed to fetch help images', err);
            }
        });
    },

    fetchAppIcon() {
        const cloudId = 'cloud://cloud1-7go9rrf32b9c9cbc.636c-cloud1-7go9rrf32b9c9cbc-1390826004/assets/app-icon.jpg';
        wx.cloud.getTempFileURL({
            fileList: [cloudId],
            success: res => {
                const file = res.fileList[0];
                if (file.status === 0) {
                    this.setData({ appIconUrl: file.tempFileURL });
                } else {
                    console.error('Failed to get App Icon URL', file.errMsg);
                    // Fallback handled by UI (empty or default) logic if needed, 
                    // but we are removing local file, so maybe show nothing or text.
                }
            }
        });
    },

    // ... (rest of the file)

    // Profile Logic
    navigateToProfile() {
        wx.navigateTo({
            url: '/pages/profile/index'
        });
    },

    openProfileModal() {
        // Kept for backward compatibility or if called internally, 
        // but UI now points to navigateToProfile
        this.setData({
            showProfileModal: true,
            tempName: this.data.userInfo.name,
            tempAvatar: this.data.userInfo.avatarUrl
        });
    },

    closeProfileModal() {
        this.setData({ showProfileModal: false });
    },

    onNameInput(e) {
        this.setData({ tempName: e.detail.value });
    },

    selectAvatar(e) {
        const url = e.currentTarget.dataset.url;
        this.setData({ tempAvatar: url });
    },

    // randomAvatar removed as it's replaced by grid selection

    saveProfile() {
        if (!this.data.tempName.trim()) {
            wx.showToast({ title: '昵称不能为空', icon: 'none' });
            return;
        }

        const newUser = {
            ...this.data.userInfo,
            name: this.data.tempName,
            avatarUrl: this.data.tempAvatar
        };

        wx.setStorageSync('hdpj_user_profile', newUser);
        app.globalData.userInfo = newUser;
        this.setData({
            userInfo: newUser,
            showProfileModal: false
        });
    },

    // Help Modal Logic
    openHelpModal() {
        this.setData({
            showHelpModal: true,
            helpIndex: 0
        });
    },

    closeHelpModal() {
        this.setData({ showHelpModal: false });
    },

    prevHelp() {
        if (this.data.helpIndex > 0) {
            this.setData({
                helpIndex: this.data.helpIndex - 1
            });
        }
    },

    nextHelp() {
        if (this.data.helpIndex < this.data.helpImages.length - 1) {
            this.setData({
                helpIndex: this.data.helpIndex + 1
            });
        }
    }
})
