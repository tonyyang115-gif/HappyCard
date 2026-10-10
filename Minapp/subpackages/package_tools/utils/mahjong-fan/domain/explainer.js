function buildSummary(result, templateConfig) {
  if (!result.ok) {
    return `计算失败：${result.errorMessage || '未知错误'}`;
  }
  if (result.appliedRules.length === 0) {
    return `未命中番型，总分 ${result.totalScore}`;
  }
  return `命中 ${result.appliedRules.length} 条规则，${result.totalFan} 番，合计 ${result.totalScore} 分`;
}

function buildExplainLines(result, calcMeta, templateConfig) {
  if (!result.ok) {
    return [result.errorMessage || '计算失败'];
  }

  const lines = [];
  lines.push(`模板：${templateConfig.name} (${templateConfig.version})`);
  lines.push(`底分=${templateConfig.baseScore}，加底=${calcMeta.addBaseSum}，乘底=${calcMeta.mulBaseProduct}`);
  lines.push(`番数汇总=${calcMeta.fanSum}，封顶后番数=${calcMeta.effectiveFan}`);
  lines.push(`封顶前得分=${calcMeta.scoreBeforeCap}，封顶后得分=${calcMeta.totalScore}`);

  for (const rule of result.appliedRules) {
    const countSuffix = rule.hitCount > 1 ? ` x${rule.hitCount}` : '';
    lines.push(`命中：${rule.ruleName}${countSuffix}（${rule.scoreSemantics}:${rule.value}）`);
  }

  if (result.removedByConflict.length > 0) {
    lines.push(`淘汰规则：${result.removedByConflict.map((item) => item.ruleName).join('、')}`);
  }

  return lines;
}

module.exports = {
  buildSummary,
  buildExplainLines
};
