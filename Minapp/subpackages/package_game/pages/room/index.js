const app = getApp();
const cloudApi = require('../../../../utils/cloudApi');

// 批量setData工具类
function BatchSetData(pageContext) {
    this.context = pageContext;
    this.queue = {};
    this.timer = null;
    this.delay = 50;
    this.callbacks = [];
}

BatchSetData.prototype.set = function (data, callback) {
    Object.assign(this.queue, data);

    if (callback) {
        this.callbacks.push(callback);
    }

    if (this.timer) {
        clearTimeout(this.timer);
    }

    var self = this;
    this.timer = setTimeout(function () {
        self.flush();
    }, this.delay);
};

BatchSetData.prototype.setImmediate = function (data, callback) {
    Object.assign(this.queue, data);
    if (callback) {
        this.callbacks.push(callback);
    }
    this.flush();
};

BatchSetData.prototype.flush = function () {
    if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
    }

    if (Object.keys(this.queue).length === 0) {
        return;
    }

    var data = this.queue;
    var callbacks = this.callbacks || [];

    this.queue = {};
    this.callbacks = [];

    this.context.setData(data, function () {
        callbacks.forEach(function (cb) {
            cb();
        });
    });
};

BatchSetData.prototype.destroy = function () {
    if (this.timer) {
        clearTimeout(this.timer);
    }
    this.flush();
};

Page({
    data: {
        userInfo: null,
        roomId: '',
        room: { players: [], rounds: [] }, // View copy (rounds empty)
        loading: true, // Initial loading state
        myScore: 0,
        myRank: '-',
        sortedPlayers: [],
        inputPlayers: [], // Stable list for input forms

        // UI State
        showAddScoreModal: false,
        scoreMode: 'quick', // quick | manual
        selectedWinner: null,
        selectedLosers: [],
        quickScoreAmount: '',
        tempScores: {},

        showTransferModal: false,
        transferTarget: null,
        transferAmount: '',

        showScoreDetailModal: false,
        showSettlementModal: false, // Final Settlement
        settlementBigWinner: null,
        settlementGroups: [],
        showLeaveModal: false,
        showChartModal: false,
        chartRounds: [],

        // Rounds pagination
        roundsPage: 1,
        roundsPageSize: 20,
        hasMoreRounds: true,
        isLoadingMoreRounds: false,

        // Score detail pagination (for full history)
        scoreDetailRoundsPage: 1,
        scoreDetailRoundsPageSize: 20,
        scoreDetailHasMore: true,
        scoreDetailIsLoading: false,

        // 全局加载状态管理
        loadingState: {
            roomWatcher: false,      // 房间数据监听中
            roundsWatcher: false,    // 回合数据监听中
            errorCount: 0,           // 错误计数
            lastErrorTime: 0         // 最后错误时间
        },

        // Read-Only Mode
        isReadOnly: false,
        isProcessing: false, // Interaction Lock

        // 权限和状态
        canSettle: false, // 是否可以结算
        watchersActive: false, // Watcher状态标记

        // Club context (for club rooms)
        cid: null,
        club: null,

        // Player count
        activePlayersCount: 0, // 活跃玩家数量
        chartPlayers: [], // 走势图显示所有玩家（包括已退出的）

        // Base Score Feature
        baseScore: 1, // Default base score
        showBaseScoreModal: false,
        newBaseScore: '',

        appIconUrl: '' // Cloud Icon URL
    },

    // 聚类缓存相关
    clusteredRoundsCache: null,
    lastRoundsHash: null,

    onShareAppMessage() {
        let url = `/subpackages/package_game/pages/room/index?roomId=${this.data.roomId}`;
        let title = '';
        let imageUrl = this.data.appIconUrl || ''; // Use Cloud Icon if available

        if (this.data.isReadOnly) {
            url += '&readonly=true';
        }

        // Customize share content based on room type
        const isClubRoom = this.data.cid && this.data.cid !== '---';

        if (isClubRoom) {
            url += `&cid=${this.data.cid}`;

            // Club room: Emphasize club identity
            const clubName = this.data.club?.name || '圈子';
            if (this.data.isReadOnly) {
                title = `【${clubName}】对局回顾 - 房间号 ${this.data.roomId}`;
            } else {
                title = `快来加入【${clubName}】的对局！房间号：${this.data.roomId}`;
            }

            // Use club avatar if available
            if (this.data.club?.avatar) {
                imageUrl = this.data.club.avatar;
            }
        } else {
            // Free room: Highlight quick join
            if (this.data.isReadOnly) {
                title = `对局回顾：房间号 ${this.data.roomId}`;
            } else {
                title = `来一起打牌吧！房间号：${this.data.roomId}`;
            }
        }

        return {
            title: title,
            path: url,
            imageUrl: imageUrl
        };
    },

    manualRefresh() {
        if (!this.data.docId) return;
        wx.showToast({ title: '刷新中...', icon: 'loading' });
        const db = wx.cloud.database();
        db.collection(cloudApi.collectionName('rooms')).doc(this.data.docId).get().then(res => {
            if (res.data) {
                // Update cache
                this.currentRoomData = res.data;
                // Update UI using correct signature
                this.updateLocalRoom(this.data.userInfo);
                wx.showToast({ title: '刷新成功', icon: 'success' });
            }
        }).catch(err => {
            console.error(err);
            wx.showToast({ title: '刷新失败', icon: 'none' });
        });
    },

    onLoad(options) {
        // 初始化批量setData工具
        this.batchUpdater = new BatchSetData(this);

        // 1. Get User Info
        let userInfo = wx.getStorageSync('hdpj_user_profile') || app.globalData.userInfo;
        if (userInfo) {
            userInfo.id = userInfo.openid || userInfo.id; // Normalize to 'id'
        }

        const roomId = options.roomId;
        const cid = options.cid || ''; // Capture club context

        this.batchUpdater.set({
            userInfo: userInfo,
            roomId: roomId,
            cid: cid,
            isReadOnly: options.readonly === 'true', // Initialize Read-Only Flag
            watchersActive: true // 标记watcher激活
        });

        if (!userInfo) {
            wx.showToast({ title: '未登录', icon: 'none' });
            wx.redirectTo({ url: '/pages/index/index' });
            return;
        }

        // 2. Join Room Logic (Cloud)
        this.initRoomWatcher(roomId, userInfo);

        // 3. 监听网络状态变化
        this.networkStatusListener = (res) => {
            console.log('Network status changed:', res);
            if (res.isConnected) {
                // 网络恢复，尝试重新连接watchers
                if (this.data.watchersActive && !this.roomWatcher) {
                    console.log('Network restored, reconnecting watchers...');
                    wx.showToast({
                        title: '网络已恢复，正在重新连接',
                        icon: 'success',
                        duration: 2000
                    });
                    setTimeout(() => {
                        if (this.data.watchersActive) {
                            this.initRoomWatcher(this.data.roomId, this.data.userInfo);
                        }
                    }, 500);
                } else if (this.data.loadingState?.errorCount > 0) {
                    // 有错误记录，显示恢复提示
                    this.setData({
                        'loadingState.errorCount': 0
                    });
                    wx.showToast({
                        title: '网络已恢复',
                        icon: 'success',
                        duration: 2000
                    });
                }
            } else {
                // 网络断开
                wx.showToast({
                    title: '网络连接已断开',
                    icon: 'none',
                    duration: 2000
                });
            }
        };
        wx.onNetworkStatusChange(this.networkStatusListener);
    },

    // 备用方法：退出前检查docId是否已设置
    ensureDocIdBeforeLeave() {
        if (!this.data.docId) {
            console.warn('docId not set, cannot leave room');
            wx.showToast({ title: '房间尚未加载完成，请稍后再试', icon: 'none' });
            return false;
        }
        return true;
    },

    // 智能页面跳转：检查页面栈，避免重复跳转
    smartNavigateTo(url, options = {}) {
        try {
            const pages = getCurrentPages();
            if (!pages || pages.length === 0) {
                // 页面栈为空，直接使用redirectTo
                wx.redirectTo({ url: url });
                return;
            }

            const currentPage = pages[pages.length - 1];
            const currentRoute = `/${currentPage.route}`;

            // 如果目标页面已在页面栈中，使用navigateBack
            const targetRoute = url.split('?')[0];
            const existingPageIndex = pages.findIndex(p => `/${p.route}` === targetRoute);

            if (existingPageIndex >= 0 && existingPageIndex < pages.length - 1) {
                // 目标页面在栈中，且不是当前页面
                const delta = pages.length - 1 - existingPageIndex;
                console.log(`Target page exists in stack, navigating back ${delta} pages`);
                wx.navigateBack({ delta: delta });
            } else {
                // 目标页面不在栈中，使用redirectTo或navigateTo
                if (options.replace) {
                    wx.redirectTo({ url: url });
                } else {
                    wx.navigateTo({ url: url });
                }
            }
        } catch (err) {
            console.error('Smart navigate error:', err);
            // 容错：直接使用redirectTo
            wx.redirectTo({ url: url });
        }
    },

    // 检查是否可以执行操作
    canPerformAction(action) {
        if (this.data.isReadOnly) {
            wx.showToast({
                title: '历史查看模式，无法操作',
                icon: 'none',
                duration: 2000
            });
            return false;
        }

        if (this.data.isProcessing) {
            wx.showToast({
                title: '操作进行中，请稍候',
                icon: 'none'
            });
            return false;
        }

        // 检查是否是房间成员
        const isMember = this.data.room.players.some(p =>
            String(p.id) === String(this.data.userInfo.id)
        );

        if (!isMember && action !== 'view') {
            wx.showToast({
                title: '仅房间成员可操作',
                icon: 'none'
            });
            return false;
        }

        return true;
    },

    onShow() {
        // Keep screen on
        wx.setKeepScreenOn({
            keepScreenOn: true
        });

        // 如果之前被隐藏，重新激活watchers
        if (!this.data.watchersActive && this.data.roomId && this.data.userInfo) {
            console.log('Page shown, reactivating watchers...');

            // 防抖：延迟100ms再重新激活，避免快速切换时重复创建
            if (this.reactivateTimer) {
                clearTimeout(this.reactivateTimer);
            }

            this.reactivateTimer = setTimeout(() => {
                // 再次检查状态，确保不重复创建
                if (!this.data.watchersActive && !this.roomWatcher && !this.roundsWatcher) {
                    this.batchUpdater.set({ watchersActive: true });
                    this.initRoomWatcher(this.data.roomId, this.data.userInfo);
                    if (this.data.roomId) {
                        this.initRoundsWatcher(this.data.roomId, this.data.userInfo);
                    }
                }
            }, 100);
        }

        // Refresh local user info
        const userInfo = wx.getStorageSync('hdpj_user_profile') || app.globalData.userInfo;
        if (userInfo) {
            this.batchUpdater.set({ userInfo });
            // Check if we need to sync to cloud
            if (this.data.room && this.data.room.players.length > 0) {
                const meInRoom = this.data.room.players.find(p => p.id === userInfo.id);
                if (meInRoom) {
                    if (meInRoom.name !== userInfo.name || meInRoom.avatarUrl !== userInfo.avatarUrl) {
                        this.syncPlayerInfoToCloud(userInfo);
                    }
                }
            }
        }
    },

    onHide() {
        console.log('Page hidden, closing watchers to save resources...');
        wx.setKeepScreenOn({ keepScreenOn: false });

        // 清除重新激活定时器
        if (this.reactivateTimer) {
            clearTimeout(this.reactivateTimer);
            this.reactivateTimer = null;
        }

        this.closeAllWatchers();
        this.batchUpdater.set({ watchersActive: false });
    },

    onUnload() {
        console.log('Page unloaded, cleaning up...');
        this.isUnloading = true; // 增加卸载标识

        // 移除网络状态监听器
        if (this.networkStatusListener) {
            wx.offNetworkStatusChange(this.networkStatusListener);
            this.networkStatusListener = null;
        }

        // 清除所有定时器
        if (this.reactivateTimer) {
            clearTimeout(this.reactivateTimer);
            this.reactivateTimer = null;
        }

        this.closeAllWatchers();
        if (this.batchUpdater) {
            this.batchUpdater.destroy();
        }
    },

    // Watcher管理方法
    closeAllWatchers() {
        // 关闭房间元数据监听
        if (this.roomWatcher) {
            try {
                const watcher = this.roomWatcher;
                this.roomWatcher = null; // 先清空引用防止重复进入
                watcher.close();
                console.log('Room watcher closed');
            } catch (e) {
                console.warn('Silent catch: Error closing room watcher:', e);
            }
        }

        // 关闭回合数据监听
        if (this.roundsWatcher) {
            try {
                const watcher = this.roundsWatcher;
                this.roundsWatcher = null; // 先清空引用
                watcher.close();
                console.log('Rounds watcher closed');
            } catch (e) {
                console.warn('Silent catch: Error closing rounds watcher:', e);
            }
        }
    },

    initRoomWatcher(roomId, currentUser, retryCount = 0) {
        const _this = this;

        // 强制关闭现有监听器（无论 retryCount）
        if (this.roomWatcher) {
            console.log('Closing existing room watcher before creating new one...');
            try {
                this.roomWatcher.close();
            } catch (e) {
                console.warn('Error closing existing room watcher:', e);
            }
            this.roomWatcher = null;
        }

        // 如果不是重试且监听器已存在，跳过
        if (retryCount === 0) {
            console.log('Initializing new room watcher...');
        } else {
            console.log(`Retrying room watcher (attempt ${retryCount})...`);
        }

        const db = wx.cloud.database();

        // Flags
        let hasProcessedInitialJoin = false;
        let isRoundsWatcherActive = false;

        // Local Data Cache
        this.currentRoomData = null;
        this.currentRoundsData = [];

        // 1. Watch Room Metadata
        // Handle both Doc ID and 6-digit Display ID
        const query = roomId.length === 6 ? { roomId: roomId } : { _id: roomId };

        // 延迟初始化watcher，确保wx.cloud完全初始化
        const initWatcher = () => {
            this.roomWatcher = db.collection(cloudApi.collectionName('rooms')).where(query).watch({
                onChange: function (snapshot) {
                    if (_this.isUnloading) return; // 卸载时不再处理回调

                    // Connection established/working, reset retries
                    retryCount = 0; // Reset retry count on successful change

                    // 如果之前有错误，现在恢复了，显示提示
                    if (_this.data.loadingState?.errorCount > 0) {
                        _this.setData({
                            'loadingState.errorCount': 0,
                            'loadingState.roomWatcher': true
                        });
                        wx.showToast({
                            title: '连接已恢复',
                            icon: 'success',
                            duration: 2000
                        });
                    }

                    if (snapshot.docs.length > 0) {
                        const roomData = snapshot.docs[0];
                        _this.data.docId = roomData._id;
                        _this.currentRoomData = roomData;


                        // Security: Force Read-Only if room is not active
                        if (roomData.status && roomData.status !== 'active') {
                            _this.batchUpdater.set({ isReadOnly: true });
                        }

                        // Validation: Check room type consistency
                        const expectedClubId = _this.data.cid || null;
                        const actualClubId = roomData.clubId || null;

                        // Case 1: Expected free room, but it's a club room
                        if (!expectedClubId && actualClubId) {
                            console.warn('Room type mismatch: expected free, got club');
                            wx.showModal({
                                title: '房间类型不匹配',
                                content: '该房间属于圈子对局，是否前往圈子页面？',
                                confirmText: '前往圈子',
                                cancelText: '返回首页',
                                success: (res) => {
                                    if (res.confirm) {
                                        wx.redirectTo({
                                            url: `/subpackages/package_club/pages/club/detail/index?id=${actualClubId}`
                                        });
                                    } else {
                                        wx.redirectTo({ url: '/pages/index/index' });
                                    }
                                }
                            });
                            return;
                        }

                        // Case 2: Expected club room, but ID doesn't match
                        if (expectedClubId && actualClubId &&
                            String(expectedClubId) !== String(actualClubId)) {
                            console.warn('Club ID mismatch:', expectedClubId, 'vs', actualClubId);
                            wx.showModal({
                                title: '房间不匹配',
                                content: '该房间属于其他圈子',
                                showCancel: false,
                                success: () => {
                                    _this.smartNavigateTo(`/subpackages/package_club/pages/club/detail/index?id=${expectedClubId}`, { replace: true });
                                }
                            });
                            return;
                        }

                        // Case 3: Expected club room, but it's a free room
                        if (expectedClubId && !actualClubId) {
                            console.warn('Room type mismatch: expected club, got free');
                            wx.showModal({
                                title: '房间类型不匹配',
                                content: '该房间为自由对局，不属于任何圈子',
                                confirmText: '继续加入',
                                cancelText: '返回圈子',
                                success: (res) => {
                                    if (!res.confirm) {
                                        wx.redirectTo({
                                            url: `/subpackages/package_club/pages/club/detail/index?id=${expectedClubId}`
                                        });
                                        return;
                                    }
                                    // Clear cid if user chooses to continue
                                    _this.setData({ cid: null });
                                }
                            });
                        }

                        // Ensure roomId is Display ID (6-digit) for UI and Rounds Query
                        if (roomData.roomId) {
                            _this.batchUpdater.set({ roomId: roomData.roomId });

                            // Lazy Start Rounds Watcher once we have the valid 6-digit ID
                            if (!isRoundsWatcherActive) {
                                isRoundsWatcherActive = true;
                                _this.initRoundsWatcher(roomData.roomId, currentUser);
                            }
                        }

                        // Load club info if this is a club room
                        if (roomData.clubId && !_this.data.club) {
                            console.log('Loading club info for club room:', roomData.clubId);
                            db.collection(cloudApi.collectionName('clubs')).doc(roomData.clubId).get().then(clubRes => {
                                if (clubRes.data) {
                                    _this.setData({
                                        club: {
                                            name: clubRes.data.name,
                                            avatar: clubRes.data.avatar,
                                            clubId: clubRes.data.clubId
                                        }
                                    });
                                    console.log('Club info loaded:', clubRes.data.name);
                                }
                            }).catch(err => {
                                console.warn('Failed to load club info:', err);
                            });
                        }

                        // Initial Join Logic (Add Self via Atomic Cloud Function)
                        // Checks if we are entering via Share Link and need to join cleanly
                        const isIn = roomData.players.find(p => p.id === currentUser.id);
                        const canJoin = !_this.data.isReadOnly && roomData.status === 'active';

                        if (!isIn && !hasProcessedInitialJoin && canJoin) {
                            hasProcessedInitialJoin = true;

                            // Call Atomic Join
                            console.log('User not in room, attempting atomic join...');
                            wx.cloud.callFunction({
                                name: 'joinRoom',
                                data: {
                                    roomId: roomData._id, // Internal Doc ID for safety
                                    userInfo: currentUser,
                                    targetClubId: _this.data.cid // PASS CLUB CONTEXT TO HARDEN JOIN LOGIC
                                }
                            }).then(res => {
                                if (res.result && res.result.joined) {
                                    console.log('Joined room successfully via Cloud');

                                    // --- Identity Sync (Critical Fix) ---
                                    if (res.result.openId) {
                                        const realOpenId = res.result.openId;
                                        if (currentUser.id !== realOpenId) {
                                            console.log('Syncing Identity:', currentUser.id, '->', realOpenId);
                                            currentUser.id = realOpenId;
                                            currentUser.openid = realOpenId;
                                            app.globalData.userInfo = currentUser;
                                            wx.setStorageSync('hdpj_user_profile', currentUser);
                                            _this.setData({ userInfo: currentUser });
                                        }
                                    }
                                    // ------------------------------------

                                    // 显示积分恢复提示
                                    if (res.result.recoveredScore !== undefined && res.result.recoveredScore > 0) {
                                        const roundsCount = res.result.recoveredRoundsCount || '多';
                                        wx.showModal({
                                            title: '重新加入成功',
                                            content: `已恢复您的历史积分 ${res.result.recoveredScore} 分（来自${roundsCount}局记录）`,
                                            showCancel: false,
                                            confirmText: '知道了',
                                            confirmColor: '#22c55e'
                                        });
                                    } else if (res.result.joined) {
                                        wx.showToast({
                                            title: '已加入房间',
                                            icon: 'success'
                                        });
                                    }

                                    // The watcher will fire again with new player list, 
                                    // so we don't strictly need to manually update local room, 
                                    // but for instant feedback we can.
                                    // Wait for next watch update is safer for consistency.
                                } else {
                                    throw new Error(res.result ? res.result.msg : 'Join Failed');
                                }
                            }).catch(err => {
                                console.error('Atomic Join Failed', err);
                                let msg = '加入失败';
                                if (err.message && err.message.includes('Room is full')) msg = '房间已满';

                                wx.showModal({
                                    title: '无法加入',
                                    content: msg,
                                    showCancel: false,
                                    success: () => {
                                        wx.reLaunch({ url: '/pages/index/index' });
                                    }
                                });
                                hasProcessedInitialJoin = false;
                            });
                        } else {
                            // User is already in room or cannot join, update UI
                            console.log(`Room Watcher onChange: ${roomData.players?.length || 0} players in room`);
                            console.log('Players:', roomData.players?.map(p => ({ id: p.id, name: p.name })));
                            _this.updateLocalRoom(currentUser);
                        }
                    } else {
                        // --- Room Dissolution Logic (P2) ---
                        // If room is deleted (usually because club was dissolved OR room expired)
                        if (_this.data.cid && _this.data.cid !== '---') {
                            app.ejectFromClub(_this.data.cid, '该房间已关闭或所属圈子已解散');
                        } else {
                            // Free Room or unknown context
                            wx.showModal({
                                title: '房间已失效',
                                content: '该房间不存在、已关闭或您无权访问。',
                                showCancel: false,
                                confirmText: '返回首页',
                                success: () => {
                                    wx.reLaunch({ url: '/pages/index/index' });
                                }
                            });
                        }
                    }
                },
                onError: function (err) {
                    if (_this.isUnloading) return; // 卸载时不再处理回调

                    console.error('Room Watcher Error:', err);

                    // 更新错误统计
                    _this.setData({
                        'loadingState.errorCount': (_this.data.loadingState?.errorCount || 0) + 1,
                        'loadingState.lastErrorTime': Date.now()
                    });

                    // 只在页面激活状态才重试
                    if (!_this.data.watchersActive) {
                        console.log('Watchers inactive, skipping retry');
                        return;
                    }

                    const maxRetries = 5;
                    const currentRetryCount = retryCount;

                    if (currentRetryCount < maxRetries) {
                        const delay = Math.pow(2, currentRetryCount) * 1000;
                        const remainingRetries = maxRetries - currentRetryCount;

                        // 显示明显的重试提示（使用modal而非toast），提供手动重试选项
                        wx.showModal({
                            title: '实时连接断开',
                            content: `正在尝试重新连接... (${remainingRetries}/${maxRetries})`,
                            showCancel: true,
                            cancelText: '手动重试',
                            confirmText: '等待',
                            confirmColor: '#3b82f6',
                            success: (res) => {
                                if (res.cancel) {
                                    // 用户选择手动重试
                                    if (_this.data.watchersActive) {
                                        _this.initRoomWatcher(roomId, currentUser, 0); // 重置重试计数
                                    }
                                } else {
                                    // 用户选择等待，自动重试
                                    setTimeout(() => {
                                        if (_this.data.watchersActive) {
                                            _this.initRoomWatcher(roomId, currentUser, retryCount + 1);
                                        }
                                    }, delay);
                                }
                            }
                        });

                        console.log(`Retrying Room Watcher in ${delay}ms... (attempt ${currentRetryCount + 1}/${maxRetries})`);
                    } else {
                        // 达到最大重试次数
                        wx.showModal({
                            title: '连接失败',
                            content: '已达到最大重试次数，请刷新页面重试',
                            showCancel: false,
                            confirmText: '刷新页面',
                            confirmColor: '#ef4444',
                            success: () => {
                                wx.reLaunch({ url: `/subpackages/package_game/pages/room/index?roomId=${_this.data.roomId}` });
                            }
                        });
                        console.warn('Max retries reached for Room Watcher. Falling back to static fetch.');

                        // 显示离线状态提示
                        _this.setData({ 'loadingState.roomWatcher': false });

                        // Fallback to static fetch after retries fail
                        db.collection(cloudApi.collectionName('rooms')).where(query).get().then(res => {
                            if (res.data.length > 0) {
                                const roomData = res.data[0];
                                _this.data.docId = roomData._id;
                                _this.currentRoomData = roomData;

                                // Ensure roomId is Display ID if available
                                if (roomData.roomId) {
                                    _this.setData({ roomId: roomData.roomId });
                                }

                                _this.updateLocalRoom(currentUser);
                            }
                        });
                    }
                }
            });
        };

        // 延迟初始化watcher，避免wx.cloud未完全初始化的问题
        setTimeout(() => {
            initWatcher();
        }, 100);
    },

    initRoundsWatcher(displayRoomId, currentUser, retryCount = 0) {
        const _this = this;

        // 强制关闭现有监听器（无论 retryCount）
        if (this.roundsWatcher) {
            console.log('Closing existing rounds watcher before creating new one...');
            try {
                this.roundsWatcher.close();
            } catch (e) {
                console.warn('Error closing existing rounds watcher:', e);
            }
            this.roundsWatcher = null;
        }

        // 如果不是重试且监听器已存在，跳过
        if (retryCount === 0) {
            console.log('Initializing new rounds watcher...');
        } else {
            console.log(`Retrying rounds watcher (attempt ${retryCount})...`);
        }

        const db = wx.cloud.database();

        // 微信云数据库 watch 的硬性限制是 20 条记录
        // 更多历史数据可以通过分页加载获取
        const roundsLimit = 20;

        console.log(`Starting Rounds Watcher for: ${displayRoomId} (limit: ${roundsLimit})`);

        this.roundsWatcher = db.collection(cloudApi.collectionName('rounds')).where({
            roomId: displayRoomId // Must be 6-digit ID
        }).orderBy('timestamp', 'desc').limit(roundsLimit).watch({
            onChange: function (snapshot) {
                if (_this.isUnloading) return; // 卸载时不再处理回调

                _this.currentRoundsData = snapshot.docs;

                // 如果之前有错误，现在恢复了，显示提示
                if (_this.data.loadingState?.errorCount > 0) {
                    _this.batchUpdater.set({
                        'loadingState.errorCount': 0,
                        'loadingState.roundsWatcher': true
                    });
                    wx.showToast({
                        title: '回合数据连接已恢复',
                        icon: 'success',
                        duration: 2000
                    });
                }

                // 新数据到达，清除缓存并重新计算
                _this.invalidateClusterCache();

                // 更新是否有更多数据的状态
                _this.batchUpdater.set({
                    hasMoreRounds: snapshot.docs.length >= roundsLimit
                });
                _this.updateLocalRoom(currentUser);
            },
            onError: function (err) {
                if (_this.isUnloading) return; // 卸载时不再处理回调

                console.error('Rounds Watcher Error:', err);

                // 更新加载状态
                _this.setData({
                    'loadingState.roundsWatcher': false,
                    'loadingState.errorCount': (_this.data.loadingState?.errorCount || 0) + 1
                });

                if (!_this.data.watchersActive) {
                    console.log('Watchers inactive, skipping retry');
                    return;
                }

                const maxRetries = 5;
                if (retryCount < maxRetries) {
                    const delay = Math.pow(2, retryCount) * 1000;
                    const remainingRetries = maxRetries - retryCount;

                    wx.showModal({
                        title: '回合数据连接断开',
                        content: `正在尝试重新连接... (${remainingRetries}/${maxRetries})`,
                        showCancel: true,
                        cancelText: '手动重试',
                        confirmText: '等待',
                        confirmColor: '#3b82f6',
                        success: (res) => {
                            if (res.cancel) {
                                // 用户选择手动重试
                                if (_this.data.watchersActive) {
                                    _this.initRoundsWatcher(displayRoomId, currentUser, 0); // 重置重试计数
                                }
                            } else {
                                // 用户选择等待，自动重试
                                setTimeout(() => {
                                    if (_this.data.watchersActive) {
                                        _this.initRoundsWatcher(displayRoomId, currentUser, retryCount + 1);
                                    }
                                }, delay);
                            }
                        }
                    });
                    console.log(`Retrying Rounds Watcher in ${delay}ms...`);
                } else {
                    wx.showModal({
                        title: '回合数据加载失败',
                        content: '无法连接到回合数据，请刷新页面',
                        showCancel: false,
                        confirmText: '刷新',
                        confirmColor: '#ef4444',
                        success: () => {
                            wx.reLaunch({ url: `/subpackages/package_game/pages/room/index?roomId=${_this.data.roomId}` });
                        }
                    });
                    console.warn('Max retries reached for Rounds Watcher.');
                }
            }
        });
    },

    // 加载更多历史回合数据
    async loadMoreRounds() {
        if (this.data.isLoadingMoreRounds || !this.data.hasMoreRounds) {
            return;
        }

        this.setData({ isLoadingMoreRounds: true });
        wx.showLoading({ title: '加载中...', mask: true });

        try {
            const db = wx.cloud.database();
            const currentPage = this.data.roundsPage;
            const pageSize = this.data.roundsPageSize;

            // 获取下一页数据
            const res = await db.collection(cloudApi.collectionName('rounds'))
                .where({ roomId: this.data.roomId })
                .orderBy('timestamp', 'desc')
                .skip(currentPage * pageSize)
                .limit(pageSize)
                .get();

            if (res.data && res.data.length > 0) {
                // 合并新数据到现有数据
                const newRounds = [...this.currentRoundsData, ...res.data];
                this.currentRoundsData = newRounds;

                // 更新UI
                this.setData({
                    roundsPage: currentPage + 1,
                    hasMoreRounds: res.data.length >= pageSize,
                    isLoadingMoreRounds: false
                });

                // 刷新本地房间数据（包括走势图）
                this.updateLocalRoom(this.data.userInfo);
                this.invalidateClusterCache();

                wx.showToast({ title: `已加载 ${res.data.length} 条记录`, icon: 'success' });
            } else {
                // 没有更多数据
                this.setData({ hasMoreRounds: false, isLoadingMoreRounds: false });
                wx.showToast({ title: '没有更多数据', icon: 'none' });
            }
        } catch (err) {
            console.error('Load more rounds error:', err);
            this.setData({ isLoadingMoreRounds: false });
            wx.showToast({ title: '加载失败，请重试', icon: 'none' });
        } finally {
            wx.hideLoading();
        }
    },

    // 生成数据哈希(简单版本)
    generateRoundsHash(rounds) {
        if (!rounds || rounds.length === 0) return 'empty';
        // 使用长度+最后一条的timestamp作为简单哈希
        const lastRound = rounds[rounds.length - 1];
        return `${rounds.length}_${lastRound.timestamp || 0}`;
    },

    clusterRounds(rounds) {
        if (!rounds || rounds.length === 0) return [];

        // 检查缓存
        const currentHash = this.generateRoundsHash(rounds);
        if (this.lastRoundsHash === currentHash && this.clusteredRoundsCache) {
            console.log('Using cached cluster result');
            return this.clusteredRoundsCache;
        }

        // 执行聚类计算
        console.log('Computing cluster...');

        // 1. Sort ASC (Oldest -> Newest)
        const sorted = [...rounds].sort((a, b) => a.timestamp - b.timestamp);
        const result = [];
        const THRESHOLD = 3 * 60 * 1000; // 3 Minutes

        let currentBatch = null;
        let lastTime = 0;

        sorted.forEach((r) => {
            const rScore = r.scores || {};

            if (!currentBatch) {
                // Start new batch
                currentBatch = {
                    ...r,
                    scores: { ...rScore } // Clone scores
                };
                lastTime = r.timestamp;
            } else {
                // Sliding Window Logic: Compare with LAST event time, not batch start time
                // Matches club/detail/index.js logic
                if (r.timestamp - lastTime > THRESHOLD) {
                    // Commit previous batch
                    result.push(currentBatch);
                    // Start new
                    currentBatch = { ...r, scores: { ...rScore } };
                    lastTime = r.timestamp;
                } else {
                    // Merge into current
                    Object.keys(rScore).forEach(pid => {
                        currentBatch.scores[pid] = (currentBatch.scores[pid] || 0) + rScore[pid];
                    });
                    // Update info to latest
                    currentBatch.timestamp = r.timestamp;
                    currentBatch.id = r.id;
                    lastTime = r.timestamp;
                }
            }
        });

        if (currentBatch) result.push(currentBatch);

        // 更新缓存
        this.lastRoundsHash = currentHash;
        this.clusteredRoundsCache = result;

        return result;
    },

    // 清除缓存(在重要数据更新时)
    invalidateClusterCache() {
        this.lastRoundsHash = null;
        this.clusteredRoundsCache = null;
    },

    updateLocalRoom(currentUser) {
        if (!this.currentRoomData) return;

        const roomData = this.currentRoomData;

        // 检测房主变更（用于通知新房主）
        const currentHostId = this.data.room?.host?.id || this.data.room?.host?.openId;
        const newHostId = roomData?.host?.id || roomData?.host?.openId;

        if (currentHostId && newHostId && String(currentHostId) !== String(newHostId)) {
            const newHost = roomData.players.find(p =>
                String(p.id) === String(newHostId) || String(p.openId) === String(newHostId)
            );
            if (newHost) {
                // 如果当前用户是新房主，显示通知
                if (String(currentUser.id) === String(newHostId)) {
                    wx.showModal({
                        title: '房主权限已转移',
                        content: '原房主已离开，您已成为新的房主',
                        showCancel: false,
                        confirmText: '我知道了',
                        success: () => {
                            // 可以在这里记录用户已查看通知
                        }
                    });
                }
                console.log(`Host changed: ${currentHostId} -> ${newHostId} (${newHost.name})`);
            }
        }

        // Merge rounds into roomFullData for logic access
        // We attach it artificially so existing logic (e.g. counting rounds) works if it checks this.roomFullData.rounds
        // BUT: Note that we only have the last 20 rounds initially.
        const roundsData = this.currentRoundsData || [];

        this.roomFullData = {
            ...roomData,
            rounds: roundsData
        };

        // Sort players
        const sorted = [...roomData.players]
            .map(p => ({
                ...p,
                isMe: String(p.id) === String(currentUser.id)
            }))
            .sort((a, b) => b.totalScore - a.totalScore);
        const myPlayer = roomData.players.find(p => String(p.id) === String(currentUser.id));
        const myRank = sorted.findIndex(p => String(p.id) === String(currentUser.id)) + 1;

        // 计算活跃玩家数量（不包括已退出的）
        const activePlayersCount = roomData.players.filter(p => p.hasLeft !== true).length;

        const viewRoom = {
            ...roomData,
            rounds: [] // View never needs rounds list for the main scoreboard
        };

        // Apply Logic Alignment: Use Clustered Rounds for Chart
        const clusteredChartRounds = this.clusterRounds(roundsData);

        // 过滤出活跃玩家用于记分界面
        const activePlayers = roomData.players.filter(p => p.hasLeft !== true);

        // 计算是否可以结算
        const isHost = roomData.host?.id === currentUser.id || roomData.host?.openId === currentUser.id;
        const canSettle = !this.data.isReadOnly && isHost && roomData.status === 'active';

        // 判定是否为圈子房间（全系统统一判定标准）
        const isClubRoom = !!(roomData.clubId && roomData.clubId !== '---' && roomData.clubId !== '');

        // 我们也同步更新 data 中的 cid，确保两端一致
        const cid = isClubRoom ? roomData.clubId : null;

        this.batchUpdater.set({
            room: viewRoom,
            isClubRoom: isClubRoom,
            cid: cid,
            sortedPlayers: sorted,
            inputPlayers: activePlayers, // 只显示活跃玩家用于记分
            chartPlayers: roomData.players, // 走势图显示所有玩家（包括已退出的）
            chartRounds: clusteredChartRounds, // Pass clustered data to chart
            myScore: myPlayer ? myPlayer.totalScore : 0,
            myRank: myPlayer ? myRank : '-',
            activePlayersCount: activePlayersCount,
            loading: false,
            canSettle: canSettle,
            baseScore: roomData.baseScore || 1 // Sync base score from server, default 1
        });
    },



    // --- UI Interactions ---

    openAddScoreModal() {
        if (!this.canPerformAction('addScore')) return;
        if (this.data.room.players.length < 2) {
            wx.showToast({ title: '人数不足', icon: 'none' });
            return;
        }
        this.setData({ showAddScoreModal: true });
    },

    closeAddScoreModal() {
        this.setData({ showAddScoreModal: false });
    },

    setScoreMode(e) {
        this.setData({ scoreMode: e.currentTarget.dataset.mode });
    },

    selectWinner(e) {
        const id = e.currentTarget.dataset.id;
        // Remove from losers if present
        let losers = this.data.selectedLosers.filter(l => l !== id);
        this.setData({
            selectedWinner: id,
            selectedLosers: losers
        });
    },

    toggleLoser(e) {
        const id = e.currentTarget.dataset.id;
        if (id === this.data.selectedWinner) return; // Cannot be winner and loser

        let losers = this.data.selectedLosers;
        if (losers.includes(id)) {
            losers = losers.filter(l => l !== id);
        } else {
            losers.push(id);
        }
        this.setData({ selectedLosers: losers });
    },

    onQuickScoreInput(e) {
        this.setData({ quickScoreAmount: e.detail.value });
    },

    onManualScoreInput(e) {
        const id = e.currentTarget.dataset.id;
        const val = e.detail.value;
        const temp = this.data.tempScores;
        temp[id] = val;
        this.setData({ tempScores: temp });
    },

    async submitRound() {
        if (!this.canPerformAction('addScore')) return;
        if (this.data.room.players.length < 2) {
            wx.showToast({ title: '人数不足', icon: 'none' });
            return;
        }

        this.setData({ isProcessing: true });

        wx.showLoading({ title: '提交中...', mask: true });

        try {
            const { scoreMode, selectedWinner, selectedLosers, quickScoreAmount, tempScores, room } = this.data;
            let numericScores = {};

            if (scoreMode === 'quick') {
                if (!selectedWinner || selectedLosers.length === 0 || !quickScoreAmount) {
                    throw new Error('信息不完整');
                }
                const score = parseInt(quickScoreAmount);
                if (isNaN(score) || score <= 0) {
                    throw new Error('请输入正确的积分数值');
                }
                const totalWin = score * selectedLosers.length;

                room.players.forEach(p => numericScores[p.id] = 0);
                numericScores[selectedWinner] = totalWin;
                selectedLosers.forEach(lid => numericScores[lid] = -score);

            } else {
                // Manual
                let total = 0;
                let isValid = true;
                room.players.forEach(p => {
                    const val = parseInt(tempScores[p.id] || "0");
                    if (isNaN(val)) isValid = false;
                    numericScores[p.id] = val;
                    total += val;
                });

                if (!isValid) {
                    throw new Error('请输入有效数字');
                }
                if (total !== 0) {
                    throw new Error(`总分不为0 (当前总计: ${total > 0 ? '+' : ''}${total})`);
                }
                if (Object.keys(numericScores).every(key => numericScores[key] === 0)) {
                    throw new Error('请输入积分数值');
                }
            }

            const res = await this.pushRoundToCloud(numericScores, 'game');
            if (res.success) {
                // 清除缓存，确保下次重新计算
                this.invalidateClusterCache();

                this.setData({
                    showAddScoreModal: false,
                    selectedWinner: null,
                    selectedLosers: [],
                    quickScoreAmount: '',
                    tempScores: {}
                });
                wx.showToast({ title: '记分成功', icon: 'success' });
                // Stage 3: Immediate Cross-page Notice (P0)
                app.emit('roundUpdate', { roomId: this.data.roomId });
            } else {
                throw new Error(res.msg || '提交失败');
            }
        } catch (err) {
            console.error('Submit Error', err);
            wx.showToast({ title: err.message || '提交失败', icon: 'none' });
        } finally {
            wx.hideLoading();
            this.setData({ isProcessing: false });
        }
    },

    async pushRoundToCloud(scores, type = 'game') {
        try {
            const res = await cloudApi.call('submitRound', {
                docId: this.data.docId, // Use Doc ID for stable update
                scores: scores,
                type: type
            });
            if (res.result && res.result.success) {
                return { success: true };
            } else {
                console.error('Cloud function submitRound failed', res.result);
                return { success: false, msg: res.result?.msg || '云函数调用失败' };
            }
        } catch (err) {
            console.error('Cloud function submitRound exception', err);
            return { success: false, msg: '网络异常或云函数错误' };
        }
    },

    syncPlayerInfoToCloud(newUserInfo) {
        console.log('Syncing profile to cloud room...');
        cloudApi.call('updateProfile', {
            roomId: this.data.docId,
            userInfo: newUserInfo
        }).then(res => {
            if (res.result && res.result.success) {
                console.log('Profile synced atomically');
            } else {
                console.warn('Profile sync failed', res.result);
            }
        }).catch(console.error);
    },

    handlePlayerClick(e) {
        if (!this.canPerformAction('transfer')) return;

        const p = e.currentTarget.dataset.player;
        const myId = String(this.data.userInfo.id);
        const targetId = String(p.id);

        if (targetId === myId) return;

        // 禁止向已退出玩家转账
        if (p.hasLeft === true) {
            wx.showToast({ title: '该玩家已退出房间，无法转账', icon: 'none' });
            return;
        }

        this.setData({
            transferTarget: p,
            showTransferModal: true,
            transferAmount: ''
        });
    },

    closeTransferModal() {
        this.setData({ showTransferModal: false });
    },

    onTransferInput(e) {
        this.setData({ transferAmount: e.detail.value });
    },

    onKeypadTap(e) {
        const val = e.currentTarget.dataset.value;
        const current = this.data.transferAmount || '';
        if (current.length >= 6) return; // Limit length
        this.setData({ transferAmount: current + val });
    },

    onBackspaceTap() {
        const current = this.data.transferAmount || '';
        if (!current) return;
        this.setData({ transferAmount: current.slice(0, -1) });
    },

    preventBubble() { },

    async submitTransfer() {
        if (this.data.isReadOnly || this.data.isProcessing) return;

        const amount = parseInt(this.data.transferAmount);
        const baseScore = this.data.baseScore || 1;

        if (isNaN(amount) || amount <= 0) {
            wx.showToast({ title: '请输入正整数', icon: 'none' });
            return;
        }

        // Base Score Validation
        if (amount % baseScore !== 0) {
            wx.showModal({
                title: '金额无效',
                content: `转账金额必须是底分 (${baseScore}) 的倍数`,
                showCancel: false,
                confirmText: '知道了'
            });
            return;
        }

        const myId = String(this.data.userInfo.id);
        const targetId = String(this.data.transferTarget.id);

        if (myId === targetId) {
            wx.showToast({ title: '不能给自己转账', icon: 'none' });
            return;
        }

        this.setData({ isProcessing: true });
        wx.showLoading({ title: '转账中...', mask: true });

        try {
            const scores = {};
            scores[myId] = -amount;
            scores[targetId] = amount;

            const res = await this.pushRoundToCloud(scores, 'transfer');
            if (res.success) {
                this.setData({ showTransferModal: false });
                wx.showToast({ title: '转账成功', icon: 'success' });
            } else {
                throw new Error(res.msg || '转账失败');
            }
        } catch (err) {
            console.error(err);
            wx.showToast({ title: err.message || '网络异常', icon: 'none' });
        } finally {
            wx.hideLoading();
            this.setData({ isProcessing: false });
        }
    },

    // --- Base Score UI Methods ---

    openBaseScoreModal() {
        if (!this.canPerformAction('view')) return; // Check general permission
        // Double check host permission
        const isHost = this.data.room.host?.id === this.data.userInfo.id || this.data.room.host?.openId === this.data.userInfo.id;
        if (!isHost) {
            wx.showToast({ title: '仅房主可设置底分', icon: 'none' });
            return;
        }

        this.setData({
            showBaseScoreModal: true,
            newBaseScore: this.data.baseScore
        });
    },

    closeBaseScoreModal() {
        this.setData({
            showBaseScoreModal: false,
            newBaseScore: ''
        });
    },

    onBaseScoreInput(e) {
        this.setData({ newBaseScore: e.detail.value });
    },

    async submitBaseScore() {
        const score = parseInt(this.data.newBaseScore);
        if (isNaN(score) || score <= 0) {
            wx.showToast({ title: '请输入大于0的整数', icon: 'none' });
            return;
        }

        this.setData({ isProcessing: true });
        wx.showLoading({ title: '设置中...', mask: true });

        try {
            const res = await cloudApi.call('updateRoom', {
                action: 'updateSettings',
                roomId: this.data.docId,
                settings: {
                    baseScore: score
                }
            });

            if (res.result && res.result.success) {
                this.setData({
                    baseScore: score,
                    showBaseScoreModal: false
                });
                wx.showToast({ title: '设置成功', icon: 'success' });
            } else {
                throw new Error(res.result?.msg || '设置失败');
            }
        } catch (err) {
            console.error('Update Base Score Error:', err);
            wx.showToast({ title: err.message || '网络异常', icon: 'none' });
        } finally {
            wx.hideLoading();
            this.setData({ isProcessing: false });
        }
    },

    handleLeave() {
        this.setData({
            showLeaveModal: true
        });
    },

    closeLeaveModal() {
        this.setData({
            showLeaveModal: false
        });
    },

    confirmLeave() {
        this.setData({
            showLeaveModal: false
        });

        // 差异化处理：自由房支持退出释放，圈子房仅导航返回
        const isClubRoom = this.data.cid && this.data.cid !== '---';

        if (isClubRoom) {
            // 圈子房：智能回退逻辑，解决双重返回Bug
            const pages = getCurrentPages();
            const clubId = this.data.cid || this.data.room?.clubId;
            let targetDelta = -1;

            // 搜索页面栈，寻找最近的该圈子详情页
            for (let i = pages.length - 1; i >= 0; i--) {
                const page = pages[i];
                if (page.route.indexOf('pages/club/detail/index') !== -1 && (page.data.clubId === clubId || page.options?.id === clubId)) {
                    targetDelta = pages.length - 1 - i;
                    break;
                }
            }

            if (targetDelta > 0) {
                console.log('Intelligent Back: found club detail in stack, delta:', targetDelta);
                wx.navigateBack({ delta: targetDelta });
            } else {
                console.log('Intelligent Redirect: club detail not in stack, using redirectTo');
                wx.redirectTo({
                    url: `/subpackages/package_club/pages/club/detail/index?id=${clubId}`
                });
            }
        } else {
            // 自由房：执行真正的退出并释放名额
            this.leaveAndRelease();
        }
    },

    async leaveAndRelease() {
        if (this.data.isProcessing) return;

        // 检查 docId 是否已设置
        if (!this.ensureDocIdBeforeLeave()) {
            return;
        }

        this.setData({ isProcessing: true });

        wx.showLoading({ title: '退出中...', mask: true });

        try {
            const res = await cloudApi.call('leaveRoom', {
                docId: this.data.docId
            });

            wx.hideLoading();
            this.setData({ isProcessing: false });

            if (res.result && res.result.success) {
                // 立即更新本地显示：将玩家标记为已退出（软删除）
                const updatedPlayers = this.data.room.players.map(p => {
                    if (String(p.id) === String(this.data.userInfo.id) ||
                        String(p.openid) === String(this.data.userInfo.id)) {
                        return { ...p, hasLeft: true };
                    }
                    return p;
                });

                // 重新计算活跃玩家数量
                const activeCount = updatedPlayers.filter(p => p.hasLeft !== true).length;

                this.setData({
                    'room.players': updatedPlayers,
                    sortedPlayers: updatedPlayers.sort((a, b) => b.totalScore - a.totalScore),
                    activePlayersCount: activeCount
                });

                wx.showToast({
                    title: '已退出房间',
                    icon: 'success',
                    duration: 2000
                });

                // 延迟跳转，让用户看到提示
                setTimeout(() => {
                    wx.reLaunch({ url: '/pages/index/index' });
                }, 2000);
            } else {
                throw new Error(res.result.msg || '退出失败');
            }
        } catch (err) {
            wx.hideLoading();
            this.setData({ isProcessing: false });
            console.error('Leave Room Error:', err);
            wx.showToast({
                title: err.message || '退出失败',
                icon: 'none'
            });
        }
    },


    openProfile() {
        wx.navigateTo({
            url: '/pages/profile/index'
        });
    },

    async showScoreDetail() {
        // Reset list state for fresh view
        this.setData({
            showScoreDetailModal: true,
            scoreDetailList: [],
            scoreDetailHasMore: true,
            scoreDetailLoading: true
        });

        this.scoreDetailCursor = null; // Reset cursor

        await this.loadMoreScoreDetails();
    },

    async loadMoreScoreDetails() {
        if (!this.data.scoreDetailHasMore && this.scoreDetailCursor) return;
        if (this.data.isLoadingScoreDetail) return;

        this.setData({ isLoadingScoreDetail: true });

        try {
            const batchSize = 20;
            const res = await this.fetchScoreDetailBatch(this.scoreDetailCursor, batchSize);

            const newItems = res.list.map(item => this.formatScoreDetail(item));

            this.setData({
                scoreDetailList: [...this.data.scoreDetailList, ...newItems],
                scoreDetailHasMore: res.hasMore,
                scoreDetailLoading: false,
                isLoadingScoreDetail: false
            });

            this.scoreDetailCursor = res.nextCursor;

        } catch (err) {
            console.error(err);
            this.setData({
                isLoadingScoreDetail: false,
                scoreDetailLoading: false
            });
            wx.showToast({ title: '加载失败', icon: 'none' });
        }
    },

    async fetchScoreDetailBatch(cursorTimestamp, limit = 20) {
        const db = wx.cloud.database();
        let query = db.collection(cloudApi.collectionName('rounds'))
            .where({ roomId: this.data.roomId })
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .field({
                _id: true,
                id: true,
                timestamp: true,
                scores: true,
                type: true
            });

        if (cursorTimestamp) {
            query = query.where({
                timestamp: db.command.lt(cursorTimestamp)
            });
        }

        const res = await query.get();
        const list = res.data || [];
        const hasMore = list.length >= limit;
        const nextCursor = list.length > 0 ? list[list.length - 1].timestamp : null;

        return { list, hasMore, nextCursor };
    },

    formatScoreDetail(round) {
        const players = this.data.room.players || [];
        const date = new Date(round.timestamp);
        const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;

        let sender = null;
        let receiver = null;
        let amount = 0;

        Object.keys(round.scores).forEach(pid => {
            const score = round.scores[pid];
            const p = players.find(player => String(player.id) === String(pid));
            if (!p) return;

            if (score < 0) {
                sender = p;
                amount = Math.abs(score);
            } else if (score > 0) {
                receiver = p;
            }
        });

        // Fallback for system message or incomplete records
        let desc = '记录';
        if (sender && receiver) {
            desc = `${sender.name} 给 ${receiver.name}`;
        }

        return {
            uniqueId: round.id || round._id,
            time: timeStr,
            senderName: sender ? sender.name : '系统',
            senderAvatar: sender ? sender.avatarUrl : '',
            receiverName: receiver ? receiver.name : '',
            receiverAvatar: receiver ? receiver.avatarUrl : '',
            amount: amount,
            desc: desc // Helper for UI
        };
    },

    closeScoreDetailModal() {
        this.setData({
            showScoreDetailModal: false
        });
    },

    // --- Chart Modal ---
    async openChartModal() {
        this.setData({ showChartModal: true });

        // Independent fetch for chart data (Full history needed)
        if (!this.data.chartDataLoaded) {
            await this.fetchChartData();
        }
    },

    async fetchChartData() {
        this.setData({ chartLoading: true });
        wx.showLoading({ title: '加载走势...', mask: true });

        try {
            const db = wx.cloud.database();
            // Optimized fetch: limit 1000, only scores/timestamp
            const res = await db.collection(cloudApi.collectionName('rounds'))
                .where({ roomId: this.data.roomId })
                .orderBy('timestamp', 'desc') // Latest first
                .limit(1000)
                .field({
                    timestamp: true,
                    scores: true
                })
                .get();

            if (res.data) {
                // Must reverse to be chronological for clustering
                const chronological = res.data.reverse();
                const clustered = this.clusterRounds(chronological);

                this.setData({
                    chartRounds: clustered,
                    chartDataLoaded: true
                });
            }
        } catch (err) {
            console.error('Fetch Chart Error:', err);
            wx.showToast({ title: '加载走势失败', icon: 'none' });
        } finally {
            wx.hideLoading();
            this.setData({ chartLoading: false });
        }
    },

    closeChartModal() {
        this.setData({ showChartModal: false });
    },

    preventOverlayScroll(e) {
        // Prevent overlay from scrolling when touching the modal content
        return false;
    },

    // Settlement Modal (Game Over / Final Report)
    openSettlementModal() {
        const isSettled = this.data.room && this.data.room.status === 'settled';

        // Block interaction in Read-Only Mode ONLY if it's not settled yet
        // If it's settled, we SHOULD allow viewing the final report and winner
        if (this.data.isReadOnly && !isSettled) return;

        // Security Check: Only players in the room can trigger settlement (Before it's settled)
        // Once settled, anybody who can see the room can see the report
        if (!isSettled) {
            const isMember = this.data.room.players.some(p => String(p.id) === String(this.data.userInfo.id));
            if (!isMember) {
                wx.showToast({ title: '仅房间成员可操作', icon: 'none' });
                return;
            }
        }

        const players = this.data.room.players;
        if (!players || players.length === 0) return;

        // 1. Find Big Winner
        const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);
        const bigWinner = sorted[0];

        // 2. Calculate Settlement (Who pays Whom)
        // Simple greedy algorithm: match biggest loser with biggest winner
        let winners = players.filter(p => p.totalScore > 0).sort((a, b) => b.totalScore - a.totalScore).map(p => ({ ...p, remainder: p.totalScore }));
        let losers = players.filter(p => p.totalScore < 0).sort((a, b) => a.totalScore - b.totalScore).map(p => ({ ...p, remainder: Math.abs(p.totalScore) }));

        const transfers = [];

        let wIndex = 0;
        let lIndex = 0;
        let safetyCounter = 0;

        while (wIndex < winners.length && lIndex < losers.length) {
            safetyCounter++;
            if (safetyCounter > 500) {
                console.warn('Settlement calculation exceeded safety limit');
                break;
            }
            let winner = winners[wIndex];
            let loser = losers[lIndex];

            let amount = Math.min(winner.remainder, loser.remainder);

            if (amount > 0) {
                transfers.push({
                    fromId: loser.id,
                    fromName: loser.name,
                    fromAvatar: loser.avatarUrl,
                    toId: winner.id,
                    toName: winner.name,
                    toAvatar: winner.avatarUrl,
                    amount: amount
                });
            }

            winner.remainder -= amount;
            loser.remainder -= amount;

            if (winner.remainder <= 0.01) wIndex++;
            if (loser.remainder <= 0.01) lIndex++;
        }

        // 3. Group by Receiver (Merged Collection)
        const groupsMap = {};
        transfers.forEach(t => {
            const key = t.toId;
            if (!groupsMap[key]) {
                groupsMap[key] = {
                    receiver: { name: t.toName, avatar: t.toAvatar },
                    totalAmount: 0,
                    payers: []
                };
            }
            groupsMap[key].totalAmount += t.amount;
            groupsMap[key].payers.push({
                name: t.fromName,
                avatar: t.fromAvatar,
                amount: t.amount
            });
        });

        const settlementGroups = Object.keys(groupsMap).map(key => groupsMap[key]);

        this.setData({
            showSettlementModal: true,
            settlementBigWinner: bigWinner,
            settlementGroups: settlementGroups
        });
    },

    closeSettlementModal() {
        this.setData({ showSettlementModal: false });
    },

    confirmSettlement() {
        if (this.data.isReadOnly || this.data.isProcessing) return;

        // Security: only host can settle
        if (!this.data.room || !this.data.room.host) {
            console.error('Room or host data not available:', this.data.room);
            wx.showToast({ title: '房间数据异常，请刷新重试', icon: 'none' });
            return;
        }

        const isHost = this.data.room.host.id === this.data.userInfo.id || this.data.room.host.openId === this.data.userInfo.id;
        if (!isHost) {
            wx.showToast({ title: '仅房主可执行结算', icon: 'none' });
            return;
        }

        // 统一显示确认对话框（自由房间和圈子房间相同）
        wx.showModal({
            title: '结束对局确认',
            content: '确定要结束本次对局吗？结束后将将无法再添加分数。',
            confirmText: '确认结束',
            confirmColor: '#3b82f6',
            success: (res) => {
                if (res.confirm) {
                    this.setData({ isProcessing: true });
                    wx.showLoading({ title: '正在结束...' });

                    cloudApi.call('settleRoom', {
                        docId: this.data.docId
                    }).then(res => {
                        wx.hideLoading();
                        this.setData({ isProcessing: false });

                        if (res.result && res.result.success) {
                            // 统一成功提示
                            wx.showToast({ title: '对局已结束', icon: 'success' });
                            // 保持结算弹窗开启，由 Watcher 更新 room.status 后通过 WXML 自动切换底部按钮
                        } else {
                            wx.showToast({ title: res.result.msg || '结算失败', icon: 'none' });
                        }
                    }).catch(err => {
                        wx.hideLoading();
                        this.setData({ isProcessing: false });
                        console.error('SettleRoom error', err);

                        // 详细错误分析和提示
                        let errorMsg = '网络请求失败';

                        if (err.errCode === -1) {
                            errorMsg = '网络连接超时，请检查网络后重试';
                        } else if (err.errCode === -502001) {
                            errorMsg = '云函数执行失败，请联系管理员';
                        } else if (err.errMsg) {
                            if (err.errMsg.includes('timeout') || err.errMsg.includes('超时')) {
                                errorMsg = '请求超时，请稍后重试';
                            } else if (err.errMsg.includes('network')) {
                                errorMsg = '网络异常，请检查网络连接';
                            } else if (err.errMsg.includes('fail')) {
                                errorMsg = '请求失败，请稍后重试';
                            } else if (err.errMsg.includes('permission')) {
                                errorMsg = '权限不足，仅房主可结算';
                            }
                        }

                        // 打印完整错误信息用于调试
                        console.log('Error details:', {
                            errCode: err.errCode,
                            errMsg: err.errMsg,
                            result: err.result
                        });

                        wx.showToast({ title: errorMsg, icon: 'none', duration: 2000 });
                    });
                }
            }
        });
    },

    // 跳转首页（用于自由房间结算后）
    goToIndex() {
        wx.reLaunch({ url: '/pages/index/index' });
    },

    // 返回圈子详情页（用于圈子房间结算后）
    backToClubDetail() {
        const clubId = this.data.room?.clubId || this.data.cid;
        if (!clubId) {
            wx.reLaunch({ url: '/pages/index/index' });
            return;
        }

        const pages = getCurrentPages();
        let targetDelta = -1;

        // 搜索页面栈，寻找最近的该圈子详情页
        for (let i = pages.length - 1; i >= 0; i--) {
            const page = pages[i];
            if (page.route.indexOf('pages/club/detail/index') !== -1 && (page.data.clubId === clubId || page.options?.id === clubId)) {
                targetDelta = pages.length - 1 - i;
                break;
            }
        }

        if (targetDelta > 0) {
            console.log('Intelligent Back (Settled): found club detail in stack, delta:', targetDelta);
            wx.navigateBack({ delta: targetDelta });
        } else {
            console.log('Intelligent Redirect (Settled): club detail not in stack, using redirectTo');
            wx.redirectTo({
                url: `/subpackages/package_club/pages/club/detail/index?id=${clubId}`
            });
        }
    }

})
