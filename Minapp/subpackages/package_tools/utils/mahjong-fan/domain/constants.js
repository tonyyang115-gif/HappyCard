const { ALL_TILES } = require('../../mahjong');

const TILE_LABEL_MAP = {
  11: '一万', 12: '二万', 13: '三万', 14: '四万', 15: '五万', 16: '六万', 17: '七万', 18: '八万', 19: '九万',
  21: '一条', 22: '二条', 23: '三条', 24: '四条', 25: '五条', 26: '六条', 27: '七条', 28: '八条', 29: '九条',
  31: '一筒', 32: '二筒', 33: '三筒', 34: '四筒', 35: '五筒', 36: '六筒', 37: '七筒', 38: '八筒', 39: '九筒',
  41: '东', 42: '南', 43: '西', 44: '北', 45: '中', 46: '发', 47: '白'
};

const ERROR_CODES = {
  INVALID_TILE_CODE: 'INVALID_TILE_CODE',
  INVALID_TILE_COUNT: 'INVALID_TILE_COUNT',
  EXCEED_PHYSICAL_LIMIT: 'EXCEED_PHYSICAL_LIMIT',
  INVALID_EXPOSED_MELD: 'INVALID_EXPOSED_MELD',
  INVALID_WIN_CONTEXT: 'INVALID_WIN_CONTEXT',
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  TEMPLATE_INVALID_SCHEMA: 'TEMPLATE_INVALID_SCHEMA',
  RULE_DEPENDENCY_ERROR: 'RULE_DEPENDENCY_ERROR',
  INTERNAL_CALC_ERROR: 'INTERNAL_CALC_ERROR'
};

const PHASE_ORDER = ['base_pattern', 'timing', 'bonus'];

module.exports = {
  ALL_TILES,
  TILE_LABEL_MAP,
  ERROR_CODES,
  PHASE_ORDER
};
