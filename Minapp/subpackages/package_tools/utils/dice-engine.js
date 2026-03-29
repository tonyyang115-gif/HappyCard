function validateDiceCount(count) {
  if (count !== 1 && count !== 2) {
    throw new Error('仅支持1颗或2颗骰子');
  }
}

function rollDice(count) {
  validateDiceCount(count);
  const values = [];
  for (let i = 0; i < count; i += 1) {
    values.push(Math.floor(Math.random() * 6) + 1);
  }
  return values;
}

function buildRollRecord(values, count) {
  validateDiceCount(count);
  if (!Array.isArray(values) || values.length !== count) {
    throw new Error('骰子结果与数量不匹配');
  }

  const normalizedValues = values.map((value) => Number(value));
  const valid = normalizedValues.every((value) => Number.isInteger(value) && value >= 1 && value <= 6);

  if (!valid) {
    throw new Error('骰子结果必须在1到6之间');
  }

  const ts = Date.now();
  const sum = normalizedValues.reduce((total, value) => total + value, 0);

  return {
    id: `${ts}-${Math.random().toString(36).slice(2, 8)}`,
    ts,
    diceCount: count,
    values: normalizedValues,
    sum,
    source: 'local'
  };
}

module.exports = {
  rollDice,
  buildRollRecord
};
