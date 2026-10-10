function compareRules(a, b, preferHigherValue) {
  if (preferHigherValue && a.value !== b.value) {
    return b.value - a.value;
  }
  if ((a.priority || 0) !== (b.priority || 0)) {
    return (b.priority || 0) - (a.priority || 0);
  }
  return String(a.ruleId).localeCompare(String(b.ruleId));
}

function resolveConflicts(rules, conflictGroups) {
  const removed = [];
  const decisionTrace = [];
  let kept = rules.slice();

  const groupMap = new Map();
  for (const group of conflictGroups || []) {
    groupMap.set(group.id, group);
  }

  for (const group of groupMap.values()) {
    const members = kept.filter((rule) => group.members.includes(rule.ruleId));
    if (members.length <= 1) {
      continue;
    }

    if (group.strategy === 'stackable') {
      decisionTrace.push({
        stage: 'conflict',
        groupId: group.id,
        strategy: group.strategy,
        winner: members.map((item) => item.ruleId),
        loser: [],
        reason: group.reason || 'stackable 保留全部规则'
      });
      continue;
    }

    const preferHigherValue = group.strategy === 'highest';
    const sorted = members.slice().sort((a, b) => compareRules(a, b, preferHigherValue));
    const winner = sorted[0];
    const losers = sorted.slice(1);

    kept = kept.filter((item) => item.ruleId === winner.ruleId || !group.members.includes(item.ruleId));

    for (const loser of losers) {
      removed.push({
        ruleId: loser.ruleId,
        ruleName: loser.ruleName,
        reason: `冲突组 ${group.id} 裁决淘汰，保留 ${winner.ruleId}`,
        removedBy: 'conflict'
      });
    }

    decisionTrace.push({
      stage: 'conflict',
      groupId: group.id,
      strategy: group.strategy,
      winner: winner.ruleId,
      loser: losers.map((item) => item.ruleId),
      reason: group.reason || ''
    });
  }

  return {
    kept,
    removed,
    decisionTrace
  };
}

module.exports = {
  resolveConflicts
};
