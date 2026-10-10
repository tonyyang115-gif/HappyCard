const {
  getTemplateById,
  saveCustomTemplate
} = require('../../utils/mahjong-fan');
const {
  buildWorkbenchDraft,
  attachWorkbenchConfigToTemplate,
  buildConfigSummary,
  decorateDraftForView,
  createWorkbenchState,
  calculateWorkbenchViewModel,
  pickerOptionsForField,
  pickerOptionsForRule,
  formatRuleValue,
  clone
} = require('../../utils/mahjong-fan/workbench');
const {
  getWorkbenchSession,
  saveWorkbenchSession,
  appendWorkbenchHistory,
  clearWorkbenchHistory
} = require('../../utils/mahjong-fan/infra/workbench-store');

Page({
  data: {
    templateName: '',
    configDraft: null,
    draftSummary: '',
    boardState: null,
    vm: null,
    showConfigPopup: false,
    showValuePicker: false,
    pickerTitle: '',
    pickerOptions: [],
    pickerSelectedKey: '',
    pickerTargetType: '',
    pickerTargetId: '',
    pickerTargetGroup: '',
    configPopupDraft: null,
    familyCountOptions: [1, 2, 3, 4],
    loading: true
  },

  onLoad() {
    this.bootstrap();
  },

  bootstrap() {
    const session = getWorkbenchSession();
    if (!session || !session.configDraft) {
      wx.showToast({ title: '请先配置规则', icon: 'none' });
      setTimeout(() => {
        wx.navigateBack();
      }, 300);
      return;
    }

    const configDraft = decorateDraftForView(clone(session.configDraft));
    const boardState = session.boardState ? clone(session.boardState) : createWorkbenchState();
    const vm = calculateWorkbenchViewModel(configDraft, boardState);

    this.setData({
      templateName: session.templateName || configDraft.templateName,
      configDraft,
      draftSummary: buildConfigSummary(configDraft),
      boardState,
      vm,
      loading: false
    });
    this.persistSession();
  },

  persistSession() {
    saveWorkbenchSession({
      templateName: this.data.templateName,
      templateId: this.data.configDraft ? this.data.configDraft.templateId : '',
      configDraft: clone(this.data.configDraft),
      boardState: clone(this.data.boardState),
      updatedAt: Date.now()
    });
  },

  handleBack() {
    wx.navigateBack();
  },

  noop() {},

  recalculate(nextBoardState) {
    const boardState = nextBoardState || this.data.boardState;
    const vm = calculateWorkbenchViewModel(this.data.configDraft, boardState);
    this.setData({ boardState, vm }, () => this.persistSession());
  },

  toggleRuleSelection(containerKey, playerId, ruleId) {
    const nextBoard = clone(this.data.boardState);
    const target = containerKey === 'income'
      ? nextBoard.income
      : nextBoard.players.find((item) => item.id === playerId);
    if (!target) return;
    const selected = new Set(target.selectedHuRuleIds || []);
    if (selected.has(ruleId)) {
      selected.delete(ruleId);
    } else {
      selected.add(ruleId);
    }
    target.selectedHuRuleIds = Array.from(selected);
    this.recalculate(nextBoard);
  },

  onToggleIncomeRule(e) {
    this.toggleRuleSelection('income', '', e.currentTarget.dataset.ruleId);
  },

  onTogglePlayerRule(e) {
    this.toggleRuleSelection('player', e.currentTarget.dataset.playerId, e.currentTarget.dataset.ruleId);
  },

  adjustWindRain(containerKey, playerId, ruleId, delta) {
    const nextBoard = clone(this.data.boardState);
    const target = containerKey === 'income'
      ? nextBoard.income
      : nextBoard.players.find((item) => item.id === playerId);
    if (!target) return;
    const current = Number(target.windRainCounts[ruleId] || 0);
    target.windRainCounts[ruleId] = Math.max(0, current + delta);
    this.recalculate(nextBoard);
  },

  onAdjustIncomeWindRain(e) {
    this.adjustWindRain('income', '', e.currentTarget.dataset.ruleId, Number(e.currentTarget.dataset.delta));
  },

  onAdjustPlayerWindRain(e) {
    this.adjustWindRain('player', e.currentTarget.dataset.playerId, e.currentTarget.dataset.ruleId, Number(e.currentTarget.dataset.delta));
  },

  selectFamily(containerKey, playerId, count) {
    const nextBoard = clone(this.data.boardState);
    const target = containerKey === 'income'
      ? nextBoard.income
      : nextBoard.players.find((item) => item.id === playerId);
    if (!target) return;
    target.familyCount = count;
    this.recalculate(nextBoard);
  },

  onSelectIncomeFamily(e) {
    this.selectFamily('income', '', Number(e.currentTarget.dataset.count));
  },

  onSelectPlayerFamily(e) {
    this.selectFamily('player', e.currentTarget.dataset.playerId, Number(e.currentTarget.dataset.count));
  },

  toggleIncludeBase(containerKey, playerId) {
    const nextBoard = clone(this.data.boardState);
    const target = containerKey === 'income'
      ? nextBoard.income
      : nextBoard.players.find((item) => item.id === playerId);
    if (!target) return;
    target.includeBase = !target.includeBase;
    this.recalculate(nextBoard);
  },

  onToggleIncomeBase() {
    this.toggleIncludeBase('income', '');
  },

  onTogglePlayerBase(e) {
    this.toggleIncludeBase('player', e.currentTarget.dataset.playerId);
  },

  onSaveRound() {
    const nextBoard = clone(this.data.boardState);
    nextBoard.savedTotal = Number(nextBoard.savedTotal || 0) + Number(this.data.vm.roundScore || 0);
    const record = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      templateId: this.data.configDraft.templateId,
      templateName: this.data.templateName,
      templateHash: this.data.configDraft.templateHash,
      roundScore: this.data.vm.roundScore,
      totalScore: nextBoard.savedTotal,
      summary: this.data.draftSummary
    };
    appendWorkbenchHistory(record);
    nextBoard.income = createWorkbenchState().income;
    nextBoard.players = createWorkbenchState().players;
    this.setData({ boardState: nextBoard }, () => {
      this.recalculate(nextBoard);
      wx.showToast({ title: '本局已保存', icon: 'success' });
    });
  },

  onOpenMore() {
    wx.showActionSheet({
      itemList: ['重置当前局', '清空本场总分', '清空最近记录'],
      success: ({ tapIndex }) => {
        if (tapIndex === 0) {
          const nextBoard = clone(this.data.boardState);
          nextBoard.income = createWorkbenchState().income;
          nextBoard.players = createWorkbenchState().players;
          this.recalculate(nextBoard);
        } else if (tapIndex === 1) {
          const nextBoard = createWorkbenchState();
          this.recalculate(nextBoard);
        } else if (tapIndex === 2) {
          clearWorkbenchHistory();
          wx.showToast({ title: '记录已清空', icon: 'success' });
        }
      }
    });
  },

  onShareWorkbench() {
    const text = `${this.data.templateName}\n本场总分 ${this.data.vm.totalScore} 分\n本局总分 ${this.data.vm.roundScore} 分`;
    wx.setClipboardData({ data: text });
  },

  onFinishWorkbench() {
    wx.showModal({
      title: '结束本局',
      content: '结束后将返回麻将算翻首页，当前配置会保留。',
      confirmColor: '#ff4d5b',
      success: (res) => {
        if (!res.confirm) return;
        wx.navigateBack();
      }
    });
  },

  onOpenManual() {
    wx.navigateTo({
      url: '/subpackages/package_tools/pages/mahjong-fan-manual/index'
    });
  },

  onOpenConfig() {
    this.setData({
      showConfigPopup: true,
      configPopupDraft: decorateDraftForView(clone(this.data.configDraft))
    });
  },

  onCloseConfig() {
    this.setData({ showConfigPopup: false, showValuePicker: false });
  },

  onOpenBasePicker(e) {
    const type = e.currentTarget.dataset.type;
    const draft = this.data.configPopupDraft;
    if (!draft) return;
    const options = pickerOptionsForField(type);
    const selected = draft[type];
    this.setData({
      showValuePicker: true,
      pickerTitle: type === 'baseScore' ? '选择打好大' : (type === 'maxFan' ? '选择最多几番' : '选择好多封顶'),
      pickerOptions: options,
      pickerSelectedKey: String(selected),
      pickerTargetType: type,
      pickerTargetId: '',
      pickerTargetGroup: ''
    });
  },

  onOpenRulePicker(e) {
    const ruleId = e.currentTarget.dataset.ruleId;
    const group = e.currentTarget.dataset.group;
    const draft = this.data.configPopupDraft;
    if (!draft) return;
    const rules = group === 'windRain' ? draft.windRainRules : draft.huRules;
    const rule = rules.find((item) => item.id === ruleId);
    if (!rule) return;
    const options = pickerOptionsForRule(rule).map((item) => ({
      ...item,
      key: `${item.scoreSemantics || item.kind}-${item.value}`
    }));
    const selectedKey = rule.kind === 'windRain' ? `point-${rule.value}` : `${rule.scoreSemantics}-${rule.value}`;
    this.setData({
      showValuePicker: true,
      pickerTitle: `设置 ${rule.name}`,
      pickerOptions: options,
      pickerSelectedKey: selectedKey,
      pickerTargetType: 'rule',
      pickerTargetId: ruleId,
      pickerTargetGroup: group
    });
  },

  onPickerSelect(e) {
    this.setData({ pickerSelectedKey: e.currentTarget.dataset.key });
  },

  onPickerCancel() {
    this.setData({ showValuePicker: false });
  },

  onPickerConfirm() {
    const picked = this.data.pickerOptions.find((item) => String(item.key || item.value) === String(this.data.pickerSelectedKey));
    const draft = clone(this.data.configPopupDraft);
    if (!picked || !draft) {
      this.setData({ showValuePicker: false });
      return;
    }
    if (this.data.pickerTargetType === 'baseScore' || this.data.pickerTargetType === 'maxFan' || this.data.pickerTargetType === 'hardCap') {
      draft[this.data.pickerTargetType] = Number(picked.value);
    } else {
      const listKey = this.data.pickerTargetGroup === 'windRain' ? 'windRainRules' : 'huRules';
      draft[listKey] = draft[listKey].map((item) => {
        if (item.id !== this.data.pickerTargetId) return item;
        return {
          ...item,
          value: Number(picked.value),
          scoreSemantics: picked.scoreSemantics || item.scoreSemantics
        };
      });
    }
    this.setData({ configPopupDraft: decorateDraftForView(draft), showValuePicker: false });
  },

  onAddRule() {
    const draft = clone(this.data.configPopupDraft);
    draft.huRules.push({
      id: `CUSTOM_${Date.now()}`,
      name: `自定义规则${draft.huRules.filter((item) => String(item.id).startsWith('CUSTOM_')).length + 1}`,
      value: 1,
      scoreSemantics: 'fan',
      kind: 'hu',
      uiOrder: 999 + draft.huRules.length
    });
    this.setData({ configPopupDraft: decorateDraftForView(draft) });
  },

  onRuleLongPress(e) {
    const ruleId = e.currentTarget.dataset.ruleId;
    const group = e.currentTarget.dataset.group;
    if (group !== 'hu' || !String(ruleId).startsWith('CUSTOM_')) return;
    const draft = clone(this.data.configPopupDraft);
    draft.huRules = draft.huRules.filter((item) => item.id !== ruleId);
    this.setData({ configPopupDraft: decorateDraftForView(draft) });
  },

  onSaveTemplate() {
    const baseTemplate = getTemplateById(this.data.configDraft.templateId);
    if (!baseTemplate || !this.data.configPopupDraft) return;
    const now = new Date();
    const suffix = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const template = attachWorkbenchConfigToTemplate(baseTemplate, this.data.configPopupDraft);
    template.id = `custom_workbench_${Date.now()}`;
    template.name = `算翻模板-${suffix}`;
    template.version = '1.0.0';
    template.isSystem = false;
    const saved = saveCustomTemplate(template);
    if (!saved.ok) {
      wx.showToast({ title: saved.message, icon: 'none' });
      return;
    }
    wx.showToast({ title: '模板已保存', icon: 'success' });
  },

  onApplyConfig() {
    const nextDraft = clone(this.data.configPopupDraft);
    this.setData({
      configDraft: decorateDraftForView(nextDraft),
      draftSummary: buildConfigSummary(nextDraft),
      showConfigPopup: false
    }, () => {
      this.recalculate(this.data.boardState);
    });
  },

});
