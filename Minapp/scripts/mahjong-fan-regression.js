const fs = require('fs');
const path = require('path');
const assert = require('assert');

global.wx = { getStorageSync: () => '', setStorageSync: () => {} };
const { calculateMahjongFan } = require('../subpackages/package_tools/utils/mahjong-fan');

const goldenPath = path.join(__dirname, 'mahjong-fan-golden_cases.json');
const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

const grouped = {};
for (const item of golden.cases) {
  grouped[item.templateId] = (grouped[item.templateId] || 0) + 1;
}
for (const key of Object.keys(grouped)) {
  assert.ok(grouped[key] >= 30, `${key} golden case count should be >=30`);
}

let checked = 0;
for (const item of golden.cases) {
  const result = calculateMahjongFan(item.request, { templateId: item.templateId, debug: false });

  assert.strictEqual(result.ok, item.expected.ok, `${item.id}: ok mismatch`);
  assert.strictEqual(result.totalFan, item.expected.totalFan, `${item.id}: totalFan mismatch`);
  assert.strictEqual(result.totalScore, item.expected.totalScore, `${item.id}: totalScore mismatch`);
  assert.deepStrictEqual(
    result.appliedRules.map((rule) => rule.ruleId),
    item.expected.appliedRules,
    `${item.id}: appliedRules mismatch`
  );
  assert.deepStrictEqual(
    result.removedByConflict.map((rule) => rule.ruleId),
    item.expected.removedByConflict,
    `${item.id}: removedByConflict mismatch`
  );
  assert.strictEqual(result.templateHash, item.expected.templateHash, `${item.id}: templateHash mismatch`);
  assert.strictEqual(result.errorCode || '', item.expected.errorCode || '', `${item.id}: errorCode mismatch`);
  checked += 1;
}

console.log(`mahjong-fan-regression: PASS (${checked} cases)`);
