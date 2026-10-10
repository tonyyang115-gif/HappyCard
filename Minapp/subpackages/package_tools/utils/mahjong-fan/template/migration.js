const { SYSTEM_TEMPLATE_SCHEMA_VERSION } = require('./system-templates');

function migrateTemplate(template) {
  if (!template || typeof template !== 'object') {
    return {
      ok: false,
      warning: '模板为空，无法迁移'
    };
  }

  const working = JSON.parse(JSON.stringify(template));
  const version = Number.isInteger(working.schemaVersion) ? working.schemaVersion : 0;

  if (version === SYSTEM_TEMPLATE_SCHEMA_VERSION) {
    return {
      ok: true,
      template: working,
      warning: ''
    };
  }

  // v0 -> v1: 补全缺省字段
  if (version === 0 && SYSTEM_TEMPLATE_SCHEMA_VERSION === 1) {
    working.schemaVersion = 1;
    working.rules = (working.rules || []).map((rule) => ({
      enabled: rule.enabled !== false,
      requires: Array.isArray(rule.requires) ? rule.requires : [],
      excludes: Array.isArray(rule.excludes) ? rule.excludes : [],
      conflictGroup: rule.conflictGroup || '',
      priority: Number.isFinite(rule.priority) ? rule.priority : 100,
      uiOrder: Number.isFinite(rule.uiOrder) ? rule.uiOrder : 100,
      desc: rule.desc || '',
      ...rule
    }));
    working.conflictGroups = Array.isArray(working.conflictGroups) ? working.conflictGroups : [];
    return {
      ok: true,
      template: working,
      warning: '模板已从 schema v0 自动迁移到 v1'
    };
  }

  return {
    ok: false,
    warning: `不支持的模板 schemaVersion: ${version}`
  };
}

module.exports = {
  migrateTemplate,
  SYSTEM_TEMPLATE_SCHEMA_VERSION
};
