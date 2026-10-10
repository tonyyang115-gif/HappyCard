const {
  getAllTemplates,
  getDefaultTemplateId,
  setDefaultTemplateId,
  saveCustomTemplate,
  deleteCustomTemplate
} = require('../../utils/mahjong-fan');
const {
  buildWorkbenchDraft,
  attachWorkbenchConfigToTemplate,
  buildConfigSummary,
  decorateDraftForView,
  pickerOptionsForField,
  pickerOptionsForRule,
  formatRuleValue,
  clone,
  summarizeWorkbenchRecord
} = require('../../utils/mahjong-fan/workbench');
const {
  saveWorkbenchSession,
  getWorkbenchHistory
} = require('../../utils/mahjong-fan/infra/workbench-store');

function buildTemplateList() {
  return getAllTemplates().sort((a, b) => (a.uiMeta?.order || 99) - (b.uiMeta?.order || 99));
}

function createDraftPayload(template) {
  const workbenchDraft = buildWorkbenchDraft(template);
  return {
    templateId: template.id,
    templateName: template.name,
    summary: buildConfigSummary(workbenchDraft),
    workbenchDraft
  };
}

Page({
  data: {
    templates: [],
    activeTemplateId: '',
    activeTemplate: null,
    currentSummary: '',
    recentSummary: '暂无最近记录',
    recentTemplateName: '默认模板',
    recentUpdatedAtText: '',
    showConfigPopup: false,
    showValuePicker: false,
    pickerTitle: '',
    pickerOptions: [],
    pickerSelectedKey: '',
    pickerTargetType: '',
    pickerTargetId: '',
    configDraft: null,
    toolIcon: '/assets/tool-icons/mahjong-tool.png'
  },

  onLoad() {
    this.bootstrap();
  },

  bootstrap() {
    const templates = buildTemplateList();
    const activeTemplateId = getDefaultTemplateId();
    const activeTemplate = templates.find((item) => item.id === activeTemplateId) || templates[0] || null;
    const latestRecord = getWorkbenchHistory()[0] || null;
    const draftPayload = activeTemplate ? createDraftPayload(activeTemplate) : null;

    this.setData({
      templates,
      activeTemplateId: activeTemplate ? activeTemplate.id : '',
      activeTemplate,
      currentSummary: draftPayload ? draftPayload.summary : '',
      recentSummary: summarizeWorkbenchRecord(latestRecord),
      recentTemplateName: latestRecord ? latestRecord.templateName : (activeTemplate ? activeTemplate.name : '默认模板'),
      recentUpdatedAtText: latestRecord ? this.formatTime(latestRecord.ts) : '等待首次开局',
      configDraft: draftPayload ? decorateDraftForView(draftPayload.workbenchDraft) : null
    });
  },

  formatTime(ts) {
    if (!ts) return '';
    const date = new Date(ts);
    const mm = `${date.getMonth() + 1}`.padStart(2, '0');
    const dd = `${date.getDate()}`.padStart(2, '0');
    const hh = `${date.getHours()}`.padStart(2, '0');
    const ii = `${date.getMinutes()}`.padStart(2, '0');
    return `${mm}-${dd} ${hh}:${ii}`;
  },

  handleBack() {
    wx.navigateBack();
  },

  noop() {},

  onTemplateChange(e) {
    const templateId = e.currentTarget.dataset.id;
    const activeTemplate = this.data.templates.find((item) => item.id === templateId);
    if (!activeTemplate) return;
    const draftPayload = createDraftPayload(activeTemplate);
    setDefaultTemplateId(templateId);
    this.setData({
      activeTemplateId: templateId,
      activeTemplate,
      configDraft: decorateDraftForView(draftPayload.workbenchDraft),
      currentSummary: draftPayload.summary
    });
  },

  onStartTap() {
    if (!this.data.activeTemplate) return;
    this.setData({
      showConfigPopup: true,
      configDraft: decorateDraftForView(buildWorkbenchDraft(this.data.activeTemplate))
    });
  },

  onCloseConfig() {
    this.setData({ showConfigPopup: false, showValuePicker: false });
  },

  onOpenBasePicker(e) {
    const type = e.currentTarget.dataset.type;
    const draft = this.data.configDraft;
    if (!draft) return;
    const options = pickerOptionsForField(type);
    const selected = draft[type];
    this.setData({
      showValuePicker: true,
      pickerTitle: type === 'baseScore' ? '选择打好大' : (type === 'maxFan' ? '选择最多几番' : '选择好多封顶'),
      pickerOptions: options,
      pickerSelectedKey: String(selected),
      pickerTargetType: type,
      pickerTargetId: ''
    });
  },

  onOpenRulePicker(e) {
    const ruleId = e.currentTarget.dataset.ruleId;
    const group = e.currentTarget.dataset.group;
    const draft = this.data.configDraft;
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
      pickerTargetType: group,
      pickerTargetId: ruleId
    });
  },

  onPickerSelect(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ pickerSelectedKey: key });
  },

  onPickerCancel() {
    this.setData({ showValuePicker: false });
  },

  onPickerConfirm() {
    const { pickerTargetType, pickerTargetId, pickerSelectedKey, pickerOptions, configDraft } = this.data;
    if (!configDraft) return;

    const picked = pickerOptions.find((item) => String(item.key || item.value) === String(pickerSelectedKey));
    if (!picked) {
      this.setData({ showValuePicker: false });
      return;
    }

    const nextDraft = clone(configDraft);
    if (pickerTargetType === 'baseScore' || pickerTargetType === 'maxFan' || pickerTargetType === 'hardCap') {
      nextDraft[pickerTargetType] = Number(picked.value);
    } else {
      const listKey = pickerTargetType === 'windRain' ? 'windRainRules' : 'huRules';
      nextDraft[listKey] = nextDraft[listKey].map((item) => {
        if (item.id !== pickerTargetId) return item;
        return {
          ...item,
          value: Number(picked.value),
          scoreSemantics: picked.scoreSemantics || item.scoreSemantics
        };
      });
    }

    this.setData({
      configDraft: decorateDraftForView(nextDraft),
      showValuePicker: false
    });
  },

  onRuleLongPress(e) {
    const ruleId = e.currentTarget.dataset.ruleId;
    const group = e.currentTarget.dataset.group;
    if (group !== 'hu' || !ruleId || !String(ruleId).startsWith('CUSTOM_')) {
      return;
    }
    const nextDraft = clone(this.data.configDraft);
    nextDraft.huRules = nextDraft.huRules.filter((item) => item.id !== ruleId);
    this.setData({ configDraft: decorateDraftForView(nextDraft) });
  },

  onAddRule() {
    const nextDraft = clone(this.data.configDraft);
    const now = Date.now();
    nextDraft.huRules.push({
      id: `CUSTOM_${now}`,
      name: `自定义规则${nextDraft.huRules.filter((item) => String(item.id).startsWith('CUSTOM_')).length + 1}`,
      value: 1,
      scoreSemantics: 'fan',
      kind: 'hu',
      uiOrder: 999 + nextDraft.huRules.length
    });
    this.setData({ configDraft: decorateDraftForView(nextDraft) });
  },

  onSaveTemplate() {
    const { activeTemplate, configDraft } = this.data;
    if (!activeTemplate || !configDraft) return;
    const now = new Date();
    const suffix = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const template = attachWorkbenchConfigToTemplate(activeTemplate, configDraft);
    template.id = `custom_workbench_${Date.now()}`;
    template.name = `算翻模板-${suffix}`;
    template.version = '1.0.0';
    template.isSystem = false;
    const saved = saveCustomTemplate(template);
    if (!saved.ok) {
      wx.showToast({ title: saved.message, icon: 'none' });
      return;
    }
    const templates = buildTemplateList();
    setDefaultTemplateId(saved.template.id);
    this.setData({
      templates,
      activeTemplateId: saved.template.id,
      activeTemplate: saved.template,
      currentSummary: buildConfigSummary(configDraft),
      showConfigPopup: false
    });
    wx.showToast({ title: '模板已保存', icon: 'success' });
  },

  onBeginWorkbench() {
    const { activeTemplate, configDraft } = this.data;
    if (!activeTemplate || !configDraft) return;
    const session = {
      templateId: activeTemplate.id,
      templateName: activeTemplate.name,
      startedAt: Date.now(),
      configDraft: clone(configDraft),
      source: 'landing'
    };
    saveWorkbenchSession(session);
    this.setData({
      currentSummary: buildConfigSummary(configDraft),
      showConfigPopup: false
    });
    wx.navigateTo({
      url: '/subpackages/package_tools/pages/mahjong-fan-workbench/index'
    });
  },

  onDeleteTemplate(e) {
    const templateId = e.currentTarget.dataset.id;
    const target = this.data.templates.find((item) => item.id === templateId);
    if (!target || target.isSystem) {
      wx.showToast({ title: '系统模板不可删除', icon: 'none' });
      return;
    }
    const deleted = deleteCustomTemplate(templateId);
    if (!deleted.ok) {
      wx.showToast({ title: deleted.message, icon: 'none' });
      return;
    }
    this.bootstrap();
  },

  formatRuleValueForView(rule) {
    return formatRuleValue(rule);
  }
});
