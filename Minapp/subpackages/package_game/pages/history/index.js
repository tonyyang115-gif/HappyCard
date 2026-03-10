const app = getApp();
const cloudApi = require('../../../../utils/cloudApi');

Page({
  data: {
    pageSize: 20,
    pageIndex: 0,
    hasMore: true
  },

  onLoad() {
    this.fetchHistory();
  },

  onReachBottom() {
    // 页面级触底（兜底逻辑）
    if (this.data.hasMore && !this.data.isLoading) {
      this.fetchHistory(true);
    }
  },

  onScrollToLower() {
    // scroll-view 触底事件（核心逻辑）
    console.log('[History] Scroll to lower triggered');
    if (this.data.hasMore && !this.data.isLoading) {
      this.fetchHistory(true);
    }
  },

  onPullDownRefresh() {
    this.setData({
      pageIndex: 0,
      hasMore: true,
      historyList: []
    }, () => {
      this.fetchHistory().then(() => {
        wx.stopPullDownRefresh();
      }).catch(() => {
        wx.stopPullDownRefresh();
      });
    });
  },

  async fetchHistory(isNextPage = false) {
    const userInfo = wx.getStorageSync('hdpj_user_profile') || app.globalData.userInfo;
    if (!userInfo) {
      this.setData({ isLoading: false });
      return;
    }

    this.setData({ isLoading: true });

    const db = wx.cloud.database();
    const _ = db.command;

    // 处理 ID 类型兼容性：同时匹配字符串和数字类型
    const uidStr = String(userInfo.id);
    const uidNum = Number(userInfo.id);

    const currentPage = isNextPage ? this.data.pageIndex + 1 : 0;

    try {
      const res = await db.collection(cloudApi.collectionName('rooms'))
        .where({
          'players.id': _.or([uidStr, uidNum])
        })
        .field({
          roomId: true,
          _id: true,
          _createTime: true,
          gameCount: true,
          totalRounds: true,
          status: true,
          players: {
            id: true,
            name: true,
            avatarUrl: true,
            totalScore: true
          }
        })
        .orderBy('_createTime', 'desc')
        .skip(currentPage * this.data.pageSize)
        .limit(this.data.pageSize)
        .get();

      const list = res.data.map(room => {
        const date = new Date(room._createTime || Date.now());
        const displayPlayers = (room.players || []).map(p => {
          return {
            id: p.id,
            name: p.name,
            avatarUrl: p.avatarUrl,
            score: p.totalScore,
            isPositive: p.totalScore > 0,
            isNegative: p.totalScore < 0
          };
        });

        const formatNum = (n) => n.toString().padStart(2, '0');

        return {
          id: room.roomId,
          _id: room._id,
          time: `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`,
          roundCount: Math.max(
            room.gameCount || 0,
            room.totalRounds || 0
          ),
          players: displayPlayers
        };
      });

      this.setData({
        historyList: isNextPage ? this.data.historyList.concat(list) : list,
        isLoading: false,
        pageIndex: currentPage,
        hasMore: list.length === this.data.pageSize
      });
    } catch (err) {
      console.error(err);
      this.setData({ isLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  handleBack() {
    wx.navigateBack();
  },

  goToRoom(e) {
    // Optional: details click
  }
});