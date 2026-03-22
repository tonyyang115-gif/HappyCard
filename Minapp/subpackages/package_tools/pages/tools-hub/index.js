Page({
  handleBack() {
    wx.navigateBack();
  },

  goMahjongTing() {
    wx.navigateTo({
      url: '/subpackages/package_tools/pages/mahjong-ting/index'
    });
  }
});
