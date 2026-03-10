const app = getApp();
const cloudApi = require('../../../../../utils/cloudApi');
const db = wx.cloud.database();

Page({
    data: {
        currentTab: 0, // 0: 基础设置, 1: 成员管理
        clubInfo: { name: '', description: '' },
        clubId: '',
        members: [],
        allMembers: [], // 保存原始成员列表用于搜索
        ownerId: '',
        isOwner: false,
        cid: null, // Numeric Club ID
        isLoading: false,
        hasMore: true,
        skip: 0,
        limit: 20,
        searchKeyword: '', // 搜索关键词
        refreshingMembers: false // 下拉刷新状态
    },

    onLoad(options) {
        if (options.id) {
            this.setData({
                clubId: options.id,
                cid: options.cid ? Number(options.cid) : null
            });
            this.fetchMembers();
            this.fetchClubInfo();
        }
    },

    onTabChange(e) {
        const tab = Number(e.currentTarget.dataset.tab);
        this.setData({ currentTab: tab });
    },

    async fetchClubInfo() {
        try {
            const res = await db.collection(cloudApi.collectionName('clubs')).doc(this.data.clubId).get();
            const club = res.data;
            this.setData({
                'clubInfo.name': club.name,
                'clubInfo.description': club.description || ''
            });
        } catch (e) {
            console.error('Fetch club info failed', e);
        }
    },

    onNameInput(e) {
        this.setData({ 'clubInfo.name': e.detail.value });
    },

    onDescInput(e) {
        this.setData({ 'clubInfo.description': e.detail.value });
    },

    async saveSetting() {
        if (!this.data.clubInfo.name.trim()) {
            wx.showToast({ title: '名称不能为空', icon: 'none' });
            return;
        }

        wx.showLoading({ title: '保存中' });
        try {
            await cloudApi.call('manageClub', {
                action: 'updateInfo',
                clubId: this.data.clubId,
                name: this.data.clubInfo.name,
                description: this.data.clubInfo.description
            });
            wx.hideLoading();
            wx.showToast({ title: '已更新' });

            // Notify global state
            app.globalData.reloadClubDetail = true;
        } catch (e) {
            wx.hideLoading();
            console.error(e);
            wx.showToast({ title: e.message || '保存失败', icon: 'none' });
        }
    },

    onDissolveTap() {
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
        }
    },

    async fetchMembers(append = false) {
        // 检查是否在刷新中
        if (!this.data.refreshingMembers) {
            this.setData({ isLoading: true });
            if (!append) {
                this.setData({ skip: 0, hasMore: true });
            }
        }

        try {
            // 1. Ensure we have the numeric CID
            let cid = this.data.cid;
            let club = null;

            if (!cid) {
                const clubRes = await db.collection(cloudApi.collectionName('clubs')).doc(this.data.clubId).get();
                club = clubRes.data;
                if (!club) throw new Error('Club not found');
                cid = club.clubId;
                this.setData({ cid });
            }

            // 2. Fetch from decoupled collection with pagination
            const currentSkip = append ? this.data.members.length : 0;

            const membersRes = await db.collection(cloudApi.collectionName('club_members'))
                .where({ clubId: cid })
                .orderBy('joinedAt', 'desc')
                .skip(currentSkip)
                .limit(this.data.limit)
                .get();

            const rawMembers = membersRes.data;

            // 3. Fallback and Formatting (Simplified for V2)
            let membersList = [];
            if (rawMembers.length > 0) {
                membersList = rawMembers.map(m => ({
                    openId: m.openId,
                    name: m.name,
                    avatar: m.avatar,
                    joinedAt: m.joinedAt,
                    role: m.role
                }));
            } else {
                // Even if empty, we trust the collection.
                // Legacy fallback removed.
                membersList = [];
            }

            // 4. Formatting
            const userInfo = app.globalData.userInfo;
            const formattedMembers = membersList.map(m => {
                let joinDateStr = '未知';
                if (m.joinedAt) {
                    const d = new Date(m.joinedAt);
                    joinDateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                }
                return {
                    ...m,
                    joinDate: joinDateStr,
                    avatar: m.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=?backgroundColor=c0aede' // 默认头像
                };
            });

            // 5. Update State
            // If we don't have the club object yet (cached cid used), fetch it for ownerId
            if (!club) {
                const clubRes = await db.collection(cloudApi.collectionName('clubs')).doc(this.data.clubId).get();
                club = clubRes.data;
                if (!club) {
                    wx.hideLoading();
                    this.setData({ isLoading: false });
                    app.ejectFromClub(this.data.clubId);
                    return;
                }
            }

            const finalMembers = append ? [...this.data.members, ...formattedMembers] : formattedMembers;

            this.setData({
                members: finalMembers,
                allMembers: finalMembers, // 保存原始成员列表用于搜索
                ownerId: club.ownerId,
                isOwner: userInfo && userInfo.openid === club.ownerId,
                hasMore: membersRes.data.length === this.data.limit
            });

            wx.hideLoading();
            this.setData({ isLoading: false, refreshingMembers: false });
        } catch (err) {
            console.error(err);
            wx.hideLoading();
            this.setData({ isLoading: false, refreshingMembers: false });
            if (err.message && (err.message.includes('not found') || err.message.includes('404'))) {
                app.ejectFromClub(this.data.clubId);
            } else {
                wx.showToast({ title: '加载失败', icon: 'none' });
            }
        }
    },

    // 加载更多成员
    loadMoreMembers() {
        if (this.data.isLoading || !this.data.hasMore || this.data.searchKeyword) return;

        const newSkip = this.data.skip + this.data.limit;
        this.setData({ skip: newSkip }, () => {
            this.fetchMembers(true);
        });
    },

    // 下拉刷新成员列表
    onRefreshMembers() {
        this.setData({ refreshingMembers: true });
        this.fetchMembers(false);
    },

    // 搜索输入处理
    onSearchInput(e) {
        this.setData({ searchKeyword: e.detail.value.trim() });
        this.filterMembers();
    },

    // 搜索确认
    onSearchConfirm() {
        this.filterMembers();
        wx.hideKeyboard();
    },

    // 清除搜索
    clearSearch() {
        this.setData({
            searchKeyword: '',
            members: this.data.allMembers,
            skip: 0,
            hasMore: this.data.allMembers.length > this.data.limit
        });
    },

    // 过滤成员
    filterMembers() {
        const keyword = this.data.searchKeyword.toLowerCase();

        if (!keyword) {
            // 无搜索关键词，显示所有成员
            this.setData({
                members: this.data.allMembers,
                skip: 0,
                hasMore: this.data.allMembers.length > this.data.limit
            });
            return;
        }

        // 搜索过滤：昵称或ID
        const filtered = this.data.allMembers.filter(m =>
            (m.name && m.name.toLowerCase().includes(keyword)) ||
            (m.openId && m.openId.toLowerCase().includes(keyword))
        );

        this.setData({
            members: filtered,
            skip: 0,
            hasMore: filtered.length > this.data.limit
        });
    },

    onRemoveTap(e) {
        if (!this.data.isOwner) return;

        const { openid, name } = e.currentTarget.dataset;
        const that = this;

        wx.showModal({
            title: '移除成员',
            content: `确定要将成员 "${name}" 移出圈子吗？`, // Named Confirmation
            confirmColor: '#ef4444',
            success(res) {
                if (res.confirm) {
                    that.performRemove(openid);
                }
            }
        });
    },

    async performRemove(targetOpenId) {
        // --- Optimistic UI Execution ---
        const originalMembers = [...this.data.members];
        const newMembers = originalMembers.filter(m => m.openId !== targetOpenId);

        // Immediate visual feedback
        this.setData({ members: newMembers });
        wx.showToast({ title: '处理中...', icon: 'none', duration: 1000 });

        try {
            const res = await wx.cloud.callFunction({
                name: 'manageClub',
                data: {
                    action: 'kick',
                    clubId: this.data.clubId,
                    targetOpenId: targetOpenId
                }
            });

            if (res.result && res.result.success) {
                // Success: Confirm with a toast
                wx.showToast({ title: '已移除', icon: 'success' });
                // Optional: Re-fetch silently to ensure sync with other possible changes
                // this.fetchMembers(); 
            } else {
                // Failure: Rollback UI
                this.setData({ members: originalMembers });
                wx.showToast({ title: (res.result && res.result.msg) || '操作失败', icon: 'none' });
            }
        } catch (err) {
            console.error('Optimistic UI Error:', err);
            // Failure: Rollback UI
            this.setData({ members: originalMembers });
            wx.showToast({ title: '网络连接异常', icon: 'none' });
        }
    },

    // 加载更多成员（分页）
    loadMoreMembers() {
        if (this.data.isLoading || !this.data.hasMore) return;
        const newSkip = this.data.skip + this.data.limit;
        this.setData({ skip: newSkip }, () => {
            this.fetchMembers();
        });
    },

    // 滚动到底部加载更多
    onReachBottom() {
        this.loadMoreMembers();
    }
});
