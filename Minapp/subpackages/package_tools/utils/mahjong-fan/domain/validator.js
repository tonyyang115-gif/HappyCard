const { isValidExposedMeldShape, countTiles } = require('./analyzer-helpers');
const { ALL_TILES, ERROR_CODES } = require('./constants');

function fail(errorCode, errorMessage) {
  return { ok: false, errorCode, errorMessage };
}

function validateRequest(request) {
  if (!request || typeof request !== 'object') {
    return fail(ERROR_CODES.INVALID_TILE_COUNT, '请求体为空或格式错误');
  }

  const concealedTiles = Array.isArray(request.concealedTiles) ? request.concealedTiles : null;
  const exposedMelds = Array.isArray(request.exposedMelds) ? request.exposedMelds : null;
  const context = request.context || {};

  if (!concealedTiles || !exposedMelds) {
    return fail(ERROR_CODES.INVALID_TILE_COUNT, '手牌或副露字段缺失');
  }

  if (!ALL_TILES.includes(request.winTile)) {
    return fail(ERROR_CODES.INVALID_TILE_CODE, `无效和牌牌码: ${request.winTile}`);
  }

  if (request.winMode !== 'zimo' && request.winMode !== 'dianpao') {
    return fail(ERROR_CODES.INVALID_WIN_CONTEXT, '和牌方式仅支持 zimo / dianpao');
  }

  for (const tile of concealedTiles) {
    if (!ALL_TILES.includes(tile)) {
      return fail(ERROR_CODES.INVALID_TILE_CODE, `暗手牌含无效牌码: ${tile}`);
    }
  }

  if (concealedTiles.length < 1 || concealedTiles.length > 14) {
    return fail(ERROR_CODES.INVALID_TILE_COUNT, '暗手牌数量范围应为 1~14');
  }

  if (exposedMelds.length > 4) {
    return fail(ERROR_CODES.INVALID_EXPOSED_MELD, '副露最多4组');
  }

  for (const meld of exposedMelds) {
    if (!isValidExposedMeldShape(meld)) {
      return fail(ERROR_CODES.INVALID_EXPOSED_MELD, '副露结构不合法');
    }
  }

  const finalConcealed = concealedTiles.concat(request.winTile);
  const expectedFinalTileCount = 14 + exposedMelds.filter((item) => item.type === 'gang').length;
  const exposedPhysicalCount = exposedMelds.reduce((sum, meld) => sum + meld.tiles.length, 0);
  const totalPhysicalCount = finalConcealed.length + exposedPhysicalCount;
  if (totalPhysicalCount !== expectedFinalTileCount) {
    return fail(ERROR_CODES.INVALID_TILE_COUNT, `总牌数不合法，应为 ${expectedFinalTileCount}，实际 ${totalPhysicalCount}`);
  }

  const allTiles = finalConcealed.concat(...exposedMelds.map((item) => item.tiles));
  const countMap = countTiles(allTiles);
  for (const tile of Object.keys(countMap)) {
    if (countMap[tile] > 4) {
      return fail(ERROR_CODES.EXCEED_PHYSICAL_LIMIT, `牌码 ${tile} 超过4张物理上限`);
    }
  }

  const contextKeys = ['menqing', 'gangShangHua', 'gangShangPao', 'qiangGangHu', 'haiDi', 'tianHu', 'diHu'];
  for (const key of contextKeys) {
    const value = context[key];
    if (value !== undefined && typeof value !== 'boolean') {
      return fail(ERROR_CODES.INVALID_WIN_CONTEXT, `上下文字段 ${key} 必须为布尔值`);
    }
  }

  if (context.gangShangHua && request.winMode !== 'zimo') {
    return fail(ERROR_CODES.INVALID_WIN_CONTEXT, '杠上花仅支持自摸');
  }
  if ((context.gangShangPao || context.qiangGangHu) && request.winMode !== 'dianpao') {
    return fail(ERROR_CODES.INVALID_WIN_CONTEXT, '杠上炮/抢杠胡仅支持点炮');
  }
  if (context.tianHu && context.diHu) {
    return fail(ERROR_CODES.INVALID_WIN_CONTEXT, '天胡与地胡不可同时成立');
  }

  return { ok: true };
}

module.exports = {
  validateRequest
};
