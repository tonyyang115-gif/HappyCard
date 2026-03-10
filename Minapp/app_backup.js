// app.js 备份文件
const app = getApp();

App({
    onError(err) {
        console.error('Global Error:', err);
    },

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
});


