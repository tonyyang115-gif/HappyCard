const { PHASE_ORDER } = require('./constants');
const { runDetector } = require('./detectors');

function initialRuleState(rule, phase) {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    phase,
    enabled: rule.enabled !== false,
    status: 'pending',
    reason: '',
    value: rule.value,
    valueType: rule.valueType,
    scoreSemantics: rule.scoreSemantics,
    priority: rule.priority || 0,
    hitCount: 0,
    conflictGroup: rule.conflictGroup || '',
    requires: rule.requires || [],
    excludes: rule.excludes || []
  };
}

function executeRules(templateConfig, analysis) {
  const allRuleStates = [];
  const applied = [];

  for (const phase of PHASE_ORDER) {
    const phaseRules = templateConfig.rules
      .filter((rule) => rule.phase === phase)
      .sort((a, b) => (a.uiOrder || 0) - (b.uiOrder || 0));

    for (const rule of phaseRules) {
      const state = initialRuleState(rule, phase);
      allRuleStates.push(state);

      if (!state.enabled) {
        state.status = 'disabled';
        state.reason = '规则已禁用';
        continue;
      }

      const detectorResult = runDetector(rule.detectorKey, analysis);
      if (!detectorResult.hit) {
        state.status = 'missed';
        state.reason = detectorResult.reason || 'detector未命中';
        continue;
      }

      state.status = 'hit';
      state.reason = detectorResult.reason || 'detector命中';
      state.hitCount = detectorResult.count || 1;

      applied.push({
        ruleId: rule.id,
        ruleName: rule.name,
        phase,
        value: rule.value,
        valueType: rule.valueType,
        scoreSemantics: rule.scoreSemantics,
        priority: rule.priority || 0,
        conflictGroup: rule.conflictGroup || '',
        requires: rule.requires || [],
        excludes: rule.excludes || [],
        hitCount: detectorResult.count || 1,
        desc: rule.desc || '',
        detectorReason: detectorResult.reason || ''
      });
    }
  }

  return {
    allRuleStates,
    applied
  };
}

function applyDependencies(appliedRules, allRuleStates) {
  const hitRuleMap = new Map(appliedRules.map((item) => [item.ruleId, item]));
  const kept = [];
  const removed = [];

  for (const rule of appliedRules) {
    const missing = (rule.requires || []).filter((requireId) => !hitRuleMap.has(requireId));
    if (missing.length > 0) {
      removed.push({
        ruleId: rule.ruleId,
        ruleName: rule.ruleName,
        reason: `依赖未满足: ${missing.join(',')}`,
        removedBy: 'requires'
      });
      const state = allRuleStates.find((item) => item.ruleId === rule.ruleId);
      if (state) {
        state.status = 'removed';
        state.reason = `依赖未满足: ${missing.join(',')}`;
      }
      continue;
    }
    kept.push(rule);
  }

  const keptMap = new Map(kept.map((item) => [item.ruleId, item]));
  const keptAfterExcludes = [];
  for (const rule of kept) {
    const conflictIds = (rule.excludes || []).filter((excludeId) => keptMap.has(excludeId));
    if (conflictIds.length > 0) {
      removed.push({
        ruleId: rule.ruleId,
        ruleName: rule.ruleName,
        reason: `排斥命中: ${conflictIds.join(',')}`,
        removedBy: 'excludes'
      });
      const state = allRuleStates.find((item) => item.ruleId === rule.ruleId);
      if (state) {
        state.status = 'removed';
        state.reason = `排斥命中: ${conflictIds.join(',')}`;
      }
      continue;
    }
    keptAfterExcludes.push(rule);
  }

  return {
    kept: keptAfterExcludes,
    removed
  };
}

module.exports = {
  executeRules,
  applyDependencies
};
