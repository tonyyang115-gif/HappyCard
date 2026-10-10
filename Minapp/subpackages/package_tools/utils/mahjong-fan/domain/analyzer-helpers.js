const { ALL_TILES } = require('./constants');

const TILE_TO_INDEX = {};
ALL_TILES.forEach((tile, idx) => {
  TILE_TO_INDEX[tile] = idx;
});

function isSuitTile(tile) {
  const suit = Math.floor(tile / 10);
  return suit >= 1 && suit <= 3;
}

function isValidChiTiles(tiles) {
  if (!Array.isArray(tiles) || tiles.length !== 3) return false;
  const sorted = tiles.slice().sort((a, b) => a - b);
  if (!isSuitTile(sorted[0])) return false;
  const suit = Math.floor(sorted[0] / 10);
  return Math.floor(sorted[1] / 10) === suit
    && Math.floor(sorted[2] / 10) === suit
    && sorted[1] === sorted[0] + 1
    && sorted[2] === sorted[1] + 1;
}

function isValidSameTiles(tiles, expectedLength) {
  if (!Array.isArray(tiles) || tiles.length !== expectedLength) return false;
  if (!ALL_TILES.includes(tiles[0])) return false;
  for (let i = 1; i < tiles.length; i += 1) {
    if (tiles[i] !== tiles[0]) return false;
  }
  return true;
}

function isValidExposedMeldShape(meld) {
  if (!meld || !Array.isArray(meld.tiles)) return false;
  if (meld.type === 'chi') return isValidChiTiles(meld.tiles);
  if (meld.type === 'peng') return isValidSameTiles(meld.tiles, 3);
  if (meld.type === 'gang') return isValidSameTiles(meld.tiles, 4);
  return false;
}

function countTiles(tiles) {
  const map = {};
  for (const tile of tiles) {
    map[tile] = (map[tile] || 0) + 1;
  }
  return map;
}

function getCounts34(tiles) {
  const counts = new Array(34).fill(0);
  for (const tile of tiles) {
    const idx = TILE_TO_INDEX[tile];
    if (idx !== undefined) {
      counts[idx] += 1;
    }
  }
  return counts;
}

function canFormTripletsOnly(counts, memo) {
  const key = counts.join(',');
  if (memo.has(key)) return memo.get(key);

  let first = -1;
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] > 0) {
      first = i;
      break;
    }
  }

  if (first === -1) {
    memo.set(key, true);
    return true;
  }

  if (counts[first] < 3) {
    memo.set(key, false);
    return false;
  }

  counts[first] -= 3;
  const ok = canFormTripletsOnly(counts, memo);
  counts[first] += 3;
  memo.set(key, ok);
  return ok;
}

function isDuiDuiHuFromConcealed(finalConcealedTiles) {
  const counts = getCounts34(finalConcealedTiles);
  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i] >= 2) {
      counts[i] -= 2;
      const ok = canFormTripletsOnly(counts, new Map());
      counts[i] += 2;
      if (ok) return true;
    }
  }
  return false;
}

function getSuitKinds(tiles) {
  const suits = new Set();
  for (const tile of tiles) {
    suits.add(Math.floor(tile / 10));
  }
  return suits;
}

module.exports = {
  TILE_TO_INDEX,
  isSuitTile,
  isValidExposedMeldShape,
  countTiles,
  getCounts34,
  isDuiDuiHuFromConcealed,
  getSuitKinds
};
