const { annotateTemplateRuntime } = require('./template/repository');

const BASE_SCORE_OPTIONS = [1, 2, 4, 8, 16, 32];
const MAX_FAN_OPTIONS = [2, 4, 5, 6, 8, 10, 12];
const HARD_CAP_OPTIONS = [16, 32, 64, 128, 256, 512];
const HU_RULE_OPTIONS = [
  { kind: 'score', scoreSemantics: 'add_base', value: 1, label: '加底' },
  { kind: 'score', scoreSemantics: 'fan', value: 1, label: '1番' },
  { kind: 'score', scoreSemantics: 'fan', value: 2, label: '2番' },
  { kind: 'score', scoreSemantics: 'fan', value: 3, label: '3番' },
  { kind: 'score', scoreSemantics: 'fan', value: 4, label: '4番' },
  { kind: 'score', scoreSemantics: 'fan', value: 5, label: '5番' },
  { kind: 'score', scoreSemantics: 'mul_base', value: 2, label: '2倍' },
  { kind: 'score', scoreSemantics: 'mul_base', value: 3, label: '3倍' }
];
const WIND_RAIN_OPTIONS = [
  { kind: 'point', value: 1, label: '1分' },
  { kind: 'point', value: 2, label: '2分' },
  { kind: 'point', value: 4, label: '4分' },
  { kind: 'point', value: 8, label: '8分' }
];

const MANUAL_WIND_RAIN_RULES = [
  { id: 'WR_ANGANG', name: '暗杠', kind: 'windRain', value: 1, valueType: 'point', scoreSemantics: 'point', uiOrder: 1 },
  { id: 'WR_BAGANG', name: '巴杠', kind: 'windRain', value: 1, valueType: 'point', scoreSemantics: 'point', uiOrder: 2 }
];

function clone(input) {
  return JSON.parse(JSON.stringify(input));
}

function normalizeHuRule(rule) {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled !== false,
    value: Number(rule.value || 0),
    scoreSemantics: rule.scoreSemantics || 'fan',
    kind: 'hu',
    priority: rule.priority || 0,
    uiOrder: rule.uiOrder || 999,
    desc: rule.desc || ''
  };
}

function buildDefaultWorkbenchRules(template) {
  const huRules = (template.rules || [])
    .filter((rule) => rule.id !== 'R_HU_VALID')
    .map(normalizeHuRule)
    .sort((a, b) => (a.uiOrder || 0) - (b.uiOrder || 0));

  return {
    windRainRules: clone(MANUAL_WIND_RAIN_RULES),
    huRules
  };
}

function buildWorkbenchDraft(template) {
  const fallback = buildDefaultWorkbenchRules(template);
  const saved = template.workbenchConfig || {};
  return {
    templateId: template.id,
    templateName: template.name,
    templateVersion: template.version,
    templateHash: template.templateHash || annotateTemplateRuntime(template).templateHash,
    baseScore: Number(saved.baseScore || template.baseScore || 1),
    maxFan: Number(saved.maxFan || template.maxFan || 4),
    hardCap: Number(saved.hardCap || template.hardCap || 16),
    windRainRules: clone(saved.windRainRules || fallback.windRainRules),
    huRules: clone(saved.huRules || fallback.huRules)
  };
}

function attachWorkbenchConfigToTemplate(template, draft) {
  const next = clone(template);
  next.workbenchConfig = {
    baseScore: draft.baseScore,
    maxFan: draft.maxFan,
    hardCap: draft.hardCap,
    windRainRules: clone(draft.windRainRules),
    huRules: clone(draft.huRules)
  };
  return next;
}

function findRule(list, id) {
  return (list || []).find((item) => item.id === id) || null;
}

function formatRuleValue(rule) {
  if (!rule) return '';
  if (rule.kind === 'windRain' || rule.scoreSemantics === 'point') {
    return `${rule.value}分`;
  }
  if (rule.scoreSemantics === 'add_base') {
    return '加底';
  }
  if (rule.scoreSemantics === 'mul_base') {
    return `${rule.value}倍`;
  }
  return `${rule.value}番`;
}

function buildConfigSummary(draft) {
  return `打好大${draft.baseScore} / 最多${draft.maxFan}番 / 封顶${draft.hardCap}`;
}

function decorateDraftForView(draft) {
  if (!draft) return null;
  const next = clone(draft);
  next.windRainRules = (next.windRainRules || []).map((item) => ({ ...item, displayValue: formatRuleValue(item) }));
  next.huRules = (next.huRules || []).map((item) => ({ ...item, displayValue: formatRuleValue(item) }));
  return next;
}

function createPanelState() {
  return {
    windRainCounts: {
      WR_ANGANG: 0,
      WR_BAGANG: 0
    },
    selectedHuRuleIds: [],
    familyCount: 1,
    includeBase: true
  };
}

function createWorkbenchState() {
  return {
    savedTotal: 0,
    income: createPanelState(),
    players: [
      { id: 'player1', name: '玩家1', ...createPanelState() },
      { id: 'player2', name: '玩家2', ...createPanelState() },
      { id: 'player3', name: '玩家3', ...createPanelState() }
    ]
  };
}

function calculateHuSubtotal(draft, panel) {
  let fanSum = 0;
  let addBaseSum = 0;
  let mulBaseProduct = 1;
  const appliedRules = [];

  (panel.selectedHuRuleIds || []).forEach((ruleId) => {
    const rule = findRule(draft.huRules, ruleId);
    if (!rule) return;
    appliedRules.push({ ...rule, valueLabel: formatRuleValue(rule) });
    if (rule.scoreSemantics === 'fan') {
      fanSum += Number(rule.value || 0);
    } else if (rule.scoreSemantics === 'add_base') {
      addBaseSum += Number(rule.value || 0);
    } else if (rule.scoreSemantics === 'mul_base') {
      mulBaseProduct *= Number(rule.value || 1);
    }
  });

  const effectiveFan = Math.min(fanSum, Number(draft.maxFan || 0));
  const base = (panel.includeBase ? Number(draft.baseScore || 0) : 0) + addBaseSum;
  const raw = base * Math.pow(2, effectiveFan || 0) * mulBaseProduct;
  const subtotal = draft.hardCap > 0 ? Math.min(raw, Number(draft.hardCap)) : raw;

  return {
    subtotal,
    effectiveFan,
    base,
    appliedRules,
    multiplierLabel: panel.familyCount > 1 ? `${panel.familyCount}家` : '1家'
  };
}

function calculateWindRainSubtotal(draft, panel) {
  let subtotal = 0;
  const entries = [];
  Object.keys(panel.windRainCounts || {}).forEach((ruleId) => {
    const count = Number(panel.windRainCounts[ruleId] || 0);
    if (!count) return;
    const rule = findRule(draft.windRainRules, ruleId);
    if (!rule) return;
    const score = Number(rule.value || 0) * count;
    subtotal += score;
    entries.push({
      id: rule.id,
      name: rule.name,
      count,
      score,
      valueLabel: formatRuleValue(rule)
    });
  });
  return { subtotal, entries };
}

function calculatePanelTotal(draft, panel, type) {
  const windRain = calculateWindRainSubtotal(draft, panel);
  const hu = calculateHuSubtotal(draft, panel);
  const huTotal = hu.subtotal * Number(panel.familyCount || 1);
  return {
    type,
    windRain,
    hu,
    subtotal: windRain.subtotal + huTotal,
    huTotal
  };
}

function calculateWorkbenchViewModel(draft, state) {
  const income = calculatePanelTotal(draft, state.income, 'income');
  const players = (state.players || []).map((item) => ({
    ...item,
    panel: calculatePanelTotal(draft, item, 'expense')
  }));
  const outcomeTotal = players.reduce((sum, item) => sum + item.panel.subtotal, 0);
  const roundScore = income.subtotal - outcomeTotal;
  const totalScore = Number(state.savedTotal || 0) + roundScore;

  return {
    income,
    players,
    outcomeTotal,
    roundScore,
    totalScore,
    currentRoundScore: roundScore,
    totalHitRules: income.hu.appliedRules.length + players.reduce((sum, item) => sum + item.panel.hu.appliedRules.length, 0)
  };
}

function summarizeWorkbenchRecord(record) {
  if (!record) return '暂无最近记录';
  return `${record.templateName} · 本局${record.roundScore}分 / 本场${record.totalScore}分`;
}

function pickerOptionsForField(type) {
  if (type === 'baseScore') return BASE_SCORE_OPTIONS.map((value) => ({ value, label: `${value}分` }));
  if (type === 'maxFan') return MAX_FAN_OPTIONS.map((value) => ({ value, label: `${value}番` }));
  if (type === 'hardCap') return HARD_CAP_OPTIONS.map((value) => ({ value, label: `${value}` }));
  return [];
}

function pickerOptionsForRule(rule) {
  if (!rule) return [];
  if (rule.kind === 'windRain') return clone(WIND_RAIN_OPTIONS);
  return clone(HU_RULE_OPTIONS);
}

module.exports = {
  BASE_SCORE_OPTIONS,
  MAX_FAN_OPTIONS,
  HARD_CAP_OPTIONS,
  buildWorkbenchDraft,
  attachWorkbenchConfigToTemplate,
  buildConfigSummary,
  decorateDraftForView,
  createWorkbenchState,
  calculateWorkbenchViewModel,
  summarizeWorkbenchRecord,
  pickerOptionsForField,
  pickerOptionsForRule,
  formatRuleValue,
  clone
};
