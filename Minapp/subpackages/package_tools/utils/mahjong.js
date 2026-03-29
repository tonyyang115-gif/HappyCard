const ALL_TILES = [
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 23, 24, 25, 26, 27, 28, 29,
  31, 32, 33, 34, 35, 36, 37, 38, 39,
  41, 42, 43, 44, 45, 46, 47
];

const THIRTEEN_ORPHANS_SET = new Set([11, 19, 21, 29, 31, 39, 41, 42, 43, 44, 45, 46, 47]);

const TILE_TO_INDEX = {};
ALL_TILES.forEach((tile, idx) => {
  TILE_TO_INDEX[tile] = idx;
});

function getCounts(tiles) {
  const counts = new Array(34).fill(0);
  for (const tile of tiles) {
    const idx = TILE_TO_INDEX[tile];
    if (idx === undefined) {
      continue;
    }
    counts[idx] += 1;
  }
  return counts;
}

function indexToTile(index) {
  return ALL_TILES[index];
}

function getTileCount(tiles, tile) {
  let count = 0;
  for (const t of tiles) {
    if (t === tile) {
      count += 1;
    }
  }
  return count;
}

function isSuitTile(tile) {
  const base = Math.floor(tile / 10);
  return base === 1 || base === 2 || base === 3;
}

function canSequenceStart(tile) {
  if (!isSuitTile(tile)) {
    return false;
  }
  const rank = tile % 10;
  return rank >= 1 && rank <= 7;
}

function hasOnlyValidTiles(tiles) {
  return Array.isArray(tiles) && tiles.every((tile) => ALL_TILES.includes(tile));
}

function validateBasicInput(normalTiles, laiziCount) {
  if (!Number.isInteger(laiziCount) || laiziCount < 0) {
    return false;
  }
  if (!hasOnlyValidTiles(normalTiles)) {
    return false;
  }
  const counts = getCounts(normalTiles);
  return counts.every((count) => count <= 4);
}

function validatePhysicalTileLimit(normalTiles, laiziCount, laiziTile, exposedTileCountMap = {}) {
  if (!validateBasicInput(normalTiles, laiziCount)) {
    return false;
  }

  if (laiziTile === null || laiziTile === undefined) {
    return true;
  }

  if (!ALL_TILES.includes(laiziTile)) {
    return false;
  }

  // Contract: normalTiles should exclude laizi实体牌.
  if (getTileCount(normalTiles, laiziTile) > 0) {
    return false;
  }

  for (const tile of ALL_TILES) {
    const normalCount = getTileCount(normalTiles, tile);
    const exposedCount = exposedTileCountMap[tile] || 0;
    const laiziPhysicalCount = tile === laiziTile ? laiziCount : 0;
    if (normalCount + exposedCount + laiziPhysicalCount > 4) {
      return false;
    }
  }

  return true;
}

function canWin(normalTiles14, laiziCount) {
  if (!validateBasicInput(normalTiles14, laiziCount)) {
    return false;
  }
  if (normalTiles14.length + laiziCount !== 14) {
    return false;
  }

  return canWinStandard(normalTiles14, laiziCount)
    || canWinSevenPairs(normalTiles14, laiziCount)
    || canWinThirteenOrphans(normalTiles14, laiziCount);
}

function canWinStandard(normalTiles14, laiziCount) {
  const counts = getCounts(normalTiles14);
  const memo = new Map();

  // 1) 将头来自两张实体牌
  for (let i = 0; i < 34; i += 1) {
    if (counts[i] >= 2) {
      counts[i] -= 2;
      if (canFormMelds(counts, laiziCount, memo)) {
        counts[i] += 2;
        return true;
      }
      counts[i] += 2;
    }
  }

  // 2) 将头来自一张实体 + 一张赖子
  if (laiziCount >= 1) {
    for (let i = 0; i < 34; i += 1) {
      if (counts[i] >= 1) {
        counts[i] -= 1;
        if (canFormMelds(counts, laiziCount - 1, memo)) {
          counts[i] += 1;
          return true;
        }
        counts[i] += 1;
      }
    }
  }

  // 3) 将头来自两张赖子
  if (laiziCount >= 2 && canFormMelds(counts, laiziCount - 2, memo)) {
    return true;
  }

  return false;
}

function canFormMelds(counts, laiziCount, memo) {
  const key = `${counts.join(',')}|${laiziCount}`;
  if (memo.has(key)) {
    return memo.get(key);
  }

  let first = -1;
  for (let i = 0; i < 34; i += 1) {
    if (counts[i] > 0) {
      first = i;
      break;
    }
  }

  if (first === -1) {
    const ok = laiziCount % 3 === 0;
    memo.set(key, ok);
    return ok;
  }

  const tile = indexToTile(first);
  const original = counts[first];

  // 方案A：组成刻子（不足用赖子补）
  {
    const need = Math.max(0, 3 - original);
    if (need <= laiziCount) {
      counts[first] -= Math.min(3, original);
      if (canFormMelds(counts, laiziCount - need, memo)) {
        counts[first] = original;
        memo.set(key, true);
        return true;
      }
      counts[first] = original;
    }
  }

  // 方案B：组成顺子（仅数牌）
  if (canSequenceStart(tile)) {
    const i1 = first;
    const i2 = TILE_TO_INDEX[tile + 1];
    const i3 = TILE_TO_INDEX[tile + 2];

    if (i2 !== undefined && i3 !== undefined) {
      const c1 = counts[i1];
      const c2 = counts[i2];
      const c3 = counts[i3];
      const need = (c1 > 0 ? 0 : 1) + (c2 > 0 ? 0 : 1) + (c3 > 0 ? 0 : 1);

      if (need <= laiziCount) {
        if (counts[i1] > 0) counts[i1] -= 1;
        if (counts[i2] > 0) counts[i2] -= 1;
        if (counts[i3] > 0) counts[i3] -= 1;

        if (canFormMelds(counts, laiziCount - need, memo)) {
          counts[i1] = c1;
          counts[i2] = c2;
          counts[i3] = c3;
          memo.set(key, true);
          return true;
        }

        counts[i1] = c1;
        counts[i2] = c2;
        counts[i3] = c3;
      }
    }
  }

  memo.set(key, false);
  return false;
}

function canWinSevenPairs(normalTiles14, laiziCount) {
  if (normalTiles14.length + laiziCount !== 14) {
    return false;
  }

  const counts = getCounts(normalTiles14);

  let pairTypes = 0;
  let singleTypes = 0;

  for (let i = 0; i < 34; i += 1) {
    const c = counts[i];

    // 严格 7 种不同牌：普通牌不允许 4 张算 2 对，也不允许 3 张
    if (c >= 3) {
      return false;
    }

    if (c === 2) {
      pairTypes += 1;
    } else if (c === 1) {
      singleTypes += 1;
    }
  }

  if (laiziCount < singleTypes) {
    return false;
  }

  const leftLaizi = laiziCount - singleTypes;
  if (leftLaizi % 2 !== 0) {
    return false;
  }

  const totalPairs = pairTypes + singleTypes + (leftLaizi / 2);
  return totalPairs === 7;
}

function canWinThirteenOrphans(normalTiles14, laiziCount) {
  if (normalTiles14.length + laiziCount !== 14) {
    return false;
  }

  const counts = getCounts(normalTiles14);

  for (let i = 0; i < 34; i += 1) {
    const tile = indexToTile(i);
    if (!THIRTEEN_ORPHANS_SET.has(tile) && counts[i] > 0) {
      return false;
    }
  }

  let missingKinds = 0;
  let countEq2Kinds = 0;
  let hasSingleKind = false;

  for (const tile of THIRTEEN_ORPHANS_SET) {
    const c = counts[TILE_TO_INDEX[tile]];

    if (c === 0) {
      missingKinds += 1;
    } else if (c === 1) {
      hasSingleKind = true;
    } else if (c === 2) {
      countEq2Kinds += 1;
    } else {
      return false;
    }
  }

  if (countEq2Kinds > 1) {
    return false;
  }

  if (laiziCount < missingKinds) {
    return false;
  }

  const leftLaizi = laiziCount - missingKinds;

  // 必须且仅有一个将
  if (countEq2Kinds === 1) {
    return true;
  }

  if (leftLaizi >= 2) {
    return true;
  }

  if (leftLaizi >= 1 && hasSingleKind) {
    return true;
  }

  return false;
}

function isValidChiTiles(tiles) {
  if (!Array.isArray(tiles) || tiles.length !== 3) {
    return false;
  }
  const sorted = tiles.slice().sort((a, b) => a - b);
  if (!isSuitTile(sorted[0])) {
    return false;
  }
  const suit = Math.floor(sorted[0] / 10);
  return Math.floor(sorted[1] / 10) === suit
    && Math.floor(sorted[2] / 10) === suit
    && sorted[1] === sorted[0] + 1
    && sorted[2] === sorted[1] + 1
    && (sorted[0] % 10) >= 1
    && (sorted[2] % 10) <= 9;
}

function isValidSameTiles(tiles, expectedLength) {
  if (!Array.isArray(tiles) || tiles.length !== expectedLength) {
    return false;
  }
  if (!ALL_TILES.includes(tiles[0])) {
    return false;
  }
  for (let i = 1; i < tiles.length; i += 1) {
    if (tiles[i] !== tiles[0]) {
      return false;
    }
  }
  return true;
}

function isValidExposedMeld(meld) {
  if (!meld || !Array.isArray(meld.tiles)) {
    return false;
  }
  if (meld.type === 'chi') {
    return isValidChiTiles(meld.tiles);
  }
  if (meld.type === 'peng') {
    return isValidSameTiles(meld.tiles, 3);
  }
  if (meld.type === 'gang') {
    return isValidSameTiles(meld.tiles, 4);
  }
  return false;
}

function buildExposedTileCountMap(exposedMelds) {
  const countMap = {};
  for (const meld of exposedMelds) {
    for (const tile of meld.tiles) {
      countMap[tile] = (countMap[tile] || 0) + 1;
    }
  }
  return countMap;
}

function canFormExactMelds(counts, laiziCount, targetMelds, memo) {
  const key = `${counts.join(',')}|${laiziCount}|${targetMelds}`;
  if (memo.has(key)) {
    return memo.get(key);
  }

  if (targetMelds === 0) {
    for (let i = 0; i < 34; i += 1) {
      if (counts[i] !== 0) {
        memo.set(key, false);
        return false;
      }
    }
    const ok = laiziCount === 0;
    memo.set(key, ok);
    return ok;
  }

  let first = -1;
  for (let i = 0; i < 34; i += 1) {
    if (counts[i] > 0) {
      first = i;
      break;
    }
  }

  if (first === -1) {
    const ok = laiziCount === targetMelds * 3;
    memo.set(key, ok);
    return ok;
  }

  const tile = indexToTile(first);
  const original = counts[first];

  // 方案A：刻子
  {
    const need = Math.max(0, 3 - original);
    if (need <= laiziCount) {
      counts[first] -= Math.min(3, original);
      if (canFormExactMelds(counts, laiziCount - need, targetMelds - 1, memo)) {
        counts[first] = original;
        memo.set(key, true);
        return true;
      }
      counts[first] = original;
    }
  }

  // 方案B：顺子
  if (canSequenceStart(tile)) {
    const i1 = first;
    const i2 = TILE_TO_INDEX[tile + 1];
    const i3 = TILE_TO_INDEX[tile + 2];
    if (i2 !== undefined && i3 !== undefined) {
      const c1 = counts[i1];
      const c2 = counts[i2];
      const c3 = counts[i3];
      const need = (c1 > 0 ? 0 : 1) + (c2 > 0 ? 0 : 1) + (c3 > 0 ? 0 : 1);

      if (need <= laiziCount) {
        if (counts[i1] > 0) counts[i1] -= 1;
        if (counts[i2] > 0) counts[i2] -= 1;
        if (counts[i3] > 0) counts[i3] -= 1;
        if (canFormExactMelds(counts, laiziCount - need, targetMelds - 1, memo)) {
          counts[i1] = c1;
          counts[i2] = c2;
          counts[i3] = c3;
          memo.set(key, true);
          return true;
        }
        counts[i1] = c1;
        counts[i2] = c2;
        counts[i3] = c3;
      }
    }
  }

  memo.set(key, false);
  return false;
}

function canWinStandardWithFixedMelds(concealedNormalTiles, laiziCount, fixedMeldCount) {
  const targetConcealedTileCount = 14 - fixedMeldCount * 3;
  if (fixedMeldCount < 0 || fixedMeldCount > 4) {
    return false;
  }
  if (concealedNormalTiles.length + laiziCount !== targetConcealedTileCount) {
    return false;
  }

  const concealedNeedMeldCount = 4 - fixedMeldCount;
  const counts = getCounts(concealedNormalTiles);
  const memo = new Map();

  for (let i = 0; i < 34; i += 1) {
    if (counts[i] >= 2) {
      counts[i] -= 2;
      if (canFormExactMelds(counts, laiziCount, concealedNeedMeldCount, memo)) {
        counts[i] += 2;
        return true;
      }
      counts[i] += 2;
    }
  }

  if (laiziCount >= 1) {
    for (let i = 0; i < 34; i += 1) {
      if (counts[i] >= 1) {
        counts[i] -= 1;
        if (canFormExactMelds(counts, laiziCount - 1, concealedNeedMeldCount, memo)) {
          counts[i] += 1;
          return true;
        }
        counts[i] += 1;
      }
    }
  }

  if (laiziCount >= 2 && canFormExactMelds(counts, laiziCount - 2, concealedNeedMeldCount, memo)) {
    return true;
  }

  return false;
}

function canWinWithMelds(concealedNormalTilesAfterDraw, concealedLaiziCountAfterDraw, exposedMelds) {
  const melds = Array.isArray(exposedMelds) ? exposedMelds : [];
  for (const meld of melds) {
    if (!isValidExposedMeld(meld)) {
      return false;
    }
  }
  if (melds.length === 0) {
    return canWin(concealedNormalTilesAfterDraw, concealedLaiziCountAfterDraw);
  }

  const exposedTileCountMap = buildExposedTileCountMap(melds);
  if (!validateBasicInput(concealedNormalTilesAfterDraw, concealedLaiziCountAfterDraw)) {
    return false;
  }
  for (const tile of ALL_TILES) {
    const concealedCount = getTileCount(concealedNormalTilesAfterDraw, tile);
    const exposedCount = exposedTileCountMap[tile] || 0;
    if (concealedCount + exposedCount > 4) {
      return false;
    }
  }

  return canWinStandardWithFixedMelds(concealedNormalTilesAfterDraw, concealedLaiziCountAfterDraw, melds.length);
}

function getTingTiles(normalTiles, laiziCount, laiziTile) {
  if (!validatePhysicalTileLimit(normalTiles, laiziCount, laiziTile)) {
    return [];
  }
  const results = [];

  for (const tile of ALL_TILES) {
    const normalCount = getTileCount(normalTiles, tile);
    const physicalHave = normalCount + (laiziTile === tile ? laiziCount : 0);

    if (physicalHave >= 4) {
      continue;
    }

    let candidateNormal = normalTiles;
    let candidateLaizi = laiziCount;

    if (laiziTile !== null && tile === laiziTile) {
      candidateLaizi += 1;
    } else {
      candidateNormal = normalTiles.concat(tile);
    }

    if (canWin(candidateNormal, candidateLaizi)) {
      results.push({
        tile,
        remaining: 4 - physicalHave
      });
    }
  }

  results.sort((a, b) => {
    if (b.remaining !== a.remaining) {
      return b.remaining - a.remaining;
    }
    return a.tile - b.tile;
  });

  return results;
}

function getTingTilesWithMelds(concealedNormalTiles, concealedLaiziCount, laiziTile, exposedMelds) {
  const melds = Array.isArray(exposedMelds) ? exposedMelds : [];
  for (const meld of melds) {
    if (!isValidExposedMeld(meld)) {
      return [];
    }
  }

  const results = [];
  const exposedTileCountMap = buildExposedTileCountMap(melds);
  if (!validatePhysicalTileLimit(concealedNormalTiles, concealedLaiziCount, laiziTile, exposedTileCountMap)) {
    return [];
  }

  for (const tile of ALL_TILES) {
    const concealedCount = getTileCount(concealedNormalTiles, tile);
    const exposedCount = exposedTileCountMap[tile] || 0;
    const physicalHave = concealedCount + exposedCount + (laiziTile === tile ? concealedLaiziCount : 0);

    if (physicalHave >= 4) {
      continue;
    }

    let candidateNormal = concealedNormalTiles;
    let candidateLaizi = concealedLaiziCount;

    if (laiziTile !== null && tile === laiziTile) {
      candidateLaizi += 1;
    } else {
      candidateNormal = concealedNormalTiles.concat(tile);
    }

    if (canWinWithMelds(candidateNormal, candidateLaizi, melds)) {
      results.push({
        tile,
        remaining: 4 - physicalHave
      });
    }
  }

  results.sort((a, b) => {
    if (b.remaining !== a.remaining) {
      return b.remaining - a.remaining;
    }
    return a.tile - b.tile;
  });

  return results;
}

module.exports = {
  ALL_TILES,
  buildExposedTileCountMap,
  getTingTiles,
  getTingTilesWithMelds,
  canWin,
  canWinWithMelds,
  canWinStandard,
  canWinSevenPairs,
  canWinThirteenOrphans
};
