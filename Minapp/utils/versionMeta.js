const versionConfig = require('../config/version.config');

function buildAppMeta(config = versionConfig) {
    const safeConfig = config || {};
    const appName = safeConfig.appName || '快乐打牌记';
    const prefixUpper = safeConfig.prefixUpper || 'V';
    const prefixLower = safeConfig.prefixLower || 'v';
    const version = String(safeConfig.version || '').trim();
    const displayUpper = version ? `${prefixUpper}${version}` : '';
    const displayLower = version ? `${prefixLower}${version}` : '';

    return {
        appName,
        version,
        prefixUpper,
        prefixLower,
        displayUpper,
        displayLower
    };
}

function getAppMeta() {
    return buildAppMeta();
}

module.exports = {
    buildAppMeta,
    getAppMeta
};
