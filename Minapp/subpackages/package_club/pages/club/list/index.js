const app = getApp();
const cloudApi = require('../../../../../utils/cloudApi');
const db = wx.cloud.database();

// 工具函数：防抖
function debounce(func, wait, immediate) {
    wait = wait || 300;
    immediate = immediate || false;
    var timeout;

    return function () {
        var context = this;
        var args = arguments;

        var later = function () {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };

        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);

        if (callNow) func.apply(context, args);
    };
}

// 工具函数：节流
function throttle(func, limit) {
    limit = limit || 200;
    var inThrottle;

    return function () {
        var context = this;
        var args = arguments;

        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(function () {
                inThrottle = false;
            }, limit);
        }
    };
}

Page({
    data: {
        clubs: [],
        loading: true,
        showSearchModal: false,
        searchQuery: '',
        searchError: '',
        skip: 0,
        limit: 20,
        hasMore: true,
        isInitialLoad: true
    },

    onLoad() {
        const cached = wx.getStorageSync('hdpj_cache_club_list');
        if (cached && cached.length > 0) {
            this.setData({
                clubs: cached,
                loading: false,
                isInitialLoad: false
            });
        }

        // 初始化节流的加载更多函数
        this.throttledLoadMore = throttle(() => {
            this.fetchClubs(true);
        }, 500);

        // 初始化防抖的搜索函数
        this.debouncedSearch = debounce(() => {
            this.confirmSearch();
        }, 300);

        // Stage 3: Reactive Invalidation (P0)
        app.on('roundUpdate', () => {
            console.log('List page: Round update detected, marking for refresh...');
            this.data.needsRefresh = true;
        });
    },

    onShow() {
        if (this.data.clubs.length === 0 || this.data.needsRefresh) {
            this.setData({ loading: true, clubs: this.data.needsRefresh ? [] : this.data.clubs });
            this.data.needsRefresh = false;
        }
        this.setData({ skip: 0, hasMore: true }, async () => {
            await this.syncIdentity();
            this.fetchClubs();
        });
    },

    async syncIdentity() {
        const userInfo = app.globalData.userInfo;
        if (userInfo && !userInfo.isSynced) {
            try {
                const res = await wx.cloud.callFunction({
                    name: 'manageClub',
                    data: { action: 'sync', clubId: 'placeholder' }
                });
                if (res.result && res.result.openId) {
                    const realId = res.result.openId;
                    if (userInfo.openid !== realId) {
                        userInfo.openid = realId;
                        userInfo.isSynced = true;
                        app.globalData.userInfo = userInfo;
                        wx.setStorageSync('hdpj_user_profile', userInfo);
                    } else {
                        userInfo.isSynced = true;
                        wx.setStorageSync('hdpj_user_profile', userInfo);
                    }
                }
            } catch (e) {
                console.error("Identity sync failed", e);
            }
        }
    },

    async fetchClubs(append = false) {
        if (this.data.loading && append) return;

        try {
            const userInfo = app.globalData.userInfo;
            if (!userInfo || !userInfo.openid) {
                this.setData({ loading: false });
                return;
            }

            const skip = append ? this.data.clubs.length : 0;
            const limit = this.data.limit;

            const res = await db.collection(cloudApi.collectionName('clubs')).where({
                'members.openId': userInfo.openid
            })
                .field({
                    name: true,
                    avatar: true,
                    clubId: true,
                    _id: true,
                    members: true,
                    createdAt: true,
                    stats: true                 // ✅ 获取统计信息
                })
                .orderBy('createdAt', 'desc')
                .skip(skip)
                .limit(limit)
                .get();

            const formatted = res.data.map(c => ({
                ...c,
                createDate: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Unknown',
                totalGames: c.stats?.totalGames || 0    // ✅ 直接使用缓存统计
            }));

            const finalClubs = append ? [...this.data.clubs, ...formatted] : formatted;

            // Compare to avoid flickering
            const currentStr = JSON.stringify(this.data.clubs);
            const nextStr = JSON.stringify(finalClubs);

            if (currentStr !== nextStr || this.data.isInitialLoad) {
                this.setData({
                    clubs: finalClubs,
                    loading: false,
                    isInitialLoad: false,
                    hasMore: res.data.length === limit
                });

                if (!append) {
                    wx.setStorage({
                        key: 'hdpj_cache_club_list',
                        data: formatted.slice(0, 50)
                    });
                }
            } else {
                this.setData({ loading: false });
            }
        } catch (err) {
            console.error(err);
            this.setData({ loading: false });
        }
    },

    onReachBottom() {
        if (this.data.hasMore && !this.data.loading) {
            this.throttledLoadMore();
        }
    },

    gotoCreate() {
        wx.navigateTo({
            url: '/subpackages/package_club/pages/club/create/index'
        });
    },

    goHome() {
        wx.reLaunch({
            url: '/pages/index/index'
        });
    },

    gotoDetail(e) {
        const id = e.currentTarget.dataset.id;
        const club = this.data.clubs.find(c => c._id === id);
        let url = `/subpackages/package_club/pages/club/detail/index?id=${id}`;

        if (club) {
            const preData = encodeURIComponent(JSON.stringify({
                name: club.name,
                avatar: club.avatar
            }));
            url += `&pre=${preData}`;
        }

        wx.navigateTo({ url });
    },

    openSearchModal() {
        this.setData({ showSearchModal: true, searchQuery: '', searchError: '' });
    },

    closeSearchModal() {
        this.setData({ showSearchModal: false });
    },

    onSearchInput(e) {
        this.setData({ searchQuery: e.detail.value, searchError: '' });
    },

    async confirmSearch() {
        const query = this.data.searchQuery.trim();
        if (query.length < 4) {
            this.setData({ searchError: '请输入至少4位ID' });
            return;
        }

        wx.showLoading({ title: '正在搜索...' });
        try {
            const db = wx.cloud.database();
            const _ = db.command;

            // ===== 正则转义函数 =====
            const escapeRegExp = (str) => {
                // 转义所有正则特殊字符
                return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            };

            // Build query conditions
            const conditions = [];

            // 1. Match old Hash ID (Prefix) - 使用转义后的字符串
            const escapedQuery = escapeRegExp(query);
            conditions.push({
                _id: db.RegExp({
                    regexp: '^' + escapedQuery,
                    options: 'i',
                })
            });

            // 2. Match new Numeric Club ID (Exact)
            const numId = parseInt(query, 10);
            if (!isNaN(numId) && numId > 0) {
                conditions.push({ clubId: numId });
                // 支持字符串形式的数字ID
                conditions.push({ clubId: String(numId) });
            }

            // 3. 限制结果数量(防止恶意查询)
            const res = await db.collection(cloudApi.collectionName('clubs'))
                .where(_.or(conditions))
                .limit(10)
                .get();

            wx.hideLoading();
            if (res.data.length === 0) {
                this.setData({ searchError: '未找到匹配的圈子' });
            } else if (res.data.length > 1) {
                // If multiple found (rare for IDs but possible if short), might need refinement
                // but for now we'll take the first one or show results
                const club = res.data[0];
                this.setData({ showSearchModal: false });
                wx.navigateTo({ url: `/subpackages/package_club/pages/club/detail/index?id=${club._id}&action=join` });
            } else {
                const club = res.data[0];
                this.setData({ showSearchModal: false });
                wx.navigateTo({ url: `/subpackages/package_club/pages/club/detail/index?id=${club._id}&action=join` });
            }
        } catch (err) {
            console.error(err);
            wx.hideLoading();
            wx.showToast({ title: '搜索失败', icon: 'none' });
        }
    }
});
