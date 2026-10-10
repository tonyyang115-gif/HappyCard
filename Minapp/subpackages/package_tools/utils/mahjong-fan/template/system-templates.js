const SYSTEM_TEMPLATE_SCHEMA_VERSION = 1;

function rule(item) {
  return {
    enabled: true,
    requires: [],
    excludes: [],
    conflictGroup: '',
    priority: 100,
    uiOrder: 100,
    desc: '',
    ...item
  };
}

const BASE_RULES_BLOODWAR = [
  rule({ id: 'R_HU_VALID', name: '和牌成立', valueType: 'fan', value: 0, scoreSemantics: 'fan', detectorKey: 'hu_valid', phase: 'base_pattern', priority: 999, uiOrder: 1, desc: '基础和牌校验' }),
  rule({ id: 'R_PINGHU', name: '平胡', valueType: 'fan', value: 1, scoreSemantics: 'fan', detectorKey: 'pinghu', phase: 'base_pattern', priority: 100, uiOrder: 10, conflictGroup: 'CG_BASE_PATTERN' }),
  rule({ id: 'R_DUIDUIHU', name: '对对胡', valueType: 'fan', value: 2, scoreSemantics: 'fan', detectorKey: 'duiduihu', phase: 'base_pattern', priority: 220, uiOrder: 20, conflictGroup: 'CG_BASE_PATTERN' }),
  rule({ id: 'R_QIDUI', name: '七对', valueType: 'fan', value: 2, scoreSemantics: 'fan', detectorKey: 'qidui', phase: 'base_pattern', priority: 250, uiOrder: 30, conflictGroup: 'CG_BASE_PATTERN' }),
  rule({ id: 'R_LONGQIDUI', name: '龙七对', valueType: 'fan', value: 3, scoreSemantics: 'fan', detectorKey: 'longqidui', phase: 'base_pattern', priority: 260, uiOrder: 40, conflictGroup: 'CG_BASE_PATTERN', requires: ['R_QIDUI'] }),
  rule({ id: 'R_QINGYISE', name: '清一色', valueType: 'fan', value: 3, scoreSemantics: 'fan', detectorKey: 'qingyise', phase: 'base_pattern', priority: 180, uiOrder: 50 }),
  rule({ id: 'R_JINGOUDIAO', name: '金钩钓', valueType: 'fan', value: 2, scoreSemantics: 'fan', detectorKey: 'jingoudiao', phase: 'base_pattern', priority: 300, uiOrder: 60, conflictGroup: 'CG_BASE_PATTERN' }),

  rule({ id: 'R_ZIMO', name: '自摸', valueType: 'fan', value: 1, scoreSemantics: 'fan', detectorKey: 'zimo', phase: 'timing', priority: 100, uiOrder: 100 }),
  rule({ id: 'R_MENQING', name: '门清', valueType: 'fan', value: 1, scoreSemantics: 'fan', detectorKey: 'menqing', phase: 'timing', priority: 90, uiOrder: 110 }),
  rule({ id: 'R_GANG_SHANG_HUA', name: '杠上花', valueType: 'fan', value: 1, scoreSemantics: 'fan', detectorKey: 'gang_shang_hua', phase: 'timing', priority: 130, uiOrder: 120 }),
  rule({ id: 'R_GANG_SHANG_PAO', name: '杠上炮', valueType: 'fan', value: 1, scoreSemantics: 'fan', detectorKey: 'gang_shang_pao', phase: 'timing', priority: 130, uiOrder: 130 }),
  rule({ id: 'R_QIANG_GANG_HU', name: '抢杠胡', valueType: 'fan', value: 1, scoreSemantics: 'fan', detectorKey: 'qiang_gang_hu', phase: 'timing', priority: 140, uiOrder: 140 }),
  rule({ id: 'R_HAI_DI', name: '海底', valueType: 'fan', value: 1, scoreSemantics: 'fan', detectorKey: 'hai_di', phase: 'timing', priority: 80, uiOrder: 150 }),
  rule({ id: 'R_TIAN_HU', name: '天胡', valueType: 'mul_base', value: 2, scoreSemantics: 'mul_base', detectorKey: 'tian_hu', phase: 'timing', priority: 500, uiOrder: 160, excludes: ['R_DI_HU'] }),
  rule({ id: 'R_DI_HU', name: '地胡', valueType: 'mul_base', value: 2, scoreSemantics: 'mul_base', detectorKey: 'di_hu', phase: 'timing', priority: 490, uiOrder: 170, excludes: ['R_TIAN_HU'] }),

  rule({ id: 'R_GEN', name: '带根', valueType: 'fan', value: 1, scoreSemantics: 'fan', detectorKey: 'gen_count', phase: 'bonus', priority: 60, uiOrder: 200 })
];

const BASE_RULES_COMPETITION = BASE_RULES_BLOODWAR.map((item) => ({ ...item }));
for (const item of BASE_RULES_COMPETITION) {
  if (item.id === 'R_QINGYISE') item.value = 4;
  if (item.id === 'R_LONGQIDUI') item.value = 4;
  if (item.id === 'R_MENQING') item.value = 0;
}

const BLOODWAR_TEMPLATE = {
  id: 'sc_bloodwar_v1',
  name: '四川血战（实战）',
  version: '1.0.0',
  schemaVersion: SYSTEM_TEMPLATE_SCHEMA_VERSION,
  isSystem: true,
  baseScore: 1,
  maxFan: 5,
  hardCap: 128,
  rules: BASE_RULES_BLOODWAR,
  conflictGroups: [
    {
      id: 'CG_BASE_PATTERN',
      strategy: 'highest',
      members: ['R_PINGHU', 'R_DUIDUIHU', 'R_QIDUI', 'R_LONGQIDUI', 'R_JINGOUDIAO'],
      reason: '基础牌型只取最大主牌型'
    }
  ],
  uiMeta: {
    order: 1,
    group: 'system',
    labels: ['默认', '实战']
  }
};

const COMPETITION_TEMPLATE = {
  id: 'sc_competition_v1',
  name: '四川比赛（标准）',
  version: '1.0.0',
  schemaVersion: SYSTEM_TEMPLATE_SCHEMA_VERSION,
  isSystem: true,
  baseScore: 1,
  maxFan: 6,
  hardCap: 256,
  rules: BASE_RULES_COMPETITION,
  conflictGroups: [
    {
      id: 'CG_BASE_PATTERN',
      strategy: 'highest',
      members: ['R_PINGHU', 'R_DUIDUIHU', 'R_QIDUI', 'R_LONGQIDUI', 'R_JINGOUDIAO'],
      reason: '基础牌型择高计番'
    }
  ],
  uiMeta: {
    order: 2,
    group: 'system',
    labels: ['标准']
  }
};

const PLACEHOLDER_TEMPLATE = {
  id: 'placeholder_v1',
  name: '占位模板',
  version: '1.0.0',
  schemaVersion: SYSTEM_TEMPLATE_SCHEMA_VERSION,
  isSystem: true,
  baseScore: 1,
  maxFan: 1,
  hardCap: 2,
  rules: [
    rule({ id: 'R_HU_VALID', name: '和牌成立', valueType: 'fan', value: 0, scoreSemantics: 'fan', detectorKey: 'hu_valid', phase: 'base_pattern', priority: 999, uiOrder: 1, desc: '占位模板仅做和牌验证' })
  ],
  conflictGroups: [],
  uiMeta: {
    order: 3,
    group: 'system',
    labels: ['占位']
  }
};

function getSystemTemplates() {
  return [
    JSON.parse(JSON.stringify(BLOODWAR_TEMPLATE)),
    JSON.parse(JSON.stringify(COMPETITION_TEMPLATE)),
    JSON.parse(JSON.stringify(PLACEHOLDER_TEMPLATE))
  ];
}

module.exports = {
  SYSTEM_TEMPLATE_SCHEMA_VERSION,
  getSystemTemplates
};
