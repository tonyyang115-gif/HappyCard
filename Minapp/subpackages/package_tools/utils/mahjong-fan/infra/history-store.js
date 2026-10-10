const STORAGE_KEY = 'tool_mahjong_fan_history_v1';
const LIMIT = 50;

function safeGetHistory() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(raw) ? raw : [];
  } catch (error) {
    return [];
  }
}

function saveHistory(items) {
  try {
    wx.setStorageSync(STORAGE_KEY, items);
  } catch (error) {
    // ignore
  }
}

function appendHistory(record) {
  const history = safeGetHistory();
  const next = [record].concat(history).slice(0, LIMIT);
  saveHistory(next);
  return next;
}

function clearHistory() {
  saveHistory([]);
}

module.exports = {
  STORAGE_KEY,
  LIMIT,
  safeGetHistory,
  appendHistory,
  clearHistory
};
