const app = getApp();
const cloudApi = require('../../utils/cloudApi');
const MINI_CODE_FILE_ID = 'cloud://cloud1-7go9rrf32b9c9cbc.636c-cloud1-7go9rrf32b9c9cbc-1390826004/assets/mini-code-v1.png';

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
        helpTouchStartX: 0,
        helpTouchStartY: 0,
        helpTouchDeltaX: 0,
        helpTouchDeltaY: 0,
        helpImageAnimating: false,
        helpImages: [
            'cloud://cloud1-7go9rrf32b9c9cbc.636c-cloud1-7go9rrf32b9c9cbc-1390826004/assets/instructions/guide_1.jpg',
            'cloud://cloud1-7go9rrf32b9c9cbc.636c-cloud1-7go9rrf32b9c9cbc-1390826004/assets/instructions/guide_2.jpg',
            'cloud://cloud1-7go9rrf32b9c9cbc.636c-cloud1-7go9rrf32b9c9cbc-1390826004/assets/instructions/guide_3.jpg',
            'cloud://cloud1-7go9rrf32b9c9cbc.636c-cloud1-7go9rrf32b9c9cbc-1390826004/assets/instructions/guide_4.jpg'
        ],

        isProcessing: false, // Interaction Lock
        appIconUrl: '', // Cloud Icon URL
        miniCodeUrl: '', // Mini Program Code URL
        miniCodeLocalPath: '',
        showSharePanel: false,
        isSavingMiniCode: false
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
        this.fetchMiniCode();
    },

    onShow() {
        this.updateUserInfo();
    },

    onHide() {
        clearTimeout(this._helpAnimTimer);
        if (this.data.showSharePanel) {
            this.setData({ showSharePanel: false });
        }
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
            },
            fail: err => {
                console.error('Failed to fetch app icon', err);
            }
        });
    },

    fetchMiniCode() {
        wx.cloud.getTempFileURL({
            fileList: [MINI_CODE_FILE_ID],
            success: res => {
                const file = res.fileList[0];
                if (file && file.status === 0) {
                    this.setData({ miniCodeUrl: file.tempFileURL });
                } else {
                    console.error('Failed to get Mini Code URL', file ? file.errMsg : 'empty response');
                }
            },
            fail: err => {
                console.error('Failed to fetch mini code', err);
            }
        });
    },

    onShareAppMessage() {
        return {
            title: '转发给牌友，扫码就能进，开局更快',
            path: '/pages/index/index',
            imageUrl: this.data.miniCodeUrl || this.data.appIconUrl || ''
        };
    },

    openSharePanel() {
        this.setData({ showSharePanel: true });
    },

    closeSharePanel() {
        this.setData({ showSharePanel: false });
    },

    noop() {},

    handleShareMiniProgram() {
        this.closeSharePanel();
    },

    async handleSendMiniCode() {
        if (this.data.isSavingMiniCode) return;
        this.closeSharePanel();

        if (!this.data.miniCodeUrl) {
            wx.showToast({ title: '码图加载中，请稍后重试', icon: 'none' });
            return;
        }

        this.setData({ isSavingMiniCode: true });
        try {
            const localPath = await this.ensureMiniCodeLocalPath();
            wx.previewImage({
                current: localPath,
                urls: [localPath]
            });

            const wantSave = await new Promise(resolve => {
                wx.showModal({
                    title: '发送码图',
                    content: '已打开预览，是否保存到相册后发给牌友？',
                    confirmText: '保存到相册',
                    cancelText: '先看看',
                    success: res => resolve(!!res.confirm),
                    fail: () => resolve(false)
                });
            });

            if (wantSave) {
                await this.saveMiniCodeToAlbum(localPath);
            }
        } catch (err) {
            console.error('handleSendMiniCode failed', err);
            wx.showToast({ title: '码图处理失败，请稍后重试', icon: 'none' });
        } finally {
            this.setData({ isSavingMiniCode: false });
        }
    },

    ensureMiniCodeLocalPath() {
        if (this.data.miniCodeLocalPath) {
            return Promise.resolve(this.data.miniCodeLocalPath);
        }

        return new Promise((resolve, reject) => {
            wx.downloadFile({
                url: this.data.miniCodeUrl,
                success: res => {
                    if (res.statusCode >= 200 && res.statusCode < 400 && res.tempFilePath) {
                        this.setData({ miniCodeLocalPath: res.tempFilePath });
                        resolve(res.tempFilePath);
                        return;
                    }
                    reject(new Error(`download status invalid: ${res.statusCode}`));
                },
                fail: err => reject(err)
            });
        });
    },

    ensureAlbumPermission() {
        return new Promise(resolve => {
            wx.getSetting({
                success: settingRes => {
                    const auth = settingRes.authSetting['scope.writePhotosAlbum'];
                    if (auth === true) {
                        resolve(true);
                        return;
                    }

                    if (auth === false) {
                        wx.showModal({
                            title: '需要相册权限',
                            content: '请开启“保存到相册”权限后重试',
                            confirmText: '去设置',
                            success: modalRes => {
                                if (!modalRes.confirm) {
                                    resolve(false);
                                    return;
                                }
                                wx.openSetting({
                                    success: openRes => resolve(!!openRes.authSetting['scope.writePhotosAlbum']),
                                    fail: () => resolve(false)
                                });
                            },
                            fail: () => resolve(false)
                        });
                        return;
                    }

                    wx.authorize({
                        scope: 'scope.writePhotosAlbum',
                        success: () => resolve(true),
                        fail: () => {
                            wx.showModal({
                                title: '需要相册权限',
                                content: '未授予相册权限，可在设置中开启后继续',
                                confirmText: '去设置',
                                success: modalRes => {
                                    if (!modalRes.confirm) {
                                        resolve(false);
                                        return;
                                    }
                                    wx.openSetting({
                                        success: openRes => resolve(!!openRes.authSetting['scope.writePhotosAlbum']),
                                        fail: () => resolve(false)
                                    });
                                },
                                fail: () => resolve(false)
                            });
                        }
                    });
                },
                fail: () => resolve(false)
            });
        });
    },

    async saveMiniCodeToAlbum(filePath) {
        const granted = await this.ensureAlbumPermission();
        if (!granted) {
            wx.showToast({ title: '未获得相册权限', icon: 'none' });
            return;
        }

        return new Promise(resolve => {
            wx.saveImageToPhotosAlbum({
                filePath,
                success: () => {
                    wx.showToast({ title: '已保存，去微信聊天发送图片', icon: 'none', duration: 2200 });
                    resolve(true);
                },
                fail: err => {
                    console.error('saveMiniCodeToAlbum failed', err);
                    wx.showToast({ title: '保存失败，可在预览页长按保存', icon: 'none' });
                    resolve(false);
                }
            });
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
            helpIndex: 0,
            helpTouchStartX: 0,
            helpTouchStartY: 0,
            helpTouchDeltaX: 0,
            helpTouchDeltaY: 0
        });
    },

    closeHelpModal() {
        this.setData({
            showHelpModal: false,
            helpImageAnimating: false
        });
    },

    onHelpTouchStart(e) {
        const point = e.touches && e.touches[0];
        if (!point) return;

        this._helpTouchActive = true;
        this.setData({
            helpTouchStartX: point.clientX,
            helpTouchStartY: point.clientY,
            helpTouchDeltaX: 0,
            helpTouchDeltaY: 0
        });
    },

    onHelpTouchMove(e) {
        if (!this._helpTouchActive) return;
        const point = e.touches && e.touches[0];
        if (!point) return;

        this.setData({
            helpTouchDeltaX: point.clientX - this.data.helpTouchStartX,
            helpTouchDeltaY: point.clientY - this.data.helpTouchStartY
        });
    },

    onHelpTouchEnd() {
        if (!this._helpTouchActive) return;
        this._helpTouchActive = false;

        const deltaX = this.data.helpTouchDeltaX;
        const deltaY = this.data.helpTouchDeltaY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        const threshold = 40;

        this.setData({
            helpTouchDeltaX: 0,
            helpTouchDeltaY: 0
        });

        // Only react to obvious horizontal swipes
        if (absX < threshold || absX <= absY) {
            return;
        }

        const total = this.data.helpImages.length;
        if (!total) return;

        let nextIndex = this.data.helpIndex;
        if (deltaX > 0) {
            // Right swipe -> previous page, hard lock at first page
            if (nextIndex > 0) nextIndex -= 1;
        } else {
            // Left swipe -> next page, hard lock at last page
            if (nextIndex < total - 1) nextIndex += 1;
        }

        if (nextIndex === this.data.helpIndex) {
            return;
        }

        this.setData({
            helpIndex: nextIndex,
            helpImageAnimating: true
        });

        clearTimeout(this._helpAnimTimer);
        this._helpAnimTimer = setTimeout(() => {
            this.setData({ helpImageAnimating: false });
        }, 180);
    },

    onHelpTouchCancel() {
        this._helpTouchActive = false;
        this.setData({
            helpTouchDeltaX: 0,
            helpTouchDeltaY: 0
        });
    }
})
