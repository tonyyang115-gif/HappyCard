Page({
  data: {
    toolIconErrorMap: {},
    toolCards: [
      {
        id: 'mahjong-ting',
        icon: '/assets/tool-icons/mahjong-tool.png',
        iconAlt: '麻将',
        iconFallback: '麻',
        name: '麻将胡牌听牌',
        desc: '选择13张手牌，自动计算听牌与剩余张数',
        path: '/subpackages/package_tools/pages/mahjong-ting/index'
      },
      {
        id: 'dice',
        icon: '/assets/tool-icons/dice-tool.png',
        iconAlt: '骰子',
        iconFallback: '骰',
        name: '掷骰子',
        desc: '支持1颗或2颗掷骰，自动记录最近20条历史',
        path: '/subpackages/package_tools/pages/dice/index'
      }
    ]
  },

  handleBack() {
    wx.navigateBack();
  },

  openTool(e) {
    const path = e.currentTarget.dataset.path;
    if (!path) return;
    wx.navigateTo({
      url: path
    });
  },

  onToolIconError(e) {
    const toolId = e.currentTarget.dataset.id;
    if (!toolId) return;
    this.setData({
      [`toolIconErrorMap.${toolId}`]: true
    });
  }
});
