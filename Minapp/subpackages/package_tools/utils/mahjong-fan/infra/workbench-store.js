const STORAGE_KEYS = {
  session: 'tool_mahjong_fan_workbench_session_v1',
  history: 'tool_mahjong_fan_workbench_history_v1'
};

function safeGet(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value === undefined || value === null || value === '' ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

function clone(input) {
  return JSON.parse(JSON.stringify(input));
}

function getWorkbenchSession() {
  return safeGet(STORAGE_KEYS.session, null);
}

function saveWorkbenchSession(session) {
  return safeSet(STORAGE_KEYS.session, clone(session));
}

function clearWorkbenchSession() {
  return safeSet(STORAGE_KEYS.session, '');
}

function getWorkbenchHistory() {
  const list = safeGet(STORAGE_KEYS.history, []);
  return Array.isArray(list) ? list : [];
}

function appendWorkbenchHistory(record) {
  const history = getWorkbenchHistory();
  history.unshift(clone(record));
  const next = history.slice(0, 20);
  safeSet(STORAGE_KEYS.history, next);
  return next;
}

function clearWorkbenchHistory() {
  return safeSet(STORAGE_KEYS.history, []);
}

module.exports = {
  STORAGE_KEYS,
  getWorkbenchSession,
  saveWorkbenchSession,
  clearWorkbenchSession,
  getWorkbenchHistory,
  appendWorkbenchHistory,
  clearWorkbenchHistory
};
