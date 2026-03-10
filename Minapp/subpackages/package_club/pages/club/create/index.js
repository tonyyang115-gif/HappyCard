const app = getApp();
const cloudApi = require('../../../../../utils/cloudApi');
const db = wx.cloud.database();

const PRESETS = [
    "https://api.dicebear.com/7.x/adventurer/png?seed=Felix",
    "https://api.dicebear.com/7.x/adventurer/png?seed=Aneka",
    "https://api.dicebear.com/7.x/avataaars/png?seed=Shadow",
    "https://api.dicebear.com/7.x/avataaars/png?seed=Bailey",
    "https://api.dicebear.com/7.x/bottts/png?seed=Sasha",
    "https://api.dicebear.com/7.x/fun-emoji/png?seed=Ace",
    "https://api.dicebear.com/7.x/fun-emoji/png?seed=King",
    "https://api.dicebear.com/7.x/fun-emoji/png?seed=Queen",
    "https://api.dicebear.com/7.x/fun-emoji/png?seed=Jack",
    "https://api.dicebear.com/7.x/fun-emoji/png?seed=Joker",
    "https://api.dicebear.com/7.x/notionists/png?seed=George",
    "https://api.dicebear.com/7.x/notionists/png?seed=Zoey"
];

Page({
    data: {
        name: '',
        desc: '',
        loading: false,
        avatarUrl: PRESETS[0],
        presets: PRESETS,
        showAvatarModal: false,
        tempAvatarUrl: ''
    },

    onInputName(e) {
        this.setData({ name: e.detail.value });
    },

    onInputDesc(e) {
        this.setData({ desc: e.detail.value });
    },

    // Modal Handlers
    openAvatarModal() {
        this.setData({
            showAvatarModal: true,
            tempAvatarUrl: this.data.avatarUrl
        });
    },

    closeAvatarModal() {
        this.setData({ showAvatarModal: false });
    },

    onSelectTempPreset(e) {
        const url = e.currentTarget.dataset.url;
        this.setData({ tempAvatarUrl: url });
    },

    async onUploadTempImage() {
        try {
            const res = await wx.chooseMedia({
                count: 1,
                mediaType: ['image'],
                sourceType: ['album', 'camera'],
            });
            const tempFilePath = res.tempFiles[0].tempFilePath;

            wx.showLoading({ title: '上传中...' });

            // Generate cloud path
            const cloudPath = `club_avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}.png`;

            const uploadRes = await wx.cloud.uploadFile({
                cloudPath: cloudPath,
                filePath: tempFilePath,
            });

            this.setData({ tempAvatarUrl: uploadRes.fileID });
            wx.hideLoading();
        } catch (err) {
            console.error(err);
            wx.hideLoading();
        }
    },

    confirmAvatarSelection() {
        this.setData({
            avatarUrl: this.data.tempAvatarUrl,
            showAvatarModal: false
        });
    },

    async submitCreate() {
        if (!this.data.name.trim() || this.data.loading) {
            if (!this.data.name.trim()) wx.showToast({ title: '请输入名称', icon: 'none' });
            return;
        }

        this.setData({ loading: true });
        wx.showLoading({ title: '正在创建...', mask: true });

        try {
            const userInfo = app.globalData.userInfo || {};

            const res = await cloudApi.call('createClub', {
                name: this.data.name,
                desc: this.data.desc,
                avatar: this.data.avatarUrl,
                userInfo: {
                    name: userInfo.name || '玩家',
                    avatarUrl: userInfo.avatarUrl || ''
                }
            });

            wx.hideLoading();

            if (res.result && res.result.success) {
                wx.showToast({ title: '创建成功', icon: 'success' });
                setTimeout(() => {
                    wx.navigateBack();
                }, 1500);
            } else {
                throw new Error(res.result ? res.result.msg : '创建失败');
            }
        } catch (err) {
            console.error('Club Creation Failed:', err);
            wx.hideLoading();
            wx.showToast({ title: err.message || '创建失败', icon: 'none' });
            this.setData({ loading: false });
        }
    },

    goHome() {
        wx.reLaunch({
            url: '/pages/index/index'
        });
    }
});
