/**
 * 通用工具函数库
 */

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {Number} wait - 等待时间(ms)
 * @param {Boolean} immediate - 是否立即执行
 */
function debounce(func, wait, immediate) {
    wait = wait || 300;
    immediate = immediate || false;
    var timeout;
    
    return function() {
        var context = this;
        var args = arguments;
        
        var later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        
        var callNow = immediate && !timeout;
        
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        
        if (callNow) func.apply(context, args);
    };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {Number} limit - 时间限制(ms)
 */
function throttle(func, limit) {
    limit = limit || 200;
    var inThrottle;
    
    return function() {
        var context = this;
        var args = arguments;
        
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(function() { 
                inThrottle = false; 
            }, limit);
        }
    };
}

/**
 * setData批量合并工具
 * 用法:在Page/Component中混入此工具
 */
function BatchSetData(pageContext) {
    this.context = pageContext;
    this.queue = {};
    this.timer = null;
    this.delay = 50;
    this.callbacks = [];
}

BatchSetData.prototype.set = function(data, callback) {
    Object.assign(this.queue, data);
    
    if (callback) {
        this.callbacks.push(callback);
    }
    
    if (this.timer) {
        clearTimeout(this.timer);
    }
    
    var self = this;
    this.timer = setTimeout(function() {
        self.flush();
    }, this.delay);
};

BatchSetData.prototype.setImmediate = function(data, callback) {
    Object.assign(this.queue, data);
    if (callback) {
        this.callbacks.push(callback);
    }
    this.flush();
};

BatchSetData.prototype.flush = function() {
    if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
    }
    
    if (Object.keys(this.queue).length === 0) {
        return;
    }
    
    var data = this.queue;
    var callbacks = this.callbacks || [];
    
    this.queue = {};
    this.callbacks = [];
    
    this.context.setData(data, function() {
        callbacks.forEach(function(cb) {
            cb();
        });
    });
};

BatchSetData.prototype.destroy = function() {
    if (this.timer) {
        clearTimeout(this.timer);
    }
    this.flush();
};

/**
 * 格式化时间
 * @param {Date} date - 日期对象
 * @param {String} format - 格式化字符串
 */
function formatTime(date, format) {
    format = format || 'YYYY-MM-DD HH:mm:ss';
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var hour = date.getHours();
    var minute = date.getMinutes();
    var second = date.getSeconds();

    return format
        .replace('YYYY', year)
        .replace('MM', padZero(month))
        .replace('DD', padZero(day))
        .replace('HH', padZero(hour))
        .replace('mm', padZero(minute))
        .replace('ss', padZero(second));
}

/**
 * 补零
 */
function padZero(num) {
    return num < 10 ? '0' + num : num;
}

module.exports = {
    debounce: debounce,
    throttle: throttle,
    BatchSetData: BatchSetData,
    formatTime: formatTime
};

