const { rollDice, buildRollRecord } = require('../../utils/dice-engine');

const HISTORY_STORAGE_KEY = 'tool_dice_history_v1';
const MAX_HISTORY = 20;
const ROLL_DURATION = 940;
const SETTLE_DURATION = 320;

const FACE_PIP_CLASSES = {
  1: ['dot-center'],
  2: ['dot-top-left', 'dot-bottom-right'],
  3: ['dot-top-left', 'dot-center', 'dot-bottom-right'],
  4: ['dot-top-left', 'dot-top-right', 'dot-bottom-left', 'dot-bottom-right'],
  5: ['dot-top-left', 'dot-top-right', 'dot-center', 'dot-bottom-left', 'dot-bottom-right'],
  6: ['dot-top-left', 'dot-top-right', 'dot-middle-left', 'dot-middle-right', 'dot-bottom-left', 'dot-bottom-right']
};

const SIDE_RING_BY_TOP = {
  1: [2, 4, 5, 3],
  2: [6, 4, 1, 3],
  3: [2, 1, 5, 6],
  4: [2, 6, 5, 1],
  5: [1, 4, 6, 3],
  6: [5, 4, 2, 3]
};

function formatTime(ts) {
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function normalizeHistory(rawList) {
  if (!Array.isArray(rawList)) {
    return [];
  }

  return rawList
    .filter((item) => item && Array.isArray(item.values) && (item.diceCount === 1 || item.diceCount === 2))
    .slice(0, MAX_HISTORY)
    .map((item) => {
      const values = item.values.map((value) => Number(value));
      const diceCount = Number(item.diceCount);
      const isValidValues =
        values.length === diceCount &&
        values.every((value) => Number.isInteger(value) && value >= 1 && value <= 6);
      if (!isValidValues) {
        return null;
      }

      const sum = Number(item.sum);
      const normalizedSum = Number.isFinite(sum) ? sum : values.reduce((acc, value) => acc + value, 0);
      return {
        id: String(item.id || `${item.ts || Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        ts: Number(item.ts) || Date.now(),
        diceCount,
        values,
        sum: normalizedSum,
        source: item.source || 'local'
      };
    })
    .filter(Boolean);
}

function toHistoryView(record) {
  return {
    ...record,
    timeText: formatTime(record.ts),
    diceText: record.values.join(' + ')
  };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildFaceValues(topValue) {
  const top = Number(topValue) || 1;
  const bottom = 7 - top;
  const ring = SIDE_RING_BY_TOP[top] || SIDE_RING_BY_TOP[1];
  return {
    top,
    bottom,
    front: ring[0],
    right: ring[1],
    back: ring[2],
    left: ring[3]
  };
}

function settleTransformOf(index) {
  const rotateY = index === 0 ? 10 : -10;
  const rotateX = -32;
  const rotateZ = index === 0 ? -3 : 3;
  return `rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`;
}

function buildCubeView(options) {
  const {
    topValue,
    index,
    rolling = false,
    settling = false
  } = options;
  const faceValues = buildFaceValues(topValue);
  const rollClass = index % 2 === 0 ? 'roll-a' : 'roll-b';
  const rollDuration = `${500 + index * 80 + randomInt(0, 60)}ms`;
  const rollDelay = `${index * 45}ms`;

  return {
    id: `cube-${index}`,
    rolling,
    settling,
    rollClass,
    styleText: `--roll-duration:${rollDuration};--roll-delay:${rollDelay};`,
    transform: settleTransformOf(index),
    faces: [
      { key: 'top', pips: FACE_PIP_CLASSES[faceValues.top] || [] },
      { key: 'bottom', pips: FACE_PIP_CLASSES[faceValues.bottom] || [] },
      { key: 'front', pips: FACE_PIP_CLASSES[faceValues.front] || [] },
      { key: 'back', pips: FACE_PIP_CLASSES[faceValues.back] || [] },
      { key: 'left', pips: FACE_PIP_CLASSES[faceValues.left] || [] },
      { key: 'right', pips: FACE_PIP_CLASSES[faceValues.right] || [] }
    ]
  };
}

function buildRollingViews(count) {
  const views = [];
  for (let i = 0; i < count; i += 1) {
    views.push(buildCubeView({
      topValue: randomInt(1, 6),
      index: i,
      rolling: true
    }));
  }
  return views;
}

function buildSettlingViews(values) {
  return values.map((value, index) => buildCubeView({
    topValue: value,
    index,
    settling: true
  }));
}

function buildIdleViews(count) {
  const seed = count === 1 ? [1] : [2, 5];
  return seed.slice(0, count).map((value, index) => buildCubeView({
    topValue: value,
    index
  }));
}

Page({
  data: {
    diceCount: 1,
    rolling: false,
    rollPhase: 'idle',
    currentValues: [],
    currentSum: 0,
    cubeViews: [],
    history: []
  },

  onLoad() {
    this.historyRecords = [];
    this.rollStopTimer = null;
    this.settleTimer = null;

    this.loadHistory();
    this.setData({ cubeViews: buildIdleViews(this.data.diceCount) });
  },

  onUnload() {
    this.clearRollTimers();
  },

  handleBack() {
    wx.navigateBack();
  },

  onDecreaseDiceCount() {
    if (this.data.rolling || this.data.diceCount <= 1) return;
    const count = this.data.diceCount - 1;
    this.setData({
      diceCount: count,
      currentValues: [],
      currentSum: 0,
      rollPhase: 'idle',
      cubeViews: buildIdleViews(count)
    });
  },

  onIncreaseDiceCount() {
    if (this.data.rolling || this.data.diceCount >= 2) return;
    const count = this.data.diceCount + 1;
    this.setData({
      diceCount: count,
      currentValues: [],
      currentSum: 0,
      rollPhase: 'idle',
      cubeViews: buildIdleViews(count)
    });
  },

  onRoll() {
    if (this.data.rolling) return;

    const diceCount = this.data.diceCount;
    let finalValues;
    let record;

    try {
      finalValues = rollDice(diceCount);
      record = buildRollRecord(finalValues, diceCount);
    } catch (error) {
      console.error('Prepare roll result failed:', error);
      wx.showToast({ title: '掷骰失败，请重试', icon: 'none' });
      return;
    }

    this.clearRollTimers();

    this.setData({
      rolling: true,
      rollPhase: 'rolling',
      currentValues: [],
      currentSum: 0,
      cubeViews: buildRollingViews(diceCount)
    });

    this.rollStopTimer = setTimeout(() => {
      this.startSettling(finalValues, record);
    }, ROLL_DURATION);
  },

  startSettling(finalValues, record) {
    this.setData({
      rollPhase: 'settling',
      cubeViews: buildSettlingViews(finalValues)
    });

    this.settleTimer = setTimeout(() => {
      const nextHistory = [record, ...this.historyRecords].slice(0, MAX_HISTORY);
      this.historyRecords = nextHistory;
      this.setData({
        rollPhase: 'idle',
        rolling: false,
        currentValues: finalValues,
        currentSum: record.sum,
        cubeViews: buildSettlingViews(finalValues),
        history: nextHistory.map(toHistoryView)
      });
      this.saveHistory(nextHistory);
    }, SETTLE_DURATION);
  },

  clearRollTimers() {
    if (this.rollStopTimer) {
      clearTimeout(this.rollStopTimer);
      this.rollStopTimer = null;
    }
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  },

  onClearHistory() {
    if (this.data.rolling) return;
    if (!this.data.history.length) return;
    wx.removeStorageSync(HISTORY_STORAGE_KEY);
    this.historyRecords = [];
    this.setData({ history: [] });
    wx.showToast({ title: '已清空历史', icon: 'none' });
  },

  loadHistory() {
    try {
      const raw = wx.getStorageSync(HISTORY_STORAGE_KEY);
      const normalized = normalizeHistory(raw);
      this.historyRecords = normalized;
      this.setData({ history: normalized.map(toHistoryView) });
      if (normalized.length !== raw?.length) {
        this.saveHistory(normalized);
      }
    } catch (error) {
      console.error('Load dice history failed:', error);
      this.historyRecords = [];
      this.setData({ history: [] });
    }
  },

  saveHistory(list) {
    try {
      wx.setStorageSync(HISTORY_STORAGE_KEY, list.slice(0, MAX_HISTORY));
    } catch (error) {
      console.error('Save dice history failed:', error);
    }
  }
});
