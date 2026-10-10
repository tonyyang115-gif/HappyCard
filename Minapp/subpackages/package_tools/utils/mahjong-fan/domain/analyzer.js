const {
  canWinWithMelds,
  canWinSevenPairs,
  canWinThirteenOrphans,
  buildExposedTileCountMap
} = require('../../mahjong');
const {
  countTiles,
  getSuitKinds,
  isDuiDuiHuFromConcealed
} = require('./analyzer-helpers');

function analyzeHand(request) {
  const concealedFinalTiles = request.concealedTiles.concat(request.winTile);
  const exposedMelds = request.exposedMelds || [];
  const exposedTiles = exposedMelds.flatMap((item) => item.tiles);
  const allTiles = concealedFinalTiles.concat(exposedTiles);

  const huValid = canWinWithMelds(concealedFinalTiles, 0, exposedMelds);

  const counts = countTiles(allTiles);
  const exposedTileCountMap = buildExposedTileCountMap(exposedMelds);
  const suitKinds = getSuitKinds(allTiles);
  const hasHonor = Array.from(new Set(allTiles.map((tile) => Math.floor(tile / 10)))).includes(4);
  const noChiMeld = exposedMelds.every((item) => item.type !== 'chi');
  const meldCount = exposedMelds.length;

  const qidui = meldCount === 0 && canWinSevenPairs(concealedFinalTiles, 0);
  const shisanyao = meldCount === 0 && canWinThirteenOrphans(concealedFinalTiles, 0);
  const longQidui = qidui && Object.keys(counts).some((tile) => counts[tile] === 4);
  const duiduihu = huValid && noChiMeld && isDuiDuiHuFromConcealed(concealedFinalTiles);
  const qingyise = suitKinds.size === 1 && !hasHonor;
  const jingoudiao = huValid && meldCount === 4;

  let genCount = 0;
  for (const tile of Object.keys(counts)) {
    if (counts[tile] === 4) {
      genCount += 1;
    }
  }

  return {
    huValid,
    concealedFinalTiles,
    allTiles,
    counts,
    exposedTileCountMap,
    meldCount,
    hasHonor,
    suitKinds,
    qidui,
    longQidui,
    duiduihu,
    qingyise,
    jingoudiao,
    shisanyao,
    genCount,
    noChiMeld,
    context: request.context || {},
    winMode: request.winMode
  };
}

module.exports = {
  analyzeHand
};
