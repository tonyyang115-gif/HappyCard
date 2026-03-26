const app = getApp();
const cloudApi = require('../../../../../utils/cloudApi');
const db = wx.cloud.database();
const _ = db.command;
const MINI_CODE_FILE_ID = 'cloud://cloud1-7go9rrf32b9c9cbc.636c-cloud1-7go9rrf32b9c9cbc-1390826004/assets/mini-code-v1.png';

// ===== 内联缓存管理器 =====
class CacheManager {
    constructor(defaultTTL = 5 * 60 * 1000) {
        this.cache = new Map();
        this.defaultTTL = defaultTTL;
        this.maxSize = 100;
    }

    set(key, value, ttl = this.defaultTTL) {
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

    get(key) {
        const item = this.cache.get(key);

        if (!item) return null;

        if (Date.now() > item.expireAt) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

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

const cacheManager = new CacheManager();
// ===== 缓存管理器结束 =====

Page({
    data: {
        clubId: '',
        club: {},
        rooms: [],
        stats: {
            champion: {},
            totalGames: 0
        },
        navTop: 0,
        navHeight: 0,
        btnBottom: 60,
        isLoading: false,
        hasMore: true,
        skip: 0,
        totalLoaded: 0,
        limit: 20,
        isProcessing: false, // Interaction Lock (Replaces isCreatingRoom)
        showJoinModal: false,
        joiningRoomId: '',
        joinError: '',
        showConfirmJoinModal: false,
        isOwner: false,
        isMember: false,
        clubMembers: [], // Added for decoupled stats
        cloudReady: false,
        isHydrating: true, // New state for skeleton lock
        watchersActive: false, // Watcher状态标记
        refreshingDetail: false, // 下拉刷新状态
        refreshBg: '#f6f7f9', // 刷新背景色
        activeRequests: 0,  // 并发请求防护
        lastWatchUpdate: 0,  // Watcher冲突防护
        loadingState: 'idle',  // 统一加载状态：'idle' | 'loading' | 'refreshing' | 'loading-more'
        enableStatsVerify: false, // 默认关闭高频统计校验，仅调试时开启
        miniCodeUrl: '' // Shared mini code image URL
    },

    hasServerAggregatedStats(clubData) {
        const club = clubData || this.data.club;
        return !!(club && club.stats && club.stats.champion);
    },

    recordPerf(eventName) {
        if (!this._perfStats) return;
        this._perfStats[eventName] = (this._perfStats[eventName] || 0) + 1;
        const now = Date.now();
        if (now - this._perfStats.lastLogAt > 15000) {
            this._perfStats.lastLogAt = now;
            console.log('[PerfPulse][club/detail]', JSON.stringify({
                statsCalc: this._perfStats.statsCalc || 0,
                statsWatcherOnChange: this._perfStats.statsWatcherOnChange || 0,
                roomsWatcherOnChange: this._perfStats.roomsWatcherOnChange || 0
            }));
        }
    },

    onLoad(options) {
        // Calculate Navigation Bar Position
        const capsule = wx.getMenuButtonBoundingClientRect();
        const navTop = capsule.top + 4; // Moved upward as per user request
        const navHeight = capsule.height;

        // Initialize instance property (not in data to avoid serialization issues with Map)
        this.timeCache = new Map();
        this._perfStats = { lastLogAt: Date.now() };

        // Calculate Safe Area for Button
        const sys = wx.getSystemInfoSync();
        const safeBottom = sys.safeArea ? sys.safeArea.bottom : sys.screenHeight;
        const bottomInset = Math.max(sys.screenHeight - safeBottom, 15); // Ensure min 15px
        const btnBottom = bottomInset + 80; // 80px: Safe lift, easier on layout

        this.setData({
            navTop,
            navHeight,
            btnBottom
        });
        this.fetchMiniCode();

        if (options.id) {
            const clubId = options.id;
            this.setData({ clubId });

            // Stage 2: Cross-page Pre-data (P0)
            if (options.pre) {
                try {
                    const pre = JSON.parse(decodeURIComponent(options.pre));
                    this.setData({
                        club: {
                            name: pre.name,
                            avatar: pre.avatar,
                            clubId: '---' // Placeholder until sync
                        }
                    });
                } catch (e) { console.error("Parse pre-data failed", e); }
            }

            // 1. Snapshot-First Hydration (P1)
            // Restore from cache for instant response in weak network
            const cacheKey_club = `hdpj_cache_club_${clubId}`;
            const cacheKey_rooms = `hdpj_cache_rooms_${clubId}`;
            const cachedClub = wx.getStorageSync(cacheKey_club);
            const cachedRooms = wx.getStorageSync(cacheKey_rooms);

            if (cachedClub) {
                console.log('Hydrating club from snapshot...');
                this.processClubUpdate(cachedClub, true); // true = isSnapshot
            }
            if (cachedRooms) {
                console.log('Hydrating rooms from snapshot...');
                this.processRoomsUpdate(cachedRooms, true);
            }

            // 2. Sync Identity & Warm Up Connection (P2)
            this.syncIdentity().then(() => {
                console.log('Cloud session ready, starting all watchers...');
                this.setData({ watchersActive: true });
                this.initClubWatcher(clubId);
                this.initRoomsWatcher(clubId);
                // 结构优化：优先使用服务端聚合统计，仅在缺失时才启用 stats watcher
                if (this.data.club && this.data.club.clubId && !this.hasServerAggregatedStats()) {
                    this.initStatsWatcher(this.data.club.clubId);
                }
            });

            // Stage 3: Reactive Invalidation (P0)
            app.on('roundUpdate', (data) => {
                console.log('Detail page: Round update detected, marking for refresh...');
                this.data.needsRefresh = true;
            });

            // --- Network Resilience (P2) ---
            this._onNetworkResume = () => {
                console.log('Network resumed, re-initializing watchers...');
                if (this.data.clubId && this.data.cloudReady) {
                    this.initClubWatcher(this.data.clubId);
                    this.initRoomsWatcher(this.data.clubId);
                    if (this.data.club && this.data.club.clubId && !this.hasServerAggregatedStats()) {
                        this.initStatsWatcher(this.data.club.clubId);
                    }
                }
            };
            app.on('networkResume', this._onNetworkResume);

            // Handle Join Action
            if (options.action === 'join') {
                this.checkJoinAction(clubId);
            }
        }
    },

    onShow() {
        console.log('Detail page onShow, checking watchers...');

        // Check for Global Reload Flag (from Settings page)
        if (app.globalData.reloadClubDetail) {
            console.log('Global reload flag detected. Refreshing club detail...');
            app.globalData.reloadClubDetail = false;

            // Invalidate Cache
            if (this.data.clubId) {
                cacheManager.delete(`club_${this.data.clubId}`);
                this.fetchDetail(this.data.clubId);
            }
        }

        // 如果之前被隐藏，重新激活watchers
        if (!this.data.watchersActive && this.data.clubId && this.data.cloudReady) {
            console.log('Reactivating watchers...');
            this.setData({ watchersActive: true });
            this.initClubWatcher(this.data.clubId);
            this.initRoomsWatcher(this.data.clubId);
            if (this.data.club && this.data.club.clubId && !this.hasServerAggregatedStats()) {
                this.initStatsWatcher(this.data.club.clubId);
            }
        }

        // If coming back from another page or background, resume watchers if club is known
        if (this.data.clubId && this.data.cloudReady && this.data.watchersActive) {
            this.initClubWatcher(this.data.clubId);
            this.initRoomsWatcher(this.data.clubId);
            // Stats watcher needs numeric ID
            if (this.data.club && this.data.club.clubId && !this.hasServerAggregatedStats()) {
                this.initStatsWatcher(this.data.club.clubId);
            }
        }

        // Refresh data when returning from a room
        if (this.data.clubId) {
            // Stage 3: Reactive Invalidation (P0)
            if (this.data.needsRefresh) {
                console.log('Detail page: Dirty data detected, refreshing...');
                this.setData({ isHydrating: true }); // Show skeleton again for stats
                this.fetchRooms(this.data.clubId);
                this.data.needsRefresh = false;
            } else if (!this.data.isLoading) {
                this.fetchRooms(this.data.clubId);
            }
        }
    },

    onHide() {
        console.log('Detail page onHide, releasing watchers...');
        this.closeAllWatchers();
        this.setData({ watchersActive: false });
        if (this._statsCalcTimer) {
            clearTimeout(this._statsCalcTimer);
            this._statsCalcTimer = null;
        }
    },

    onUnload() {
        console.log('Detail page onUnload, cleaning up...');
        this.closeAllWatchers();
        if (this._onNetworkResume) {
            app.off('networkResume', this._onNetworkResume);
        }
        app.off('roundUpdate', this.handleRoundUpdate);
        if (this._statsCalcTimer) {
            clearTimeout(this._statsCalcTimer);
            this._statsCalcTimer = null;
        }

        // 清理时间格式化缓存
        if (this.data.timeCache) {
            this.data.timeCache.clear();
        }
    },

    // Watcher管理方法
    closeAllWatchers() {
        if (this.clubWatcher) {
            try {
                this.clubWatcher.close();
                console.log('Club watcher closed');
            } catch (e) {
                console.error('Error closing club watcher:', e);
            }
            this.clubWatcher = null;
        }
        if (this.roomsWatcher) {
            try {
                this.roomsWatcher.close();
                console.log('Rooms watcher closed');
            } catch (e) {
                console.error('Error closing rooms watcher:', e);
            }
            this.roomsWatcher = null;
        }
        if (this.statsWatcher) {
            try {
                this.statsWatcher.close();
                console.log('Stats watcher closed');
            } catch (e) {
                console.error('Error closing stats watcher:', e);
            }
            this.statsWatcher = null;
        }
    },

    async syncIdentity() {
        const userInfo = app.globalData.userInfo;
        // If it looks like a mock ID (no dashes, or just random chars - usually real IDs have dashes or a prefix)
        // A safer check is to always check with cloud if not already flagged as 'synced'
        if (userInfo && !userInfo.isSynced) {
            try {
                const res = await cloudApi.call('manageClub', { action: 'sync', clubId: 'placeholder' }); // action sync doesn't need real clubId
                if (res.result && res.result.openId) {
                    const realId = res.result.openId;
                    if (userInfo.openid !== realId) {
                        console.log("Syncing identity:", userInfo.openid, "->", realId);
                        const oldId = userInfo.openid;
                        userInfo.openid = realId;
                        userInfo.isSynced = true;
                        app.globalData.userInfo = userInfo;
                        wx.setStorageSync('hdpj_user_profile', userInfo);
                        this.data.oldMockId = oldId;
                    } else {
                        userInfo.isSynced = true;
                        wx.setStorageSync('hdpj_user_profile', userInfo);
                    }
                }
                this.setData({ cloudReady: true });
                return true;
            } catch (e) {
                console.error("Identity sync failed", e);
                this.setData({ cloudReady: true });
                return false;
            }
        }
        this.setData({ cloudReady: true });
        return true;
    },


    initClubWatcher(id, retryCount = 0) {
        if (!id || this.clubWatcher) return;
        const _this = this;

        try {
            this.clubWatcher = db.collection(cloudApi.collectionName('clubs')).doc(id).watch({
                onChange: function (snapshot) {
                    if (snapshot.docs.length > 0) {
                        const club = snapshot.docs[0];
                        _this.processClubUpdate(club);
                    } else {
                        // --- Dissolution Logic (P2) ---
                        // If docs are empty, it means the document was deleted
                        _this.closeAllWatchers();
                        app.ejectFromClub(id);
                    }
                },
                onError: function (err) {
                    console.error('Club Watcher Error:', err);

                    // 先关闭已有的 watcher
                    try {
                        if (_this.clubWatcher && typeof _this.clubWatcher.close === 'function') {
                            _this.clubWatcher.close();
                        }
                    } catch (e) {
                        console.warn('Error closing club watcher in error handler:', e);
                    }

                    _this.clubWatcher = null;

                    // 检查是否可以重试
                    if (retryCount < 5 && !err.errCode) {
                        const delay = Math.pow(2, retryCount) * 1000;
                        console.warn(`Club Watcher will retry (${retryCount + 1}/${5}) in ${delay}ms`);
                        setTimeout(() => _this.initClubWatcher(id, retryCount + 1), delay);
                    } else {
                        console.error('Club Watcher failed after max retries or unrecoverable error');
                        // 降级为轮询
                        _this.fetchDetail(id);
                    }
                }
            });
        } catch (e) {
            console.error('Failed to init club watcher:', e);
            _this.clubWatcher = null;
            // 降级为轮询
            _this.fetchDetail(id);
        }
    },

    initRoomsWatcher(clubId, retryCount = 0) {
        if (!clubId || this.roomsWatcher) return;
        const _this = this;

        try {
            this.roomsWatcher = db.collection(cloudApi.collectionName('rooms'))
                .where({ clubId: clubId })
                .orderBy('createdAt', 'desc')
                .field({
                    roomId: true,
                    createdAt: true,
                    status: true,
                    totalRounds: true,
                    clubId: true
                })
                .limit(20)
                .watch({
                    onChange: function (snapshot) {
                        _this.recordPerf('roomsWatcherOnChange');
                        _this.processRoomsUpdate(snapshot.docs);
                    },
                    onError: function (err) {
                        console.error('Rooms Watcher Error:', err);

                        // 先关闭已有的 watcher
                        try {
                            if (_this.roomsWatcher && typeof _this.roomsWatcher.close === 'function') {
                                _this.roomsWatcher.close();
                            }
                        } catch (e) {
                            console.warn('Error closing rooms watcher in error handler:', e);
                        }

                        _this.roomsWatcher = null;

                        // 检查是否可以重试
                        if (retryCount < 5 && !err.errCode) {
                            const delay = Math.pow(2, retryCount) * 1000;
                            console.warn(`Rooms Watcher will retry (${retryCount + 1}/${5}) in ${delay}ms`);
                            setTimeout(() => _this.initRoomsWatcher(clubId, retryCount + 1), delay);
                        } else {
                            console.error('Rooms Watcher failed after max retries or unrecoverable error');
                            // 降级为轮询
                            _this.fetchRooms(clubId);
                        }
                    }
                });
        } catch (e) {
            console.error('Failed to init rooms watcher:', e);
            _this.roomsWatcher = null;
            // 降级为轮询
            _this.fetchRooms(clubId);
        }
    },

    initStatsWatcher(numericId, retryCount = 0) {
        if (!numericId || this.statsWatcher) return;
        const _this = this;
        console.log("Starting Stats Watcher for Club:", numericId, "type:", typeof numericId);
        // 确保使用数字类型查询，与 migrateStats 和 settleRoom 保持一致
        const queryId = Number(numericId);
        console.log("Query clubId:", queryId, "type:", typeof queryId);

        try {
            this.statsWatcher = db.collection(cloudApi.collectionName('club_members'))
                .where({ clubId: queryId })
                .field({
                    openId: true,
                    name: true,
                    avatar: true,
                    stats: true,
                    // 只查询需要的字段
                })
                .orderBy('stats.winCount', 'desc')
                .limit(50)
                .watch({
                    onChange: function (snapshot) {
                        _this.recordPerf('statsWatcherOnChange');
                        const docs = snapshot.docs || [];
                        const snapshotKey = docs.map((doc) => {
                            const stats = doc.stats || {};
                            return `${doc.openId}:${stats.winCount || 0}:${stats.gameCount || 0}:${stats.totalScore || 0}`;
                        }).join('|');

                        // 快照未变化时跳过后续计算，避免重复 setData + DB 查询
                        if (_this._lastStatsSnapshotKey === snapshotKey) {
                            return;
                        }
                        _this._lastStatsSnapshotKey = snapshotKey;

                        console.log("Stats Watcher onChange - members count:", docs.length);
                        _this.setData({ clubMembers: snapshot.docs });

                        // fetchBestPlayer 节流，避免 watch 高频触发时重复查库
                        const now = Date.now();
                        if (!_this._lastBestPlayerFetchAt || now - _this._lastBestPlayerFetchAt > 15000) {
                            _this._lastBestPlayerFetchAt = now;
                            _this.fetchBestPlayer(queryId);
                        }

                        // 统计计算轻度防抖，避免同一帧内多次重算
                        if (_this._statsCalcTimer) {
                            clearTimeout(_this._statsCalcTimer);
                        }
                        _this._statsCalcTimer = setTimeout(() => {
                            _this.calculateStats(_this.data.rooms);
                        }, 80);
                    },
                    onError: function (err) {
                        console.error('Stats Watcher Error:', err);

                        // 先关闭已有的 watcher
                        try {
                            if (_this.statsWatcher && typeof _this.statsWatcher.close === 'function') {
                                _this.statsWatcher.close();
                            }
                        } catch (e) {
                            console.warn('Error closing stats watcher in error handler:', e);
                        }

                        _this.statsWatcher = null;

                        // 检查是否可以重试
                        if (retryCount < 5 && !err.errCode) {
                            const delay = Math.pow(2, retryCount) * 1000;
                            console.warn(`Stats Watcher will retry (${retryCount + 1}/${5}) in ${delay}ms`);
                            setTimeout(() => _this.initStatsWatcher(numericId, retryCount + 1), delay);
                        } else {
                            console.error('Stats Watcher failed after max retries or unrecoverable error');
                            // Stats watcher 失败不影响主要功能，降级为手动刷新
                        }
                    }
                });
        } catch (e) {
            console.error('Failed to init stats watcher:', e);
            _this.statsWatcher = null;
        }
    },

    // New Method: Fetch Best Player by Rate directly from DB
    fetchBestPlayer(clubId) {
        if (!clubId) return;
        const db = wx.cloud.database();
        const _ = db.command;

        db.collection(cloudApi.collectionName('club_members'))
            .where({
                clubId: clubId,
                'stats.gameCount': _.gte(5)
            })
            .orderBy('stats.winRate', 'desc')
            .limit(1)
            .get()
            .then(res => {
                if (res.data.length > 0) {
                    const best = res.data[0];
                    const winRateVal = best.stats && best.stats.winRate
                        ? (best.stats.winRate / 100) // 5555 -> 55.55
                        : Math.round((best.stats.winCount / best.stats.gameCount) * 100);

                    const bestPlayerObj = {
                        name: best.name,
                        avatar: best.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                        wins: best.stats.winCount,
                        games: best.stats.gameCount
                    };

                    this.setData({
                        'stats.bestPlayer': bestPlayerObj,
                        'stats.winRate': Math.round(winRateVal) // Display integer usually
                    });
                    this.data.hasDbBestPlayer = true; // Flag to prevent overwrite
                } else {
                    this.data.hasDbBestPlayer = false;
                }
            })
            .catch(e => console.error("Failed to fetch best player:", e));
    },

    processRoomsUpdate(rooms, isSnapshot = false) {
        if (!rooms) return;

        // 防抖：避免短时间内重复更新
        const now = Date.now();
        if (!isSnapshot && this.data.lastWatchUpdate && now - this.data.lastWatchUpdate < 1000) {
            console.log('Skipping rapid update within 1s');
            return;
        }

        // 智能合并：保留原有顺序，只更新匹配项或追加新项
        const existingMap = new Map(this.data.rooms.map(r => [r._id, r]));
        const mergedRooms = this.data.rooms.map(r => {
            const updated = rooms.find(u => u._id === r._id);
            return updated ? { ...r, ...updated } : r;
        });

        // 如果有新数据，追加到后面
        const newRooms = rooms.filter(u => !existingMap.has(u._id));
        const finalRooms = [...mergedRooms, ...newRooms];

        this.setData({
            rooms: finalRooms,
            lastWatchUpdate: now
        });

        // 只在必要时重新计算统计（避免重复计算）
        if (!isSnapshot || finalRooms.length !== this.data.rooms.length) {
            this.calculateStats(finalRooms);
        }
    },

    processClubUpdate(club, isSnapshot = false) {
        if (!club) return;

        // 🔍 诊断日志：检查 club 数据结构
        console.log("=== processClubUpdate 诊断 ===");
        console.log("club._id:", club._id);
        console.log("club.clubId:", club.clubId, "type:", typeof club.clubId);
        console.log("isSnapshot:", isSnapshot);
        console.log("cloudReady:", this.data.cloudReady);
        console.log("statsWatcher exists:", !!this.statsWatcher);

        club.id_short = club.clubId || (club._id ? club._id.toString().substring(0, 6) : '---');

        const userInfo = app.globalData.userInfo;
        const isOwner = userInfo && (club.ownerId === userInfo.openid);
        const members = club.members || [];
        const isMember = userInfo && club.members && club.members.some(m => m.openId === userInfo.openid);

        // --- Auto-Correction Logic ---
        // If I am NOT identified as member by real ID, but my old Mock ID is there
        const mockIdInDB = (this.data.oldMockId || userInfo.openid);
        const hasMockMember = members.some(m => m.openId === mockIdInDB && m.openId !== userInfo.openid);

        if (hasMockMember && userInfo.isSynced && !this.data.isCorrecting) {
            this.data.isCorrecting = true;
            console.log("Detected mock ID in members, correcting...");
            cloudApi.call('manageClub', {
                action: 'updateIdentity',
                clubId: this.data.clubId,
                mockId: mockIdInDB
            }).then(() => {
                this.data.isCorrecting = false;
                this.data.oldMockId = null;
            });
        }

        this.setData({
            club: club,
            isOwner,
            isMember
        });

        // Defer stats watcher until cloud is ready and it's not a snapshot
        // console.log("🔍 Checking Stats Watcher Init...");
        // console.log("  ClubId:", club.clubId, "CloudReady:", this.data.cloudReady);

        const shouldUseServerStats = this.hasServerAggregatedStats(club);
        if (shouldUseServerStats && this.statsWatcher) {
            try {
                this.statsWatcher.close();
            } catch (e) {
                console.warn('Close stats watcher failed while switching to server stats:', e);
            }
            this.statsWatcher = null;
            this.data.activeStatsClubId = null;
        }

        if (club.clubId && !isSnapshot && this.data.cloudReady && !shouldUseServerStats) {
            // Stability Fix: Only re-init if clubId changed or watcher missing
            if (this.statsWatcher && this.data.activeStatsClubId === club.clubId) {
                // Watcher already active for this club, do nothing
                // console.log("Stats Watcher stable (no change)");
                return;
            }

            // If we have a watcher but ID changed, or no watcher...
            if (this.statsWatcher) {
                // console.warn("Switching Club ID, closing old watcher...");
                try {
                    this.statsWatcher.close();
                } catch (e) {
                    // console.warn("Closing watcher failed", e);
                }
                this.statsWatcher = null;
            }

            // Mark current ID to prevent duplicate init
            this.data.activeStatsClubId = club.clubId;
            this.initStatsWatcher(club.clubId);
        } else if (!shouldUseServerStats) {
            console.warn("⚠️ 未满足条件，跳过 Stats Watcher 初始化");
            if (!club.clubId) {
                console.error("❌ 关键问题：club.clubId 为空！需要检查数据库数据");
            }
        }

        if (club.clubId && !isSnapshot) {
            this.setData({ isHydrating: false });
        }
        if (this.data.rooms.length > 0) {
            this.calculateStats(this.data.rooms);
        }
    },

    async checkJoinAction(clubId) {
        // Wait for global user info if needed
        if (!app.globalData.userInfo) {
            setTimeout(() => this.checkJoinAction(clubId), 500);
            return;
        }

        try {
            const res = await cloudApi.call('getClubDetail', { clubId });
            if (!res.result || !res.result.success) {
                throw new Error(res.result ? res.result.msg : '查询失败');
            }
            const club = res.result.data;
            const userInfo = app.globalData.userInfo;
            const isMember = club.members.some(m => m.openId === userInfo.openid);

            if (isMember) {
                wx.showToast({ title: '已是成员', icon: 'none' });
                return;
            }

            this.setData({ showConfirmJoinModal: true });
        } catch (e) {
            console.error(e);
        }
    },

    confirmJoinIntent() {
        this.joinClub(this.data.clubId);
        this.setData({ showConfirmJoinModal: false });
    },

    cancelJoinIntent() {
        this.setData({ showConfirmJoinModal: false });
    },

    async joinClub(id) {
        if (!id || this.data.isProcessing) return;
        this.setData({ isProcessing: true });
        wx.showLoading({ title: '确认中...', mask: true });

        try {
            const userInfo = app.globalData.userInfo || {};
            const res = await cloudApi.call('manageClub', {
                action: 'join',
                clubId: id,
                name: userInfo.name || userInfo.nickName || '玩家',
                avatar: userInfo.avatarUrl || ''
            });

            wx.hideLoading();

            if (res.result && res.result.success) {
                wx.showToast({ title: '加入成功' });
                this.setData({ isMember: true });
                // Refresh local data (watcher will pick it up, but we can force update metadata)
                this.fetchDetail(id);
            } else {
                throw new Error(res.result ? res.result.msg : '加入失败');
            }
        } catch (err) {
            console.error(err);
            wx.hideLoading();
            wx.showToast({ title: err.message || '网络异常', icon: 'none' });
        } finally {
            this.setData({ isProcessing: false });
        }
    },

    goBack() {
        wx.navigateBack({
            delta: 1,
            fail: () => {
                wx.reLaunch({ url: '/pages/index/index' });
            }
        });
    },

    async fetchDetail(id) {
        try {
            // 尝试从缓存加载
            const clubKey = `club_${id}`;
            const cachedClub = cacheManager.get(clubKey);

            if (cachedClub && !this.data.refreshingDetail) {
                console.log('Loaded club from cache:', cachedClub.name);
                this.processClubUpdate(cachedClub, true);
                return;
            }

            // 从数据库加载 (改为云函数调用)
            const res = await cloudApi.call('getClubDetail', { clubId: id });
            if (!res.result || !res.result.success) {
                throw new Error(res.result ? res.result.msg : '加载失败');
            }
            const club = res.result.data;

            // 保存到缓存（TTL: 5分钟）
            cacheManager.set(clubKey, club, 5 * 60 * 1000);

            this.processClubUpdate(club);
        } catch (err) {
            console.error('Fetch detail error:', err);
            wx.showToast({ title: '加载失败', icon: 'none' });
        }
    },

    onRefreshDetail() {
        this.setData({
            refreshingDetail: true,
            loadingState: 'refreshing'
        });

        // 清除缓存，强制重新加载
        cacheManager.delete(`club_${this.data.clubId}`);
        cacheManager.delete(`rooms_${this.data.clubId}`);
        cacheManager.delete(`stats_${this.data.clubId}`);

        // 重置分页
        this.setData({
            totalLoaded: 0,
            skip: 0,
            rooms: []
        });

        // 重新加载所有数据
        Promise.all([
            this.fetchDetail(this.data.clubId),
            this.fetchRooms(this.data.clubId, false)
        ]).then(() => {
            this.setData({
                refreshingDetail: false,
                isHydrating: false,
                loadingState: 'idle'
            });
            wx.showToast({ title: '刷新成功', icon: 'success', duration: 1000 });
        }).catch(err => {
            console.error('Refresh failed:', err);
            this.setData({
                refreshingDetail: false,
                loadingState: 'idle'
            });
            wx.showToast({ title: this.getFriendlyErrorMessage(err), icon: 'none' });
        });
    },

    async fetchRooms(clubId, append = false) {
        // 并发请求防护：检查是否有正在进行的请求
        if (this.data.activeRequests > 0) {
            console.warn('FetchRooms: Active request in progress, skipping');
            return;
        }

        this.setData({
            isLoading: true,
            activeRequests: this.data.activeRequests + 1,
            loadingState: append ? 'loading-more' : 'loading'
        });
        const skip = append ? this.data.totalLoaded : 0;
        const limit = this.data.limit;

        try {
            const res = await db.collection(cloudApi.collectionName('rooms'))
                .where({ clubId: clubId })
                .field({
                    roomId: true,
                    status: true,
                    players: true,
                    gameCount: true,
                    totalRounds: true,
                    createdAt: true,
                    settledAt: true,
                    // 不查询rounds数组,减少数据传输
                })
                .orderBy('createdAt', 'desc')
                .skip(skip)
                .limit(limit)
                .get();

            const rooms = res.data;

            // Optimization: No longer fetching rounds (N+1 query removed).
            // Relying on server-side aggregated 'gameCount'.

            const newRooms = rooms.map(r => {
                return {
                    ...r,
                    rounds: [], // Deprecated
                    createTime: this.formatTime(r.createdAt),
                    // Use server-aggregated Game Count. Fallback to totalRounds for legacy data.
                    roundsCount: (typeof r.gameCount === 'number') ? r.gameCount : (r.totalRounds || 0),
                    playerAvatars: r.players.slice(0, 3).map(p => p.avatarUrl)
                };
            });

            // 记录已加载的总数量，用于分页计算
            const newTotalLoaded = this.data.totalLoaded + res.data.length;

            this.setData({
                rooms: append ? [...this.data.rooms, ...newRooms] : newRooms,
                hasMore: res.data.length === limit,
                isLoading: false,
                activeRequests: this.data.activeRequests - 1,
                skip: newTotalLoaded,
                totalLoaded: newTotalLoaded,
                loadingState: 'idle'
            });

            if (!append) {
                this.calculateStats(this.data.rooms);
            }
        } catch (err) {
            console.error(err);
            this.setData({
                isLoading: false,
                activeRequests: Math.max(0, this.data.activeRequests - 1),
                loadingState: 'idle'
            });
            wx.showToast({
                title: this.getFriendlyErrorMessage(err),
                icon: 'none'
            });
        }
    },

    loadMoreRooms() {
        if (this.data.hasMore && !this.data.isLoading) {
            this.fetchRooms(this.data.clubId, true);
        }
    },

    goToRoom(e) {
        const id = e.currentTarget.dataset.id || e.currentTarget.id;
        if (id) {
            wx.navigateTo({
                url: `/subpackages/package_game/pages/room/index?roomId=${id}&readonly=true&cid=${this.data.clubId}` // Pass cid for security
            });
        }
    },

    formatTime(timestamp) {
        if (!timestamp) return '';

        const key = String(timestamp);
        if (this.timeCache && this.timeCache.has(key)) {
            return this.timeCache.get(key);
        }

        const date = new Date(timestamp);
        const formatted = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;

        if (this.timeCache) {
            this.timeCache.set(key, formatted);
        }
        return formatted;
    },

    // --- Helper: Smart Rounds Calculation ---
    calculateSmartRounds(rounds) {
        if (!rounds || !Array.isArray(rounds) || rounds.length === 0) return 0;

        // 1. Sort by timestamp (Oldest -> Newest)
        // Ensure we copy the array to avoid mutating original data if it's used elsewhere
        const sorted = [...rounds].sort((a, b) => a.timestamp - b.timestamp);

        let count = 0;
        let lastTime = 0;
        const THRESHOLD = 3 * 60 * 1000; // 3 Minutes (180s)

        sorted.forEach((r, index) => {
            if (index === 0) {
                // First record always starts a round
                count++;
                lastTime = r.timestamp;
            } else {
                // If time gap > Threshold, it's a new round
                if (r.timestamp - lastTime > THRESHOLD) {
                    count++;
                }
                // Always update reference time (Sequential clustering)
                // If A occurs at T0, B at T0+30s. Same round. LastTime becomes T0+30s.
                // If C occurs at T0+60s. Diff is 30s. Same round.
                // This "Sliding" logic groups a continuous stream of events.
                lastTime = r.timestamp;
            }
        });

        return count;
    },

    // ===== 统计计算辅助函数 =====

    // 计算总场次（优先使用圈子缓存）
    calculateTotalGames(rooms) {
        let totalGames = 0;
        const cachedTotal = (this.data.club && this.data.club.stats && this.data.club.stats.totalGames) || 0;

        // Priority 1: Use club cached stats
        if (cachedTotal > 0) {
            totalGames = cachedTotal;
            // console.log('Using club cached totalGames:', totalGames);
        } else {
            // Fallback: Use rooms length temporarily
            totalGames = rooms ? rooms.length : 0;
        }
        return totalGames;
    },

    // 准备成员列表数据
    prepareMemberList(clubMembers) {
        if (!clubMembers || clubMembers.length === 0) return [];

        return clubMembers.map(doc => {
            const m = doc;
            return {
                id: m.openId,
                name: m.name || '玩家',
                avatar: m.avatar || '',
                totalScore: m.stats ? m.stats.totalScore : 0,
                gameCount: m.stats ? m.stats.gameCount : 0,
                winCount: m.stats ? m.stats.winCount : 0
            };
        });
    },

    // 计算总胜场冠军
    calculateChampion(memberList) {
        if (!memberList || memberList.length === 0) return null;

        const championPool = [...memberList].sort((a, b) => {
            if (b.winCount !== a.winCount) return b.winCount - a.winCount;
            if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
            return a.gameCount - b.gameCount;
        });

        const champion = championPool[0];

        // 验证有效性：有胜场记录，或虽然没赢过但总分是正数（且参与过对局）
        const isValid = champion && (champion.winCount > 0 || (champion.totalScore > 0 && champion.gameCount > 0));

        if (!isValid) return null;

        return {
            name: champion.name,
            avatar: champion.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
            wins: champion.winCount,
            games: champion.gameCount,
            winRate: Math.round((champion.winCount / champion.gameCount) * 100)
        };
    },

    // 计算常胜将军（需要至少5局）
    calculateBestPlayer(memberList) {
        const MIN_GAMES_FOR_RATE = 5;

        if (!memberList || memberList.length === 0) return null;

        const ratePool = memberList
            .filter(m => m.gameCount >= MIN_GAMES_FOR_RATE)
            .sort((a, b) => {
                const rateA = a.winCount / (a.gameCount || 1);
                const rateB = b.winCount / (b.gameCount || 1);

                if (Math.abs(rateB - rateA) > 0.0001) return rateB - rateA;
                if (b.gameCount !== a.gameCount) return b.gameCount - a.gameCount;
                return b.totalScore - a.totalScore;
            });

        const best = ratePool[0];

        // 如果没有符合条件的玩家（都少于5局）
        if (!best) return null;

        // 验证有效性
        const isValid = best && (best.winCount > 0 || (best.totalScore > 0 && best.gameCount > 0));

        if (!isValid) return null;

        return {
            name: best.name,
            avatar: best.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
            wins: best.winCount,
            games: best.gameCount
        };
    },

    // 从club_members集合计算统计（新数据）
    calculateStatsFromClubMembers(rooms) {
        if (!this.data.clubMembers || this.data.clubMembers.length === 0) {
            return null;
        }

        console.log("✅ Using Decoupled Scalable Stats (club_members)");
        console.log("📊 clubMembers count:", this.data.clubMembers.length);

        const memberList = this.prepareMemberList(this.data.clubMembers);

        console.log("🎮 Member stats sample:", memberList.slice(0, 3).map(m => ({
            name: m.name,
            wins: m.winCount,
            games: m.gameCount,
            score: m.totalScore
        })));

        const totalGames = this.calculateTotalGames(rooms);
        const champion = this.calculateChampion(memberList);
        const bestPlayer = this.calculateBestPlayer(memberList);

        const winRate = bestPlayer ?
            Math.round((bestPlayer.wins / (bestPlayer.games || 1)) * 100) : 0;

        console.log("🏆 Champion:", champion ? {
            name: champion.name,
            wins: champion.wins,
            games: champion.games,
            rate: champion.winRate + '%'
        } : 'None');

        console.log("🏅 Best player:", bestPlayer ? {
            name: bestPlayer.name,
            wins: bestPlayer.wins,
            games: bestPlayer.games,
            rate: winRate + '%'
        } : 'None');

        return {
            totalGames,
            champion: champion || {
                name: '虚位以待',
                avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                wins: 0,
                games: 0,
                winRate: 0
            },
            winRate,
            bestPlayer: bestPlayer || {
                name: '暂无数据',
                avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                note: `需至少参与5局`,
                wins: 0,
                games: 0
            }
        };
    },

    // 从clubs集合计算统计（旧数据，向后兼容）
    calculateStatsFromClubLegacy(rooms) {
        if (!this.data.club || !this.data.club.stats || !this.data.club.stats.version) {
            return null;
        }

        console.log("Using Cloud Aggregated Stats (legacy)");
        const statsV2 = this.data.club.stats;
        const membersMap = statsV2.members || {};
        const memberList = Object.keys(membersMap).map(id => {
            const m = membersMap[id];
            return {
                id: id,
                name: m.name || '玩家',
                avatar: m.avatar || '',
                totalScore: m.totalScore || 0,
                gameCount: m.gameCount || 0,
                winCount: m.winCount || 0
            };
        });

        if (memberList.length === 0) return null;

        const champion = this.calculateChampion(memberList);
        const bestPlayer = this.calculateBestPlayer(memberList);
        const totalGames = this.calculateTotalGames(rooms);

        return {
            totalGames,
            champion: champion || {
                name: '虚位以待',
                avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                wins: 0,
                games: 0,
                winRate: 0
            },
            winRate: bestPlayer ? Math.round((bestPlayer.wins / (bestPlayer.games || 1)) * 100) : 0,
            bestPlayer: bestPlayer || {
                name: '虚位以待',
                avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                wins: 0,
                games: 0
            }
        };
    },

    calculateStats(rooms) {
        this.recordPerf('statsCalc');
        // Calculate totalGames from club cache (preferred) or database query
        let totalGames = 0;

        // Priority 1: Use club cached stats
        if (this.data.club && this.data.club.stats && this.data.club.stats.totalGames) {
            totalGames = this.data.club.stats.totalGames;
            console.log('Using club cached totalGames:', totalGames);
        }

        // [New Architecture] Check for Pre-Aggregated Stats (Server-Side)
        const serverStats = this.data.club && this.data.club.stats;
        const hasServerChampion = serverStats && serverStats.champion;

        if (hasServerChampion) {
            console.log("✅ Using Server-Side Pre-Aggregated Champion");

            // 直接使用服务端数据，由于服务端存储的是万分比 (Basis Points)，需要除以 100 转换为百分比
            const championData = serverStats.champion;
            const updatePayload = {
                'stats.totalGames': totalGames,
                'stats.champion': {
                    name: championData.name || '虚位以待',
                    avatar: championData.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                    wins: championData.wins || 0,
                    games: championData.games || 0,
                    winRate: championData.winRate ? Math.round(championData.winRate / 100) : 0
                }
            };

            // Check for Server-Side BestPlayer (Frequent Winner)
            if (serverStats.bestPlayer) {
                const bestData = serverStats.bestPlayer;
                updatePayload['stats.bestPlayer'] = {
                    name: bestData.name,
                    avatar: bestData.avatar,
                    wins: bestData.wins,
                    games: bestData.games
                };
                // 万分比转换为百分比
                updatePayload['stats.winRate'] = bestData.winRate ? Math.round(bestData.winRate / 100) : 0;
            } else if (this.data.hasDbBestPlayer) {
                // Fallback to fetchBestPlayer result if Server didn't provide one
                console.log("Using DB Best Player (Fetch Result)");
            } else {
                console.log("No Server/DB Best Player, skipping update (will rely on fetchBestPlayer)");
            }

            this.setData(updatePayload);
            return;
        }

        // [Legacy Fallback] Client-side Calculation
        // Only runs if Server Stats are missing (e.g., old clubs before migration)
        if (this.data.clubMembers && this.data.clubMembers.length > 0) {
            console.log("⚠️ Legacy Mode: Calculating stats on client-side");
            console.log("📊 clubMembers count:", this.data.clubMembers.length);

            const memberList = this.data.clubMembers.map(doc => {
                const m = doc;
                return {
                    id: m.openId,
                    name: m.name || '玩家',
                    avatar: m.avatar || '',
                    totalScore: m.stats ? m.stats.totalScore : 0,
                    gameCount: m.stats ? m.stats.gameCount : 0,
                    winCount: m.stats ? m.stats.winCount : 0
                };
            });

            console.log("🎮 Member stats sample:", memberList.slice(0, 3).map(m => ({
                name: m.name,
                wins: m.winCount,
                games: m.gameCount,
                score: m.totalScore
            })));

            // 1. Annual Champion: 优先胜场，次要积分，最后局数少
            const championPool = [...memberList].sort((a, b) => {
                if (b.winCount !== a.winCount) return b.winCount - a.winCount;
                if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
                return a.gameCount - b.gameCount;
            });
            const championRaw = championPool[0];

            // 智能判定：有胜场记录，或虽然没赢过但总分是正数（且参与过对局）
            const hasValidChampion = championRaw && (championRaw.winCount > 0 || (championRaw.totalScore > 0 && championRaw.gameCount > 0));
            const championData = hasValidChampion ? {
                name: championRaw.name,
                avatar: championRaw.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                wins: championRaw.winCount,
                games: championRaw.gameCount,
                winRate: Math.round((championRaw.winCount / championRaw.gameCount) * 100)
            } : { name: '虚位以待', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede', wins: 0, games: 0, winRate: 0 };

            // Data to update - start with champion
            const updatePayload = {
                'stats.totalGames': totalGames,
                'stats.champion': championData
            };

            // 2. Frequent Winner: Prefer DB result, fallback to local calculation
            if (this.data.hasDbBestPlayer) {
                console.log("Using DB Best Player (Skip local calc)");
                // Do NOT overwrite 'stats.bestPlayer' or 'stats.winRate' 
                // as they are managed by fetchBestPlayer
            } else {
                console.log("Using Legacy Local Best Player Calc");
                const MIN_GAMES_FOR_RATE = 3; // 策略调整：5 -> 3
                const ratePool = memberList.filter(m => m.gameCount >= MIN_GAMES_FOR_RATE).sort((a, b) => {
                    const rateA = a.winCount / (a.gameCount || 1);
                    const rateB = b.winCount / (b.gameCount || 1);
                    if (Math.abs(rateB - rateA) > 0.0001) return rateB - rateA;
                    return b.gameCount - a.gameCount;
                });
                const bestRaw = ratePool[0];
                const hasValidBest = bestRaw && (bestRaw.winCount > 0 || (bestRaw.totalScore > 0 && bestRaw.gameCount > 0));

                updatePayload['stats.winRate'] = hasValidBest ? Math.round((bestRaw.winCount / (bestRaw.gameCount || 1)) * 100) : 0;
                updatePayload['stats.bestPlayer'] = hasValidBest ? {
                    name: bestRaw.name,
                    avatar: bestRaw.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                    wins: bestRaw.winCount,
                    games: bestRaw.gameCount
                } : { name: '虚位以待', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede', wins: 0, games: 0 };
            }

            this.setData(updatePayload);

            // 如果找到了有效的统计数据，直接返回；否则，允许回退到 legacy 逻辑
            if (hasValidChampion || this.data.hasDbBestPlayer) { // Adjusted condition
                console.log("Stats determined from club_members, returning.");
                return;
            }
            console.log("No valid stats in club_members, checking legacy data...");
        }

        // Mid Priority: Use cloud-aggregated stats if the club document has them (Migration Support)
        if (this.data.club && this.data.club.stats && this.data.club.stats.version) {
            console.log("Using Cloud Aggregated Stats (legacy)");
            const statsV2 = this.data.club.stats;
            const membersMap = statsV2.members || {};
            const memberList = Object.keys(membersMap).map(id => {
                const m = membersMap[id];
                return {
                    id: id,
                    name: m.name || '玩家',
                    avatar: m.avatar || '',
                    totalScore: m.totalScore || 0,
                    gameCount: m.gameCount || 0,
                    winCount: m.winCount || 0
                };
            });

            if (memberList.length > 0) {
                // 1. Annual Champion: 优先胜场，次要积分，最后局数少
                const championPool = [...memberList].sort((a, b) => {
                    if (b.winCount !== a.winCount) return b.winCount - a.winCount;
                    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
                    return a.gameCount - b.gameCount;
                });

                // 2. Frequent Winner: 优先胜率，次要局数多，最后积分高
                // 常胜将军需要至少参与3局才参与评选 (策略调整：降低门槛以提升初期体验)
                const MIN_GAMES_FOR_RATE = 3;
                const ratePool = memberList.filter(m => m.gameCount >= MIN_GAMES_FOR_RATE).sort((a, b) => {
                    const rateA = a.winCount / a.gameCount;
                    const rateB = b.winCount / b.gameCount;

                    if (Math.abs(rateB - rateA) > 0.0001) return rateB - rateA;
                    if (b.gameCount !== a.gameCount) return b.gameCount - a.gameCount;
                    return b.totalScore - a.totalScore;
                });

                const championRaw = championPool[0];
                const bestRaw = ratePool[0];

                const hasValidChampion = championRaw && championRaw.winCount > 0;
                const hasValidBest = bestRaw && bestRaw.winCount > 0;

                this.setData({
                    stats: {
                        totalGames: totalGames,
                        champion: hasValidChampion ? {
                            name: championRaw.name,
                            avatar: championRaw.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                            wins: championRaw.winCount,
                            games: championRaw.gameCount,
                            winRate: Math.round((championRaw.winCount / championRaw.gameCount) * 100)
                        } : { name: '虚位以待', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede', wins: 0, games: 0, winRate: 0 },
                        winRate: hasValidBest ? Math.round((bestRaw.winCount / bestRaw.gameCount) * 100) : 0,
                        bestPlayer: hasValidBest ? {
                            name: bestRaw.name,
                            avatar: bestRaw.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                            wins: bestRaw.winCount,
                            games: bestRaw.gameCount
                        } : { name: '虚位以待', avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede', wins: 0, games: 0 }
                    }
                });
                return;
            }
        }

        this.setData({
            stats: {
                totalGames: totalGames,
                champion: {
                    name: '虚位以待',
                    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                    wins: 0,
                    games: 0,
                    winRate: 0
                },
                winRate: 0,
                bestPlayer: {
                    name: '虚位以待',
                    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede',
                    wins: 0,
                    games: 0
                }
            }
        });

        console.log("Stats fallback, totalGames:", totalGames);
    },

    createRoom() {
        if (this.data.isProcessing) return;
        this.autoCreateRoom();
    },

    async autoCreateRoom() {
        if (this.data.isProcessing) return;
        this.setData({ isProcessing: true });

        wx.showLoading({ title: '创建房间中...', mask: true });
        try {
            const res = await cloudApi.call('createRoom', {
                clubId: this.data.clubId,
                userInfo: app.globalData.userInfo
            });

            if (res.result && res.result.success) {
                // Sync Real OpenID from Cloud (Lazy Login)
                if (res.result.openId) {
                    const realOpenId = res.result.openId;
                    const currentUser = app.globalData.userInfo;

                    // Update Local Identity
                    if (currentUser.id !== realOpenId) {
                        currentUser.id = realOpenId;
                        currentUser.openid = realOpenId;
                        app.globalData.userInfo = currentUser;
                        wx.setStorageSync('hdpj_user_profile', currentUser);
                        console.log('Identity synced with Cloud OpenID:', realOpenId);
                    }
                }

                wx.hideLoading();
                wx.navigateTo({
                    url: `/subpackages/package_game/pages/room/index?roomId=${res.result.docId}&cid=${this.data.clubId}`
                });
            } else {
                throw new Error(res.result ? res.result.msg : '创建失败');
            }
        } catch (err) {
            console.error('Create Room Failed', err);
            wx.hideLoading();
            wx.showToast({ title: err.message || '创建异常', icon: 'none' });
        } finally {
            this.setData({ isProcessing: false });
        }
    },

    // --- Stats Repair Utility (Frontend Driven) ---
    // Called when we detect valid rooms but missing member stats
    rebuildMemberStatsFromRooms(rooms) {
        if (!rooms || rooms.length === 0) return;

        console.log('[StatsRepair] Starting frontend-driven repair...');
        const statsMap = {}; // openId -> { totalScore, gameCount, winCount }

        // 1. Aggregate
        rooms.forEach(room => {
            if (!room.players || !room.scores) return;
            room.players.forEach((p, idx) => {
                const pid = p.openid || p.id;
                if (!pid) return;

                if (!statsMap[pid]) {
                    statsMap[pid] = { totalScore: 0, gameCount: 0, winCount: 0, drawCount: 0, lostCount: 0 };
                }
                const s = room.scores[idx] || 0;
                statsMap[pid].totalScore += s;
                statsMap[pid].gameCount += 1;
                if (s > 0) statsMap[pid].winCount += 1;
                else if (s < 0) statsMap[pid].lostCount += 1;
                else statsMap[pid].drawCount += 1;
            });
        });

        // 2. Identify Members to Update
        const clubMembers = this.data.clubMembers || [];
        clubMembers.forEach(member => {
            const pid = member.openId;
            const newStats = statsMap[pid];

            // If we have calculated stats, check if we need to update DB
            if (newStats) {
                // Check discrepancy (simple check: if DB has 0 games but we calc > 0)
                const currentGames = member.stats ? member.stats.gameCount : 0;
                if (newStats.gameCount > 0 && currentGames === 0) {
                    console.log(`[StatsRepair] Repairing stats for ${member.name} (${pid})...`, newStats);

                    // Call Cloud to Update
                    // Calculate winRate just for display/completeness
                    newStats.winRate = Math.floor((newStats.winCount / newStats.gameCount) * 10000);

                    cloudApi.call('manageClub', {
                        action: 'updateMemberStats',
                        clubId: this.data.clubId,
                        memberId: member._id,
                        stats: newStats
                    }).then(res => {
                        console.log(`[StatsRepair] Update success for ${member.name}:`, res);
                    }).catch(err => {
                        console.error(`[StatsRepair] Update failed for ${member.name}:`, err);
                    });
                }
            }
        });
    },

    inviteMember() {
        wx.showToast({ title: '请点击右上角分享给好友', icon: 'none' });
    },

    fetchMiniCode() {
        wx.cloud.getTempFileURL({
            fileList: [MINI_CODE_FILE_ID],
            success: res => {
                const file = res.fileList[0];
                if (file && file.status === 0) {
                    this.setData({ miniCodeUrl: file.tempFileURL });
                } else {
                    console.error('Failed to get club mini code URL', file ? file.errMsg : 'empty response');
                }
            },
            fail: err => {
                console.error('Failed to fetch club mini code', err);
            }
        });
    },

    onShareAppMessage() {
        return {
            title: `邀请你加入【${this.data.club.name}】牌友圈`,
            path: `/subpackages/package_club/pages/club/detail/index?id=${this.data.clubId}&action=join`,
            imageUrl: this.data.miniCodeUrl || this.data.club.avatar || ''
        };
    },

    onImageError(e) {
        console.error('Club avatar load error, falling back');
        this.setData({
            'club.avatar': 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YWqJCn1aYSnS7S14E3Yn3Q/0'
        });
    },

    // Join Room Feature
    openJoinModal() {
        this.setData({
            showJoinModal: true,
            joiningRoomId: '',
            joinError: ''
        });
    },

    closeJoinModal() {
        this.setData({ showJoinModal: false });
    },

    onJoinInput(e) {
        this.setData({ joiningRoomId: e.detail.value, joinError: '' });
    },

    async confirmJoin() {
        const roomId = this.data.joiningRoomId;
        if (!roomId || !/^\d{6}$/.test(roomId)) {
            this.setData({ joinError: '请输入正确的6位房间号' });
            return;
        }

        if (this.data.isProcessing) return;

        // Critical: Ensure we have a valid club context
        if (!this.data.clubId || this.data.clubId === '---') {
            wx.showToast({ title: '页面渲染中，请稍后', icon: 'none' });
            return;
        }

        this.setData({ isProcessing: true });
        wx.showLoading({ title: '加入中...', mask: true });

        try {
            const res = await cloudApi.call('joinRoom', {
                roomId: roomId,
                userInfo: app.globalData.userInfo,
                targetClubId: this.data.clubId // Restriction to current club
            });

            wx.hideLoading();

            if (res.result && res.result.joined) {
                // --- Identity Sync ---
                if (res.result.openId) {
                    const realOpenId = res.result.openId;
                    const currentUser = app.globalData.userInfo;
                    if (currentUser.id !== realOpenId) {
                        currentUser.id = realOpenId;
                        currentUser.openid = realOpenId;
                        app.globalData.userInfo = currentUser;
                        wx.setStorageSync('hdpj_user_profile', currentUser);
                        console.log('Identity synced in Club Join');
                    }
                }
                // ---------------------

                this.setData({ showJoinModal: false, joiningRoomId: '' });
                wx.navigateTo({
                    url: `/subpackages/package_game/pages/room/index?roomId=${res.result.docId}&cid=${this.data.clubId}`
                });
            } else {
                throw new Error(res.result ? res.result.msg : '加入失败');
            }

        } catch (err) {
            console.error('Join Error', err);
            wx.hideLoading();
            let msg = err.message || '加入失败';
            if (msg.includes('Room not found')) msg = '房间不存在';
            if (msg.includes('Room is full')) msg = '房间已满';
            this.setData({ joinError: msg });
        } finally {
            this.setData({ isProcessing: false });
        }
    },

    // Club 2.0 Governance
    leaveClub() {
        const that = this;
        wx.showModal({
            title: '退出圈子',
            content: '确定要退出该牌友圈吗？退出后无法查看战绩。',
            confirmColor: '#ef4444',
            success(res) {
                if (res.confirm) {
                    that.performLeave();
                }
            }
        });
    },

    // Navigation to Member Management
    goToMemberManage() {
        if (!this.data.isMember) return;
        wx.navigateTo({
            url: `/subpackages/package_club/pages/club/members/index?id=${this.data.clubId}&cid=${this.data.club.clubId}`
        });
    },



    // Dissolve Club Logic (Owner Only)
    dissolveClub() {
        if (!this.data.isOwner) return;
        const that = this;
        wx.showModal({
            title: '解散圈子',
            content: '警告：此操作不可恢复。解散后圈子及所有关联数据将被删除。确定要继续吗？',
            confirmColor: '#ef4444',
            cancelText: '取消',
            confirmText: '确认解散',
            success(res) {
                if (res.confirm) {
                    that.performDissolve();
                }
            }
        });
    },

    async performDissolve() {
        if (this.data.isProcessing) return;
        this.setData({ isProcessing: true });
        wx.showLoading({ title: '解散中...', mask: true });
        try {
            const res = await cloudApi.call('dissolveClub', {
                clubId: this.data.clubId
            });

            if (res.result && res.result.success) {
                wx.hideLoading();
                wx.showToast({ title: '已解散', icon: 'success' });

                setTimeout(() => {
                    wx.reLaunch({ url: '/pages/index/index' });
                }, 1000);
            } else {
                throw new Error(res.result ? res.result.msg : 'Unknown Error');
            }
        } catch (err) {
            console.error(err);
            wx.hideLoading();
            wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        } finally {
            this.setData({ isProcessing: false });
        }
    },

    showStatsRules() {
        const MIN_GAMES_FOR_RATE = 5;
        wx.showModal({
            title: '📊 排名规则说明',
            content: `🏆 总胜场冠军\n按历史累计胜场数排序，胜场相同则按总积分排序，最后按局数少排序\n\n🏅 常胜将军\n按胜率排序（需至少参与${MIN_GAMES_FOR_RATE}局），胜率相同则按总局数排序，最后按总积分排序`,
            showCancel: false,
            confirmText: '知道了',
            confirmColor: '#3b82f6'
        });
    },

    async performLeave() {
        if (this.data.isProcessing) return;
        this.setData({ isProcessing: true });
        wx.showLoading({ title: '处理中...', mask: true });
        try {
            const res = await cloudApi.call('manageClub', {
                action: 'leave',
                clubId: this.data.clubId,
                mockId: app.globalData.userInfo.openid // Provide current ID for removal logic
            });

            wx.hideLoading();

            if (res.result && res.result.success) {
                wx.showToast({ title: '已退出', icon: 'success' });
                // Go home after leaving
                setTimeout(() => wx.reLaunch({ url: '/pages/index/index' }), 1500);
            } else {
                wx.showToast({ title: (res.result && res.result.msg) || '操作失败', icon: 'none' });
            }
        } catch (err) {
            console.error(err);
            wx.hideLoading();
            wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        } finally {
            this.setData({ isProcessing: false });
        }
    },

    // ========== 优化方法 ==========

    // 用户友好的错误提示
    getFriendlyErrorMessage(err) {
        if (!err) return '未知错误';

        if (err.errCode === 'NETWORK_ERROR') {
            return '网络连接失败，请检查网络';
        }
        if (err.errCode === 'QUOTA_EXCEEDED') {
            return '请求过于频繁，请稍后再试';
        }
        if (err.errMsg && err.errMsg.includes('timeout')) {
            return '请求超时，请重试';
        }
        if (err.errMsg && err.errMsg.includes('permission')) {
            return '没有访问权限';
        }

        return '加载失败，请稍后重试';
    },

    onReachBottom() {
        this.loadMoreRooms();
    }
});
