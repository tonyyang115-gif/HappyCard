const assert = require('assert');
const {
  getTingTiles,
  getTingTilesWithMelds,
  canWinSevenPairs,
  canWinWithMelds
} = require('../subpackages/package_tools/utils/mahjong');

function findResult(results, tile) {
  return results.find((item) => item.tile === tile);
}

function run() {
  // 1) 七对子：普通4张不允许当2对
  const sevenPairsInvalidQuad = [11, 11, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16];
  assert.strictEqual(canWinSevenPairs(sevenPairsInvalidQuad, 0), false, '七对子应拒绝普通4张当2对');

  // 2) 七对子：6对+1单+1赖子可胡
  const sevenPairsWithLaizi = [11, 11, 12, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17];
  assert.strictEqual(canWinSevenPairs(sevenPairsWithLaizi, 1), true, '七对子应允许赖子补单牌');

  // 3) 副露场景仅标准型：不能走十三幺路径
  const concealedThirteenLike = [11, 19, 21, 29, 31, 39, 41, 42, 43, 44];
  const melds = [{ type: 'chi', tiles: [11, 12, 13] }];
  assert.strictEqual(
    canWinWithMelds(concealedThirteenLike, 1, melds),
    false,
    '存在副露时不应按十三幺判胡'
  );

  // 4) remaining 对赖子实体扣减：赖子牌型本身 remaining 正确
  const normalTiles = [11, 11, 12, 12, 13, 13, 14, 14, 15, 15];
  const laiziCount = 3;
  const laiziTile = 19;
  const tingWithLaizi = getTingTiles(normalTiles, laiziCount, laiziTile);
  const laiziEntry = findResult(tingWithLaizi, laiziTile);
  assert.ok(laiziEntry, '听牌结果应包含摸到赖子牌型');
  assert.strictEqual(laiziEntry.remaining, 1, 'remaining 应扣减赖子实体张数');

  // 5) 新增硬校验：同牌实体总数超过4，直接返回空结果
  const invalidPhysical = getTingTiles([11, 11, 11, 11], 1, 11);
  assert.deepStrictEqual(invalidPhysical, [], '物理不可能手牌应被拒绝');

  // 6) 副露版同样做实体上限校验（含杠）
  const invalidMeldPhysical = getTingTilesWithMelds(
    [11],
    0,
    null,
    [{ type: 'gang', tiles: [11, 11, 11, 11] }]
  );
  assert.deepStrictEqual(invalidMeldPhysical, [], '副露场景同牌>4应被拒绝');

  console.log('mahjong-regression: PASS');
}

run();
