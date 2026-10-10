const { getSystemTemplates } = require('./system-templates');
const { migrateTemplate } = require('./migration');
const { buildTemplateHash } = require('./hash');

const STORAGE_KEYS = {
  customTemplates: 'tool_mahjong_fan_custom_templates_v1',
  defaultTemplateId: 'tool_mahjong_fan_default_template_id_v1'
};

function safeGetStorage(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === undefined || value === null || value === '' ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function safeSetStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

function clone(input) {
  return JSON.parse(JSON.stringify(input));
}

function annotateTemplateRuntime(template) {
  const next = clone(template);
  next.templateHash = buildTemplateHash(next);
  return next;
}

function getMigratedCustomTemplates() {
  const rawTemplates = safeGetStorage(STORAGE_KEYS.customTemplates, []);
  if (!Array.isArray(rawTemplates)) {
    return [];
  }

  const migrated = [];
  let changed = false;

  for (const item of rawTemplates) {
    const result = migrateTemplate(item);
    if (!result.ok) {
      changed = true;
      continue;
    }
    migrated.push({ ...result.template, isSystem: false });
    if (result.warning) {
      changed = true;
    }
  }

  if (changed) {
    safeSetStorage(STORAGE_KEYS.customTemplates, migrated);
  }

  return migrated;
}

function getAllTemplates() {
  const systemTemplates = getSystemTemplates().map((item) => ({ ...item, isSystem: true }));
  const customTemplates = getMigratedCustomTemplates().map((item) => ({ ...item, isSystem: false }));
  return systemTemplates.concat(customTemplates).map(annotateTemplateRuntime);
}

function getTemplateById(templateId) {
  const all = getAllTemplates();
  return all.find((item) => item.id === templateId) || null;
}

function getDefaultTemplateId() {
  const defaultId = safeGetStorage(STORAGE_KEYS.defaultTemplateId, '');
  if (defaultId && getTemplateById(defaultId)) {
    return defaultId;
  }
  return 'sc_bloodwar_v1';
}

function setDefaultTemplateId(templateId) {
  if (!getTemplateById(templateId)) {
    return false;
  }
  return safeSetStorage(STORAGE_KEYS.defaultTemplateId, templateId);
}

function saveCustomTemplate(template) {
  if (!template || typeof template !== 'object' || !template.id) {
    return {
      ok: false,
      message: '模板参数不合法'
    };
  }

  if (template.isSystem) {
    return {
      ok: false,
      message: '系统模板不可保存为自定义覆盖'
    };
  }

  const list = getMigratedCustomTemplates();
  const next = clone(template);
  next.isSystem = false;

  const index = list.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    list[index] = next;
  } else {
    if (list.length >= 5) {
      return {
        ok: false,
        message: '自定义模板最多5个'
      };
    }
    list.push(next);
  }

  safeSetStorage(STORAGE_KEYS.customTemplates, list);
  return {
    ok: true,
    template: annotateTemplateRuntime(next)
  };
}

function deleteCustomTemplate(templateId) {
  const list = getMigratedCustomTemplates();
  const target = list.find((item) => item.id === templateId);
  if (!target) {
    return {
      ok: false,
      message: '模板不存在'
    };
  }

  const next = list.filter((item) => item.id !== templateId);
  safeSetStorage(STORAGE_KEYS.customTemplates, next);

  const defaultId = getDefaultTemplateId();
  if (defaultId === templateId) {
    setDefaultTemplateId('sc_bloodwar_v1');
  }

  return { ok: true };
}

module.exports = {
  STORAGE_KEYS,
  getAllTemplates,
  getTemplateById,
  getDefaultTemplateId,
  setDefaultTemplateId,
  saveCustomTemplate,
  deleteCustomTemplate,
  annotateTemplateRuntime
};
