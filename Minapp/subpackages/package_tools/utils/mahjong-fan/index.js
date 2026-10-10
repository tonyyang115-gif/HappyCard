const { calculateMahjongFan } = require('./application/calculate');
const {
  getAllTemplates,
  getTemplateById,
  getDefaultTemplateId,
  setDefaultTemplateId,
  saveCustomTemplate,
  deleteCustomTemplate
} = require('./template/repository');
const { appendHistory, safeGetHistory, clearHistory } = require('./infra/history-store');

module.exports = {
  calculateMahjongFan,
  getAllTemplates,
  getTemplateById,
  getDefaultTemplateId,
  setDefaultTemplateId,
  saveCustomTemplate,
  deleteCustomTemplate,
  appendHistory,
  getFanHistory: safeGetHistory,
  clearFanHistory: clearHistory
};
