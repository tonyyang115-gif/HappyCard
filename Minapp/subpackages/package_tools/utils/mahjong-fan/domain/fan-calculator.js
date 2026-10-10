function calculateFanAndScore(rules, templateConfig) {
  let fanSum = 0;
  let addBaseSum = 0;
  let mulBaseProduct = 1;

  for (const rule of rules) {
    const hitCount = rule.hitCount || 1;
    if (rule.scoreSemantics === 'fan') {
      fanSum += (rule.value || 0) * hitCount;
    } else if (rule.scoreSemantics === 'add_base') {
      addBaseSum += (rule.value || 0) * hitCount;
    } else if (rule.scoreSemantics === 'mul_base') {
      const mulValue = Math.max(1, rule.value || 1);
      for (let i = 0; i < hitCount; i += 1) {
        mulBaseProduct *= mulValue;
      }
    }
  }

  const maxFan = Number.isFinite(templateConfig.maxFan) ? templateConfig.maxFan : fanSum;
  const effectiveFan = Math.min(fanSum, maxFan);
  const baseAfterAdd = (templateConfig.baseScore || 0) + addBaseSum;
  const scoreBeforeCap = baseAfterAdd * (2 ** effectiveFan) * mulBaseProduct;

  const hardCap = templateConfig.hardCap;
  const totalScore = Number.isFinite(hardCap) && hardCap > 0
    ? Math.min(scoreBeforeCap, hardCap)
    : scoreBeforeCap;

  return {
    fanSum,
    effectiveFan,
    addBaseSum,
    mulBaseProduct,
    baseAfterAdd,
    scoreBeforeCap,
    totalScore
  };
}

module.exports = {
  calculateFanAndScore
};
