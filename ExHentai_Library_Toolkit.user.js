// ==UserScript==
// @name        ExHentai Library Toolkit
// @namespace   https://github.com/Alog6437/ExHentai-Library-Toolkit
// @version     1.3.7
// @description  ExHentai/E-Hentai 一体化工具：LANraragi 查重、纯浏览器图片 ZIP 下载与元数据打包、翻译高亮、无修正标记及统一悬浮面板。
// @description:en  ExHentai/E-Hentai toolkit with LANraragi duplicate checking, browser-only image ZIP downloads with metadata, translation highlighting, uncensored labels and a draggable compact panel.
// @author      Alog6437
// @homepageURL https://github.com/Alog6437/ExHentai-Library-Toolkit
// @supportURL  https://github.com/Alog6437/ExHentai-Library-Toolkit/issues
// @include      https://e-hentai.org/*
// @include      https://g.e-hentai.org/*
// @include      https://exhentai.org/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM_info
// @connect      *
// @run-at       document-start
// @license MIT
// ==/UserScript==

(function () {
  'use strict';

  /* ================================================================
   *  配置管理
   * ================================================================ */

  var DEFAULT_CONFIG = {
    // --- 界面语言 ---
    uiLanguage: 'zh', // zh=中文，en=English

    // --- 纯浏览器图片下载 ---
    galleryDlTitleMode: 'japanese', // default=默认标题（英文/中文/罗马音），japanese=原文/日文标题
    galleryDlOriginal: true, // true=原画，false=页面显示的压缩/缩放图
    galleryDlWriteMetadata: true,
    galleryDlParallel: 5, // 任意正整数；实际工作线程不超过图库页数

    // --- Lanraragi 查重 ---
    enableLrrChecker: false,
    lrrServerUrl: '',
    lrrApiKey: '',
    lrrConcurrency: 8,
    enableAltSearch: true,
    altSearchConcurrency: 2,
    requestTimeoutMs: 45000,
    searchTimeoutMs: 40000,
    enableLogging: false,
    lrrDebugMode: false, // 调试时开启，可查看URL匹配过程

    // --- 浏览体验增强 ---
    enableChineseHighlight: true, // 中文翻译高亮
    enableUncensoredLabel: true, // 根据 uncensored 标签显示无修正标记

    // --- UI 面板 ---
  };

  function gmGet(key, fallback) {
    if (typeof GM_getValue !== 'undefined') return GM_getValue(key, fallback);
    if (typeof GM !== 'undefined' && GM.getValue) return GM.getValue(key, fallback);
    return fallback;
  }

  function gmSet(key, value) {
    if (typeof GM_setValue !== 'undefined') {
      return Promise.resolve(GM_setValue(key, value));
    }
    if (typeof GM !== 'undefined' && GM.setValue) return Promise.resolve(GM.setValue(key, value));
    return Promise.resolve();
  }

  var LRR_CACHE_EXPIRE = 10 * 60 * 1000;
    var LRR_NEGATIVE_CACHE_EXPIRE = 5 * 60 * 1000;

    var CONFIG = {};

  function t(zh, en) {
    return CONFIG.uiLanguage === 'en' ? en : zh;
  }

  function normalizeLanguageOptions(root) {
    if (!root) return;
    var select = root.querySelector && root.querySelector('#cfg-uiLanguage');
    if (!select) return;
    select.setAttribute('translate', 'no');
    select.setAttribute('class', (select.getAttribute('class') || '') + ' notranslate');
    var zh = select.querySelector('option[value="zh"]');
    var en = select.querySelector('option[value="en"]');
    if (zh) { zh.textContent = '中文'; zh.setAttribute('translate', 'no'); zh.setAttribute('lang', 'zh-CN'); }
    if (en) { en.textContent = 'English'; en.setAttribute('translate', 'no'); en.setAttribute('lang', 'en'); en.classList.add('notranslate'); }
  }

  function localizeHtml(html) {
    if (CONFIG.uiLanguage === 'en') {
      var pairs = [
        ['长按拖动', 'Click to expand/collapse'],
        ['界面语言 / Language', 'Interface Language'],
        ['语言 / Language', 'Language'],
        ['Lanraragi 查重', 'LANraragi Duplicate Check'],
        ['启用查重', 'Enable duplicate checking'],
        ['启用备用标题搜索', 'Enable alternate-title search'],
        ['LRR 连接', 'LRR Connection'], ['LRR 性能与搜索', 'LRR Performance & Search'],
        ['LRR 服务器', 'LRR Server'], ['可选', 'Optional'],
        ['API Key：未配置', 'API key: Not configured'], ['清除已保存 API Key', 'Clear saved API key'],
        ['留空保留已保存 Key；勾选清除优先。保存时立即清空输入。输入期间宿主页脚本仍可读取，不是安全隔离。', 'Leave blank to retain the saved key; clearing takes precedence. Saving immediately empties this field. Host-page scripts can still read a key while you type; this is not secure isolation.'],
        ['主查重并发', 'Primary concurrency'], ['备用搜索并发', 'Alt-search concurrency'],
        ['无修正标签', 'Uncensored label'], ['中文翻译高亮', 'English translation highlight'], ['高级', 'Advanced'],
        ['导出本次运行日志', 'Export current session logs'],
        ['仅本次页面运行 · 最多10000条/5MB，超限丢弃最旧记录 · 导出前请检查隐私', 'Current page session only · 10,000 entries / 5 MB maximum; oldest entries dropped · Review privacy before sharing'],
        ['LRR：等待检测', 'LRR: Waiting for check'], ['将自动检测服务器状态', 'Server status will be checked automatically'],
        ['重新扫描当前页', 'Rescan current page'], ['测试LRR连接', 'Test LRR connection'],
        ['立即同步', 'Sync now'], ['尚无完整本地索引', 'No complete local index'],
        ['重新扫描档案文件夹', 'Rescan archive folder'],
        ['清空全部LRR缓存', 'Clear all LRR cache'], ['保存并刷新', 'Save & Reload'], ['恢复默认', 'Restore Defaults'],
        ['悬浮按钮开关面板 · 长按标题拖动', 'Auto-collapse after 3s · Hold title to drag'],
        ['长按拖动', 'Hold to drag'], ['图片 ZIP 下载', 'Image ZIP Download'], ['保存方式', 'Save Method'],
        ['无需 gallery-dl、Python、Bridge 或本地服务。脚本直接读取图片页、按所选画质下载图片并生成 ZIP；最终文件保存到浏览器当前下载目录。', 'No gallery-dl, Python, Bridge or local service required. The script reads image pages, downloads the selected image quality and creates a ZIP directly in the browser.'],
        ['压缩包名称', 'ZIP Name'], ['默认标题（英文/中文/罗马音）', 'Default title (English/Chinese/Romaji)'],
        ['原文/日文标题（如果有）', 'Original/Japanese title (if available)'], ['ZIP 预览：', 'ZIP Preview: '],
        ['下载内容', 'Download Contents'], ['下载原画（取消后下载压缩/缩放图）', 'Download original images (uncheck for compressed/resized images)'],
        ['图片按 001.ext、002.ext… 顺序命名', 'Name images sequentially as 001.ext, 002.ext…'],
        ['打包 metadata.json + LRR兼容 info.json', 'Include metadata.json + LRR-compatible info.json'],
        ['图片命名', 'Image Naming'], ['原文件是 JPEG 时就是 001.jpg；PNG/WebP 等会保留真实扩展名，避免转码导致不再是原画。', 'JPEG stays 001.jpg; PNG/WebP and other formats keep their real extensions so images are not transcoded.'],
        ['下载性能', 'Download Performance'], ['并行任务', 'Parallel Tasks'],
        ['当前速度（近5秒）', 'Current (last 5s)'], ['网络接收（含重试）', 'Received (incl. retries)'],
        ['平均速度', 'Average Speed'], ['已写入 ZIP', 'Written to ZIP'], ['图片进度', 'Image Progress'],
        ['下载当前图库', 'Download Gallery'], ['保存下载设置', 'Save Download Settings'],
        ['关闭面板', 'Close panel'], ['工具导航', 'Toolkit navigation'],
        ['下载</button>', 'Download</button>'], ['查重</button>', 'Check</button>'], ['设置</button>', 'Settings</button>'],
        ['维护工具', 'Maintenance'], ['更改开关后，在设置中保存并刷新。', 'After changing the switch, save and reload in Settings.'],
        ['恢复入口默认位置', 'Reset launcher position'],
        ['偏好设置', 'Preferences'], ['界面与语言', 'Appearance & language'], ['外观', 'Theme'],
        ['跟随系统', 'System'], ['深色', 'Dark'], ['浅色', 'Light'], ['原画', 'Original images'],
        ['就绪</div>', 'Ready</div>'], ['选择画质后开始', 'Choose image quality, then start'], ['命名与元数据', 'Naming & metadata'],
        ['保留原始格式', 'Keep original formats'], ['暂停可继续 · 刷新无法恢复', 'Pause to resume · Reload loses this session']
      ];
      for (var i = 0; i < pairs.length; i++) html = html.split(pairs[i][0]).join(pairs[i][1]);
    }
    // Language names are endonyms and must never be translated.
    html = html.replace(/<option value="zh"[^>]*>[^<]*<\/option>/, '<option value="zh" lang="zh-CN" translate="no">中文</option>');
    html = html.replace(/<option value="en"[^>]*>[^<]*<\/option>/, '<option value="en" lang="en" translate="no" class="notranslate">English</option>');
    return html;
  }

  function normalizeConfig() {
    CONFIG.lrrServerUrl = String(CONFIG.lrrServerUrl || DEFAULT_CONFIG.lrrServerUrl).trim().replace(/\/+$/, '');
    CONFIG.lrrApiKey = String(CONFIG.lrrApiKey || '').trim();
    CONFIG.lrrConcurrency = Math.max(1, parseInt(CONFIG.lrrConcurrency, 10) || DEFAULT_CONFIG.lrrConcurrency);
    CONFIG.altSearchConcurrency = Math.max(1, parseInt(CONFIG.altSearchConcurrency, 10) || DEFAULT_CONFIG.altSearchConcurrency);
    CONFIG.requestTimeoutMs = Math.max(1000, parseInt(CONFIG.requestTimeoutMs, 10) || DEFAULT_CONFIG.requestTimeoutMs);
    CONFIG.searchTimeoutMs = Math.max(1000, parseInt(CONFIG.searchTimeoutMs, 10) || DEFAULT_CONFIG.searchTimeoutMs);
    CONFIG.uiLanguage = CONFIG.uiLanguage === 'en' ? 'en' : 'zh';
    CONFIG.galleryDlTitleMode = CONFIG.galleryDlTitleMode === 'japanese' ? 'japanese' : 'default';
    CONFIG.galleryDlOriginal = CONFIG.galleryDlOriginal !== false;
    var galleryDlParallel = parseInt(CONFIG.galleryDlParallel, 10);
    CONFIG.galleryDlParallel = Math.max(1, isFinite(galleryDlParallel) ? galleryDlParallel : DEFAULT_CONFIG.galleryDlParallel);
  }

  // 同时兼容 GM_getValue（同步）与 GM.getValue（Promise）。
  function loadConfig() {
    return Promise.all(Object.keys(DEFAULT_CONFIG).map(function (key) {
      return Promise.resolve(gmGet(key, DEFAULT_CONFIG[key])).then(function (value) {
        CONFIG[key] = value;
      });
    })).then(function () {
      normalizeConfig();
    });
  }

  if (typeof Promise === 'undefined') {
    console.warn('[EH Toolkit] Browser does not support promises, aborting.');
    return;
  }

  loadConfig().then(function () {
    initScript();
  }).catch(function (e) {
    console.error('[EH Toolkit] Failed to load userscript config, falling back to defaults.', e);
    CONFIG = Object.assign({}, DEFAULT_CONFIG);
    normalizeConfig();
    initScript();
  });

  function initScript() {
    if (typeof Promise === 'undefined') {
      console.warn('[EH Toolkit] Browser does not support promises, aborting.');
      return;
    }

    // Runtime diagnostics
    var RUNTIME_LOG_MAX_ENTRIES = 10000;
    var RUNTIME_LOG_MAX_BYTES = 5 * 1024 * 1024;
    var RUNTIME_LOG_MAX_ENTRY_CHARS = 16000;
    var runtimeSanitizationTruncated = false;
    var runtimeLogState = { startedAt: new Date().toISOString(), entries: [], bytes: 0,
      droppedEntries: 0, truncatedEntries: 0, totalEntries: 0 };

    function redactRuntimeString(value) {
      var text = String(value);
      var key = typeof CONFIG === 'object' ? String(CONFIG.lrrApiKey || '') : '';
      if (key) {
        [key, encodeURIComponent(key), encodeURI(key)].forEach(function (secret) {
          if (secret) text = text.split(secret).join('[REDACTED]');
        });
      }
      text = text.replace(/https?:\/\/[^\s<>"']+/gi, function (raw) {
        try {
          var url = new URL(raw);
          if (url.username || url.password) { url.username = 'REDACTED'; url.password = ''; }
          Array.from(url.searchParams.keys()).forEach(function (name) {
            if (/^(?:key|api[-_]?key|authorization|auth|cookie|password|passwd|secret|signature|access[-_]?key)$|token/i.test(name))
              url.searchParams.set(name, '[REDACTED]');
          });
          return url.href;
        } catch (_) { return raw.replace(/\/\/[^/@\s]+@/, '//REDACTED@'); }
      });
      return text.replace(/\b(?:authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]+/gi, '[REDACTED HEADER]')
        .replace(/\bBearer\s+[^\s,;"'}]+/gi, 'Bearer [REDACTED]')
        .replace(/\b(api[-_]?key|access[-_]?key|\w*token\w*|password|passwd|secret)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi, '$1=[REDACTED]');
    }

    function sanitizeRuntimeValue(value, depth, seen) {
      depth = depth || 0; seen = seen || new Set();
      if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value == null ? null : value;
      if (typeof value === 'string') {
        // Redact before truncation: a secret may straddle the truncation boundary.
        var text = redactRuntimeString(value);
        if (text.length > 4096) { runtimeSanitizationTruncated = true; return text.slice(0, 4096) + '…[truncated]'; }
        return text;
      }
      if (typeof value !== 'object') return redactRuntimeString(String(value)).slice(0, 4096);
      if (seen.has(value)) return '[Circular]';
      if (depth >= 5) { runtimeSanitizationTruncated = true; return '[Depth limit]'; }
      if ((typeof Blob !== 'undefined' && value instanceof Blob) ||
          (typeof ArrayBuffer !== 'undefined' && (value instanceof ArrayBuffer || ArrayBuffer.isView(value)))) return '[Binary omitted]';
      seen.add(value);
      var out;
      if (value instanceof Error || (typeof value.message === 'string' && typeof value.stack === 'string')) {
        out = { name: sanitizeRuntimeValue(value.name, depth + 1, seen),
          message: sanitizeRuntimeValue(value.message, depth + 1, seen), stack: sanitizeRuntimeValue(value.stack, depth + 1, seen) };
      } else if (Array.isArray(value)) {
        out = value.slice(0, 30).map(function (item) { return sanitizeRuntimeValue(item, depth + 1, seen); });
        if (value.length > 30) { runtimeSanitizationTruncated = true; out.push('[Additional items omitted: ' + (value.length - 30) + ']'); }
      } else {
        out = {};
        var keys = Object.keys(value);
        if (keys.length > 40) { runtimeSanitizationTruncated = true; out._omittedKeys = keys.length - 40; }
        keys.slice(0, 40).forEach(function (name) {
          var safeName = redactRuntimeString(name).slice(0, 200);
          if (/authorization|cookie|token|password|passwd|secret|api[-_]?key/i.test(name)) out[safeName] = '[REDACTED]';
          else if (/^(?:responseText|response|body|data|buffer|blob|content)$/i.test(name)) out[safeName] = '[Payload omitted]';
          else { try { out[safeName] = sanitizeRuntimeValue(value[name], depth + 1, seen); } catch (_) { out[safeName] = '[Unreadable]'; } }
        });
      }
      seen.delete(value); return out;
    }

    function recordRuntimeLog(level, event, details) {
      try {
        runtimeSanitizationTruncated = false;
        var safeLevel = redactRuntimeString(level), safeEvent = redactRuntimeString(event);
        if (safeLevel.length > 20 || safeEvent.length > 200) runtimeSanitizationTruncated = true;
        var entry = { time: new Date().toISOString(), level: safeLevel.slice(0, 20),
          event: safeEvent.slice(0, 200), details: sanitizeRuntimeValue(details) };
        var json = JSON.stringify(entry);
        if (json.length > RUNTIME_LOG_MAX_ENTRY_CHARS) {
          entry.details = { summary: redactRuntimeString(json).slice(0, 8000), truncated: true };
          runtimeSanitizationTruncated = true; json = JSON.stringify(entry);
        }
        if (runtimeSanitizationTruncated) runtimeLogState.truncatedEntries++;
        var bytes = new TextEncoder().encode(json).byteLength;
        runtimeLogState.totalEntries++;
        if (bytes > RUNTIME_LOG_MAX_BYTES) { runtimeLogState.droppedEntries++; return; }
        while (runtimeLogState.entries.length >= RUNTIME_LOG_MAX_ENTRIES || runtimeLogState.bytes + bytes > RUNTIME_LOG_MAX_BYTES) {
          var removed = runtimeLogState.entries.shift();
          runtimeLogState.bytes -= removed.bytes; runtimeLogState.droppedEntries++;
        }
        runtimeLogState.entries.push({ entry: entry, bytes: bytes }); runtimeLogState.bytes += bytes;
      } catch (_) { runtimeLogState.droppedEntries++; }
    }

    function runtimeConsole(level) {
      var args = Array.prototype.slice.call(arguments, 1);
      recordRuntimeLog(level, 'console.' + level, args);
      // Only explicit toolkit calls use this helper; the site's console is never patched.
      console[level].apply(console, args);
    }

    function buildRuntimeLogExport() {
      var config = {};
      ['enableLrrChecker', 'enableAltSearch', 'lrrServerUrl', 'lrrConcurrency', 'altSearchConcurrency',
        'requestTimeoutMs', 'searchTimeoutMs', 'uiLanguage', 'enableLogging', 'lrrDebugMode'].forEach(function (name) {
        config[name] = typeof CONFIG === 'object' ? CONFIG[name] : null;
      });
      config.hasAuthentication = !!(typeof CONFIG === 'object' && CONFIG.lrrApiKey);
      return { version: typeof GM_info !== 'undefined' && GM_info.script ? String(GM_info.script.version || '1.3.7') : '1.3.7',
        sessionStartedAt: runtimeLogState.startedAt, exportedAt: new Date().toISOString(),
        page: redactRuntimeString(typeof location !== 'undefined' ? location.href : ''),
        userAgent: sanitizeRuntimeValue(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
        config: sanitizeRuntimeValue(config), count: runtimeLogState.entries.length, totalEntries: runtimeLogState.totalEntries,
        droppedEntries: runtimeLogState.droppedEntries, truncatedEntries: runtimeLogState.truncatedEntries,
        retainedBytes: runtimeLogState.bytes, limits: { entries: RUNTIME_LOG_MAX_ENTRIES, bytes: RUNTIME_LOG_MAX_BYTES,
          entryCharacters: RUNTIME_LOG_MAX_ENTRY_CHARS },
        notice: 'This session only; bounded memory, not unlimited history. Oldest entries are dropped at the limits. Binary/API payloads are omitted. Gallery gid/token paths remain for reproduction; review before sharing.',
        entries: runtimeLogState.entries.map(function (item) {
          // Entries are already bounded/sanitized. Refresh string redaction without imposing
          // another depth limit or mutating the retained entry when configuration changed.
          return JSON.parse(JSON.stringify(item.entry, function (name, value) {
            return typeof value === 'string' ? redactRuntimeString(value) : value;
          }));
        }) };
    }

    function exportRuntimeLogs() {
      recordRuntimeLog('info', 'diagnostics.export', { retainedEntries: runtimeLogState.entries.length, droppedEntries: runtimeLogState.droppedEntries });
      var report = buildRuntimeLogExport();
      triggerZipDownload(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }),
        'eh-toolkit-runtime-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
      return report;
    }
    recordRuntimeLog('info', 'runtime.started', { page: typeof location !== 'undefined' ? location.href : '' });
    // End runtime diagnostics

    // GM_xmlhttpRequest 兼容封装
    function xhr(data) {
      return new Promise(function (resolve, reject) {
        var request = {
          method: data.method,
          url: data.url,
          onload: function () { resolve.apply(this, arguments); },
          onerror: function () { reject.apply(this, arguments); },
          ontimeout: function () { reject(new Error('Request timeout')); },
        };
        if (data.headers) request.headers = data.headers;
        if (data.body && data.body.constructor === String) request.data = data.body;
        else if (data.body) request.data = JSON.stringify(data.body);
        if (data.timeout) request.timeout = data.timeout;
        if (typeof GM_xmlhttpRequest !== 'undefined') GM_xmlhttpRequest(request);
        else if (typeof GM !== 'undefined' && GM.xmlHttpRequest) GM.xmlHttpRequest(request);
        else reject(new Error('Could not submit XHR request'));
      });
    }


    function debugLog() {
      recordRuntimeLog('debug', 'debugLog', Array.from(arguments));
      if (CONFIG.lrrDebugMode) {
        console.log.apply(console, ['[LRR Debug]'].concat(Array.from(arguments)));
      }
    }

    function log() {
      recordRuntimeLog('info', 'log', Array.from(arguments));
      if (CONFIG.enableLogging) console.log.apply(console, arguments);
    }
    function warn() {
      recordRuntimeLog('warn', 'warn', Array.from(arguments));
      if (CONFIG.enableLogging) console.warn.apply(console, arguments);
    }
    function errLog() {
      recordRuntimeLog('error', 'errLog', Array.from(arguments));
      if (CONFIG.enableLogging) console.error.apply(console, arguments);
    }

    /* ================================================================
     *  纯浏览器原画下载（无 gallery-dl / 无本地 Bridge）
     * ================================================================ */

    var galleryDlBusy = false;
    var CRC32_TABLE = null;
    var ZIP32_MAX = 0xffffffff;
    var GALLERY_DL_FAST_RETRIES = 3;
    var GALLERY_DL_RECOVERY_ROUNDS = 3;
    // OPFS 不可用时才退回内存 ZIP。内存模式会把整库字节留在标签页里，
    // 超过这个上限就明确报错，避免页面直接 OOM 崩溃。
    var MEMORY_ZIP_LIMIT = 512 * 1024 * 1024;

    function warnBeforeLeavingDownload(event) {
      if (!galleryDlBusy) return;
      event.preventDefault();
      // Modern browsers display their own confirmation text for beforeunload.
      event.returnValue = '';
    }

    function setGalleryDownloadBusy(busy) {
      galleryDlBusy = busy;
      if (busy) window.addEventListener('beforeunload', warnBeforeLeavingDownload);
      else window.removeEventListener('beforeunload', warnBeforeLeavingDownload);
    }

    function createGalleryDownloadTask() {
      return {
        requests: new Set(), paused: false, stopped: false, error: null, waiters: [],
        interrupt: function (error) {
          Array.from(this.requests).forEach(function (cancel) { cancel(error); });
        },
        pause: function () { if (this.stopped) return; this.paused = true; this.interrupt(galleryTaskInterruption('paused')); },
        resume: function () { this.paused = false; this.waiters.splice(0).forEach(function (wake) { wake(); }); },
        stop: function (error) { this.stopped = true; this.error = error || galleryTaskInterruption('cancelled'); this.interrupt(this.error); this.resume(); },
      };
    }

    // Network receive rate, including retries; ZIP throughput is deliberately separate.
    function createGallerySpeedMeter(nowFn) {
      var clock = typeof nowFn === 'function' ? nowFn : function () {
        return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
      };
      var lastTime = Number(clock());
      if (!Number.isFinite(lastTime)) lastTime = 0;
      var activeMs = 0, totalBytes = 0, samples = [], suspendedReasons = new Set();
      function advance() {
        var time = Number(clock());
        if (!Number.isFinite(time)) time = lastTime;
        time = Math.max(lastTime, time);
        if (!suspendedReasons.size) activeMs += time - lastTime;
        lastTime = time;
        while (samples.length && samples[0].time <= time - 5000) samples.shift();
        return time;
      }
      function addBytes(delta) {
        var time = advance();
        delta = Number(delta);
        if (!Number.isFinite(delta) || delta <= 0) return;
        totalBytes += delta;
        if (suspendedReasons.size) return;
        // Millisecond coalescing bounds the five-second window to at most 5001 buckets.
        var bucketTime = Math.floor(time);
        var tail = samples[samples.length - 1];
        if (tail && tail.time === bucketTime) tail.bytes += delta;
        else samples.push({ time: bucketTime, bytes: delta });
      }
      function suspend(reason) {
        advance(); suspendedReasons.add(reason || 'paused'); samples = [];
      }
      function resume(reason) {
        advance(); suspendedReasons.delete(reason || 'paused'); samples = [];
      }
      function snapshot() {
        advance();
        var recentBytes = samples.reduce(function (sum, sample) { return sum + sample.bytes; }, 0);
        return { currentBps: suspendedReasons.size ? 0 : recentBytes / 5,
          averageBps: activeMs > 0 ? totalBytes * 1000 / activeMs : 0,
          totalBytes: totalBytes, activeMs: activeMs, suspended: !!suspendedReasons.size };
      }
      return { addBytes: addBytes, suspend: suspend, resume: resume, snapshot: snapshot };
    }

    // Bounded download → serial ZIP pipeline. Pending counts include the active write.
    function createGalleryWriteQueue(task, options) {
      options = options || {};
      var maxItems = Number(options.maxItems), maxBytes = Number(options.maxBytes);
      maxItems = Number.isFinite(maxItems) && maxItems > 0 ? Math.max(1, Math.floor(maxItems)) : 10;
      maxBytes = Number.isFinite(maxBytes) && maxBytes > 0 ? Math.max(1, Math.floor(maxBytes)) : 64 * 1024 * 1024;
      var jobs = [], capacityWaiters = [], drainWaiters = [];
      var active = false, failed = null, disposed = false;
      var stats = { pendingItems: 0, pendingBytes: 0, peakItems: 0, peakBytes: 0,
        writtenItems: 0, writeTimeMs: 0, backpressureTimeMs: 0 };
      function wakeCapacity() { capacityWaiters.splice(0).forEach(function (wake) { wake(); }); }
      function settleDrains() {
        if (active || stats.pendingItems) return;
        drainWaiters.splice(0).forEach(function (waiter) { if (failed) waiter.reject(failed); else waiter.resolve(); });
      }
      function fail(error, writeFailure) {
        if (failed) return;
        failed = error instanceof Error ? error : new Error(String(error || 'ZIP queue stopped'));
        if (writeFailure) {
          failed.galleryFatal = true; failed.galleryCode = failed.galleryCode || 'zip-write-failed';
        }
        jobs.splice(0).forEach(function (job) {
          stats.pendingItems--; stats.pendingBytes -= job.size; job.write = null;
        });
        wakeCapacity(); settleDrains();
        if (writeFailure) {
          task.stop(failed);
          if (typeof options.onError === 'function') { try { options.onError(failed); } catch (_) {} }
        }
      }
      function interrupted(error) {
        // Pauses and recoverable site-wide interrupts retain already downloaded images.
        if (task.stopped) fail(error || task.error, false);
        wakeCapacity();
      }
      task.requests.add(interrupted);
      async function pump() {
        if (active) return;
        active = true;
        try {
          while (jobs.length && !failed) {
            var job = jobs.shift();
            var started = 0;
            try {
              await galleryTaskCheckpoint(task);
              if (failed) throw failed;
              started = Date.now();
              await job.write();
              stats.writtenItems++;
            } catch (error) { fail(error, !task.stopped); }
            finally {
              if (started) stats.writeTimeMs += Date.now() - started;
              stats.pendingItems--; stats.pendingBytes -= job.size;
              job.write = null; job = null;
              wakeCapacity();
            }
          }
        } finally { active = false; settleDrains(); }
      }
      async function enqueue(size, write) {
        size = Number(size);
        if (!Number.isFinite(size) || size < 0 || typeof write !== 'function') throw new Error('Invalid ZIP queue job');
        var waitingSince = 0;
        try {
          while (true) {
            if (failed) throw failed;
            if (disposed) throw new Error('ZIP queue disposed');
            await galleryTaskCheckpoint(task);
            if (failed) throw failed;
            // One oversize image may enter an otherwise empty queue, never alongside another.
            if (stats.pendingItems < maxItems && (stats.pendingItems === 0 || stats.pendingBytes + size <= maxBytes)) break;
            if (!waitingSince) waitingSince = Date.now();
            await new Promise(function (resolve) { capacityWaiters.push(resolve); });
          }
          jobs.push({ size: size, write: write });
          stats.pendingItems++; stats.pendingBytes += size;
          stats.peakItems = Math.max(stats.peakItems, stats.pendingItems);
          stats.peakBytes = Math.max(stats.peakBytes, stats.pendingBytes);
          // Start synchronously up to the first checkpoint so a second enqueue cannot
          // start a concurrent pump; the returned admission promise never adopts a job.
          pump().catch(function (error) { fail(error, !task.stopped); });
        } finally {
          if (waitingSince) stats.backpressureTimeMs += Date.now() - waitingSince;
          write = null;
        }
      }
      function drain() {
        if (!active && !stats.pendingItems) return failed ? Promise.reject(failed) : Promise.resolve();
        return new Promise(function (resolve, reject) { drainWaiters.push({ resolve: resolve, reject: reject }); });
      }
      function getStats() { return Object.assign({}, stats, { maxItems: maxItems, maxBytes: maxBytes }); }
      function dispose() { disposed = true; task.requests.delete(interrupted); wakeCapacity(); }
      return { enqueue: enqueue, drain: drain, getStats: getStats, dispose: dispose };
    }

    function galleryTaskInterruption(reason) {
      var error = new Error(reason);
      error.galleryInterrupted = true;
      error.galleryReason = reason;
      return error;
    }

    async function galleryTaskCheckpoint(task) {
      if (!task) return;
      while (task.paused && !task.stopped) await new Promise(function (resolve) { task.waiters.push(resolve); });
      if (task.stopped) throw task.error;
    }

    async function galleryTaskRequest(task, options) {
      while (true) {
        await galleryTaskCheckpoint(task);
        try {
          if (options.onstart) options.onstart();
          return await galleryRawRequest(Object.assign({}, options, { task: task }));
        }
        catch (error) {
          if (task && !task.stopped && error.galleryReason === 'paused') continue;
          throw error;
        }
      }
    }

    function galleryRawRequest(options) {
      return new Promise(function (resolve, reject) {
        var task = options.task;
        var settled = false, handle = null, timer = null, lastLoaded = 0;
        function settle(error, response) {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          if (task) task.requests.delete(cancel);
          if (error) {
            recordRuntimeLog(error.galleryInterrupted ? 'info' : 'warn', 'download.request-failed', {
              url: options.url, reason: error.galleryReason || error.message, status: error.status, loadedBytes: lastLoaded });
            reject(error);
          } else resolve(response);
        }
        function cancel(error) {
          settle(error || galleryTaskInterruption('cancelled'));
          try { if (handle && handle.abort) handle.abort(); } catch (ignored) {}
        }
        function armStallTimer() {
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () { cancel(new Error('60s without new response bytes: ' + options.url)); }, 60000);
        }
        if (task) {
          if (task.stopped) { settle(task.error); return; }
          if (task.paused) { settle(galleryTaskInterruption('paused')); return; }
          task.requests.add(cancel);
        }
        armStallTimer();
        var req = {
          method: options.method || 'GET',
          url: options.url,
          headers: options.headers || {},
          data: options.data,
          responseType: options.responseType || 'text',
          timeout: options.timeout === 0 ? 0 : (options.timeout || 60000),
          anonymous: false,
          onprogress: function (event) {
            if (settled) return;
            var loaded = Number(event.loaded || 0);
            if (loaded > lastLoaded) { lastLoaded = loaded; armStallTimer(); }
            if (options.onprogress) options.onprogress(event);
          },
          onload: function (res) {
            if (settled) return;
            if (res.status >= 200 && res.status < 400) settle(null, res);
            else {
              var error = new Error('HTTP ' + res.status + '：' + (res.statusText || options.url));
              error.status = res.status;
              error.response = res;
              settle(error);
            }
          },
          onerror: function () { settle(new Error('网络请求失败：' + options.url)); },
          ontimeout: function () { settle(new Error('请求超时：' + options.url)); },
          onabort: function () { settle(galleryTaskInterruption('请求已取消：' + options.url)); },
        };
        try {
          if (typeof GM_xmlhttpRequest !== 'undefined') handle = GM_xmlhttpRequest(req);
          else if (typeof GM !== 'undefined' && GM.xmlHttpRequest) handle = GM.xmlHttpRequest(req);
          else settle(new Error('当前油猴环境不支持 GM_xmlhttpRequest'));
          // Some modern GM implementations return a promise for the abort handle.
          if (handle && typeof handle.then === 'function') handle.then(function (value) {
            if (value && value.abort) { handle = value; if (settled) value.abort(); }
          }, function (error) { settle(error); });
        } catch (error) { settle(error); }
      });
    }

    function galleryTextRequest(url, method, data, headers, timeout, task) {
      return galleryTaskRequest(task, {
        method: method || 'GET', url: url, data: data, headers: headers || {},
        responseType: 'text', timeout: timeout || 60000,
      }).then(function (res) {
        var text = res.responseText || res.response || '';
        return { text: String(text), response: res };
      });
    }

    function createGallerySiteError(code, zh, en) {
      var error = new Error(t(zh, en));
      error.galleryCode = code;
      error.galleryFatal = true;
      return error;
    }

    function decodeGalleryErrorBody(data) {
      if (!(data instanceof ArrayBuffer) || data.byteLength > 128 * 1024 || typeof TextDecoder === 'undefined') return '';
      try { return new TextDecoder().decode(new Uint8Array(data)); }
      catch (e) { return ''; }
    }

    function detectGallerySiteError(data, contentType) {
      var body = decodeGalleryErrorBody(data);
      if (!body && contentType.indexOf('text/') !== 0) return null;
      if (/temporarily banned/i.test(body)) return createGallerySiteError('ip-banned', 'IP 已被 E-Hentai 临时封禁，请降低并发并等待解封', 'Your IP has been temporarily banned by E-Hentai; reduce concurrency and wait for the ban to expire');
      if (/account has been suspended/i.test(body)) return createGallerySiteError('account-suspended', 'E-Hentai 账号已被冻结，无法继续下载原画', 'The E-Hentai account is suspended and original-image downloading cannot continue');
      if (/exceeded your image viewing limits|do not have sufficient GP|requires GP, and you do not have enough|reached the image limit/i.test(body)) {
        return createGallerySiteError('quota-exceeded', '图片额度或 GP 不足，下载已暂停', 'Image quota or GP is insufficient; downloading has stopped');
      }
      if (contentType.indexOf('text/') === 0 || /^\s*(?:<!doctype|<html|an error has occurred)/i.test(body)) {
        var error = new Error(t('图片服务器返回了错误页面', 'The image server returned an error page'));
        error.galleryCode = 'image-error-page';
        return error;
      }
      return null;
    }

    function galleryBinaryRequest(url, referer, onprogress, task) {
      var headers = {};
      if (referer) {
        headers.Referer = referer;
        headers['X-Alt-Referer'] = referer;
      }
      if (/\/fullimg(?:\.php|\/)/i.test(url)) headers['Cache-Control'] = 'no-cache';
      return galleryTaskRequest(task, {
        method: 'GET', url: url, headers: headers, responseType: 'arraybuffer', timeout: 0, onprogress: onprogress,
        onstart: function () { if (onprogress) onprogress({ loaded: 0, requestStarted: true }); },
      }).then(function (res) {
        var data = res.response;
        if (!(data instanceof ArrayBuffer)) throw new Error(t('图片响应不是二进制数据', 'Image response is not binary data'));
        var headersText = String(res.responseHeaders || '');
        var typeMatch = headersText.match(/(?:^|\r?\n)content-type:\s*([^;\r\n]+)/i);
        var contentType = typeMatch ? typeMatch[1].trim().toLowerCase() : '';
        var siteError = detectGallerySiteError(data, contentType);
        if (siteError) throw siteError;
        var toleratedImageTypes = ['image', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'apng'];
        if (contentType && contentType.indexOf('image/') !== 0 && contentType !== 'application/octet-stream' && toleratedImageTypes.indexOf(contentType) < 0) {
          throw new Error(t('图片请求返回了非图片内容：', 'Image request returned non-image content: ') + contentType);
        }
        if (!data.byteLength) throw new Error(t('图片响应为空', 'Image response is empty'));
        return { data: data, finalUrl: res.finalUrl || url, headers: headersText, contentType: contentType };
      });
    }

    function sleepMs(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

    function galleryRetryDelay(attempt, recoveryRound) {
      var base = recoveryRound ? 1200 * Math.pow(2, recoveryRound - 1) : 350 * attempt;
      return base + Math.floor(Math.random() * 250);
    }

    async function retryGalleryOperation(operation, attempts, recoveryRound) {
      var lastError = null;
      for (var attempt = 1; attempt <= attempts; attempt++) {
        try { return await operation(attempt); }
        catch (e) {
          lastError = e;
          if (e && (e.galleryFatal || e.galleryInterrupted)) throw e;
          if (attempt < attempts) await sleepMs(galleryRetryDelay(attempt, recoveryRound || 0));
        }
      }
      throw lastError || new Error(t('未知下载错误', 'Unknown download error'));
    }


    function sanitizeGalleryTitle(title) {
      title = String(title || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
      title = title.replace(/[ .]+$/g, '');
      if (!title) title = 'untitled';
      return title.length > 160 ? title.slice(0, 160).replace(/[ .]+$/g, '') : title;
    }

    function getCurrentGalleryInfo() {
      var m = window.location.href.match(/\/g\/(\d+)\/([0-9a-z]+)/i);
      if (!m) return null;
      var gn = document.querySelector('#gn');
      var gj = document.querySelector('#gj');
      var title = gn ? gn.textContent.trim() : '';
      var titleJpn = gj ? gj.textContent.trim() : '';
      if (!title) title = document.title.replace(/\s*-\s*E-Hentai Galleries\s*$/i, '').trim();
      var pageCount = 0;
      var detailRows = document.querySelectorAll('#gdd tr');
      for (var d = 0; d < detailRows.length; d++) {
        var labelNode = detailRows[d].querySelector('.gdt1');
        var valueNode = detailRows[d].querySelector('.gdt2');
        var labelText = labelNode ? labelNode.textContent.trim() : '';
        var valueText = valueNode ? valueNode.textContent.trim() : '';
        if (/^Length:?$/i.test(labelText)) {
          var lengthMatch = valueText.match(/([\d,]+)\s*pages?/i);
          if (lengthMatch) pageCount = parseInt(lengthMatch[1].replace(/,/g, ''), 10) || 0;
          break;
        }
      }
      var tags = [];
      var rows = document.querySelectorAll('#taglist tr');
      for (var i = 0; i < rows.length; i++) {
        var nsNode = rows[i].querySelector('.tc');
        var namespace = nsNode ? nsNode.textContent.trim().replace(/:$/, '') : '';
        var tagNodes = rows[i].querySelectorAll('.gt, .gtl');
        for (var j = 0; j < tagNodes.length; j++) {
          var tag = tagNodes[j].textContent.trim();
          if (tag) tags.push(namespace ? namespace + ':' + tag : tag);
        }
      }
      return {
        gid: m[1], token: m[2],
        url: window.location.protocol + '//' + window.location.host + '/g/' + m[1] + '/' + m[2] + '/',
        title: title, title_jpn: titleJpn, page_count: pageCount, tags: tags,
      };
    }

    function chooseGalleryTitle(info, mode) {
      if (!info) return '';
      return mode === 'japanese' && info.title_jpn ? info.title_jpn : info.title;
    }

    function updateGalleryDlPreview(panel) {
      if (!panel) return;
      var info = getCurrentGalleryInfo();
      var preview = panel.querySelector('#eh-gdl-title-preview');
      var pagePreview = panel.querySelector('#eh-gdl-page-preview');
      var downloadBtn = panel.querySelector('#eh-gdl-download');
      var modeNode = panel.querySelector('input[name="cfg-galleryDlTitleMode"]:checked');
      var mode = modeNode ? modeNode.value : 'default';
      if (!info) {
        if (preview) preview.textContent = t('当前页面不是图库详情页', 'This is not a gallery detail page');
        if (pagePreview) pagePreview.textContent = '';
        if (downloadBtn) downloadBtn.disabled = true;
        return;
      }
      var selected = chooseGalleryTitle(info, mode);
      if (preview) preview.textContent = sanitizeGalleryTitle(selected) + '.zip';
      if (pagePreview) pagePreview.textContent = info.page_count ? t(' · ' + info.page_count + ' 页', ' · ' + info.page_count + ' pages') : t(' · 页数待 API 确认', ' · Page count pending API');
      if (downloadBtn) downloadBtn.disabled = galleryDlBusy;
    }

    function updateGalleryDlStatus(box, state, main, detail) {
      if (!box) return;
      box.className = 'eh-tb-lrr-status ' + (state || 'checking');
      var mainNode = box.querySelector('.eh-tb-status-main');
      var detailNode = box.querySelector('.eh-tb-status-detail');
      if (mainNode) mainNode.textContent = main || '';
      if (detailNode) detailNode.textContent = detail || '';
    }

    function formatGalleryDlBytes(value) {
      var n = Math.max(0, Number(value) || 0);
      var units = ['B', 'KB', 'MB', 'GB', 'TB'];
      var index = 0;
      while (n >= 1024 && index < units.length - 1) { n /= 1024; index++; }
      var digits = index === 0 ? 0 : (n >= 100 ? 0 : (n >= 10 ? 1 : 2));
      return n.toFixed(digits) + ' ' + units[index];
    }

    function updateGalleryDlMetrics(box, data, visible) {
      if (!box) return;
      var metrics = box.querySelector('#eh-gdl-metrics');
      if (!metrics) return;
      metrics.style.display = visible ? 'grid' : 'none';
      if (!visible) return;
      var speedNode = metrics.querySelector('#eh-gdl-speed');
      var averageSpeedNode = metrics.querySelector('#eh-gdl-average-speed');
      var networkBytesNode = metrics.querySelector('#eh-gdl-network');
      var bytesNode = metrics.querySelector('#eh-gdl-downloaded');
      var progressNode = metrics.querySelector('#eh-gdl-progress');
      var workersNode = metrics.querySelector('#eh-gdl-workers');
      if (speedNode) speedNode.textContent = data.status === 'zipping' ? t('写入 ZIP', 'Writing ZIP') : (data.status === 'done' ? t('完成', 'Done') : formatGalleryDlBytes(data.speed_bps || 0) + '/s');
      if (averageSpeedNode) averageSpeedNode.textContent = formatGalleryDlBytes(data.average_speed_bps || 0) + '/s';
      if (networkBytesNode) networkBytesNode.textContent = formatGalleryDlBytes(data.network_bytes || 0);
      if (bytesNode) bytesNode.textContent = formatGalleryDlBytes(data.downloaded_bytes || 0);
      if (progressNode) progressNode.textContent = data.total_pages ? t((data.downloaded_files || 0) + ' / ' + data.total_pages + ' 页', (data.downloaded_files || 0) + ' / ' + data.total_pages + ' pages') : '--';
      if (workersNode) workersNode.textContent = t(String(data.workers || 1) + ' 路', String(data.workers || 1) + ' workers');
    }

    function readGalleryDlPanelConfig(panel) {
      var modeNode = panel.querySelector('input[name="cfg-galleryDlTitleMode"]:checked');
      return {
        galleryDlTitleMode: modeNode ? modeNode.value : 'japanese',
        galleryDlOriginal: panel.querySelector('#cfg-galleryDlOriginal').checked,
        galleryDlWriteMetadata: panel.querySelector('#cfg-galleryDlWriteMetadata').checked,
        galleryDlParallel: Math.max(1, parseInt(panel.querySelector('#cfg-galleryDlParallel').value, 10) || 1),
      };
    }

    function saveGalleryDlConfig(panel) {
      var cfg = readGalleryDlPanelConfig(panel);
      var saves = [];
      Object.keys(cfg).forEach(function (key) { CONFIG[key] = cfg[key]; saves.push(gmSet(key, cfg[key])); });
      return Promise.all(saves);
    }

    function fetchGalleryApiMetadata(info, task) {
      var apiUrl = /exhentai\.org$/i.test(window.location.hostname) ? 'https://exhentai.org/api.php' : 'https://api.e-hentai.org/api.php';
      var body = JSON.stringify({ method: 'gdata', gidlist: [[parseInt(info.gid, 10), info.token]], namespace: 1 });
      return galleryTextRequest(apiUrl, 'POST', body, { 'Content-Type': 'application/json' }, 30000, task).then(function (res) {
        var json = JSON.parse(res.text || '{}');
        var meta = json && json.gmetadata && json.gmetadata[0];
        if (!meta || String(meta.gid) !== String(info.gid)) throw new Error(t('API 未返回当前图库元数据', 'API did not return metadata for the current gallery'));
        return meta;
      });
    }

    function parseImagePageLinks(html, baseUrl, gid) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var map = new Map();
      var nodes = doc.querySelectorAll('#gdt a[href*="/s/"], a[href*="/s/"]');
      for (var i = 0; i < nodes.length; i++) {
        var href = nodes[i].getAttribute('href');
        if (!href) continue;
        var absolute = new URL(href, baseUrl).href;
        var m = absolute.match(/\/s\/[^/]+\/(\d+)-(\d+)/i);
        if (!m || m[1] !== String(gid)) continue;
        map.set(parseInt(m[2], 10), absolute);
      }
      return map;
    }

    async function collectImagePageUrls(info, totalPages, statusBox, task) {
      var collected = new Map();
      var page = 0;
      var emptyRounds = 0;
      var maxPages = Math.max(5, Math.ceil((totalPages || 40) / 20) + 5);
      while (page < maxPages && (!totalPages || collected.size < totalPages)) {
        var url = info.url + (page ? ('?p=' + page) : '');
        updateGalleryDlStatus(statusBox, 'checking', t('正在读取图库页', 'Reading gallery pages'), t('缩略图页 ', 'Thumbnail page ') + (page + 1) + t(' · 已找到 ', ' · Found ') + collected.size + '/' + (totalPages || '?'));
        var res = await retryGalleryOperation(function () {
          return galleryTextRequest(url, 'GET', null, null, 45000, task);
        }, GALLERY_DL_FAST_RETRIES, 0);
        var found = parseImagePageLinks(res.text, url, info.gid);
        var before = collected.size;
        found.forEach(function (value, key) { collected.set(key, value); });
        emptyRounds = collected.size === before ? emptyRounds + 1 : 0;
        if (emptyRounds >= 2) break;
        page++;
      }
      var keys = Array.from(collected.keys()).sort(function (a, b) { return a - b; });
      var urls = keys.map(function (key) { return collected.get(key); });
      if (totalPages && urls.length < totalPages) throw new Error(t('只解析到 ', 'Only parsed ') + urls.length + '/' + totalPages + t(' 个图片页，已停止以避免漏页', ' image pages; stopped to avoid missing pages'));
      return totalPages ? urls.slice(0, totalPages) : urls;
    }

    function addGalleryQuery(url, name, value) {
      if (!value) return url;
      var parsed = new URL(url, window.location.href);
      parsed.searchParams.set(name, value);
      return parsed.href;
    }

    function parseGalleryNlToken(html) {
      var match = String(html || '').match(/return\s+nl\(['"]([\w-]+)['"]\)/i);
      return match ? match[1] : '';
    }

    async function resolveDownloadImageUrl(pageUrl, useOriginal, nlToken, task) {
      var requestedPageUrl = addGalleryQuery(pageUrl, 'nl', nlToken);
      var res = await galleryTextRequest(requestedPageUrl, 'GET', null, null, 60000, task);
      var doc = new DOMParser().parseFromString(res.text, 'text/html');
      var img = doc.querySelector('#img');
      var src = img && img.getAttribute('src');
      var nextNl = parseGalleryNlToken(res.text);

      // Unchecked = use the image currently displayed on the image page (resized/compressed).
      if (!useOriginal) {
        if (src) return { url: new URL(src, requestedPageUrl).href, nlToken: nextNl, pageUrl: requestedPageUrl };
        throw new Error(t('图片页没有可下载的压缩/缩放图', 'No compressed/resized image was found on the image page'));
      }

      var original = doc.querySelector('a[href*="/fullimg.php"], a[href*="/fullimg/"]');
      if (original && original.getAttribute('href')) {
        var originalUrl = new URL(original.getAttribute('href'), requestedPageUrl).href;
        return { url: addGalleryQuery(originalUrl, 'nl', nextNl), nlToken: nextNl, pageUrl: requestedPageUrl };
      }
      if (src) {
        var absolute = new URL(src, requestedPageUrl).href;
        if (/xres=org(?:[;&/]|$)/i.test(absolute)) return { url: absolute, nlToken: nextNl, pageUrl: requestedPageUrl };
      }
      throw new Error(t('图片页没有可确认的原画链接', 'No confirmed original-image URL was found on the image page'));
    }

    function imageExtension(finalUrl, contentType, headers) {
      var disposition = String(headers || '').match(/filename\*?=(?:UTF-8''|["']?)([^"'\r\n;]+)/i);
      var name = disposition ? decodeURIComponent(disposition[1].replace(/["']/g, '').trim()) : '';
      var urlName = '';
      try { urlName = new URL(finalUrl).pathname.split('/').pop() || ''; } catch (e) {}
      var candidate = name || urlName;
      var m = candidate.match(/\.(jpe?g|png|webp|gif|bmp|avif|jxl)(?:$|\?)/i);
      if (m) return '.' + (m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase());
      var types = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/bmp': '.bmp', 'image/avif': '.avif', 'image/jxl': '.jxl' };
      return types[contentType] || '.jpg';
    }

    function getCrc32Table() {
      if (CRC32_TABLE) return CRC32_TABLE;
      CRC32_TABLE = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        CRC32_TABLE[n] = c >>> 0;
      }
      return CRC32_TABLE;
    }

    function crc32(bytes) {
      var table = getCrc32Table();
      var crc = 0xffffffff;
      for (var i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
      return (crc ^ 0xffffffff) >>> 0;
    }

    function dosDateTime(date) {
      var d = date || new Date();
      var year = Math.min(2107, Math.max(1980, d.getFullYear()));
      return {
        time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31),
        date: ((year - 1980) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31),
      };
    }

    function setUint64LE(view, offset, value) {
      var v = typeof value === 'bigint' ? value : BigInt(value);
      view.setUint32(offset, Number(v & 0xffffffffn), true);
      view.setUint32(offset + 4, Number((v >> 32n) & 0xffffffffn), true);
    }

    function concatBytes(parts, total) {
      var out = new Uint8Array(total);
      var offset = 0;
      for (var i = 0; i < parts.length; i++) { out.set(parts[i], offset); offset += parts[i].length; }
      return out;
    }

    function MemoryZipSink() { this.parts = []; this.size = 0; }
    MemoryZipSink.prototype.write = function (bytes) {
      var length = bytes && (bytes.byteLength || bytes.length) || 0;
      if (this.size + length > MEMORY_ZIP_LIMIT) {
        var limitError = new Error(t('当前浏览器不支持 OPFS，内存模式上限 ',
          'OPFS is unavailable; the in-memory mode limit is ') + formatGalleryDlBytes(MEMORY_ZIP_LIMIT) +
          t('，请改用压缩图、减少页数或更换浏览器',
            '. Use compressed images, download fewer pages, or switch browsers.'));
        limitError.galleryCode = 'memory-zip-limit';
        limitError.galleryFatal = true;
        return Promise.reject(limitError);
      }
      this.size += length;
      this.parts.push(bytes);
      return Promise.resolve();
    };
    MemoryZipSink.prototype.finish = function () {
      var blob = new Blob(this.parts, { type: 'application/zip' });
      // Blob 已经在构造时快照字节，这里立刻释放分片，避免下载完成后整库仍占内存。
      this.parts.length = 0;
      this.size = 0;
      return Promise.resolve(blob);
    };
    MemoryZipSink.prototype.abort = function () { this.parts.length = 0; return Promise.resolve(); };
    MemoryZipSink.prototype.cleanup = function () { this.parts.length = 0; return Promise.resolve(); };

    function OpfsZipSink(root, handle, writable, name) { this.root = root; this.handle = handle; this.writable = writable; this.name = name; }
    OpfsZipSink.create = async function (name) {
      if (!navigator.storage || !navigator.storage.getDirectory) throw new Error('OPFS 不可用');
      var root = await navigator.storage.getDirectory();
      var handle = await root.getFileHandle(name, { create: true });
      var writable = await handle.createWritable();
      return new OpfsZipSink(root, handle, writable, name);
    };
    OpfsZipSink.prototype.write = function (bytes) { return this.writable.write(bytes); };
    OpfsZipSink.prototype.finish = async function () { await this.writable.close(); this.writable = null; return this.handle.getFile(); };
    async function removeOpfsEntryWithRetry(root, name) {
      for (var attempt = 0; attempt < 5; attempt++) {
        try {
          await root.removeEntry(name);
          return true;
        } catch (e) {
          if (e && e.name === 'NotFoundError') return true;
          if (attempt < 4) await sleepMs(100 * Math.pow(2, attempt));
        }
      }
      return false;
    }

    async function cleanupGalleryDlTempFiles(maxAgeMs, exceptName) {
      if (!navigator.storage || !navigator.storage.getDirectory) return 0;
      var root;
      try { root = await navigator.storage.getDirectory(); }
      catch (e) { return 0; }
      var removed = 0;
      var now = Date.now();
      try {
        for await (var entry of root.entries()) {
          var name = entry[0];
          var handle = entry[1];
          if (name === exceptName || handle.kind !== 'file' || !/^\.eh-pure-\d+-\d+\.zip$/.test(name)) continue;
          if (maxAgeMs > 0) {
            try {
              var file = await handle.getFile();
              if (now - file.lastModified < maxAgeMs) continue;
            } catch (e2) {}
          }
          if (await removeOpfsEntryWithRetry(root, name)) removed++;
        }
      } catch (e3) {}
      return removed;
    }

    OpfsZipSink.prototype.abort = async function () {
      try { if (this.writable) await this.writable.abort(); } catch (e) {}
      this.writable = null;
      await this.cleanup();
    };
    OpfsZipSink.prototype.cleanup = function () { return removeOpfsEntryWithRetry(this.root, this.name); };

    // 内存回退的原因：状态栏要明确告诉用户正在用哪种模式。
    var zipSinkFallbackReason = '';

    async function createZipSink(tempName) {
      try { return await OpfsZipSink.create(tempName); }
      catch (e) {
        zipSinkFallbackReason = e && e.message ? e.message : String(e);
        warn('[EH Downloader] OPFS 不可用，已退回内存 ZIP：', zipSinkFallbackReason);
        return new MemoryZipSink();
      }
    }

    function StreamingZipWriter(sink) {
      this.sink = sink;
      this.entries = [];
      this.offset = 0n;
      this.encoder = new TextEncoder();
    }

    StreamingZipWriter.prototype.write = async function (bytes) {
      await this.sink.write(bytes);
      this.offset += BigInt(bytes.byteLength || bytes.length || 0);
    };

    StreamingZipWriter.prototype.add = async function (name, arrayBuffer) {
      var data = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
      if (data.byteLength > ZIP32_MAX) throw new Error('单个文件超过 4GB，当前纯浏览器 ZIP 不支持');
      var nameBytes = this.encoder.encode(name);
      var stamp = dosDateTime(new Date());
      var crc = crc32(data);
      var localOffset = this.offset;
      var header = new Uint8Array(30 + nameBytes.length);
      var view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0808, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, stamp.time, true);
      view.setUint16(12, stamp.date, true);
      view.setUint32(14, 0, true);
      view.setUint32(18, 0, true);
      view.setUint32(22, 0, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      header.set(nameBytes, 30);
      await this.write(header);
      await this.write(data);
      var desc = new Uint8Array(16);
      var dv = new DataView(desc.buffer);
      dv.setUint32(0, 0x08074b50, true);
      dv.setUint32(4, crc, true);
      dv.setUint32(8, data.byteLength, true);
      dv.setUint32(12, data.byteLength, true);
      await this.write(desc);
      this.entries.push({ nameBytes: nameBytes, crc: crc, size: data.byteLength, offset: localOffset, time: stamp.time, date: stamp.date });
    };

    StreamingZipWriter.prototype.centralRecord = function (entry) {
      var needOffset64 = entry.offset > 0xffffffffn;
      var extra = needOffset64 ? new Uint8Array(12) : new Uint8Array(0);
      if (needOffset64) {
        var ev = new DataView(extra.buffer);
        ev.setUint16(0, 0x0001, true);
        ev.setUint16(2, 8, true);
        setUint64LE(ev, 4, entry.offset);
      }
      var out = new Uint8Array(46 + entry.nameBytes.length + extra.length);
      var view = new DataView(out.buffer);
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, needOffset64 ? 45 : 20, true);
      view.setUint16(6, needOffset64 ? 45 : 20, true);
      view.setUint16(8, 0x0808, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, entry.time, true);
      view.setUint16(14, entry.date, true);
      view.setUint32(16, entry.crc, true);
      view.setUint32(20, entry.size, true);
      view.setUint32(24, entry.size, true);
      view.setUint16(28, entry.nameBytes.length, true);
      view.setUint16(30, extra.length, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, needOffset64 ? 0xffffffff : Number(entry.offset), true);
      out.set(entry.nameBytes, 46);
      out.set(extra, 46 + entry.nameBytes.length);
      return out;
    };

    StreamingZipWriter.prototype.finish = async function () {
      var cdStart = this.offset;
      for (var i = 0; i < this.entries.length; i++) await this.write(this.centralRecord(this.entries[i]));
      var cdSize = this.offset - cdStart;
      var count = BigInt(this.entries.length);
      var needZip64 = count >= 0xffffn || cdStart > 0xffffffffn || cdSize > 0xffffffffn;
      if (needZip64) {
        var zip64Start = this.offset;
        var z64 = new Uint8Array(56);
        var zv = new DataView(z64.buffer);
        zv.setUint32(0, 0x06064b50, true);
        setUint64LE(zv, 4, 44n);
        zv.setUint16(12, 45, true);
        zv.setUint16(14, 45, true);
        zv.setUint32(16, 0, true);
        zv.setUint32(20, 0, true);
        setUint64LE(zv, 24, count);
        setUint64LE(zv, 32, count);
        setUint64LE(zv, 40, cdSize);
        setUint64LE(zv, 48, cdStart);
        await this.write(z64);
        var locator = new Uint8Array(20);
        var lv = new DataView(locator.buffer);
        lv.setUint32(0, 0x07064b50, true);
        lv.setUint32(4, 0, true);
        setUint64LE(lv, 8, zip64Start);
        lv.setUint32(16, 1, true);
        await this.write(locator);
      }
      var eocd = new Uint8Array(22);
      var ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(4, 0, true);
      ev.setUint16(6, 0, true);
      ev.setUint16(8, needZip64 ? 0xffff : this.entries.length, true);
      ev.setUint16(10, needZip64 ? 0xffff : this.entries.length, true);
      ev.setUint32(12, needZip64 ? 0xffffffff : Number(cdSize), true);
      ev.setUint32(16, needZip64 ? 0xffffffff : Number(cdStart), true);
      ev.setUint16(20, 0, true);
      await this.write(eocd);
      return this.sink.finish();
    };

    StreamingZipWriter.prototype.abort = function () { return this.sink.abort(); };
    StreamingZipWriter.prototype.cleanup = function () { return this.sink.cleanup(); };

    function buildMetadata(info, apiMeta, selectedTitle, downloadedFiles, originalOnly) {
      var meta = Object.assign({}, apiMeta || {});
      meta.source = 'E-Hentai/ExHentai';
      meta.gallery_url = info.url;
      meta.gid = String(info.gid);
      meta.token = String(info.token);
      meta.title = (apiMeta && apiMeta.title) || info.title || '';
      meta.title_jpn = (apiMeta && apiMeta.title_jpn) || info.title_jpn || '';
      meta.selected_title = selectedTitle;
      meta.filecount = String((apiMeta && apiMeta.filecount) || info.page_count || downloadedFiles || 0);
      meta.tags = (apiMeta && Array.isArray(apiMeta.tags) && apiMeta.tags.length) ? apiMeta.tags : info.tags;
      meta.downloaded_files = downloadedFiles;
      meta.filename_pattern = '001.ext';
      meta.original_only = !!originalOnly;
      meta.image_quality = originalOnly ? 'original' : 'resized';
      meta.downloaded_at = new Date().toISOString();
      return meta;
    }

    function buildEzeInfo(info, apiMeta) {
      var rawTags = (apiMeta && Array.isArray(apiMeta.tags) && apiMeta.tags.length) ? apiMeta.tags : info.tags;
      var grouped = {};
      (rawTags || []).forEach(function (raw) {
        var value = String(raw || '');
        var pos = value.indexOf(':');
        var namespace = pos > 0 ? value.slice(0, pos) : 'misc';
        var tag = pos > 0 ? value.slice(pos + 1) : value;
        if (!tag) return;
        if (!grouped[namespace]) grouped[namespace] = [];
        grouped[namespace].push(tag);
      });
      var posted = Number(apiMeta && apiMeta.posted || 0);
      return {
        gallery_info: {
          title: (apiMeta && apiMeta.title) || info.title || '',
          title_original: (apiMeta && apiMeta.title_jpn) || info.title_jpn || '',
          category: (apiMeta && apiMeta.category) || '',
          tags: grouped,
          source: {
            site: /exhentai\.org$/i.test(window.location.hostname) ? 'exhentai' : 'e-hentai',
            gid: Number(info.gid),
            token: info.token,
          },
        },
        gallery_info_full: {
          uploader: (apiMeta && apiMeta.uploader) || '',
          date_uploaded: posted ? posted * 1000 : 0,
        },
      };
    }

    function triggerZipDownload(blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 30 * 60 * 1000);
    }

    async function startGalleryDlDownload(panel, statusBox, button) {
      if (galleryDlBusy) return;
      var info = getCurrentGalleryInfo();
      if (!info) { updateGalleryDlStatus(statusBox, 'offline', t('无法下载', 'Cannot download'), t('请在图库详情页操作', 'Please use this on a gallery detail page')); return; }
      var cfg = readGalleryDlPanelConfig(panel);
      var selectedTitle = sanitizeGalleryTitle(chooseGalleryTitle(info, cfg.galleryDlTitleMode));
      var zipName = selectedTitle + '.zip';
      recordRuntimeLog('info', 'download.started', { gallery: info.url, pages: info.page_count, originalOnly: cfg.galleryDlOriginal, concurrency: cfg.galleryDlParallel });
      var tempName = '.eh-pure-' + info.gid + '-' + Date.now() + '.zip';
      var zip = null;
      var writeQueue = null;
      var cleanupTimer = null;
      var metricsTimer = null;
      var speedMeter = null;
      // Controls are created outside the try block; expose the renderer in their scope.
      var refreshMetrics = function () {};
      function stopMetricsTimer() {
        if (metricsTimer !== null) { clearInterval(metricsTimer); metricsTimer = null; }
      }
      var task = createGalleryDownloadTask();
      var controls = document.createElement('div');
      controls.className = 'eh-tb-actions eh-gdl-actions eh-gdl-task-controls';
      var pauseButton = document.createElement('button');
      pauseButton.type = 'button';
      pauseButton.className = 'eh-tb-btn eh-tb-btn-secondary';
      pauseButton.textContent = t('暂停', 'Pause');
      controls.appendChild(pauseButton);
      var cancelButton = document.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'eh-tb-btn eh-tb-btn-secondary';
      cancelButton.textContent = t('放弃并清理', 'Discard and clean up');
      controls.appendChild(cancelButton);
      var recoveryChoice = null;
      cancelButton.onclick = function () {
        recordRuntimeLog('info', 'download.discarded', { gallery: info.url });
        stopMetricsTimer();
        task.stop();
        if (recoveryChoice) recoveryChoice('discard');
      };
      pauseButton.onclick = function () {
        if (task.paused) task.resume(); else task.pause();
        if (speedMeter) {
          if (task.paused) speedMeter.suspend('pause'); else speedMeter.resume('pause');
          refreshMetrics('downloading', true);
        }
        recordRuntimeLog('info', task.paused ? 'download.paused' : 'download.resumed', { gallery: info.url });
        pauseButton.textContent = task.paused ? t('继续', 'Resume') : t('暂停', 'Pause');
        if (task.paused) updateGalleryDlStatus(statusBox, 'checking', t('已暂停', 'Paused'), t('已写入 ZIP 保留；刷新页面无法恢复', 'Written ZIP entries are retained; refreshing cannot resume this task'));
      };
      panel.appendChild(controls);
      async function chooseRecovery(failedPages) {
        if (speedMeter) { speedMeter.suspend('recovery'); refreshMetrics('downloading', true); }
        recordRuntimeLog('warn', 'download.awaiting-recovery', { failedPages: failedPages, error: fatalError });
        pauseButton.disabled = true;
        updateGalleryDlStatus(statusBox, 'offline', t('部分页面下载失败，已保留成功内容', 'Some pages failed; successful entries retained'),
          failedPages.join(', ') + (fatalError ? ' · ' + fatalError.message : '') + t(' · 可重试、导出部分 ZIP 或放弃；刷新无法恢复', ' · Retry, export partial ZIP or discard; refresh cannot resume'));
        return new Promise(function (resolve) {
          var extra = [];
          function finish(value) {
            extra.forEach(function (node) { node.remove(); });
            recoveryChoice = null; pauseButton.disabled = false;
            if (speedMeter) speedMeter.resume('recovery');
            resolve(value);
          }
          recoveryChoice = finish;
          [['retry', t('重试失败页', 'Retry failed pages')], ['export', t('导出部分 ZIP', 'Export partial ZIP')]].forEach(function (item) {
            var node = document.createElement('button'); node.textContent = item[1];
            node.type = 'button'; node.className = 'eh-tb-btn eh-tb-btn-secondary';
            node.onclick = function () { finish(item[0]); }; controls.appendChild(node); extra.push(node);
          });
        });
      }
      setGalleryDownloadBusy(true);
      updateGalleryDlPreview(panel);
      if (button) { button.disabled = true; button.textContent = t('下载中…', 'Downloading…'); }
      updateGalleryDlMetrics(statusBox, { workers: cfg.galleryDlParallel, total_pages: info.page_count || 0 }, true);
      try {
        await saveGalleryDlConfig(panel);
        updateGalleryDlStatus(statusBox, 'checking', t('正在读取元数据', 'Reading metadata'), info.url);
        var apiMeta;
        try { apiMeta = await fetchGalleryApiMetadata(info, task); }
        catch (metaError) { if (task.stopped) throw metaError; apiMeta = null; warn('[EH Downloader] metadata API failed:', metaError); }
        var totalPages = parseInt(apiMeta && apiMeta.filecount, 10) || info.page_count || 0;
        if (!totalPages) throw new Error(t('无法确定图库总页数', 'Unable to determine total gallery page count'));
        var imagePages = await collectImagePageUrls(info, totalPages, statusBox, task);
        if (imagePages.length !== totalPages) throw new Error(t('图片页数量不完整：', 'Incomplete image-page list: ') + imagePages.length + '/' + totalPages);

        // A closed/crashed tab cannot run its delayed cleanup. Reclaim only old
        // downloader files here so another tab's active download is left alone.
        await cleanupGalleryDlTempFiles(60 * 60 * 1000, tempName);
        var sink = await createZipSink(tempName);
        zip = new StreamingZipWriter(sink);
        var memoryMode = !!zipSinkFallbackReason;
        zipSinkFallbackReason = '';
        if (memoryMode) {
          // 内存模式无法流式落盘，大图库会在写入上限处停下：先把风险说清楚。
          updateGalleryDlStatus(statusBox, 'checking',
            t('内存模式（OPFS 不可用）', 'In-memory mode (OPFS unavailable)'),
            t('图片会全部缓存在标签页内存中，达到 ', 'Images are buffered in tab memory; the limit is ') +
              formatGalleryDlBytes(MEMORY_ZIP_LIMIT) + t(' 后停止写入', ' and writing stops there'));
        }
        var actualWorkers = Math.max(1, Math.min(cfg.galleryDlParallel, imagePages.length));
        var stats = { started: Date.now(), networkBytes: 0, savedBytes: 0, done: 0, total: totalPages, workers: actualWorkers };
        speedMeter = createGallerySpeedMeter();
        if (task.paused) speedMeter.suspend('pause');
        var downloadStates = imagePages.map(function () { return { nlToken: '', lastError: null, saved: false, resolved: null }; });
        var currentQueue = imagePages.map(function (_, index) { return index; });
        var queueCursor = 0;
        var roundFailures = [];
        var fatalError = null;
        writeQueue = createGalleryWriteQueue(task, { maxItems: 10, maxBytes: 64 * 1024 * 1024,
          onError: function (error) { stopMetricsTimer(); fatalError = error; } });
        async function enqueueImage(index, filename, binary) {
          var state = downloadStates[index];
          if (state.saved || state.queued) return;
          state.queued = true;
          var data = binary.data;
          var byteLength = data.byteLength;
          binary = null;
          try {
            await writeQueue.enqueue(byteLength, async function () {
              try {
                if (state.saved) return;
                await zip.add(filename, data);
                state.saved = true;
                stats.savedBytes += byteLength;
                stats.done++;
                refreshMetrics('downloading');
              } finally { state.queued = false; data = null; }
            });
          } catch (error) { state.queued = false; data = null; throw error; }
        }

        var lastMetricsUpdate = 0;
        var metricsPhase = 'downloading';
        refreshMetrics = function (status, force) {
          var now = Date.now();
          // Progress is throttled, but the one-second heartbeat ages an idle window.
          if (!force && status === 'downloading' && now - lastMetricsUpdate < 100) return;
          lastMetricsUpdate = now;
          metricsPhase = status || 'downloading';
          var rates = speedMeter.snapshot();
          updateGalleryDlMetrics(statusBox, {
            status: metricsPhase, speed_bps: rates.currentBps, average_speed_bps: rates.averageBps,
            network_bytes: stats.networkBytes,
            downloaded_bytes: stats.savedBytes, downloaded_files: stats.done,
            total_pages: stats.total, workers: stats.workers,
          }, true);
        };
        metricsTimer = setInterval(function () {
          if (task.stopped) { stopMetricsTimer(); return; }
          refreshMetrics(metricsPhase, true);
        }, 1000);

        async function worker(workerId, recoveryRound) {
          while (!fatalError && !task.stopped) {
            await galleryTaskCheckpoint(task);
            var queueIndex = queueCursor++;
            if (queueIndex >= currentQueue.length) return;
            var index = currentQueue[queueIndex];
            var pageNo = index + 1;
            try {
              var state = downloadStates[index];
              if (state.saved) continue;
              updateGalleryDlStatus(statusBox, 'checking', cfg.galleryDlOriginal ? t('正在下载原画', 'Downloading originals') : t('正在下载压缩图', 'Downloading resized images'), t('第 ', 'Page ') + pageNo + '/' + totalPages + t(' 页；刷新页面无法恢复', ' · Refresh cannot resume this task'));
              // Reuse a resolved URL for a small burst before reparsing with nl.
              if (!state.resolved) {
                state.resolved = await retryGalleryOperation(function () {
                  if (fatalError) throw fatalError;
                  return resolveDownloadImageUrl(imagePages[index], cfg.galleryDlOriginal, state.nlToken, task);
                }, GALLERY_DL_FAST_RETRIES, recoveryRound);
                if (state.resolved.nlToken) state.nlToken = state.resolved.nlToken;
              }
              var resolved = state.resolved;
              var bin = await retryGalleryOperation(async function () {
                await galleryTaskCheckpoint(task);
                if (fatalError) throw fatalError;
                var lastLoaded = 0;
                var result = await galleryBinaryRequest(resolved.url, resolved.pageUrl || imagePages[index], function (evt) {
                  // A paused request can restart transparently inside galleryTaskRequest.
                  if (evt.requestStarted) { lastLoaded = 0; return; }
                  var loaded = Number(evt.loaded || 0);
                  if (loaded > lastLoaded) {
                    var delta = loaded - lastLoaded;
                    stats.networkBytes += delta; speedMeter.addBytes(delta);
                    lastLoaded = loaded; refreshMetrics('downloading');
                  }
                }, task);
                var remainingBytes = Math.max(0, result.data.byteLength - lastLoaded);
                stats.networkBytes += remainingBytes; speedMeter.addBytes(remainingBytes);
                refreshMetrics('downloading');
                return result;
              }, 2, recoveryRound);
              var ext = imageExtension(bin.finalUrl, bin.contentType, bin.headers);
              var digits = Math.max(3, String(totalPages).length);
              var filename = String(pageNo).padStart(digits, '0') + ext;
              await enqueueImage(index, filename, bin);
              bin = null;
            } catch (e) {
              downloadStates[index].lastError = e;
              downloadStates[index].resolved = null;
              if (task.stopped) return;
              if (e && e.galleryFatal) {
                fatalError = new Error(t('第 ', 'Page ') + pageNo + t(' 页：', ': ') + e.message);
                fatalError.galleryCode = e.galleryCode;
                fatalError.galleryFatal = true;
                // Site-wide errors stop network work, but unlike a broken ZIP
                // sink they do not invalidate successfully written entries.
                task.interrupt(fatalError);
                return;
              }
              roundFailures.push(index);
            }
          }
        }

        var partialExport = false;
        while (currentQueue.length) {
          for (var recoveryRound = 0; recoveryRound < GALLERY_DL_RECOVERY_ROUNDS && currentQueue.length; recoveryRound++) {
            queueCursor = 0;
            roundFailures = [];
            var workers = [];
            for (var w = 0; w < Math.min(actualWorkers, currentQueue.length); w++) workers.push(worker(w + 1, recoveryRound));
            await Promise.allSettled(workers);
            await writeQueue.drain();
            recordRuntimeLog('debug', 'download.write-queue-drained', writeQueue.getStats());
            await galleryTaskCheckpoint(task);
            if (fatalError) {
              currentQueue = imagePages.map(function (_, index) { return index; }).filter(function (index) { return !downloadStates[index].saved; });
              currentQueue.forEach(function (index) { downloadStates[index].resolved = null; downloadStates[index].lastError = fatalError; });
              break;
            }
            if (!roundFailures.length) {
              currentQueue = [];
              break;
            }
            currentQueue = roundFailures.slice();
            if (recoveryRound < GALLERY_DL_RECOVERY_ROUNDS - 1) {
              updateGalleryDlStatus(statusBox, 'checking', t('正在恢复失败图片', 'Recovering failed images'), t('剩余 ', 'Remaining ') + currentQueue.length + t(' 页 · 刷新图片地址并换源', ' pages · refreshing image URLs and switching sources'));
              await sleepMs(galleryRetryDelay(1, recoveryRound + 1));
            }
          }
          if (currentQueue.length) {
            var failedPages = currentQueue.map(function (index) { return index + 1; });
            var choice = await chooseRecovery(failedPages);
            await galleryTaskCheckpoint(task);
            if (choice === 'retry') { fatalError = null; continue; }
            if (choice === 'export') { partialExport = true; break; }
            throw galleryTaskInterruption('cancelled');
          }
        }
        await galleryTaskCheckpoint(task);
        pauseButton.disabled = true;
        cancelButton.disabled = true;
        if (partialExport) {
          var manifest = {
            gallery_url: info.url, total_pages: totalPages, downloaded_pages: stats.done,
            refresh_resume_supported: false,
            missing_pages: currentQueue.map(function (index) {
              return { page: index + 1, image_page: imagePages[index], error: String(downloadStates[index].lastError && downloadStates[index].lastError.message || '') };
            }),
          };
          await zip.add('missing-pages.json', new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
          zipName = selectedTitle + '.partial.zip';
        }

        var metadata = buildMetadata(info, apiMeta, selectedTitle, stats.done, cfg.galleryDlOriginal);
        if (cfg.galleryDlWriteMetadata) {
          await zip.add('metadata.json', new TextEncoder().encode(JSON.stringify(metadata, null, 2)));
          await zip.add('info.json', new TextEncoder().encode(JSON.stringify(buildEzeInfo(info, apiMeta), null, 2)));
        }
        updateGalleryDlStatus(statusBox, 'checking', t('正在完成 ZIP', 'Finalizing ZIP'), zipName);
        refreshMetrics('zipping');
        var blob = await zip.finish();
        triggerZipDownload(blob, zipName);
        stopMetricsTimer();
        refreshMetrics('done');
        recordRuntimeLog('info', partialExport ? 'download.partial-exported' : 'download.completed', { filename: zipName, savedPages: stats.done, savedBytes: stats.savedBytes, memoryMode: memoryMode });
        updateGalleryDlStatus(statusBox, 'online', (partialExport ? t('部分 ZIP 已导出', 'Partial ZIP exported') : t('下载完成', 'Download complete')), zipName + ' · ' + stats.done + t(' 页 · ', ' pages · ') + formatGalleryDlBytes(stats.savedBytes) + (memoryMode ? t(' · 内存模式', ' · in-memory mode') : ''));
        // Anchor downloads expose no completion event. Keep the OPFS-backed File
        // readable while the browser copies it, then remove it after a safe grace period.
        cleanupTimer = setTimeout(async function () {
          if (zip) await zip.cleanup();
          await cleanupGalleryDlTempFiles(60 * 60 * 1000);
        }, 30 * 60 * 1000);
      } catch (e) {
        stopMetricsTimer();
        recordRuntimeLog('error', 'download.failed', { gallery: info.url, error: e });
        task.stop(e);
        // An already-started sink write cannot be cancelled safely. Drain it before abort.
        if (writeQueue) { try { await writeQueue.drain(); } catch (drainError) {} }
        if (zip) { try { await zip.abort(); } catch (abortError) {} }
        updateGalleryDlStatus(statusBox, 'offline', t('下载失败', 'Download failed'), e.message);
      } finally {
        stopMetricsTimer();
        if (speedMeter) {
          speedMeter.suspend('finished');
          recordRuntimeLog('info', 'download.speed-summary', speedMeter.snapshot());
        }
        // Failures are cleaned synchronously above. Also reclaim historical
        // leftovers on every settled task; the successful current file is
        // intentionally protected by cleanupTimer until the browser has copied it.
        if (zip && !cleanupTimer) { try { await zip.cleanup(); } catch (cleanupError) {} }
        await cleanupGalleryDlTempFiles(60 * 60 * 1000, cleanupTimer ? tempName : '');
        task.stop();
        if (writeQueue) {
          recordRuntimeLog('info', 'download.write-queue-summary', writeQueue.getStats());
          writeQueue.dispose();
        }
        controls.remove();
        setGalleryDownloadBusy(false);
        if (button) { button.disabled = false; button.textContent = t('下载当前图库', 'Download Gallery'); }
        updateGalleryDlPreview(panel);
      }
    }


    /* ================================================================
     *  Lanraragi 查重功能
     * ================================================================ */

    var CACHE_DURATION = 3 * LRR_CACHE_EXPIRE;
    var CLEANUP_INTERVAL = 7 * LRR_CACHE_EXPIRE;
    var MAX_CACHE_ITEMS = 2000;
    var MUTATION_DEBOUNCE_MS = 400;

    var seenGalleryUrls = new Set();
    var altSearchInflight = new Map();
    var knownLrrTitleAliases = new Map();
    var galleriesToCheck = [];
    var lrrScanGeneration = 0; // 每次手动重扫递增，旧请求结果自动作废

    function simpleHash(str) {
      var h = 0;
      for (var i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
      return (h >>> 0).toString(16);
    }

    function createPool(limit) {
      var active = 0, queue = [];
      function currentLimit() {
        return Math.max(1, parseInt(typeof limit === 'function' ? limit() : limit, 10) || 1);
      }
      function start(item) {
        active++;
        // Defer invocation too: a synchronous throw must release its slot.
        Promise.resolve().then(item.fn).then(function (value) {
          active--; item.resolve(value); runNext();
        }, function (error) {
          active--; item.reject(error); runNext();
        });
      }
      function runNext() {
        while (queue.length && active < currentLimit()) start(queue.shift());
      }
      return function run(fn) {
        return new Promise(function (resolve, reject) { queue.push({ fn: fn, resolve: resolve, reject: reject }); runNext(); });
      };
    }

    var runAltSearchLimited;
    var runLrrCheckLimited;
    function ensureLrrRequestPools() {
      // Never replace a limiter on rescan: old in-flight work still owns its slots.
      if (!runLrrCheckLimited) runLrrCheckLimited = createPool(function () { return CONFIG.lrrConcurrency; });
      if (!runAltSearchLimited) runAltSearchLimited = createPool(function () { return CONFIG.altSearchConcurrency; });
    }

    function getCache(key) {
      var cached = localStorage.getItem(key);
      if (cached) {
        try {
          var parsed = JSON.parse(cached);
          var ttl = (parsed.data && (parsed.data.altHit === false || parsed.data.altKind === 'possible' || parsed.data.miss === true)) || /^lrr-checker-v\d+-raw-/.test(key)
            ? LRR_NEGATIVE_CACHE_EXPIRE : CACHE_DURATION;
          if (parsed.timestamp && (Date.now() - parsed.timestamp) < ttl) return parsed.data;
        } catch (e) { localStorage.removeItem(key); }
      }
      return null;
    }

    function setCache(key, data) {
      var item = { timestamp: Date.now(), data: minimizeCacheData(data) };
      try { localStorage.setItem(key, JSON.stringify(item)); }
      catch (e) {
        if (isQuotaExceeded(e)) {
          cleanupExpiredCache();
          try { localStorage.setItem(key, JSON.stringify(item)); return; }
          catch (e2) {
            purgeOldest(25);
            try { localStorage.setItem(key, JSON.stringify(item)); } catch (e3) {}
          }
        }
      }
    }

    function minimizeCacheData(original) {
      try {
        if (typeof original === 'object' && original && typeof original.altHit === 'boolean') {
          var altOut = { altHit: original.altHit };
          if (original.altHits) altOut.altHits = original.altHits;
          if (original.altKind) altOut.altKind = original.altKind;
          return altOut;
        }
        var out = {};
        if (typeof original === 'object' && original) {
          // miss 标记让 getCache 用负缓存 TTL（5 分钟），避免未命中结论挂 30 分钟。
          if (original.miss === true) out.miss = true;
          if ('success' in original) out.success = original.success;
          if (original.error) out.error = original.error;
          if (original.matchType) out.matchType = original.matchType;
          if (original.matchedUrl) out.matchedUrl = original.matchedUrl;
          if (original.data) {
            out.data = {};
            var d = Array.isArray(original.data) ? original.data[0] : original.data;
            if (!d || typeof d !== 'object') return out;
            if (d.id !== undefined) out.data.id = d.id;
            if (d.arcid !== undefined) out.data.arcid = d.arcid;
            if (d.title) out.data.title = d.title;
            if (d.tags) out.data.tags = d.tags;
            if (d.pagecount !== undefined) out.data.pagecount = d.pagecount;
            if (d.filesize !== undefined) out.data.filesize = d.filesize;
            else if (d.size !== undefined) out.data.filesize = d.size;
          }
        }
        return out;
      } catch (_) { return original; }
    }

    function isQuotaExceeded(e) { return e && (e.name === 'QuotaExceededError' || e.code === 22); }

    function listCacheEntries() {
      var entries = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.startsWith('lrr-checker-')) {
          try { var parsed = JSON.parse(localStorage.getItem(key)); entries.push({ key: key, timestamp: parsed.timestamp || 0 }); }
          catch (_) { entries.push({ key: key, timestamp: 0 }); }
        }
      }
      return entries;
    }

    function purgeOldest(count) {
      var entries = listCacheEntries().sort(function (a, b) { return a.timestamp - b.timestamp; });
      for (var i = 0; i < entries.length && i < count; i++) localStorage.removeItem(entries[i].key);
    }


    // 清空全部LRR查重缓存
    function clearLrrCache(showMessage) {
      var count = 0;
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var key = localStorage.key(i);
        if (key && key.indexOf('lrr-checker-') === 0) {
          localStorage.removeItem(key);
          count++;
        }
      }
      localStorage.removeItem('lrr-cache-last-cleanup');
      if (showMessage !== false) alert('LRR缓存已清理，共删除 ' + count + ' 项。');
      return count;
    }

    // 从当前页面标题生成备用搜索缓存Key
    function getAltCacheKeyFromTitle(titleElement) {
      if (!titleElement) return null;
      var fullTitle = getGalleryTitlePlain(titleElement);
      var authorRegex = /\[((?!汉化|漢化|DL版|中国翻訳)[^\]]+)\]/;
      var authorMatch = fullTitle.match(authorRegex);
      var author = authorMatch ? authorMatch[1] : null;
      var titleRegex = /\]([^\[\]\(\)]+)/;
      var titleMatch = fullTitle.match(titleRegex);
      var title = titleMatch ? titleMatch[1].trim() : null;
      if (!author || !title || author === title) return null;
      return 'lrr-checker-v2-alt-' + simpleHash(author + ',' + title);
    }

    // URL 精确结果必须按 LRR 服务器隔离：换服务器后旧结论会指向另一个库。
    // 函数声明会被提升，列表扫描处（collectGalleriesFromDom）可直接调用。
    function getUrlCacheKey(galleryUrl) {
      return 'lrr-checker-v9-' + simpleHash(String(CONFIG.lrrServerUrl || '') + (CONFIG.lrrApiKey ? '|auth:' + CONFIG.lrrApiKey : '')) + '-' + galleryUrl;
    }

    // 只清当前页面涉及的LRR缓存
    function clearCurrentPageLrrCache() {
      var removed = 0;
      var entries = collectLrrGalleryEntries();
      entries.forEach(function (entry) {
        var exactKey = getUrlCacheKey(entry.galleryUrl);
        if (localStorage.getItem(exactKey) !== null) {
          localStorage.removeItem(exactKey);
          removed++;
        }
        var fullTitle = getGalleryTitlePlain(entry.titleElement);
        var parts = extractLooseTitleParts(fullTitle);
        var altKeys = [
          getAltCacheKeyFromTitle(entry.titleElement),
          'lrr-checker-v5-alt-strict-' + simpleHash(fullTitle + '|' + parts.author + ',' + parts.shortTitle),
          'lrr-checker-v5-loose-' + simpleHash(fullTitle + '|' + parts.shortTitle),
          getTitleSearchCacheKey('alt-strict', fullTitle + '|' + parts.author + ',' + parts.shortTitle),
          getTitleSearchCacheKey('loose', fullTitle + '|' + parts.shortTitle)
        ].concat([parts.author + ',' + parts.shortTitle].concat(buildLooseSearchQueries(parts.shortTitle))
          .map(function (query) { return getTitleSearchCacheKey('raw', query); }));
        altKeys.forEach(function (altKey) {
          if (altKey && localStorage.getItem(altKey) !== null) {
            localStorage.removeItem(altKey);
            removed++;
          }
        });
      });
      return removed;
    }

    // 无需刷新浏览器，立即重新查当前列表
    function rescanCurrentPage(clearPageCache) {
      lrrScanGeneration++;
      if (clearPageCache !== false) clearCurrentPageLrrCache();
      // 手动重扫相当于重新开始：允许再次汇总失败提示，并重置重试预算。
      lrrLookupFailureCount = 0;
      lrrLastFailureNoticeAt = 0;
      lrrLookupRetries.clear();

      document.querySelectorAll('.lrr-marker-span').forEach(function (el) { el.remove(); });
      seenGalleryUrls.clear();
      altSearchInflight.clear();
      knownLrrTitleAliases.clear();
      galleriesToCheck.length = 0;
      ensureLrrRequestPools();

      collectGalleriesFromDom();
      flushPendingRequests();
    }

    // LRR /api/info：在线状态、版本、归档数量
    async function fetchLrrServerInfo() {
      var headers = {};
      if (CONFIG.lrrApiKey) headers['Authorization'] = getAuthorizationHeaderValue(CONFIG.lrrApiKey);
      var response = await makeRequest({
        method: 'GET',
        url: CONFIG.lrrServerUrl + '/api/info',
        headers: headers,
        timeout: Math.min(CONFIG.requestTimeoutMs, 15000)
      });
      var body = (response.responseText || '').trim();
      if (!body) throw new Error('LRR /api/info 返回为空');
      return JSON.parse(body);
    }

    function updateLrrStatus(statusBox, state, message, detail) {
      if (!statusBox) return;
      statusBox.classList.remove('online', 'offline', 'checking');
      statusBox.classList.add(state);
      var main = statusBox.querySelector('.eh-tb-status-main');
      var sub = statusBox.querySelector('.eh-tb-status-detail');
      if (main) main.textContent = message || '';
      if (sub) sub.textContent = detail || '';
    }

    var lrrLookupFailureCount = 0;
    var lrrLastFailureNoticeAt = 0;
    // 失败条目最多自动重试两次；LRR 长时间不可用时不至于每轮扫描都重发整页请求。
    var lrrLookupRetries = new Map();

    // 查重失败只在面板状态里汇总，绝不给单个图库贴红标：
    // 「不在库里」本来就该什么都没有。失败条目会从本页已处理集合移除，下一轮扫描自动重试。
    function noticeLrrLookupFailure(error) {
      lrrLookupFailureCount++;
      var box = typeof document !== 'undefined' && document.getElementById
        ? document.getElementById('eh-tb-lrr-status') : null;
      if (!box) return;
      var now = Date.now();
      if (now - lrrLastFailureNoticeAt < 5000) return;
      lrrLastFailureNoticeAt = now;
      var reason = error && error.message ? String(error.message) : String(error || '');
      updateLrrStatus(box, 'offline',
        t('LRR：查重请求失败（未命中的条目不做标记）', 'LRR: lookup requests failed (unmatched rows stay unmarked)'),
        reason.slice(0, 160) + ' · ' + t('失败 ', 'failed ') + lrrLookupFailureCount + t(' 条', ' lookups'));
    }

    async function testLrrConnection(statusBox, button) {
      if (!CONFIG.lrrServerUrl) {
        updateLrrStatus(statusBox, 'offline', t('LRR：未配置', 'LRR: Not configured'), t('请先填写 LANraragi 服务器地址', 'Please enter the LANraragi server address first'));
        return null;
      }
      if (button) {
        button.disabled = true;
        button.textContent = t('检测中...', 'Checking...');
      }
      updateLrrStatus(statusBox, 'checking', t('LRR：检测中…', 'LRR: Checking…'), t('正在请求 ', 'Requesting ') + CONFIG.lrrServerUrl + '/api/info');
      try {
        var info = await fetchLrrServerInfo();
        var version = info.version || '未知版本';
        var total = info.total_archives;
        var totalText = (total === 0 || total) ? String(total) : '未知';
        updateLrrStatus(
          statusBox,
          'online',
          'LRR：在线',
          '版本 ' + version + ' · 归档 ' + totalText + ' 本'
        );
        return info;
      } catch (e) {
        var reason = e && e.message ? e.message : String(e);
        updateLrrStatus(statusBox, 'offline', 'LRR：连接失败', reason);
        runtimeConsole('error', '[LRR Checker] Connection test failed:', e);
        return null;
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = t('测试LRR连接', 'Test LRR connection');
        }
      }
    }

    var lrrRescanPollTimer = null;

    function stopLrrRescanPolling() {
      if (lrrRescanPollTimer) {
        clearInterval(lrrRescanPollTimer);
        lrrRescanPollTimer = null;
      }
    }

    // LANraragi 没有重扫进度接口，这里用 /api/info 的归档数做启发式判断：
    // 数量连续几次不变，就认为索引已经稳定。
    function watchLrrRescanProgress(statusBox) {
      stopLrrRescanPolling();
      var startedAt = Date.now();
      var lastTotal = null;
      var stableSamples = 0;
      var failures = 0;
      var busy = false;
      var SETTLE_SAMPLES = 3;
      var MAX_POLL_MS = 5 * 60 * 1000;
      lrrRescanPollTimer = setInterval(async function () {
        if (!statusBox || statusBox.isConnected === false) { stopLrrRescanPolling(); return; }
        if (Date.now() - startedAt > MAX_POLL_MS) {
          stopLrrRescanPolling();
          updateLrrStatus(statusBox, 'checking',
            t('LRR：重扫仍在后台进行', 'LRR: rescan still running in the background'),
            t('已等待超过 5 分钟，请直接到 LANraragi 查看索引状态', 'Waited over 5 minutes; check the index status in LANraragi'));
          return;
        }
        if (busy) return;
        busy = true;
        var info = null;
        try { info = await fetchLrrServerInfo(); failures = 0; }
        catch (e) { failures++; busy = false; if (failures >= 3) stopLrrRescanPolling(); return; }
        busy = false;
        var total = info && info.total_archives !== undefined ? Number(info.total_archives) : null;
        if (total === null || !isFinite(total)) return;
        if (total === lastTotal) stableSamples++;
        else { lastTotal = total; stableSamples = 0; }
        var elapsed = Math.round((Date.now() - startedAt) / 1000);
        if (stableSamples >= SETTLE_SAMPLES && elapsed >= 15) {
          stopLrrRescanPolling();
          updateLrrStatus(statusBox, 'online',
            t('LRR：重扫已完成', 'LRR: rescan finished'),
            t('索引归档 ', 'Indexed archives: ') + total + t(' 本 · 用时约 ', ' · took about ') + elapsed
              + t(' 秒 · 可点「重新扫描当前页」刷新本页标记', 's · click "Rescan current page" to refresh markers on this page'));
          return;
        }
        updateLrrStatus(statusBox, 'checking',
          t('LRR：正在重扫档案文件夹…', 'LRR: rescanning the archive folder…'),
          t('索引归档 ', 'Indexed archives: ') + total + t(' 本 · 已等待 ', ' · elapsed ') + elapsed + t(' 秒', 's'));
      }, 3000);
    }

    async function triggerLrrContentRescan(statusBox, button) {
      if (button) {
        button.disabled = true;
        button.textContent = t('正在触发重扫...', 'Starting rescan...');
      }
      stopLrrRescanPolling();
      updateLrrStatus(
        statusBox,
        'checking',
        t('LRR：正在触发档案目录重扫…', 'LRR: Starting archive-folder rescan…'),
        CONFIG.lrrServerUrl + '/api/shinobu/rescan'
      );
      try {
        var result = await requestLrrContentRescan();
        var pidDetail = result.new_pid
          ? t('Shinobu 已重启，新进程 PID：', 'Shinobu restarted; new process PID: ') + result.new_pid
          : t('Shinobu 已重启，服务器将在后台重新扫描', 'Shinobu restarted; the server will rescan in the background');
        updateLrrStatus(
          statusBox,
          'online',
          t('LRR：已触发档案目录重扫', 'LRR: Archive-folder rescan started'),
          pidDetail
        );
        if (statusBox) watchLrrRescanProgress(statusBox);
        return result;
      } catch (e) {
        var reason = e && e.message ? e.message : String(e);
        updateLrrStatus(statusBox, 'offline', t('LRR：触发重扫失败', 'LRR: Failed to start rescan'), reason);
        runtimeConsole('error', '[LRR Checker] Content-folder rescan failed:', e);
        return null;
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = t('重新扫描档案文件夹', 'Rescan archive folder');
        }
      }
    }

    function cleanupExpiredCache() {
      var lastCleanup = localStorage.getItem('lrr-cache-last-cleanup');
      var currentTime = Date.now();
      if (!lastCleanup || (currentTime - parseInt(lastCleanup, 10)) > CLEANUP_INTERVAL) {
        for (var i = 0; i < localStorage.length; i++) {
          var key = localStorage.key(i);
          if (key && key.startsWith('lrr-checker-')) {
            try {
              var cacheData = JSON.parse(localStorage.getItem(key));
              if (currentTime - cacheData.timestamp > CACHE_DURATION) { localStorage.removeItem(key); i--; }
            } catch (e) {}
          }
        }
        localStorage.setItem('lrr-cache-last-cleanup', currentTime.toString());
      }
    }

    // --- LRR 标记 ---

    function getGalleryTitlePlain(titleElement) {
      var clone = titleElement.cloneNode(true);
      clone.querySelectorAll('.eh-gallery-markers, .lrr-marker-span, .eh-uncensored-marker').forEach(function (el) { el.remove(); });
      return clone.textContent.replace(/\s+/g, ' ').trim();
    }

    // Thumbnail 模式将标签放到封面角标层，避免占用标题宽度；其它列表模式仍放在标题前。
    function getLrrMarkerScope(titleElement) {
      if (!titleElement) return null;
      if (titleElement.matches && titleElement.matches('.gl4t.glname')) {
        var item = titleElement.closest('.gl1t');
        if (item) return item;
      }
      return titleElement;
    }

    function hasLrrMarker(titleElement, confirmedOnly) {
      var scope = getLrrMarkerScope(titleElement);
      var marker = scope && scope.querySelector('.lrr-marker-span');
      return !!marker && (!confirmedOnly || marker.classList.contains('lrr-marker-downloaded') || marker.classList.contains('lrr-marker-file'));
    }

    function formatLrrSize(bytes) {
      if (!bytes) return '';
      if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
      return bytes + ' B';
    }

    function openLrrSearch(keyword) {
      if (!keyword || !CONFIG.lrrServerUrl) return;
      var url = CONFIG.lrrServerUrl + '/search?filter=' + encodeURIComponent(keyword);
      window.open(url, '_blank', 'noopener');
    }

    // 徽标点击优先直接打开库内归档的介绍页（LANraragi /reader?id=）。
    function openLrrArchive(archiveId) {
      if (!CONFIG.lrrServerUrl || !archiveId) return false;
      window.open(CONFIG.lrrServerUrl + '/reader?id=' + encodeURIComponent(String(archiveId)), '_blank', 'noopener');
      return true;
    }

    // 页数只作弱证据提示，绝不参与「是否存在」的判定：
    // 归档常被删掉汉化组页与尾部广告页，与本站页数不同是正常现象。
    var sitePageCounts = new Map();

    function galleryKeyForElement(element) {
      if (!element || !element.closest) return '';
      var container = element.closest('.gl1t, tr, .gl1e, .gl1c, .gl1m, .gl2c, .gl2m, .gl3c, .gl3m');
      var link = container && container.querySelector('a[href*="/g/"]');
      var identity = link ? extractGalleryIdentity(link.href) : null;
      return identity ? identity.gid + '/' + identity.token : '';
    }

    // 容忍几页差异：删 1-2 张汉化组页 + 1-2 张广告页很常见，按约 12%（至少 4 页）放宽。
    function pageCountTolerance(sitePages) {
      return Math.max(4, Math.round((Number(sitePages) || 0) * 0.12));
    }

    function describePageCount(sourcePages, candidatePages) {
      var sitePages = parseInt(sourcePages, 10) || 0;
      var libraryPages = parseInt(candidatePages, 10) || 0;
      if (!libraryPages) return '';
      var isEnglish = CONFIG.uiLanguage === 'en';
      if (!sitePages) return (isEnglish ? 'Library pages: ' : '库内页数：') + libraryPages;
      var diff = Math.abs(sitePages - libraryPages);
      var head = (isEnglish ? 'Pages: site ' : '页数：本站 ') + sitePages
        + (isEnglish ? ' / library ' : ' / 库内 ') + libraryPages;
      if (!diff) return head + (isEnglish ? ' (identical)' : '（一致）');
      if (diff <= pageCountTolerance(sitePages)) {
        return head + (isEnglish
          ? ' (differs by ' + diff + '; likely removed credit/ad pages, still the same work)'
          : '（差 ' + diff + ' 页，可能已删汉化组页或广告页，仍视为同一作品）');
      }
      return head + (isEnglish
        ? ' (differs by ' + diff + '; likely a different edition, please verify)'
        : '（差 ' + diff + ' 页，差异较大，可能是不同版本，建议核对）');
    }

    function applyMarkerTitle(marker, titleElement) {
      if (!marker) return;
      var base = marker.dataset.ehBaseTitle || '';
      var libraryPages = Number(marker.dataset.ehLibraryPages || 0);
      var key = galleryKeyForElement(titleElement || marker);
      var pageLine = libraryPages ? describePageCount(key ? sitePageCounts.get(key) : 0, libraryPages) : '';
      var hint = marker.dataset.ehArchiveId
        ? t('点击打开库内归档介绍页', 'Click to open the archive page in your library')
        : t('点击在 LANraragi 中搜索', 'Click to search in LANraragi');
      marker.title = base + (pageLine ? '\n' + pageLine : '') + '\n' + hint;
    }

    // gdata 到达后补上页数提示；徽标本身不重建，避免打断点击。
    function refreshLrrPageHints() {
      document.querySelectorAll('.lrr-marker-span').forEach(function (marker) {
        if (marker.dataset.ehBaseTitle) applyMarkerTitle(marker);
      });
    }

    // ✔=源链接命中，≈=高相似标题，?=疑似已有，!=请求失败。
    function prependLrrMarker(titleElement, text, classNames, matchType, hits, galleryUrl, searchQuery) {
      if (!titleElement || !titleElement.isConnected) return;
      hits = hits || [];

      // 页面重绘/重复补扫时只保留一个标签。Thumbnail 模式的标签可能位于封面层。
      var markerScope = getLrrMarkerScope(titleElement) || titleElement;
      markerScope.querySelectorAll('.lrr-marker-span').forEach(function (el) { el.remove(); });

      var markerSpan = document.createElement('span');
      markerSpan.classList.add('lrr-marker-span');
      (classNames || []).forEach(function (c) { markerSpan.classList.add(c); });
      markerSpan.textContent = text;
      markerSpan.dataset.lrrScore = String(hits[0] && hits[0].similarity || 0);
      var explanation = matchType === 'possible'
        ? t('库中可能已有，请核对候选作品', 'Possibly in your library; check the candidate')
        : matchType === 'urlfinder' ? t('库中已存在：源链接匹配', 'In your library: matching source URL')
        : t('库中存在高度相似的标题，请核对版本', 'A highly similar title exists; check the edition');
      if (hits[0] && hits[0].possibleReason) explanation += '\n' + getPossibleMatchReason(hits[0].possibleReason);
      if (hits[0] && hits[0].title) explanation += '\n' + t('候选：', 'Candidate: ') + String(hits[0].title).slice(0, 240);
      // 页数提示延迟到 applyMarkerTitle 生成，gdata 页数稍后到达时可以刷新。
      markerSpan.dataset.ehBaseTitle = explanation;
      markerSpan.dataset.ehLibraryPages = String(hits[0] && hits[0].pagecount || 0);

      var hitId = hits[0] && hits[0].id ? String(hits[0].id) : '';
      markerSpan.dataset.ehArchiveId = hitId;

      var keyword = '';
      if (matchType === 'alt' && searchQuery) keyword = searchQuery;
      else if (hits.length && hits[0] && hits[0].title) keyword = String(hits[0].title).trim();
      if (!keyword) keyword = getGalleryTitlePlain(titleElement);
      if (!keyword) keyword = searchQuery || galleryUrl || '';

      function stopEvent(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }
      markerSpan.addEventListener('mousedown', function (e) { e.stopPropagation(); }, true);
      markerSpan.addEventListener('mouseup', function (e) { e.stopPropagation(); }, true);
      markerSpan.addEventListener('click', function (e) {
        stopEvent(e);
        // 命中/疑似候选都带着库内归档 ID：直接打开它的介绍页，比再搜一次更省事。
        if (hitId && openLrrArchive(hitId)) return;
        openLrrSearch(keyword);
      }, true);

      var group = getGalleryMarkerGroup(titleElement);
      group.insertBefore(markerSpan, group.firstChild);
      applyMarkerTitle(markerSpan, titleElement);
    }

    // Shared row keeps duplicate and uncensored badges side by side in every list mode.
    function getGalleryMarkerGroup(titleElement) {
      var scope = getLrrMarkerScope(titleElement) || titleElement;
      var group = scope.querySelector('.eh-gallery-markers');
      if (group) return group;
      group = document.createElement('span');
      group.className = 'eh-gallery-markers';
      var item = titleElement.matches('.gl4t.glname') ? titleElement.closest('.gl1t') : null;
      var host = item ? item.querySelector('.gl3t') : null;
      if (host) {
        host.classList.add('eh-lrr-marker-host');
        group.classList.add('eh-gallery-markers-thumbnail');
        host.appendChild(group);
      } else {
        titleElement.insertBefore(group, titleElement.firstChild);
      }
      return group;
    }

    function hasUncensoredTag(tags) {
      return Array.isArray(tags) && tags.some(function (tag) {
        return /^(?:misc:|other:)?uncensored$/i.test(String(tag).trim());
      });
    }

    function renderUncensoredLabel(titleElement, enabled) {
      if (!titleElement || !titleElement.isConnected) return;
      var scope = getLrrMarkerScope(titleElement) || titleElement;
      var marker = scope.querySelector('.eh-uncensored-marker');
      if (!enabled) { if (marker) marker.remove(); return; }
      if (marker) return;
      marker = document.createElement('span');
      marker.className = 'eh-uncensored-marker';
      marker.textContent = t('无修正', 'Uncensored');
      marker.title = 'uncensored';
      getGalleryMarkerGroup(titleElement).appendChild(marker);
    }

    var uncensoredTagCache = new Map();
    var uncensoredScanBusy = false;
    var uncensoredScanTimer = null;

    async function scanUncensoredLabels() {
      if (!CONFIG.enableUncensoredLabel || uncensoredScanBusy) return;
      var entries = collectLrrGalleryEntries();
      var pending = [];
      entries.forEach(function (entry) {
        var cached = uncensoredTagCache.get(entry.key);
        if (cached && cached.expires > Date.now()) {
          renderUncensoredLabel(entry.titleElement, cached.value);
        } else pending.push(entry);
      });
      if (!pending.length) return;
      uncensoredScanBusy = true;
      try {
        // Batch metadata requests so thumbnail lists do not require one request per gallery.
        for (var i = 0; i < pending.length; i += 25) {
          var batch = pending.slice(i, i + 25);
          try {
            var apiUrl = /exhentai\.org$/i.test(window.location.hostname) ? 'https://exhentai.org/api.php' : 'https://api.e-hentai.org/api.php';
            var body = JSON.stringify({ method: 'gdata', gidlist: batch.map(function (entry) {
              var identity = extractGalleryIdentity(entry.galleryUrl);
              return [Number(identity.gid), identity.token];
            }), namespace: 1 });
            var response = await galleryTextRequest(apiUrl, 'POST', body, { 'Content-Type': 'application/json' }, 30000);
            var metadata = JSON.parse(response.text || '{}').gmetadata;
            if (!Array.isArray(metadata)) throw new Error('Missing gallery metadata');
            var metadataByGid = new Map();
            metadata.forEach(function (value) { if (value) metadataByGid.set(String(value.gid), value); });
            batch.forEach(function (entry) {
              var identity = extractGalleryIdentity(entry.galleryUrl);
              var meta = metadataByGid.get(String(identity.gid));
              if (!meta || !Array.isArray(meta.tags)) {
                uncensoredTagCache.set(entry.key, { value: false, expires: Date.now() + 60000 });
                return;
              }
              // 同时记下站点页数，供查重徽标的页数提示使用（仅提示，不参与判定）。
              sitePageCounts.set(entry.key, parseInt(meta.filecount, 10) || 0);
              var value = hasUncensoredTag(meta.tags);
              uncensoredTagCache.set(entry.key, { value: value, expires: Date.now() + 5 * 60 * 1000 });
              renderUncensoredLabel(entry.titleElement, value);
            });
            refreshLrrPageHints();
          } catch (e) {
            batch.forEach(function (entry) { uncensoredTagCache.set(entry.key, { value: false, expires: Date.now() + 60000 }); });
            warn('[EH Uncensored] metadata request failed:', e);
          }
        }
      } finally {
        uncensoredScanBusy = false;
        // Restore markers if the list was replaced while metadata was being fetched.
        scheduleUncensoredScan();
      }
    }

    function scheduleUncensoredScan() {
      if (!CONFIG.enableUncensoredLabel) return;
      if (uncensoredScanTimer) clearTimeout(uncensoredScanTimer);
      uncensoredScanTimer = setTimeout(function () {
        uncensoredScanTimer = null;
        scanUncensoredLabels().catch(function (e) { warn('[EH Uncensored]', e); });
      }, 300);
    }

    function setupUncensoredLabels() {
      if (!CONFIG.enableUncensoredLabel) return;
      scheduleUncensoredScan();
      setupGalleryListObserver();
      window.addEventListener('pageshow', scheduleUncensoredScan, false);
    }


    function getAuthorizationHeaderValue(apiKey) {
      if (!apiKey) return '';
      // LANraragi 要求 Bearer 后放置 base64(api_key)。兼容非 ASCII Key。
      try { return 'Bearer ' + btoa(unescape(encodeURIComponent(apiKey))); }
      catch (_) { return 'Bearer ' + btoa(apiKey); }
    }

    async function requestLrrContentRescan() {
      if (!CONFIG.lrrServerUrl)
        throw new Error(t('请先配置 LANraragi 服务器地址', 'Configure the LANraragi server address first'));

      // 有 Key 就带上；LANraragi 在未启用密码时允许匿名 API，不必强行要求填写。
      var headers = {};
      if (CONFIG.lrrApiKey) headers.Authorization = getAuthorizationHeaderValue(CONFIG.lrrApiKey);

      // 自己接管状态码，才能把 LANraragi 返回的 JSON 错误信息读出来。
      var response = await makeRequest({
        method: 'POST',
        url: CONFIG.lrrServerUrl + '/api/shinobu/rescan',
        headers: headers,
        validateStatus: function () { return true; }
      });

      var status = Number(response.status) || 0;
      var body = (response.responseText || '').trim();
      var parsed = null;
      if (body) { try { parsed = JSON.parse(body); } catch (_) { parsed = null; } }
      // 只取结构化错误字段；success:0 的响应没有 error 时不能用整段 JSON 当文案。
      var payloadMessage = parsed && (parsed.error || parsed.message || parsed.successMessage)
        ? String(parsed.error || parsed.message || parsed.successMessage).trim()
        : '';
      var httpMessage = payloadMessage || body.slice(0, 200);

      if (status === 401 || status === 403) {
        throw new Error(t('API Key 不正确或无权限', 'API key is incorrect or lacks permission')
          + (CONFIG.lrrApiKey ? '' : t('（当前未填写 API Key）', ' (no API key configured)'))
          + ' · HTTP ' + status);
      }
      if (status === 404) {
        throw new Error(t('接口不存在，请检查服务器地址与子路径', 'Endpoint not found; check the server address and path prefix')
          + ' · HTTP 404');
      }
      if (status >= 400) {
        throw new Error(t('LANraragi 拒绝请求', 'LANraragi rejected the request') + ' · HTTP ' + status
          + (httpMessage ? ' · ' + httpMessage : ''));
      }
      if (!body) throw new Error(t('LRR 重扫接口返回为空', 'The LRR rescan endpoint returned an empty response'));

      var result = parsed;
      if (!result) throw new Error(t('LRR 重扫接口返回了无效 JSON', 'The LRR rescan endpoint returned invalid JSON'));
      if (result.success !== 1 && result.success !== '1') {
        throw new Error((payloadMessage ? payloadMessage + ' · ' : '')
          + t('LANraragi 未确认重扫成功', 'LANraragi did not confirm a successful rescan'));
      }
      return result;
    }

    function extractUrlfinderHit(result) {
      if (!result || !result.data) return null;
      var data = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!data || typeof data !== 'object') return null;
      var id = data.id || data.arcid || '';
      if (id === undefined || id === null || id === '') return null;
      return {
        id: String(id),
        title: data.title || '',
        tags: data.tags || '',
        pagecount: data.pagecount || 0,
        filesize: data.filesize || data.size || 0
      };
    }

    function isUrlfinderHit(result) {
      // URLFinder 的 success 代表插件结果；同时要求返回归档 ID，避免空 data 被误标为已下载。
      return !!extractUrlfinderHit(result);
    }

    // 插件明确报错时不能当成「库里没有」，否则故障会被写进未命中缓存。
    function urlfinderReportedFailure(result) {
      if (!result || typeof result !== 'object') return false;
      // 只有插件明确带错误信息才算失败。success:0 也可能表示「没有命中」，
      // 拿它当失败会让所有不在库里的图库都被当成异常。
      return typeof result.error === 'string' && result.error.trim() !== '';
    }

    function delay(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    }

    function makeRequest(options) {
      return new Promise(function (resolve, reject) {
        var reqOpts = {
          method: options.method,
          url: options.url,
          headers: options.headers || {},
          timeout: options.timeout != null ? options.timeout : CONFIG.requestTimeoutMs,
          onload: function (response) {
            var ok = typeof options.validateStatus === 'function'
              ? options.validateStatus(response.status)
              : (response.status >= 200 && response.status < 300);
            if (!ok) {
              var detail = (response.responseText || '').trim().replace(/\s+/g, ' ').slice(0, 300);
              var message = 'HTTP ' + response.status + ' ' + (response.statusText || '');
              if (detail) message += ' - ' + detail;
              recordRuntimeLog('warn', 'request.http-failed', { method: options.method, url: options.url, status: response.status });
              reject(new Error(message));
              return;
            }
            resolve(response);
          },
          onerror: function (err) { recordRuntimeLog('warn', 'request.network-failed', { url: options.url }); reject(err || new Error('Network error')); },
          ontimeout: function () { recordRuntimeLog('warn', 'request.timeout', { url: options.url }); reject(new Error('Request timeout')); },
          onabort: function () { recordRuntimeLog('info', 'request.aborted', { url: options.url }); reject(new Error('Request aborted')); }
        };
        if (typeof GM_xmlhttpRequest !== 'undefined') GM_xmlhttpRequest(reqOpts);
        else if (typeof GM !== 'undefined' && GM.xmlHttpRequest) GM.xmlHttpRequest(reqOpts);
        else reject(new Error('GM_xmlhttpRequest not available'));
      });
    }


    // LRR URL归一化：解决 e-hentai / exhentai 地址不一致导致无法精确匹配

    // 提取 E-Hentai 核心 ID
    function extractGalleryIdentity(url) {
      try {
        var u = new URL(url);
        var m = u.pathname.match(/^\/g\/(\d+)\/([^\/]+)/);
        if (!m) return null;
        return {
          gid: m[1],
          token: m[2]
        };
      } catch (e) {
        return null;
      }
    }

    function normalizeGalleryUrls(url) {
      var list = [];
      try {
        var u = new URL(url);
        var path = u.pathname;
        if (!path.match(/^\/g\/\d+\//)) return [url];

        var hosts = ['exhentai.org', 'e-hentai.org'];
        hosts.forEach(function (host) {
          list.push(u.protocol + '//' + host + path);
        });

        list.push(u.origin + path);
      } catch (e) {
        list.push(url);
      }

      return Array.from(new Set(list));
    }

    // LRR persistent library index — complete snapshots only; never stored in page localStorage.
    var LRR_INDEX_INTERVAL = 30 * 60 * 1000;
    var lrrLibraryIndex = { scope: '', snapshot: null, sourceMap: new Map(), grams: new Map(), titleKeys: new Map(),
      loading: null, syncing: null, timer: null, failures: 0, status: '', nextAttempt: 0 };

    async function getLrrIndexScope() {
      var material = String(CONFIG.lrrServerUrl || '').replace(/\/+$/, '') + '\n' + String(CONFIG.lrrApiKey || '');
      if (!globalThis.crypto || !globalThis.crypto.subtle) throw new Error('Secure index scope hashing unavailable');
      var hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
      return Array.from(new Uint8Array(hash)).map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
    }

    function validateLrrIndexSnapshot(snapshot, scope) {
      if (!snapshot || snapshot.version !== 1 || snapshot.scope !== scope || snapshot.complete !== true ||
          !Number.isFinite(snapshot.updatedAt) || snapshot.updatedAt <= 0 || snapshot.updatedAt > Date.now() + 60000 || !Array.isArray(snapshot.archives) ||
          snapshot.count !== snapshot.archives.length) return false;
      var ids = new Set();
      return snapshot.archives.every(function (item) {
        if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
            typeof item.title !== 'string' || typeof item.tags !== 'string') return false;
        ids.add(item.id); return true;
      });
    }

    function buildLrrIndexSnapshot(rows, scope, beforeCount, afterCount) {
      if (!Array.isArray(rows)) throw new Error('LRR full-library response must be an array');
      if (beforeCount !== afterCount || (beforeCount !== null && rows.length > beforeCount))
        throw new Error('LRR library count changed during synchronization');
      var archives = rows.map(function (item) {
        if (!item || !(item.arcid || item.id) || typeof item.title !== 'string' || typeof item.tags !== 'string')
          throw new Error('LRR full-library metadata is incomplete');
        return { id: String(item.arcid || item.id), title: item.title, tags: item.tags,
          pagecount: Number(item.pagecount) || 0, filesize: Number(item.size || item.filesize) || 0 };
      });
      var snapshot = { version: 1, scope: scope, complete: true, updatedAt: Date.now(), count: archives.length, archives: archives };
      if (!validateLrrIndexSnapshot(snapshot, scope)) throw new Error('LRR library contains duplicate or invalid archive IDs');
      return snapshot;
    }

    function lrrIndexSourceKey(value) {
      try {
        var source = String(value || '').trim();
        // LANraragi commonly stores source tags without a protocol.
        if (/^(?:(?:g\.)?e-hentai\.org|exhentai\.org)\//i.test(source)) source = 'https://' + source;
        else if (/^\/\//.test(source)) source = 'https:' + source;
        var url = new URL(source);
        if (!/^https?:$/.test(url.protocol) || !/^(?:(?:g\.)?e-hentai\.org|exhentai\.org)$/i.test(url.hostname)) return '';
        var match = url.pathname.match(/^\/g\/(\d+)\/([a-z0-9]+)\/?$/i);
        return match ? match[1] + '/' + match[2].toLowerCase() : '';
      } catch (_) { return ''; }
    }

    function lrrIndexTitleGrams(title) {
      var key = normalizeLooseTitle(extractLooseTitleParts(title).coreTitle || title);
      var grams = new Set();
      for (var i = 0; i + 1 < key.length; i++) grams.add(key.slice(i, i + 2));
      return Array.from(grams);
    }

    function installLrrLibraryIndex(snapshot) {
      var sources = new Map(), grams = new Map(), titleKeys = new Map();
      snapshot.archives.forEach(function (item) {
        var parts = extractLooseTitleParts(item.title);
        titleKeys.set(item.id, { core: normalizeLooseTitle(parts.coreTitle), short: normalizeLooseTitle(parts.shortTitle) });
        item.tags.split(',').forEach(function (tag) {
          var match = tag.trim().match(/^source:\s*(\S+)$/i);
          var key = match ? lrrIndexSourceKey(match[1]) : '';
          if (key) { if (!sources.has(key)) sources.set(key, []); sources.get(key).push(item); }
        });
        lrrIndexTitleGrams(item.title).forEach(function (gram) {
          if (!grams.has(gram)) grams.set(gram, []); grams.get(gram).push(item);
        });
      });
      lrrLibraryIndex.snapshot = snapshot;
      lrrLibraryIndex.sourceMap = sources;
      lrrLibraryIndex.grams = grams;
      lrrLibraryIndex.titleKeys = titleKeys;
      updateLrrIndexUi();
    }

    function lookupLrrLibraryIndex(galleryUrl, fullTitle) {
      if (!lrrLibraryIndex.snapshot) return null;
      var exactHits = lrrLibraryIndex.sourceMap.get(lrrIndexSourceKey(galleryUrl)) || [];
      if (exactHits.length) return { exactHits: exactHits, hits: [], possibleHits: [] };
      var candidates = new Map();
      lrrIndexTitleGrams(fullTitle).forEach(function (gram) {
        (lrrLibraryIndex.grams.get(gram) || []).forEach(function (item) { candidates.set(item.id, item); });
      });
      var sourceParts = extractLooseTitleParts(fullTitle);
      var sourceCore = normalizeLooseTitle(sourceParts.coreTitle), sourceShort = normalizeLooseTitle(sourceParts.shortTitle);
      var filtered = Array.from(candidates.values()).filter(function (item) {
        var keys = lrrLibraryIndex.titleKeys.get(item.id);
        return sourceCore === keys.core || sourceCore === keys.short || sourceShort === keys.core ||
          (Math.min(sourceShort.length, keys.short.length) / Math.max(sourceShort.length, keys.short.length, 1) >= 0.60 &&
            looseDiceScore(sourceShort, keys.short) >= 0.58);
      });
      // Source-confirmed titles are reliable aliases even when LRR uses a different script
      // (e.g. romanized filenames). Retain them for galleries added after the initial scan.
      knownLrrTitleAliases.forEach(function (alias) {
        if (alias.lrrServer === String(CONFIG.lrrServerUrl || '') && lrrLibraryIndex.titleKeys.has(alias.id)) filtered.push(alias);
      });
      var result = CONFIG.enableAltSearch ? classifyTitleCandidates(fullTitle, '', filtered) : { hits: [], possibleHits: [] };
      result.exactHits = []; return result;
    }

    function updateLrrIndexUi() {
      if (typeof document === 'undefined') return;
      var node = document.querySelector('#eh-tb-index-status');
      var snapshot = lrrLibraryIndex.snapshot;
      if (node) node.textContent = (snapshot ? t('本地索引 ', 'Local index: ') + snapshot.count + t(' 本 · ', ' archives · ') +
        new Date(snapshot.updatedAt).toLocaleString() : t('尚无完整本地索引', 'No complete local index')) +
        (lrrLibraryIndex.status ? ' · ' + lrrLibraryIndex.status : '');
      var button = document.querySelector('#eh-tb-sync-index');
      if (button) button.disabled = !!lrrLibraryIndex.syncing || !CONFIG.enableLrrChecker || !CONFIG.lrrServerUrl;
    }

    function loadLrrLibraryIndex() {
      if (lrrLibraryIndex.loading) return lrrLibraryIndex.loading;
      lrrLibraryIndex.loading = (async function () {
        if (!CONFIG.enableLrrChecker || !CONFIG.lrrServerUrl) return null;
        recordRuntimeLog('info', 'lrr.index.load-started');
        var scope = await getLrrIndexScope();
        lrrLibraryIndex.scope = scope;
        var snapshot = await gmGet('eh-lrr-index-v1-' + scope, null);
        if (validateLrrIndexSnapshot(snapshot, scope)) {
          lrrLibraryIndex.status = Date.now() - snapshot.updatedAt < LRR_INDEX_INTERVAL
            ? t('已加载 · 每30分钟更新', 'Loaded · updates every 30 minutes')
            : t('使用旧快照，等待更新', 'Using previous snapshot; update pending');
          installLrrLibraryIndex(snapshot);
          recordRuntimeLog('info', 'lrr.index.loaded', { count: snapshot.count, updatedAt: snapshot.updatedAt, ageMs: Date.now() - snapshot.updatedAt });
          if (typeof rescanCurrentPage === 'function') rescanCurrentPage(false);
        }
        return lrrLibraryIndex.snapshot;
      })().catch(function (error) { recordRuntimeLog('warn', 'lrr.index.load-failed', error); lrrLibraryIndex.status = String(error.message || error); updateLrrIndexUi(); return null; });
      return lrrLibraryIndex.loading;
    }

    function lrrIndexInfoCount(info) {
      var value = info && info.total_archives;
      if (value === undefined || value === null || value === '') return null;
      var count = Number(value);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid LRR total_archives');
      return count;
    }

    async function fetchLrrIndexArchives() {
      var headers = {};
      if (CONFIG.lrrApiKey) headers.Authorization = getAuthorizationHeaderValue(CONFIG.lrrApiKey);
      var response = await makeRequest({ method: 'GET', url: CONFIG.lrrServerUrl + '/api/archives', headers: headers,
        timeout: Math.max(CONFIG.requestTimeoutMs, 60000) });
      if (response.status !== 200 || !(response.responseText || '').trim()) throw new Error('LRR full-library response is not ready');
      var rows = JSON.parse(response.responseText);
      if (!Array.isArray(rows)) throw new Error('LRR full-library response must be an array');
      return rows;
    }

    function scheduleLrrIndexSync(delayMs) {
      if (lrrLibraryIndex.timer) clearTimeout(lrrLibraryIndex.timer);
      if (!CONFIG.enableLrrChecker || !CONFIG.lrrServerUrl) return;
      lrrLibraryIndex.timer = setTimeout(function () { syncLrrLibraryIndex(false); }, Math.max(1000, delayMs));
    }

    function syncLrrLibraryIndex(force) {
      if (lrrLibraryIndex.syncing) { recordRuntimeLog('debug', 'lrr.index.sync-skipped', { reason: 'singleflight' }); return lrrLibraryIndex.syncing; }
      if (!CONFIG.enableLrrChecker || !CONFIG.lrrServerUrl) { recordRuntimeLog('debug', 'lrr.index.sync-skipped', { reason: 'disabled-or-unconfigured' }); return Promise.resolve(false); }
      var syncStartedAt = Date.now();
      recordRuntimeLog('info', 'lrr.index.sync-requested', { force: !!force });
      var promise = (async function () {
        await loadLrrLibraryIndex();
        var scope = lrrLibraryIndex.scope || await getLrrIndexScope();
        // Reuse another tab's newly committed complete snapshot before acquiring a lease.
        var persisted = await gmGet('eh-lrr-index-v1-' + scope, null);
        if (validateLrrIndexSnapshot(persisted, scope) && (!lrrLibraryIndex.snapshot || persisted.updatedAt > lrrLibraryIndex.snapshot.updatedAt)) {
          installLrrLibraryIndex(persisted);
          clearLrrCache(false); knownLrrTitleAliases.clear(); rescanCurrentPage(false);
        }
        var snapshot = lrrLibraryIndex.snapshot;
        var now = Date.now();
        if (!force && (now < lrrLibraryIndex.nextAttempt || (snapshot && now - snapshot.updatedAt < LRR_INDEX_INTERVAL))) {
          recordRuntimeLog('debug', 'lrr.index.sync-skipped', { reason: now < lrrLibraryIndex.nextAttempt ? 'backoff' : 'fresh-snapshot', count: snapshot ? snapshot.count : 0 });
          scheduleLrrIndexSync(Math.max(lrrLibraryIndex.nextAttempt - now, snapshot ? LRR_INDEX_INTERVAL - (now - snapshot.updatedAt) : 1000));
          return false;
        }
        var leaseKey = 'eh-lrr-index-lease-v1-' + scope;
        var owner = Date.now() + '-' + Math.random().toString(36).slice(2);
        var lease = await gmGet(leaseKey, null);
        if (lease && lease.until > now) {
          recordRuntimeLog('debug', 'lrr.index.sync-skipped', { reason: 'other-tab-lease' });
          lrrLibraryIndex.status = t('其他标签页正在同步', 'Another tab is synchronizing');
          scheduleLrrIndexSync(Math.min(60000, lease.until - now + 1000)); return false;
        }
        await gmSet(leaseKey, { owner: owner, until: now + 5 * 60 * 1000 });
        lease = await gmGet(leaseKey, null);
        if (!lease || lease.owner !== owner) { scheduleLrrIndexSync(30000); return false; }
        try {
          lrrLibraryIndex.status = t('后台同步中，旧索引仍可用', 'Synchronizing; previous index remains usable'); updateLrrIndexUi();
          var before = lrrIndexInfoCount(await fetchLrrServerInfo());
          var rows = await fetchLrrIndexArchives();
          var after = lrrIndexInfoCount(await fetchLrrServerInfo());
          var next = buildLrrIndexSnapshot(rows, scope, before, after);
          recordRuntimeLog('info', 'lrr.index.count-verified', { before: before, after: after, received: next.count, previous: snapshot ? snapshot.count : null });
          // Archives with missing files can be omitted by LRR. Verify the entire ID set again;
          // never silently publish an empty or sharply reduced replacement.
          var reduced = snapshot && next.count < snapshot.count;
          if (before === null || next.count !== before || reduced || next.count === 0) {
            var confirmation = buildLrrIndexSnapshot(await fetchLrrIndexArchives(), scope, after,
              lrrIndexInfoCount(await fetchLrrServerInfo()));
            var ids = new Set(next.archives.map(function (item) { return item.id; }));
            if (confirmation.count !== next.count || !confirmation.archives.every(function (item) { return ids.has(item.id); }))
              throw new Error('LRR full-library ID set changed during synchronization');
            if (!next.count || (snapshot && next.count < snapshot.count * 0.75)) {
              if (!force || !confirm(t('LRR 全库数量降至 ', 'LRR library shrank to ') + next.count +
                  t(' 本。已两次核对相同 ID 集合，确认替换旧索引？', ' archives. The ID set was verified twice. Replace the previous index?')))
                throw new Error('LRR library is empty or sharply reduced; manually synchronize to confirm deletions');
            }
          }
          if (!CONFIG.enableLrrChecker || !CONFIG.lrrServerUrl || scope !== await getLrrIndexScope())
            throw new Error('LRR configuration changed during synchronization');
          // A suspended tab may outlive its lease while a newer tab finishes a sync.
          // Recheck immediately before committing; never publish that tab's older response.
          var commitLease = await gmGet(leaseKey, null);
          if (!commitLease || commitLease.owner !== owner || commitLease.until <= Date.now())
            throw new Error('LRR synchronization lease expired or was superseded');
          await gmSet('eh-lrr-index-v1-' + scope, next);
          installLrrLibraryIndex(next);
          lrrLibraryIndex.failures = 0; lrrLibraryIndex.nextAttempt = 0;
          lrrLibraryIndex.status = t('已同步 · 每30分钟更新', 'Synchronized · updates every 30 minutes');
          clearLrrCache(false); knownLrrTitleAliases.clear(); rescanCurrentPage(false);
          recordRuntimeLog('info', 'lrr.index.synchronized', { count: next.count, elapsedMs: Date.now() - syncStartedAt });
          scheduleLrrIndexSync(LRR_INDEX_INTERVAL);
          return true;
        } finally {
          var current = await gmGet(leaseKey, null);
          if (current && current.owner === owner) await gmSet(leaseKey, { owner: '', until: 0 });
        }
      })().catch(function (error) {
        recordRuntimeLog('warn', 'lrr.index.sync-failed', { error: error, elapsedMs: Date.now() - syncStartedAt, retainedCount: lrrLibraryIndex.snapshot ? lrrLibraryIndex.snapshot.count : null });
        lrrLibraryIndex.failures++;
        var wait = Math.min(LRR_INDEX_INTERVAL, 60000 * Math.pow(2, Math.min(5, lrrLibraryIndex.failures - 1)));
        lrrLibraryIndex.nextAttempt = Date.now() + wait;
        lrrLibraryIndex.status = t('同步失败，保留旧索引：', 'Sync failed; previous index retained: ') + String(error.message || error).slice(0, 180);
        // Previously fresh misses are in seenGalleryUrls. Release them once per expired
        // snapshot so URLFinder can recover them, without rescanning on every retry.
        var old = lrrLibraryIndex.snapshot;
        if (old && Date.now() - old.updatedAt >= LRR_INDEX_INTERVAL && lrrLibraryIndex.fallbackVersion !== old.updatedAt) {
          lrrLibraryIndex.fallbackVersion = old.updatedAt;
          rescanCurrentPage(false);
        }
        scheduleLrrIndexSync(wait); return false;
      });
      lrrLibraryIndex.syncing = promise;
      promise.then(function () { lrrLibraryIndex.syncing = null; updateLrrIndexUi(); });
      updateLrrIndexUi(); return promise;
    }

    function startLrrIndexSync() {
      if (!CONFIG.enableLrrChecker || !CONFIG.lrrServerUrl) return;
      loadLrrLibraryIndex().then(function () { syncLrrLibraryIndex(false); });
    }
    // End LRR persistent library index.

    async function requestUrlfinder(url) {
      var apiUrl = CONFIG.lrrServerUrl +
        '/api/plugins/use?plugin=urlfinder&arg=' +
        encodeURIComponent(url);

      var headers = {};
      if (CONFIG.lrrApiKey)
        headers['Authorization'] = getAuthorizationHeaderValue(CONFIG.lrrApiKey);

      var response = await makeRequest({
        method: 'POST',
        url: apiUrl,
        headers: headers
      });

      return JSON.parse(response.responseText);
    }

    async function processGallery(gallery) {
      var galleryUrl = gallery.galleryUrl;
      var titleElement = gallery.titleElement;
      var cacheKey = gallery.cacheKey;
      var generation = gallery.generation;
      // GM loading is shared across all galleries and never delays a first scan indefinitely.
      if (typeof loadLrrLibraryIndex === 'function') {
        await Promise.race([loadLrrLibraryIndex(), new Promise(function (resolve) { setTimeout(resolve, 200); })]);
        if (generation !== lrrScanGeneration) return { success: false, stale: true, galleryUrl: galleryUrl };
        var local = lookupLrrLibraryIndex(galleryUrl, getGalleryTitlePlain(titleElement));
        if (local) {
          var localFresh = Date.now() - lrrLibraryIndex.snapshot.updatedAt < LRR_INDEX_INTERVAL;
          recordRuntimeLog('debug', 'lrr.index.local-lookup', { gallery: galleryUrl, exactHits: local.exactHits.length,
            titleHits: local.hits.length, possibleHits: local.possibleHits.length, fresh: localFresh,
            outcome: local.exactHits.length ? 'source-hit' : local.hits.length ? 'title-hit' : local.possibleHits.length ? 'possible-hit' : localFresh ? 'fresh-miss' : 'stale-remote-fallback' });
          if (local.exactHits.length) {
            prependLrrMarker(titleElement, '(LRR ✔)', ['lrr-marker-downloaded'], 'urlfinder', local.exactHits, galleryUrl);
            registerKnownLrrTitle(getGalleryTitlePlain(titleElement), local.exactHits[0], generation);
          } else if (local.hits.length) renderLrrTitleResult(titleElement, local.hits, false, '');
          else if (local.possibleHits.length) renderLrrTitleResult(titleElement, local.possibleHits, true, '');
          if (local.exactHits.length || local.hits.length || local.possibleHits.length ||
              Date.now() - lrrLibraryIndex.snapshot.updatedAt < LRR_INDEX_INTERVAL)
            return { success: true, galleryUrl: galleryUrl, localIndex: true };
        }
      }
      var urls = normalizeGalleryUrls(galleryUrl);
      var result = null;
      var lastValidResult = null;
      var lastError = null;
      var successCount = 0;

      try {
        for (var i = 0; i < urls.length; i++) {
          if (generation !== lrrScanGeneration)
            return { success: false, stale: true, galleryUrl: galleryUrl };

          try {
            debugLog('URLFinder尝试', urls[i]);
            var current = await requestUrlfinder(urls[i]);
            if (urlfinderReportedFailure(current)) {
              throw new Error(t('URLFinder 插件返回失败：', 'URLFinder plugin reported a failure: ')
                + String(current.error || 'success=0').slice(0, 200));
            }
            successCount++;
            lastValidResult = current;

            if (isUrlfinderHit(current)) {
              current.matchType = (urls[i] === galleryUrl) ? 'URL精确匹配' : '跨站URL匹配';
              current.matchedUrl = urls[i];
              result = current;
              debugLog('URLFinder命中', current.matchType, urls[i]);
              break;
            }
          } catch (e) {
            lastError = e;
            debugLog('URLFinder请求失败', urls[i], e);
          }
        }

        if (generation !== lrrScanGeneration)
          return { success: false, stale: true, galleryUrl: galleryUrl };

        // 至少一次请求正常返回但未命中：继续走备用标题搜索。
        if (!result && successCount > 0) result = lastValidResult || {};

        // 所有URLFinder请求都失败才标记为错误。
        if (!result && successCount === 0) throw (lastError || new Error('URLFinder请求全部失败'));

        // 命中才缓存完整结果；未命中写 miss 标记，走 5 分钟负缓存，
        // 这样刚入库的作品不会长时间显示「库里没有」。
        setCache(cacheKey, isUrlfinderHit(result) ? result : { miss: true });
        handleResponse(result || {}, titleElement, galleryUrl, generation);
        return { success: true, galleryUrl: galleryUrl };
      } catch (e) {
        // URLFinder 插件不可用时，标题接口仍可能正常工作；确认标题命中后再决定如何提示。
        if (generation === lrrScanGeneration && CONFIG.enableAltSearch) {
          var fallback = await handleResponse({}, titleElement, galleryUrl, generation);
          if (fallback && fallback.success) return { success: true, galleryUrl: galleryUrl, titleFallback: true };
        }
        runtimeConsole('error', '[LRR Checker] URLFinder request failed:', galleryUrl, e);
        if (generation === lrrScanGeneration) {
          // 不在库里就不该有任何标记：失败只在面板状态里汇总，逐条贴红标只是噪音。
          // 前两次失败从本页已处理集合移除，下一轮扫描自动重试；此后不再自动重发。
          noticeLrrLookupFailure(e);
          var retried = lrrLookupRetries.get(galleryUrl) || 0;
          if (retried < 2) {
            lrrLookupRetries.set(galleryUrl, retried + 1);
            seenGalleryUrls.delete(galleryUrl);
          }
        }
        return { success: false, galleryUrl: galleryUrl, error: e };
      }
    }

    async function fetchAltSearchHttp(searchQuery) {
      var params = new URLSearchParams();
      // LRR 的双引号会设置 isexact，使标题必须整串相等；主体查询必须保持子串搜索。
      // 去除查询操作符，并防止开头的减号把标题变成排除条件。
      var terms = searchQuery.split(',').map(function (part) {
        return part.replace(/["*?%_$:\\]/g, ' ').replace(/^\s*(?:-\s*)+/, '')
          .replace(/\s+/g, ' ').trim();
      }).filter(Boolean);
      if (!terms.length) return { hit: false, hits: [], incomplete: true };
      params.set('filter', terms.join(','));
      params.set('start', '0');
      params.set('groupby_tanks', 'false');
      var headers = {};
      if (CONFIG.lrrApiKey) headers['Authorization'] = getAuthorizationHeaderValue(CONFIG.lrrApiKey);
      var validateFn = function (status) { return (status >= 200 && status < 300) || status === 204; };
      var altHits = [], ids = new Set(), start = 0;
      // 不能只看第一页；最多取三页，截断/索引未就绪不作为“未命中”缓存。
      for (var page = 0; page < 3; page++) {
        params.set('start', String(start));
        var searchUrl = CONFIG.lrrServerUrl + '/api/search?' + params.toString();
        var options = { method: 'GET', url: searchUrl, headers: headers,
          timeout: CONFIG.searchTimeoutMs, validateStatus: validateFn };
        var response = await makeRequest(options);
        if (response.status === 204) {
          await delay(2000);
          response = await makeRequest(options);
        }
        var body = (response.responseText || '').trim();
        if (response.status === 204 || !body)
          return { hit: altHits.length > 0, hits: altHits, incomplete: true };
        var searchResult = JSON.parse(body);
        var searchData = Array.isArray(searchResult) ? searchResult : searchResult && searchResult.data;
        if (!Array.isArray(searchData)) throw new Error('Invalid LANraragi search response');
        var previousCount = altHits.length;
        searchData.forEach(function (item) {
          if (!item || !(item.id || item.arcid)) return;
          var id = String(item.id || item.arcid);
          if (ids.has(id)) return;
          ids.add(id);
          altHits.push({
            id: id,
            title: item.title || '',
            tags: item.tags || '',
            pagecount: item.pagecount || 0,
            filesize: item.filesize || item.size || 0
          });
        });
        start += searchData.length;
        var total = Number(searchResult.recordsFiltered);
        if (!Number.isFinite(total) || start >= total)
          return { hit: altHits.length > 0, hits: altHits };
        if (!searchData.length || previousCount === altHits.length) break;
      }
      return { hit: altHits.length > 0, hits: altHits, incomplete: true };
    }

    // 备用搜索不能“搜到任何结果就算命中”。LANraragi 的 filter 可能返回仅部分关键词相同的归档，
    // 因此先拿原始候选，再在本地做作者 + 标题二次校验，避免明显误报。
    async function performAlternativeSearch(searchQuery, sourceFullTitle, titleElement, generation) {
      if (generation !== lrrScanGeneration) return { success: false, stale: true };
      if (hasLrrMarker(titleElement, true)) return { success: false, skipped: true };

      var filteredKey = getTitleSearchCacheKey('alt-strict', sourceFullTitle + '|' + searchQuery);
      var cached = getCache(filteredKey);
      if (cached && typeof cached.altHit === 'boolean') {
        if (cached.altHit && generation === lrrScanGeneration)
          prependLrrMarker(titleElement, '(LRR ≈)', ['lrr-marker-file'], 'alt', cached.altHits || [], null, searchQuery);
        return { success: cached.altHit, cached: true, hits: cached.altHits || [] };
      }

      try {
        var result = await getTitleSearchCandidates(searchQuery, generation);
        if (generation !== lrrScanGeneration) return { success: false, stale: true };

        var hits = (result && result.hits ? result.hits : []).filter(function (item) {
          return item && item.id && item.title && isStrictCandidateMatch(sourceFullTitle, item.title, item.tags);
        });
        var hit = hits.length > 0;
        if (hit || !result.incomplete) setCache(filteredKey, { altHit: hit, altHits: hits });

        if (hit && !hasLrrMarker(titleElement, true))
          prependLrrMarker(titleElement, '(LRR ≈)', ['lrr-marker-file'], 'alt', hits, null, searchQuery);
        return { success: hit, hits: hits };
      } catch (e) {
        return { success: false, error: e, hits: [] };
      }
    }

    // 模糊匹配专用：忽略活动编号、作者组、语言/翻译/DL 等附加标签，只比较作品主体。
    function isLooseNoiseTag(value) {
      value = String(value || '').trim();
      return /^(?:中文|中国語|中国语|中国翻訳|中国翻译|漢化|汉化|英語|英语|英文|English|Chinese|Japanese|韓国語|韩国语|DL版|Digital(?:版)?|無修正|无修正|翻訳|翻译|重嵌|机翻|機翻|個人翻譯|个人翻译|翻譯|修正版|修正|uncensored|censored|scan(?:s)?|digital edition|rewrit(?:e|ten))$/i.test(value) ||
        /(?:汉化|漢化|翻译|翻譯|翻訳|掃圖|扫图|修图|修圖|机翻|機翻)/i.test(value) ||
        /\b(?:translat(?:ion|ed)|scanlation)\b/i.test(value) ||
        /^(?:C\d{2,3}|COMIC\s*(?:MARKET|CITY)\s*\d+|コミケ\s*\d+|コミックマーケット\s*\d+|COMITIA\s*\d+|コミティア\s*\d+|例大祭\s*\d+)$/i.test(value);
    }

    function prepareMatchTitle(value) {
      value = String(value || '');
      try { value = value.normalize('NFKC'); } catch (_) {}
      return value.replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
        .replace(/【/g, '[').replace(/】/g, ']')
        .replace(/\.(?:zip|cbz|cbr|rar|7z|pdf)\s*$/i, '').trim();
    }

    function extractLooseAuthor(fullTitle) {
      // 作者只从标题前缀读取；尾部的 [汉化组]、[Digital] 不能成为作者。
      var re = /^(?:\(([^()]*)\)|\[([^\]]*)\])\s*/;
      var rest = fullTitle, offset = 0;
      var m;
      while ((m = re.exec(rest))) {
        var value = (m[2] || m[1] || '').trim();
        offset += m[0].length;
        rest = rest.slice(m[0].length);
        if (!value || isLooseNoiseTag(value)) continue;
        if (m[2]) return { value: value, end: offset };
        break;
      }
      return null;
    }

    function stripLooseDecorations(value) {
      value = prepareMatchTitle(value);
      value = value.replace(/\[([^\]]*)\]|\(([^()]*)\)/g, function (whole, square, round) {
        return isLooseNoiseTag(square === undefined ? round : square) ? ' ' : whole;
      });
      return value.replace(/\s+/g, ' ').trim();
    }

    function normalizeTitleNumber(value) {
      if (/^\d+(?:\.\d+)?$/.test(value)) return value.replace(/^0+(?=\d)/, '');
      var digits = '零一二三四五六七八九';
      if (/^[零〇一二三四五六七八九十百千]+$/.test(value)) {
        var total = 0, digit = 0;
        for (var i = 0; i < value.length; i++) {
          var unit = { 十: 10, 百: 100, 千: 1000 }[value[i]];
          if (unit) { total += (digit || 1) * unit; digit = 0; }
          else digit = digit * 10 + Math.max(0, digits.indexOf(value[i]));
        }
        return String(total + digit);
      }
      // 罗马数字仅用于带 Vol./Chapter 等标签的数字，避免误改普通单词。
      if (/^(?:X{0,3})(?:IX|IV|V?I{0,3})$/i.test(value) && value) {
        var roman = { i: 1, v: 5, x: 10 }, sum = 0;
        value = value.toLowerCase();
        for (var j = 0; j < value.length; j++)
          sum += roman[value[j]] < (roman[value[j + 1]] || 0) ? -roman[value[j]] : roman[value[j]];
        return String(sum);
      }
      return value;
    }

    function canonicalTitleNumbers(value) {
      return value.replace(/\b(vol(?:ume)?\.?|ch(?:apter)?\.?|ep(?:isode)?\.?|part)\s*(\d+(?:\.\d+)?|[ivx]+)\b/gi,
        function (_, label, number) {
          var kind = /^vol/i.test(label) ? '巻' : /^(?:ch|ep)/i.test(label) ? '話' : '部';
          return '第' + normalizeTitleNumber(number) + kind;
        }).replace(/第?\s*([\d零〇一二三四五六七八九十百千]+(?:\.\d+)?)\s*(巻|卷|話|话|章|部)/g,
          function (_, number, kind) { return '第' + normalizeTitleNumber(number) + ({ 卷: '巻', 话: '話' }[kind] || kind); })
        .replace(/\d+(?:\.\d+)?/g, normalizeTitleNumber);
    }

    function normalizeLooseTitle(value) {
      value = canonicalTitleNumbers(stripLooseDecorations(value).toLowerCase());
      return value.replace(/[\p{P}\p{S}\s]/gu, '');
    }

    function looseKeyIsUseful(value) {
      if (!value) return false;
      // 太短的标题非常容易在 LRR filter 中撞到无关作品；CJK 至少 3 字，其它至少 5 字。
      if (/[\u3040-\u30ff\u3400-\u9fff]/.test(value)) return value.length >= 3;
      return value.length >= 5;
    }

    function looseDiceScore(a, b) {
      if (!a || !b) return 0;
      if (a === b) return 1;
      if (a.length < 2 || b.length < 2) return 0;
      var counts = new Map();
      for (var i = 0; i < a.length - 1; i++) {
        var pair = a.slice(i, i + 2);
        counts.set(pair, (counts.get(pair) || 0) + 1);
      }
      var overlap = 0;
      for (var j = 0; j < b.length - 1; j++) {
        var bp = b.slice(j, j + 2);
        var count = counts.get(bp) || 0;
        if (count > 0) {
          overlap++;
          counts.set(bp, count - 1);
        }
      }
      return (2 * overlap) / ((a.length - 1) + (b.length - 1));
    }

    function extractLooseTitleParts(fullTitle) {
      fullTitle = prepareMatchTitle(fullTitle);
      var authorInfo = extractLooseAuthor(fullTitle);
      var tail = authorInfo ? fullTitle.slice(authorInfo.end) : fullTitle;
      var coreTitle = stripLooseDecorations(tail);
      // 最末尾的圆括号通常是原作名；主体括号、方括号中的副标题仍保留。
      var shortTitle = coreTitle.replace(/\s+\([^()]*\)\s*$/, '').trim() || coreTitle;

      return {
        author: authorInfo ? authorInfo.value : '',
        shortTitle: shortTitle,
        coreTitle: coreTitle
      };
    }

    function looseAuthorMatch(sourceAuthor, candidateAuthor) {
      function aliases(value) {
        value = prepareMatchTitle(value);
        var artists = value.match(/\(([^()]*)\)/);
        return { artists: artists ? artists[1].split(/[,、/&]/).map(normalizeLooseTitle).filter(Boolean) : [],
          all: [value.replace(/\([^()]*\)/g, '')].concat(artists ? artists[1].split(/[,、/&]/) : [])
            .map(normalizeLooseTitle).filter(Boolean) };
      }
      var a = aliases(sourceAuthor), b = aliases(candidateAuthor);
      // 同一社团中的不同作者不应互相命中；社团名与作者名可分别匹配缺失的另一侧。
      var left = a.artists.length && b.artists.length ? a.artists : a.all;
      var right = a.artists.length && b.artists.length ? b.artists : b.all;
      return left.some(function (name) { return right.indexOf(name) >= 0; });
    }

    function candidateAuthorEvidence(sourceAuthor, candidateParts, tags) {
      if (!sourceAuthor) return 0;
      var titleEvidence = candidateParts.author ? (looseAuthorMatch(sourceAuthor, candidateParts.author) ? 1 : -1) : 0;
      if (titleEvidence < 0) return -1;
      var tagged = (Array.isArray(tags) ? tags : String(tags || '').split(','))
        .map(function (tag) { return String(tag).trim().match(/^(artist|group):\s*(.+)$/i); }).filter(Boolean);
      var artists = tagged.filter(function (match) { return match[1].toLowerCase() === 'artist'; });
      var hasSpecificArtists = /\([^()]+\)/.test(sourceAuthor) && artists.length > 0;
      var names = (hasSpecificArtists ? artists : tagged)
        .map(function (match) { return match[2]; });
      if (titleEvidence > 0 && !hasSpecificArtists) return 1;
      if (!names.length) return titleEvidence;
      return names.some(function (name) { return looseAuthorMatch(sourceAuthor, name); }) ? 1 : -1;
    }

    // 裸卷标注（写作「作品名 上」而不是「上巻」）同样决定作品身份，
    // 否则同一系列的上/下卷会被判成同一部。只认被首尾或分隔符包围的裸标注，
    // 避免把「上下巻」「以上」「前作」这类词内字符误当成卷号。
    var BARE_VOLUME_PATTERN = /(^|[\s\u3000()[\]{}<>【】「」『』、,，.。:：;；\/／|｜_~〜·・—–―-])(上|中|下|前|後|后|番外)(?=$|[\s\u3000()[\]{}<>【】「」『』、,，.。:：;；\/／|｜_~〜·・—–―-])/g;

    function bareVolumeParts(value) {
      var found = [];
      var match;
      BARE_VOLUME_PATTERN.lastIndex = 0;
      while ((match = BARE_VOLUME_PATTERN.exec(value))) {
        found.push(match[2]);
        // 零长度匹配时强制前进，避免正则死循环。
        if (BARE_VOLUME_PATTERN.lastIndex <= match.index) BARE_VOLUME_PATTERN.lastIndex = match.index + 1;
      }
      return found;
    }

    function titleIdentityCompatible(a, b) {
      // 相似度不能区分长标题末尾的 1/2、上/下、前編/後編，必须先检查这些身份信息。
      function identity(value) {
        value = canonicalTitleNumbers(prepareMatchTitle(value));
        return JSON.stringify({ numbers: value.match(/\d+(?:\.\d+)?/g) || [],
          units: value.match(/第\d+(?:\.\d+)?(?:巻|話|章|部)/g) || [],
          parts: (value.match(/(?:上|中|下)(?:巻|卷|篇|編|编)|(?:前|後|后|番外)(?:篇|編|编)|総集編|總集篇|合本|合集|後日談/gi) || [])
            .concat(bareVolumeParts(value))
            .map(function (part) { return part.replace(/后/g, '後').replace(/[编篇]/g, '編').replace(/卷/g, '巻'); }) });
      }
      return identity(a) === identity(b);
    }

    function titleEditScore(a, b) {
      if (a === b) return 1;
      // 限制长输入的计算量；正常标题以外的输入只允许完全一致。
      if (!a || !b || Math.max(a.length, b.length) > 512) return 0;
      var row = Array.from({ length: b.length + 1 }, function (_, i) { return i; });
      for (var i = 1; i <= a.length; i++) {
        var diagonal = row[0]; row[0] = i;
        for (var j = 1; j <= b.length; j++) {
          var old = row[j];
          row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
          diagonal = old;
        }
      }
      return 1 - row[b.length] / Math.max(a.length, b.length);
    }

    function verifiedTitleMatch(sourceParts, candidateParts, authorMatched) {
      var a = normalizeLooseTitle(sourceParts.coreTitle), b = normalizeLooseTitle(candidateParts.coreTitle);
      if (!a || !b || !titleIdentityCompatible(sourceParts.coreTitle, candidateParts.coreTitle)) return false;
      var sa = normalizeLooseTitle(sourceParts.shortTitle), sb = normalizeLooseTitle(candidateParts.shortTitle);
      var useful = looseKeyIsUseful(sa) && looseKeyIsUseful(sb) && (authorMatched || Math.min(sa.length, sb.length) >= 6);
      if (a === b) return useful;
      if (a !== sa && b !== sb) {
        var suffixA = sourceParts.coreTitle.match(/\s+\(([^()]*)\)\s*$/);
        var suffixB = candidateParts.coreTitle.match(/\s+\(([^()]*)\)\s*$/);
        if (suffixA && suffixB && normalizeLooseTitle(suffixA[1]) !== normalizeLooseTitle(suffixB[1])) return false;
      }
      // 允许一侧省略原作括号；两侧均有但不同的括号内容不应被忽略。
      if ((a === sb || b === sa) && looseKeyIsUseful(sa) && looseKeyIsUseful(sb))
        return useful;
      // 相同的长原作名不能稀释主标题的差异，模糊评分只比较作品主体。
      a = sa; b = sb;
      var minLength = Math.min(a.length, b.length);
      if (minLength < (authorMatched ? 8 : 12)) return false;
      // 先用低成本的长度和二元组筛选，再核对字符顺序；缺少作者时提高阈值。
      var editThreshold = authorMatched ? 0.88 : 0.94, diceThreshold = authorMatched ? 0.80 : 0.92;
      if (minLength / Math.max(a.length, b.length) < editThreshold || looseDiceScore(a, b) < diceThreshold) return false;
      return titleEditScore(a, b) >= editThreshold;
    }

    // “作者 + 标题”备用搜索的严格校验：作者必须一致，标题也必须高度相似。
    function isStrictCandidateMatch(sourceFullTitle, candidateTitle, candidateTags) {
      var sourceParts = extractLooseTitleParts(sourceFullTitle);
      var candidateParts = extractLooseTitleParts(candidateTitle);
      return candidateAuthorEvidence(sourceParts.author, candidateParts, candidateTags) === 1 &&
        verifiedTitleMatch(sourceParts, candidateParts, true);
    }

    function isLooseCandidateMatch(sourceFullTitle, searchTitle, candidateTitle, candidateTags) {
      var sourceParts = extractLooseTitleParts(sourceFullTitle);
      var candidateParts = extractLooseTitleParts(candidateTitle);
      var evidence = candidateAuthorEvidence(sourceParts.author, candidateParts, candidateTags);
      if (evidence < 0) return false;
      // searchTitle 仅用于召回，不参与判定，防止截短查询绕过完整标题校验。
      return verifiedTitleMatch(sourceParts, candidateParts, evidence > 0);
    }

    function getPossibleMatchReason(reason) {
      if (reason === 'series') return t('标题相似，但卷号或篇章标注不同', 'Similar title, but volume or story-part annotations differ');
      if (reason === 'author') return t('标题非常接近，但作者标注不同', 'Very similar title, but author annotations differ');
      if (reason === 'same-author') return t('作者一致，标题相似，可能是不同翻译或版本', 'Same author and similar title; possibly another translation or edition');
      return t('标题相似，作者信息不足，需人工确认', 'Similar title with limited author evidence; manual confirmation needed');
    }

    function getPossibleTitleMatch(sourceFullTitle, candidateTitle, candidateTags) {
      var source = extractLooseTitleParts(sourceFullTitle), candidate = extractLooseTitleParts(candidateTitle);
      var a = normalizeLooseTitle(source.shortTitle), b = normalizeLooseTitle(candidate.shortTitle);
      var minLength = Math.min(a.length, b.length), maxLength = Math.max(a.length, b.length);
      var evidence = candidateAuthorEvidence(source.author, candidate, candidateTags);
      if (minLength < (evidence > 0 ? 6 : 8)) return null;
      if (maxLength > 512 || minLength / maxLength < (evidence < 0 ? 0.94 : evidence > 0 ? 0.62 : 0.80)) return null;
      var dice = looseDiceScore(a, b);
      if (dice < (evidence > 0 ? 0.60 : 0.78)) return null;
      var edit = titleEditScore(a, b);
      var containment = a.includes(b) || b.includes(a) ? minLength / maxLength : 0;
      if (evidence < 0) {
        if (minLength < 12 || edit < 0.94 || dice < 0.92) return null;
      } else if (evidence > 0) {
        if (!(edit >= 0.62 && dice >= 0.62) && containment < 0.65) return null;
      } else if (!(edit >= 0.80 && dice >= 0.80) && containment < 0.85) return null;
      return {
        similarity: (edit + dice) / 2,
        possibleReason: evidence < 0 ? 'author' : !titleIdentityCompatible(source.coreTitle, candidate.coreTitle)
          ? 'series' : evidence > 0 ? 'same-author' : 'title'
      };
    }

    function classifyTitleCandidates(sourceFullTitle, searchTitle, candidates) {
      var hits = [], possibleHits = [], seen = new Set();
      (candidates || []).forEach(function (item) {
        if (!item || !item.id || !item.title) return;
        // 源链接确认过的画廊标题是该归档的可靠别名，可跨越库内罗马音与日文的差异。
        var title = item.matchTitle || item.title, tags = item.matchTitle ? '' : item.tags;
        var key = item.id + '|' + title;
        if (seen.has(key)) return;
        seen.add(key);
        if (isLooseCandidateMatch(sourceFullTitle, searchTitle, title, tags)) {
          if (!hits.some(function (hit) { return hit.id === item.id; })) hits.push(item);
          return;
        }
        var match = getPossibleTitleMatch(sourceFullTitle, title, tags);
        if (match) possibleHits.push(Object.assign({}, item, match));
      });
      possibleHits.sort(function (a, b) { return b.similarity - a.similarity; });
      var possibleIds = new Set();
      return { hits: hits, possibleHits: possibleHits.filter(function (item) {
        if (possibleIds.has(item.id)) return false;
        possibleIds.add(item.id); return true;
      }).slice(0, 5) };
    }

    function renderLrrTitleResult(titleElement, hits, possible, searchTitle) {
      if (!hits.length || hasLrrMarker(titleElement, true)) return;
      prependLrrMarker(titleElement, possible ? '(LRR ?)' : '(LRR ≈)',
        [possible ? 'lrr-marker-possible' : 'lrr-marker-file'], possible ? 'possible' : 'alt-loose', hits, null, searchTitle);
    }

    function getKnownLrrTitleMatches(sourceFullTitle, searchTitle) {
      var server = typeof CONFIG === 'object' ? String(CONFIG.lrrServerUrl || '') : '';
      return classifyTitleCandidates(sourceFullTitle, searchTitle, Array.from(knownLrrTitleAliases.values())
        .filter(function (alias) { return alias.lrrServer === server; }));
    }

    function registerKnownLrrTitle(sourceFullTitle, hit, generation) {
      if (generation !== lrrScanGeneration || !hit || !hit.id || !sourceFullTitle) return;
      var server = typeof CONFIG === 'object' ? String(CONFIG.lrrServerUrl || '') : '';
      var alias = Object.assign({}, hit, { title: hit.title || sourceFullTitle, matchTitle: sourceFullTitle, lrrServer: server });
      knownLrrTitleAliases.set(server + '|' + hit.id + '|' + sourceFullTitle, alias);
      if (!CONFIG.enableAltSearch) return;
      // 只传播已被源链接证实存在的归档；普通相似提示不能再成为传播依据。
      collectLrrGalleryEntries().forEach(function (entry) {
        if (!entry.titleElement || !entry.titleElement.isConnected || hasLrrMarker(entry.titleElement, true)) return;
        var fullTitle = getGalleryTitlePlain(entry.titleElement);
        var result = classifyTitleCandidates(fullTitle, '', [alias]);
        if (result.hits.length) { renderLrrTitleResult(entry.titleElement, result.hits, false, ''); return; }
        if (!result.possibleHits.length) return;
        var scope = getLrrMarkerScope(entry.titleElement);
        var marker = scope && scope.querySelector('.lrr-marker-span');
        if (marker && marker.classList.contains('lrr-marker-possible') &&
          Number(marker.dataset.lrrScore) >= result.possibleHits[0].similarity) return;
        renderLrrTitleResult(entry.titleElement, result.possibleHits, true, '');
      });
    }

    function getTitleSearchCacheKey(kind, value) {
      var server = typeof CONFIG === 'object' ? String(CONFIG.lrrServerUrl || '') : '';
      // 新增疑似匹配层后，绕过旧版未命中缓存。
      return 'lrr-checker-v8-' + kind + '-' + simpleHash(server +
        (typeof CONFIG === 'object' && CONFIG.lrrApiKey ? '|auth:' + CONFIG.lrrApiKey : '') + '|' + value);
    }

    async function getTitleSearchCandidates(query, generation) {
      if (generation !== lrrScanGeneration) return { hits: [], incomplete: true };
      var rawKey = getTitleSearchCacheKey('raw', query);
      var cached = getCache(rawKey);
      if (cached && typeof cached.altHit === 'boolean') return { hits: cached.altHits || [] };
      var inflightKey = generation + '|' + rawKey;
      if (!altSearchInflight.has(inflightKey)) {
        var promise = runAltSearchLimited(async function () {
          if (generation !== lrrScanGeneration) return { hits: [], incomplete: true };
          var result = await fetchAltSearchHttp(query);
          if (generation === lrrScanGeneration && !result.incomplete)
            setCache(rawKey, { altHit: result.hits.length > 0, altHits: result.hits });
          return result;
        });
        altSearchInflight.set(inflightKey, promise);
        var cleanup = function () {
          if (altSearchInflight.get(inflightKey) === promise) altSearchInflight.delete(inflightKey);
        };
        promise.then(cleanup, cleanup);
      }
      return altSearchInflight.get(inflightKey);
    }

    function buildLooseSearchQueries(searchTitle) {
      // filter 检索发生在本地相似度校验之前。用连续词段回退，避免空格、波浪线等差异挡住候选。
      var queries = [searchTitle];
      var words = stripLooseDecorations(searchTitle).match(/[\p{L}\p{N}]+/gu) || [];
      words.filter(function (word) { return looseKeyIsUseful(word); })
        .sort(function (a, b) { return b.length - a.length; })
        .forEach(function (word) {
          if (queries.length < 4 && queries.indexOf(word) < 0) queries.push(word);
        });
      // 连续日文/中文标题没有空格，前后片段可召回含一个错字或不同分隔符的标题。
      if (words.length === 1 && /^[\u3040-\u30ff\u3400-\u9fff]{8,}$/.test(words[0])) {
        var middle = Math.floor(words[0].length / 2);
        [words[0].slice(0, middle), words[0].slice(middle)].forEach(function (part) {
          if (queries.length < 4 && queries.indexOf(part) < 0) queries.push(part);
        });
      }
      return queries;
    }

    async function performLooseTitleSearch(searchTitle, sourceFullTitle, titleElement, generation) {
      if (generation !== lrrScanGeneration) return { success: false, stale: true };
      if (hasLrrMarker(titleElement, true)) return { success: true, skipped: true };

      var normalizedQuery = normalizeLooseTitle(searchTitle);
      if (!looseKeyIsUseful(normalizedQuery)) return { success: false, skipped: true };

      // 新缓存前缀避免旧版“未命中”缓存阻止新的宽松匹配。
      var filteredKey = getTitleSearchCacheKey('loose', sourceFullTitle + '|' + searchTitle);
      var known = getKnownLrrTitleMatches(sourceFullTitle, searchTitle);
      if (known.hits.length) {
        renderLrrTitleResult(titleElement, known.hits, false, searchTitle);
        return { success: true, hits: known.hits, possible: false };
      }
      var cached = getCache(filteredKey);
      if (cached && typeof cached.altHit === 'boolean') {
        var cachedHits = cached.altHit ? cached.altHits || [] : known.possibleHits;
        var cachedPossible = cached.altHit ? cached.altKind === 'possible' : true;
        renderLrrTitleResult(titleElement, cachedHits, cachedPossible, searchTitle);
        return { success: cachedHits.length > 0, cached: true, hits: cachedHits, possible: cachedPossible && cachedHits.length > 0 };
      }

      try {
        var queries = buildLooseSearchQueries(searchTitle);
        var candidates = known.possibleHits.slice(), hits = [], possibleHits = [], incomplete = false, lastError;
        for (var i = 0; i < queries.length; i++) {
          if (generation !== lrrScanGeneration) return { success: false, stale: true };
          if (hasLrrMarker(titleElement, true)) return { success: true, skipped: true };
          var query = queries[i];
          var result;
          try { result = await getTitleSearchCandidates(query, generation); }
          catch (e) { incomplete = true; lastError = e; continue; }
          if (generation !== lrrScanGeneration) return { success: false, stale: true };
          incomplete = incomplete || !!result.incomplete;
          // 回退词只负责召回，始终用完整标题校验，不能把相同关键词当作相同作品。
          candidates = candidates.concat(result.hits || []);
          var classified = classifyTitleCandidates(sourceFullTitle, searchTitle, candidates);
          hits = classified.hits;
          if (hits.length) break;
        }
        if (generation !== lrrScanGeneration) return { success: false, stale: true };
        // 后返回的源链接命中也可以补充别名；疑似候选不妨碍继续寻找更可靠的命中。
        var latestKnown = getKnownLrrTitleMatches(sourceFullTitle, searchTitle);
        var finalResult = classifyTitleCandidates(sourceFullTitle, searchTitle,
          candidates.concat(latestKnown.hits, latestKnown.possibleHits));
        hits = finalResult.hits;
        possibleHits = finalResult.possibleHits;
        var possible = !hits.length && possibleHits.length > 0;
        if (possible) hits = possibleHits;
        var hit = hits.length > 0;
        if (hit || !incomplete) setCache(filteredKey, { altHit: hit, altHits: hits, altKind: possible ? 'possible' : 'verified' });
        renderLrrTitleResult(titleElement, hits, possible, searchTitle);
        return { success: hit, hits: hits, possible: possible, error: lastError };
      } catch (e) {
        return { success: false, error: e, hits: [] };
      }
    }

    function handleResponse(result, titleElement, galleryUrl, generation) {
      if (generation !== undefined && generation !== lrrScanGeneration) return;
      if (isUrlfinderHit(result)) {
        log('[LRR Checker] Found: ' + galleryUrl + ' [' + (result.matchType || 'URL匹配') + ']');
        var exactHit = extractUrlfinderHit(result);
        prependLrrMarker(titleElement, '(LRR ✔)', ['lrr-marker-downloaded'], 'urlfinder', exactHit ? [exactHit] : [], galleryUrl);
        registerKnownLrrTitle(getGalleryTitlePlain(titleElement), exactHit, generation);
        return { success: true };
      }
      if (hasLrrMarker(titleElement, true)) return { success: true, skipped: true };
      if (!CONFIG.enableAltSearch) return;

      var fullTitle = getGalleryTitlePlain(titleElement);
      var parts = extractLooseTitleParts(fullTitle);
      var author = parts.author;
      var title = parts.shortTitle;

      if (!title || !looseKeyIsUseful(normalizeLooseTitle(title))) return;

      // 一级：作者 + 主标题；二级：主标题单独搜索 + 宽松候选过滤。
      if (author && author !== title) {
        return performAlternativeSearch(author + ',' + title, fullTitle, titleElement, generation).then(function (r) {
          if (r && r.success) return r;
          if (generation !== lrrScanGeneration) return { success: false, stale: true };
          if (hasLrrMarker(titleElement, true)) return { success: true, skipped: true };
          return performLooseTitleSearch(title, fullTitle, titleElement, generation);
        });
      } else {
        return performLooseTitleSearch(title, fullTitle, titleElement, generation);
      }
    }

    // E-Hentai 各列表模式的标题 DOM 不一致：
    // Extended/Compact/Minimal 通常有 .glink，而 Thumbnail 使用 .gl4t.glname。
    // 因此从图库链接反查标题节点，比只扫描 .glink 更可靠，收藏夹 Thumbnail 也兼容。
    function getLrrGalleryEntryFromLink(linkElement) {
      if (!linkElement || !linkElement.href) return null;
      var identity = extractGalleryIdentity(linkElement.href);
      if (!identity) return null;

      var container = linkElement.closest('.gl1t, tr, .gl1e, .gl1c, .gl1m, .gl2c, .gl2m, .gl3c, .gl3m');
      var titleElement = null;
      if (container) {
        titleElement = container.querySelector('.gl4t.glname') ||
          container.querySelector('.glink') ||
          container.querySelector('.glname');
      }
      if (!titleElement) {
        titleElement = linkElement.closest('.gl4t.glname, .glname') ||
          linkElement.querySelector('.glink') ||
          linkElement.closest('.glink');
      }
      if (!titleElement) return null;

      var u;
      try { u = new URL(linkElement.href, location.href); }
      catch (_) { return null; }
      var galleryUrl = u.protocol + '//' + u.host + '/g/' + identity.gid + '/' + identity.token + '/';
      return {
        key: identity.gid + '/' + identity.token,
        galleryUrl: galleryUrl,
        titleElement: titleElement
      };
    }

    function collectLrrGalleryEntries() {
      var entries = new Map();
      var links = document.querySelectorAll('.itg a[href*="/g/"]');
      links.forEach(function (linkElement) {
        // A cover and its title often link to the same gallery. Resolve its DOM only once.
        var identity = extractGalleryIdentity(linkElement.href);
        if (!identity || entries.has(identity.gid + '/' + identity.token)) return;
        var entry = getLrrGalleryEntryFromLink(linkElement);
        if (!entry || entries.has(entry.key)) return;
        entries.set(entry.key, entry);
      });
      return Array.from(entries.values());
    }

    function collectGalleriesFromDom() {
      var entries = collectLrrGalleryEntries();
      debugLog('页面图库条目', entries.length);
      entries.forEach(function (entry) {
        var galleryUrl = entry.galleryUrl;
        var titleElement = entry.titleElement;
        if (!titleElement || !titleElement.isConnected) return;

        // DOM 被页面脚本重绘后，旧 marker 可能消失。先从缓存恢复，再用 seen 去重网络请求。
        if (hasLrrMarker(titleElement)) { seenGalleryUrls.add(galleryUrl); return; }
        var cacheKey = getUrlCacheKey(galleryUrl);
        var cachedData = typeof lrrLibraryIndex !== 'undefined' && lrrLibraryIndex.snapshot ? null : getCache(cacheKey);
        if (cachedData) {
          handleResponse(cachedData, titleElement, galleryUrl, lrrScanGeneration);
          seenGalleryUrls.add(galleryUrl);
          return;
        }
        if (seenGalleryUrls.has(galleryUrl)) return;
        seenGalleryUrls.add(galleryUrl);
        galleriesToCheck.push({ galleryUrl: galleryUrl, titleElement: titleElement, cacheKey: cacheKey, generation: lrrScanGeneration });
      });
    }

    async function processInBatches(items, processFn, batchSize) {
      batchSize = Math.max(1, parseInt(batchSize, 10) || 1);
      var results = [];
      for (var i = 0; i < items.length; i += batchSize) {
        var batch = items.slice(i, i + batchSize);
        var batchResults = await Promise.all(batch.map(processFn));
        results.push.apply(results, batchResults);
      }
      return results;
    }

    function flushPendingRequests() {
      var batch = galleriesToCheck.splice(0, galleriesToCheck.length);
      if (batch.length === 0) return;
      ensureLrrRequestPools();
      return Promise.all(batch.map(function (gallery) {
        return runLrrCheckLimited(function () {
          // A queued task may outlive a rescan or its original DOM row.
          if (gallery.generation !== lrrScanGeneration || !gallery.titleElement ||
              gallery.titleElement.isConnected === false || !CONFIG.enableLrrChecker || !CONFIG.lrrServerUrl)
            return { success: false, stale: true, galleryUrl: gallery.galleryUrl };
          return processGallery(gallery);
        });
      })).catch(function (e) {
        runtimeConsole('error', '[LRR Checker] Batch processing failed:', e);
      });
    }


    var lrrRescanTimer = null;
    var lrrDomScanTimer = null;
    var lrrDomObserver = null;
    var lrrCheckerInitialized = false;

    function scheduleLrrRescan() {
      if (lrrRescanTimer) clearTimeout(lrrRescanTimer);
      lrrRescanTimer = setTimeout(function(){
        rescanCurrentPage(true);
        syncLrrLibraryIndex(true);
      }, 500);
    }

    function scheduleLrrDomScan(delayMs) {
      if (!CONFIG.enableLrrChecker || !CONFIG.lrrServerUrl) return;
      if (lrrDomScanTimer) clearTimeout(lrrDomScanTimer);
      lrrDomScanTimer = setTimeout(function () {
        lrrDomScanTimer = null;
        collectGalleriesFromDom();
        flushPendingRequests();
      }, delayMs == null ? MUTATION_DEBOUNCE_MS : Math.max(0, delayMs));
    }

    function lrrMutationTouchesList(mutation) {
      var markerSelector = '.eh-gallery-markers, .lrr-marker-span, .eh-uncensored-marker';
      var changedTarget = mutation.target;
      // Adding our own badges cannot introduce galleries. Keep removals observable so
      // badges deleted by the page are still restored on the next scan.
      if (!mutation.removedNodes.length && mutation.addedNodes.length) {
        if (changedTarget && changedTarget.nodeType === 1 && changedTarget.closest(markerSelector)) return false;
        var onlyMarkers = Array.prototype.every.call(mutation.addedNodes, function (node) {
          return node.nodeType === 1 && node.matches(markerSelector);
        });
        if (onlyMarkers) return false;
      }
      function touches(node) {
        if (!node || node.nodeType !== 1) return false;
        if (node.matches && node.matches('.itg, .glink, .gl4t.glname, a[href*="/g/"]')) return true;
        return !!(node.querySelector && node.querySelector('.itg, .glink, .gl4t.glname, a[href*="/g/"]'));
      }
      var target = mutation.target;
      if (target && target.nodeType === 1 && target.closest && target.closest('.itg')) return true;
      var i;
      for (i = 0; i < mutation.addedNodes.length; i++) if (touches(mutation.addedNodes[i])) return true;
      for (i = 0; i < mutation.removedNodes.length; i++) if (touches(mutation.removedNodes[i])) return true;
      return false;
    }

    function setupGalleryListObserver() {
      if (lrrDomObserver || typeof MutationObserver === 'undefined') return;
      lrrDomObserver = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (!lrrMutationTouchesList(mutations[i])) continue;
          scheduleLrrDomScan();
          scheduleUncensoredScan();
          break;
        }
      });
      lrrDomObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    function setupLrrChecker() {
      if (!CONFIG.enableLrrChecker || !CONFIG.lrrServerUrl) return;
      if (!lrrCheckerInitialized) {
        lrrCheckerInitialized = true;
        ensureLrrRequestPools();
        cleanupExpiredCache();
        if (typeof startLrrIndexSync === 'function') startLrrIndexSync();
      }

      // DOMContentLoaded 时列表偶尔还没稳定，立即扫一次并安排补扫。
      scheduleLrrDomScan(0);
      setTimeout(function () { scheduleLrrDomScan(0); }, 350);
      setTimeout(function () { scheduleLrrDomScan(0); }, 1200);

      // 不再只观察“初始化瞬间存在的 .itg”。首页/收藏夹若稍后生成或重绘列表，也能自动重新挂上查重。
      setupGalleryListObserver();

      // BFCache/页面恢复后主动补扫，避免“悬浮球恢复了但查重没有恢复”。
      window.addEventListener('pageshow', function () { scheduleLrrDomScan(0); }, false);
      window.addEventListener('load', function () { scheduleLrrDomScan(0); }, { once: true });
    }

    /* ================================================================
     *  浏览体验增强
     * ================================================================ */

    // ---- 翻译高亮：跟随界面语言 ----
    function setupChineseHighlight() {
      if (!CONFIG.enableChineseHighlight) return;

      var title_path = "//div[contains(@class, 'gl4t')]";
      var titles = document.evaluate(title_path, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      var title, idx = 0;
      var chinesePatt = /中文|中国|Chinese|中國|汉化|漢化|未來數位|重嵌|新桥|CE家族|翻譯|翻译|嵌字|整合|个人|個人|机翻|機翻/;
      var englishPatt = /\bEnglish\b|English\s*(?:Translation|Translated)|Translated\s*(?:to|into)\s*English|英語|英语|英文|英译|英譯|英訳/i;
      var titlePatt = CONFIG.uiLanguage === 'en' ? englishPatt : chinesePatt;
      while ((title = titles.snapshotItem(idx))) {
        var value = title.innerText || '';
        if (titlePatt.test(value)) title.setAttribute('style', 'color: #ff8d8d; font-weight: bold;');
        idx++;
      }
    }

    /* ================================================================
     *  美观 UI 配置面板
     * ================================================================ */

    // Three standalone templates: one shell, two scoped legacy views (all original control IDs remain stable).
    var SHELL_HTML = `
<div id="eh-toolkit-shell" role="region" aria-label="EH Library Toolkit" style="display:none" data-tab="download">
  <header id="eh-toolkit-header"><span class="eh-brand-mark">EL</span><strong>Library Toolkit</strong><button type="button" id="eh-toolkit-close" aria-label="关闭面板" title="关闭面板">×</button></header>
  <nav class="eh-toolkit-tabs" role="tablist" aria-label="工具导航">
    <button type="button" id="eh-tab-download" role="tab" data-eh-tab="download" aria-controls="eh-gallerydl-panel" aria-selected="true">下载</button>
    <button type="button" id="eh-tab-check" role="tab" data-eh-tab="check" aria-controls="eh-toolbox-panel" aria-selected="false" tabindex="-1">查重</button>
    <button type="button" id="eh-tab-settings" role="tab" data-eh-tab="settings" aria-controls="eh-toolbox-panel" aria-selected="false" tabindex="-1">设置</button>
  </nav>
  <div id="eh-toolkit-content"></div>
</div>`;

    var PANEL_HTML = `
<div id="eh-toolbox-panel" role="tabpanel" aria-labelledby="eh-tab-check">
  <div id="eh-toolbox-body">
    <section data-eh-view="check">
      <div class="eh-view-heading"><span>Lanraragi 查重</span><label class="eh-switch"><input type="checkbox" id="cfg-enableLrrChecker"> 启用查重</label></div>
      <div id="eh-tb-lrr-status" class="eh-tb-lrr-status checking"><div class="eh-tb-status-main">LRR：等待检测</div><div class="eh-tb-status-detail">将自动检测服务器状态</div></div>
      <div class="eh-subtle" id="eh-tb-index-status" role="status">尚无完整本地索引</div>
      <div class="eh-tb-actions eh-index-actions"><button id="eh-tb-sync-index" class="eh-tb-btn eh-tb-btn-primary">立即同步</button><button id="eh-tb-rescan-lrr" class="eh-tb-btn">重新扫描当前页</button><button id="eh-tb-test-lrr" class="eh-tb-btn">测试LRR连接</button></div>
      <details class="eh-tb-section"><summary>维护工具</summary>
        <div class="eh-tb-actions"><button id="eh-tb-rescan-folder" class="eh-tb-btn">重新扫描档案文件夹</button></div>
        <div class="eh-tb-actions"><button id="eh-tb-clear-lrr" class="eh-tb-btn eh-tb-btn-warning">清空全部LRR缓存</button></div>
      </details>
      <p class="eh-gdl-hint">更改开关后，在设置中保存并刷新。</p>
    </section>
    <section data-eh-view="settings" hidden>
      <div class="eh-view-heading">偏好设置 <span class="eh-tb-version"></span></div>
      <details class="eh-tb-section" open><summary>界面与语言</summary>
        <label class="eh-field"><span>语言 / Language</span><select id="cfg-uiLanguage" translate="no" class="notranslate"><option value="zh" lang="zh-CN" translate="no">中文</option><option value="en" lang="en" translate="no" class="notranslate">English</option></select></label>
        <label class="eh-field"><span>外观</span><select id="eh-toolkit-theme"><option value="auto">跟随系统</option><option value="dark">深色</option><option value="light">浅色</option></select></label>
        <div class="eh-tb-actions"><button id="eh-tb-reset-position" class="eh-tb-btn">恢复入口默认位置</button></div>
        <div class="eh-option-grid">
          <label><input type="checkbox" id="cfg-enableChineseHighlight"> 中文翻译高亮</label>
          <label><input type="checkbox" id="cfg-enableUncensoredLabel"> 无修正标签</label>
        </div>
      </details>
      <details class="eh-tb-section"><summary>LRR 连接</summary>
        <label class="eh-field eh-field-stack"><span>LRR 服务器</span><input type="text" id="cfg-lrrServerUrl" placeholder="http://127.0.0.1:3000" autocomplete="off"></label>
        <label class="eh-field eh-field-stack"><span>API Key <small id="eh-tb-api-key-status">API Key：未配置</small></span><input type="password" id="cfg-lrrApiKey" autocomplete="off"></label>
        <label class="eh-check"><input type="checkbox" id="cfg-clearLrrApiKey"> 清除已保存 API Key</label>
        <p class="eh-subtle">留空保留已保存 Key；勾选清除优先。保存时立即清空输入。输入期间宿主页脚本仍可读取，不是安全隔离。</p>
      </details>
      <details class="eh-tb-section"><summary>LRR 性能与搜索</summary>
        <label class="eh-field"><span>主查重并发</span><input type="number" id="cfg-lrrConcurrency" min="1" value="8"></label>
        <label class="eh-field"><span>备用搜索并发</span><input type="number" id="cfg-altSearchConcurrency" min="1" value="2"></label>
        <label class="eh-check"><input type="checkbox" id="cfg-enableAltSearch"> 启用备用标题搜索</label>
      </details>
      <details class="eh-tb-section"><summary>高级</summary>
        <div class="eh-tb-actions"><button id="eh-tb-export-logs" class="eh-tb-btn">导出本次运行日志</button></div>
        <p class="eh-subtle">仅本次页面运行 · 最多10000条/5MB，超限丢弃最旧记录 · 导出前请检查隐私</p>
      </details>
      <div class="eh-tb-actions"><button id="eh-tb-save" class="eh-tb-btn eh-tb-btn-primary">保存并刷新</button><button id="eh-tb-reset" class="eh-tb-btn">恢复默认</button></div>
    </section>
  </div>
</div>`;

    var GALLERY_DL_PANEL_HTML = `
<div id="eh-gallerydl-panel" role="tabpanel" aria-labelledby="eh-tab-download">
  <div id="eh-gallerydl-body">
    <div class="eh-view-heading">图片 ZIP 下载 <em id="eh-gdl-page-preview"></em></div>
    <div class="eh-gdl-preview"><span>ZIP</span><strong id="eh-gdl-title-preview">-</strong></div>
    <div class="eh-download-options"><label class="eh-check"><input type="checkbox" id="cfg-galleryDlOriginal"> 原画</label><label class="eh-inline-field"><span>并行任务</span><input type="number" id="cfg-galleryDlParallel" min="1" step="1" value="5"></label></div>
    <div id="eh-gdl-status" class="eh-tb-lrr-status checking">
      <div class="eh-tb-status-main">就绪</div>
      <div class="eh-tb-status-detail">选择画质后开始</div>
      <div id="eh-gdl-metrics" class="eh-gdl-metrics" style="display:none">
        <div><strong id="eh-gdl-speed">--</strong><span>当前速度（近5秒）</span></div>
        <div><strong id="eh-gdl-average-speed">--</strong><span>平均速度</span></div>
        <div><strong id="eh-gdl-network">--</strong><span>网络接收（含重试）</span></div>
        <div><strong id="eh-gdl-downloaded">--</strong><span>已写入 ZIP</span></div>
        <div><strong id="eh-gdl-progress">--</strong><span>图片进度</span></div>
        <div><strong id="eh-gdl-workers">--</strong><span>并行任务</span></div>
      </div>
    </div>
    <div class="eh-tb-actions eh-gdl-actions"><button id="eh-gdl-download" class="eh-tb-btn eh-gdl-btn-primary">下载当前图库</button></div>
    <details class="eh-tb-section"><summary>命名与元数据</summary>
      <label class="eh-check"><input type="radio" name="cfg-galleryDlTitleMode" value="default"> 默认标题（英文/中文/罗马音）</label>
      <label class="eh-check"><input type="radio" name="cfg-galleryDlTitleMode" value="japanese"> 原文/日文标题（如果有）</label>
      <label class="eh-check"><input type="checkbox" id="cfg-galleryDlWriteMetadata"> 打包 metadata.json + LRR兼容 info.json</label>
      <p class="eh-gdl-hint">001.ext · 002.ext · 003.ext · 保留原始格式</p>
      <div class="eh-tb-actions"><button id="eh-gdl-save" class="eh-tb-btn">保存下载设置</button></div>
    </details>
    <p class="eh-gdl-hint eh-session-note">暂停可继续 · 刷新无法恢复 · <span class="eh-tb-version"></span></p>
  </div>
</div>`;

    var PANEL_CSS = `
/* Toolkit UI: one compact surface, shared tokens, isolated from host form styles. */
#eh-toolkit-shell, #eh-toolkit-launcher {
  --eh-bg:#1b201f; --eh-surface:#242b29; --eh-input:#151b19; --eh-border:#38433e;
  --eh-text:#edf3ef; --eh-muted:#a0afa6; --eh-accent:#8be0bc; --eh-accent-ink:#10271c;
  --eh-danger:#f4a5a5; color-scheme:dark;
  font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; text-align:left;
  color:var(--eh-text); pointer-events:auto !important;
}
#eh-toolkit-shell[data-theme="light"] {
  --eh-bg:#f9fcfa; --eh-surface:#eef4f0; --eh-input:#fff; --eh-border:#ccd8d0;
  --eh-text:#21372b; --eh-muted:#5c7063; --eh-accent:#216f50; --eh-accent-ink:#fff;
  --eh-danger:#a23636; color-scheme:light;
}
@media(prefers-color-scheme:light) { #eh-toolkit-shell[data-theme="auto"] {
  --eh-bg:#f9fcfa; --eh-surface:#eef4f0; --eh-input:#fff; --eh-border:#ccd8d0;
  --eh-text:#21372b; --eh-muted:#5c7063; --eh-accent:#216f50; --eh-accent-ink:#fff;
  --eh-danger:#a23636; color-scheme:light;
} }
#eh-toolkit-shell {
  position:fixed; top:60px; right:16px; bottom:auto; z-index:2147483646;
  width:min(340px,calc(100vw - 32px)); max-height:min(560px,calc(100vh - 76px));
  max-height:min(560px,calc(100dvh - 76px));
  display:flex; flex-direction:column; overflow:hidden; border:1px solid var(--eh-border);
  border-radius:14px; background:var(--eh-bg); box-shadow:0 12px 44px #0005;
}
#eh-toolkit-shell *, #eh-toolkit-launcher { box-sizing:border-box; }
#eh-toolkit-shell [hidden] { display:none !important; }
#eh-toolkit-header { display:flex; align-items:center; gap:8px; height:48px; min-height:48px; margin:0; padding:8px 12px; flex-shrink:0; background:var(--eh-bg); color:var(--eh-text); border:0; }
#eh-toolkit-header .eh-brand-mark { display:flex; align-items:center; justify-content:center; flex:none; position:static; margin:0; padding:0; color:var(--eh-accent); font:700 11px/1 monospace; width:24px; height:24px; text-align:center; border:1px solid var(--eh-border); border-radius:7px; }
#eh-toolkit-header strong { flex:1; font-size:12px; letter-spacing:.2px; }
#eh-toolkit-shell button { font:inherit; cursor:pointer; }
#eh-toolkit-close { width:32px; height:32px; border:0; border-radius:7px; background:transparent; color:var(--eh-muted); font-size:22px !important; }
#eh-toolkit-close:hover { background:var(--eh-surface); color:var(--eh-text); }
.eh-toolkit-tabs { display:flex; gap:4px; padding:0 12px 8px; flex-shrink:0; border-bottom:1px solid var(--eh-border); }
#eh-toolkit-shell .eh-toolkit-tabs button { flex:1; min-height:32px; border:0; border-radius:7px; color:var(--eh-muted); background:transparent; }
#eh-toolkit-shell .eh-toolkit-tabs [aria-selected="true"] { color:var(--eh-accent); background:var(--eh-surface); font-weight:600; }
#eh-toolkit-content { overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:var(--eh-border) transparent; min-height:0; }
#eh-toolbox-panel, #eh-gallerydl-panel { padding:14px 12px 12px; position:static; width:auto; background:transparent; }
#eh-toolkit-shell .eh-view-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; font-weight:600; margin-bottom:10px; }
#eh-toolkit-shell .eh-view-heading em, #eh-toolkit-shell .eh-tb-version { color:var(--eh-muted); font-size:10px; font-weight:400; font-style:normal; }
#eh-toolkit-shell .eh-tb-section { border:1px solid var(--eh-border); border-radius:9px; margin:10px 0 0; padding:0 10px; }
#eh-toolkit-shell summary { cursor:pointer; color:var(--eh-muted); font-weight:500; min-height:36px; display:list-item; list-style-position:inside; padding:8px 0; }
#eh-toolkit-shell details[open] > summary { margin-bottom:4px; border-bottom:1px solid var(--eh-border); }
#eh-toolkit-shell details[open] { padding-bottom:8px; }
#eh-toolkit-shell .eh-field { display:grid; grid-template-columns:1fr 110px; align-items:center; gap:8px; margin:8px 0; }
#eh-toolkit-shell .eh-field-stack { grid-template-columns:1fr; gap:4px; }
#eh-toolkit-shell .eh-check, #eh-toolkit-shell .eh-switch, #eh-toolkit-shell .eh-option-grid label { display:flex; align-items:center; gap:6px; min-height:30px; cursor:pointer; font-weight:400; }
#eh-toolkit-shell .eh-switch { color:var(--eh-muted); font-size:11px; }
#eh-toolkit-shell .eh-option-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 8px; margin:8px 0; }
#eh-toolkit-shell input[type="text"], #eh-toolkit-shell input[type="password"], #eh-toolkit-shell input[type="number"], #eh-toolkit-shell select {
  min-width:0 !important; width:100% !important; height:32px !important; margin:0 !important; padding:4px 8px !important;
  border:1px solid var(--eh-border) !important; border-radius:6px !important; background:var(--eh-input) !important;
  color:var(--eh-text) !important; -webkit-text-fill-color:var(--eh-text) !important; font-family:inherit !important; font-size:12px !important; line-height:1.4;
}
#eh-toolkit-shell input::placeholder { color:var(--eh-muted) !important; -webkit-text-fill-color:var(--eh-muted) !important; }
#eh-toolkit-shell input[type="checkbox"], #eh-toolkit-shell input[type="radio"] { width:14px; height:14px; margin:0; accent-color:var(--eh-accent); flex-shrink:0; }
#eh-toolkit-shell :is(input,select,button,summary):focus-visible { outline:2px solid var(--eh-accent); outline-offset:2px; }
#eh-toolkit-shell .eh-tb-actions { display:flex; gap:6px; margin-top:8px; }
#eh-toolkit-shell .eh-tb-btn { flex:1; min-width:0; min-height:32px; padding:6px 8px; border:1px solid var(--eh-border); border-radius:7px; background:var(--eh-surface); color:var(--eh-text); font-size:11px; font-weight:500; }
#eh-toolkit-shell .eh-tb-btn:hover { filter:brightness(1.12); }
#eh-toolkit-shell .eh-tb-btn-primary, #eh-toolkit-shell .eh-gdl-btn-primary { color:var(--eh-accent-ink); background:var(--eh-accent); border-color:var(--eh-accent); font-weight:600; }
#eh-toolkit-shell .eh-tb-btn-warning { color:var(--eh-danger); }
#eh-toolkit-shell .eh-tb-btn:disabled { opacity:.5; cursor:wait; }
#eh-toolkit-shell .eh-index-actions { flex-wrap:wrap; }
#eh-toolkit-shell .eh-index-actions .eh-tb-btn { flex:1 1 85px; max-width:100%; }
#eh-toolkit-shell #eh-tb-sync-index { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
#eh-toolkit-shell .eh-gdl-preview { display:flex; align-items:baseline; gap:8px; padding:10px; background:var(--eh-surface); border-radius:8px; margin-bottom:10px; }
#eh-toolkit-shell .eh-gdl-preview > span { font-size:10px; color:var(--eh-muted); }
#eh-toolkit-shell .eh-gdl-preview strong { font-size:11px; font-weight:500; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
#eh-toolkit-shell .eh-download-options { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; }
#eh-toolkit-shell .eh-inline-field { display:flex; align-items:center; gap:8px; color:var(--eh-muted); }
#eh-toolkit-shell .eh-inline-field input { width:58px !important; }
#eh-toolkit-shell .eh-tb-lrr-status { padding:10px; border:1px solid var(--eh-border); border-radius:8px; background:var(--eh-surface); }
#eh-toolkit-shell .eh-tb-status-main { font-weight:500; overflow-wrap:anywhere; }
#eh-toolkit-shell .eh-tb-status-main::before { content:""; display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--eh-muted); margin-right:6px; vertical-align:2px; }
#eh-toolkit-shell .online .eh-tb-status-main::before { background:var(--eh-accent); }
#eh-toolkit-shell .offline .eh-tb-status-main::before { background:var(--eh-danger); }
#eh-toolkit-shell .eh-tb-status-detail { font-size:11px; color:var(--eh-muted); margin-top:3px; overflow-wrap:anywhere; }
#eh-toolkit-shell .eh-gdl-metrics { grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; padding-top:8px; border-top:1px solid var(--eh-border); }
#eh-toolkit-shell .eh-gdl-metrics strong { display:block; color:var(--eh-accent); font-size:12px; font-weight:500; }
#eh-toolkit-shell .eh-gdl-metrics span { display:block; color:var(--eh-muted); font-size:10px; }
#eh-toolkit-shell .eh-gdl-hint { font-size:10px; color:var(--eh-muted); margin:8px 0 0; line-height:1.5; }
#eh-toolkit-shell .eh-session-note { text-align:center; }
#eh-toolkit-launcher { position:fixed; top:16px; right:16px; bottom:auto; z-index:2147483647; display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; min-width:0; min-height:0; margin:0; padding:0; appearance:none; text-align:center; text-indent:0; text-transform:none; font-family:Arial,sans-serif; line-height:1; border:1px solid #496052; border-radius:11px; background:#202e26; color:#a0edc9; font-weight:700; font-size:11px; letter-spacing:0; cursor:pointer; box-shadow:0 3px 12px #0003; touch-action:none; user-select:none; }
#eh-toolkit-launcher:hover { background:#304238; }
#eh-toolkit-launcher:focus-visible { outline:2px solid #8be0bc; outline-offset:3px; }
@media(max-height:420px) { #eh-toolkit-shell { top:60px; bottom:auto; max-height:calc(100vh - 76px); max-height:calc(100dvh - 76px); } }
.lrr-match-tag { display:inline-block; margin-left:5px; padding:2px 6px; border-radius:4px; color:#fff; font-size:12px; cursor:pointer; font-weight:bold; }
.lrr-match-tag.exact { background:#28a745; }
.lrr-match-tag.high, .lrr-match-tag.similar { background:#f1c40f; color:#222; }
.lrr-match-tag:hover { filter:brightness(1.15); }

/* LRR Marker 样式 */
.lrr-marker-span, .eh-uncensored-marker {
  z-index:20;
  font-weight: 700; border-radius: 4px; padding: 1px 5px; margin-right: 4px;
  font-size: 0.96em; position: relative; display: inline-block;
  cursor: pointer; transition: filter 0.15s, transform 0.15s;
}
.lrr-marker-span:hover { filter: brightness(1.2); transform: translateY(-1px); z-index:999999 !important; }
/* Thumbnail 模式：LRR 标签作为封面角标，不参与标题排版，避免把标题挤成竖排/截断。 */
.gl3t.eh-lrr-marker-host { position: relative !important; }
.gl3t.eh-lrr-marker-host > .eh-gallery-markers-thumbnail {
  position: absolute !important; top: 6px; left: 6px; margin: 0 !important;
  z-index: 60 !important; line-height: 1.45; white-space: nowrap;
  font-size: 14px !important; font-weight: 800 !important;
  border-radius: 6px; padding: 3px 9px; letter-spacing: .2px;
  box-shadow: 0 2px 8px rgba(0,0,0,.55);
}
.eh-gallery-markers { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; vertical-align: middle; margin-right: 4px; }
.eh-gallery-markers:empty { display: none; }
.eh-gallery-markers > span { margin-right: 0; flex: none; }
.gl3t.eh-lrr-marker-host > .eh-gallery-markers-thumbnail { padding: 0; box-shadow: none; }
.eh-gallery-markers-thumbnail > span { padding: 3px 7px; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,.55); }
.eh-uncensored-marker { color: #fff; background: #b45309; cursor: default; }
.lrr-marker-downloaded { color: #fff; background: linear-gradient(135deg, #28a745, #49995d); }
.lrr-marker-file { color: #fff; background: linear-gradient(135deg, #356ddc, #894ab0); }
.lrr-marker-possible { color: #241600; background: linear-gradient(135deg, #ffcd57, #f3a43b); }

/* LRR Hover Card */
`;





    // Compatibility wrappers share one launcher and one shell. Closing a view never touches a download task.
    var toolkitShell = null;
    var toolkitDownloadPanel = null;
    var toolkitSettingsPanel = null;

    var toolkitLauncher = null;
    var toolkitPosition = null;
    var toolkitPositionRevision = 0;
    var toolkitPositionLoadStarted = false;
    var toolkitPositionWriteChain = Promise.resolve();
    var toolkitViewportBound = false;
    var toolkitDragBound = new WeakSet();
    var toolkitSuppressClick = false;

    function normalizeToolkitPosition(value) {
      if (!value || typeof value !== 'object' || value.version !== 1 ||
          typeof value.xRatio !== 'number' || typeof value.yRatio !== 'number' ||
          !Number.isFinite(value.xRatio) || !Number.isFinite(value.yRatio) ||
          value.xRatio < 0 || value.xRatio > 1 || value.yRatio < 0 || value.yRatio > 1) return null;
      return { version: 1, xRatio: value.xRatio, yRatio: value.yRatio };
    }

    function computeToolkitLayout(viewport, position, panelHeight) {
      viewport = viewport || {};
      function finite(value, fallback) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
      var left = Math.max(0, finite(viewport.left, 0)), top = Math.max(0, finite(viewport.top, 0));
      var width = Math.max(1, finite(viewport.width, 1)), height = Math.max(1, finite(viewport.height, 1));
      var marginX = Math.min(16, Math.max(0, (width - 34) / 2));
      var marginY = Math.min(16, Math.max(0, (height - 34) / 2));
      var rangeX = Math.max(0, width - 34 - marginX * 2), rangeY = Math.max(0, height - 34 - marginY * 2);
      position = normalizeToolkitPosition(position);
      var x = left + marginX + rangeX * (position ? position.xRatio : 1);
      var y = top + marginY + rangeY * (position ? position.yRatio : 0);
      var panelWidth = Math.max(1, Math.min(340, width - marginX * 2));
      var panelX = Math.max(left + marginX, Math.min(x + 34 - panelWidth, left + width - marginX - panelWidth));
      var below = Math.max(0, top + height - marginY - (y + 44));
      var above = Math.max(0, y - 10 - top - marginY);
      var desired = Math.max(1, Math.min(560, finite(panelHeight, 560)));
      var placement = below >= desired || below >= above ? 'below' : 'above';
      var available = placement === 'below' ? below : above;
      // In an extremely short viewport there is no usable space beside the button:
      // overlap rather than pushing the shell outside the visible viewport.
      if (available < 80) {
        available = Math.max(1, height - marginY * 2);
        return { x: x, y: y, panelX: panelX, panelY: top + marginY,
          panelWidth: panelWidth, panelMaxHeight: Math.min(560, available), placement: 'overlap' };
      }
      var maxHeight = Math.min(desired, available);
      return { x: x, y: y, panelX: panelX,
        panelY: placement === 'below' ? y + 44 : y - 10 - Math.min(desired, maxHeight),
        panelWidth: panelWidth, panelMaxHeight: maxHeight, placement: placement };
    }

    function getToolkitViewport() {
      var visual = window.visualViewport;
      return { left: visual ? visual.offsetLeft : 0, top: visual ? visual.offsetTop : 0,
        width: visual ? visual.width : window.innerWidth, height: visual ? visual.height : window.innerHeight };
    }

    function positionToolkitUi() {
      var ball = toolkitLauncher || document.getElementById('eh-toolkit-launcher');
      var shell = toolkitShell || document.getElementById('eh-toolkit-shell');
      var viewport = getToolkitViewport();
      var layout = computeToolkitLayout(viewport, toolkitPosition, 560);
      if (ball) {
        ball.style.left = layout.x + 'px'; ball.style.top = layout.y + 'px';
        ball.style.right = 'auto'; ball.style.bottom = 'auto';
        ball.style.maxWidth = Math.max(1, viewport.width) + 'px';
        ball.style.maxHeight = Math.max(1, viewport.height) + 'px';
      }
      if (shell) {
        shell.style.width = layout.panelWidth + 'px';
        shell.style.maxHeight = '560px';
        var naturalHeight = shell.style.display === 'none' ? 560 : shell.getBoundingClientRect().height;
        layout = computeToolkitLayout(viewport, toolkitPosition, naturalHeight || 560);
        shell.style.left = layout.panelX + 'px'; shell.style.top = layout.panelY + 'px';
        shell.style.right = 'auto'; shell.style.bottom = 'auto';
        shell.style.maxHeight = layout.panelMaxHeight + 'px';
      }
    }

    function persistToolkitPosition() {
      var saved = toolkitPosition ? Object.assign({}, toolkitPosition) : null;
      // Preserve write order so an earlier delayed drag cannot overwrite reset/new drag.
      toolkitPositionWriteChain = toolkitPositionWriteChain.catch(function () {}).then(function () {
        return gmSet('ehToolkitPosition', saved);
      }).catch(function () { recordRuntimeLog('warn', 'ui.position-save-failed', {}); });
      return toolkitPositionWriteChain;
    }

    function resetToolkitPosition() {
      toolkitPositionRevision++;
      toolkitPosition = null;
      positionToolkitUi();
      return persistToolkitPosition();
    }

    function setupToolkitDrag(ball) {
      if (!ball || toolkitDragBound.has(ball)) return;
      toolkitDragBound.add(ball);
      if (!toolkitViewportBound) {
        toolkitViewportBound = true;
        window.addEventListener('resize', positionToolkitUi);
        if (window.visualViewport) {
          window.visualViewport.addEventListener('resize', positionToolkitUi);
          window.visualViewport.addEventListener('scroll', positionToolkitUi);
        }
      }
      if (!toolkitPositionLoadStarted) {
        toolkitPositionLoadStarted = true;
        var revision = toolkitPositionRevision;
        Promise.resolve().then(function () { return gmGet('ehToolkitPosition', null); }).then(function (saved) {
          if (toolkitPositionRevision !== revision) return;
          toolkitPosition = normalizeToolkitPosition(saved); positionToolkitUi();
        }).catch(function () { recordRuntimeLog('warn', 'ui.position-load-failed', {}); });
      }
      var drag = null;
      ball.addEventListener('pointerdown', function (event) {
        if (event.isPrimary === false || (event.button !== undefined && event.button !== 0) || drag) return;
        toolkitSuppressClick = false;
        var layout = computeToolkitLayout(getToolkitViewport(), toolkitPosition, 560);
        drag = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: layout.x, y: layout.y, moved: false };
        try { ball.setPointerCapture(event.pointerId); } catch (_) {}
      });
      ball.addEventListener('pointermove', function (event) {
        if (!drag || event.pointerId !== drag.id) return;
        var dx = event.clientX - drag.startX, dy = event.clientY - drag.startY;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
        if (!drag.moved && Math.hypot(dx, dy) < 5) return;
        if (!drag.moved) { drag.moved = true; toolkitPositionRevision++; }
        event.preventDefault();
        var viewport = getToolkitViewport();
        var origin = computeToolkitLayout(viewport, { version: 1, xRatio: 0, yRatio: 0 }, 560);
        var end = computeToolkitLayout(viewport, { version: 1, xRatio: 1, yRatio: 1 }, 560);
        toolkitPosition = { version: 1,
          xRatio: end.x > origin.x ? Math.max(0, Math.min(1, (drag.x + dx - origin.x) / (end.x - origin.x))) : 0,
          yRatio: end.y > origin.y ? Math.max(0, Math.min(1, (drag.y + dy - origin.y) / (end.y - origin.y))) : 0 };
        positionToolkitUi();
      });
      function finish(event) {
        if (!drag || event.pointerId !== drag.id) return;
        var finished = drag; drag = null;
        if (finished.moved) { toolkitSuppressClick = true; persistToolkitPosition(); }
        try { if (ball.hasPointerCapture(finished.id)) ball.releasePointerCapture(finished.id); } catch (_) {}
        positionToolkitUi();
      }
      ball.addEventListener('pointerup', finish);
      ball.addEventListener('pointercancel', finish);
      ball.addEventListener('lostpointercapture', finish);
      positionToolkitUi();
    }

    function setToolkitTab(tab) {
      var shell = document.getElementById('eh-toolkit-shell');
      if (!shell) return;
      tab = ['download', 'check', 'settings'].indexOf(tab) >= 0 ? tab : 'download';
      shell.setAttribute('data-tab', tab);
      var buttons = shell.querySelectorAll('[data-eh-tab]');
      for (var i = 0; i < buttons.length; i++) {
        var selected = buttons[i].getAttribute('data-eh-tab') === tab;
        buttons[i].setAttribute('aria-selected', String(selected));
        buttons[i].tabIndex = selected ? 0 : -1;
      }
      var download = shell.querySelector('#eh-gallerydl-panel');
      var toolbox = shell.querySelector('#eh-toolbox-panel');
      if (download) download.style.display = tab === 'download' ? 'block' : 'none';
      if (toolbox) {
        toolbox.style.display = tab === 'download' ? 'none' : 'block';
        toolbox.setAttribute('aria-labelledby', 'eh-tab-' + tab);
        var views = toolbox.querySelectorAll('[data-eh-view]');
        for (var j = 0; j < views.length; j++) views[j].hidden = views[j].getAttribute('data-eh-view') !== tab;
      }
      if (download && tab === 'download') updateGalleryDlPreview(download);
      if (toolkitLauncher) positionToolkitUi();
    }

    function setToolkitOpen(show, tab) {
      var shell = document.getElementById('eh-toolkit-shell');
      if (!shell) return;
      if (tab) setToolkitTab(tab);
      shell.style.display = show ? 'flex' : 'none';
      var launcher = document.getElementById('eh-toolkit-launcher');
      if (launcher) launcher.setAttribute('aria-expanded', String(!!show));
      if (toolkitLauncher) positionToolkitUi();
    }

    function ensureToolkitShell() {
      var existing = document.getElementById('eh-toolkit-shell');
      if (existing) return existing;
      if (!document.body) return null;
      // Reattach the same DOM after host replacements: preserve event bindings and live task controls.
      if (toolkitShell) { document.body.appendChild(toolkitShell); return toolkitShell; }
      var container = document.createElement('div');
      container.innerHTML = localizeHtml(SHELL_HTML);
      var shell = toolkitShell = container.firstElementChild;
      shell.setAttribute('data-theme', 'dark');
      document.body.appendChild(shell);
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { positionToolkitUi(); }).observe(shell);
      Promise.resolve(gmGet('ehToolkitTheme', 'dark')).then(function (theme) {
        shell.setAttribute('data-theme', ['auto', 'dark', 'light'].indexOf(theme) >= 0 ? theme : 'dark');
        var select = shell.querySelector('#eh-toolkit-theme');
        if (select) select.value = shell.getAttribute('data-theme');
      }).catch(function (e) { runtimeConsole('warn', '[EH Toolkit] Theme preference was not loaded:', e); });
      shell.querySelector('#eh-toolkit-close').addEventListener('click', function () {
        setToolkitOpen(false);
        var launcher = document.getElementById('eh-toolkit-launcher');
        if (launcher) launcher.focus();
      });
      var tabs = shell.querySelectorAll('[data-eh-tab]');
      for (var i = 0; i < tabs.length; i++) tabs[i].addEventListener('click', function () { setToolkitTab(this.getAttribute('data-eh-tab')); });
      shell.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); shell.querySelector('#eh-toolkit-close').click(); return; }
        if (!e.target.matches('[data-eh-tab]')) return;
        var index = Array.prototype.indexOf.call(tabs, e.target);
        if (e.key === 'ArrowRight') index = (index + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
        else if (e.key === 'Home') index = 0;
        else if (e.key === 'End') index = tabs.length - 1;
        else return;
        e.preventDefault(); tabs[index].click(); tabs[index].focus();
      });
      return shell;
    }

    function toggleLrrFloatPanel(force) {
      var shell = document.getElementById('eh-toolkit-shell');
      if (!shell) return;
      var show = force === undefined ? shell.style.display === 'none' || shell.getAttribute('data-tab') === 'download' : force;
      setToolkitOpen(show, show ? 'settings' : null);
    }

    function createLrrFloatBall() {
      var existingBall = document.getElementById('eh-toolkit-launcher');
      if (existingBall) return existingBall;
      if (!document.body) return null;
      if (toolkitLauncher) { document.body.appendChild(toolkitLauncher); positionToolkitUi(); return toolkitLauncher; }
      var ball = document.createElement('button');
      ball.id = 'eh-toolkit-launcher';
      ball.type = 'button';
      ball.className = 'eh-lrr-float-ball eh-gdl-float-ball';
      ball.textContent = 'EL';
      ball.title = t('点击打开工具面板；拖动调整位置', 'Click to open Library Toolkit; drag to move');
      ball.setAttribute('aria-label', ball.title);
      ball.setAttribute('aria-controls', 'eh-toolkit-shell');
      var shell = document.getElementById('eh-toolkit-shell');
      ball.setAttribute('aria-expanded', String(!!shell && shell.style.display !== 'none'));
      ball.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (toolkitSuppressClick && e.detail !== 0) { toolkitSuppressClick = false; return; }
        ensureFloatingUi();
        var surface = document.getElementById('eh-toolkit-shell');
        var show = surface.style.display === 'none';
        setToolkitOpen(show);
        if (show) surface.querySelector('[aria-selected="true"]').focus();
      });
      toolkitLauncher = ball;
      document.body.appendChild(ball);
      setupToolkitDrag(ball);
      return ball;
    }

    function toggleGalleryDlPanel(force) {
      var shell = document.getElementById('eh-toolkit-shell');
      if (!shell) return;
      var show = force === undefined ? shell.style.display === 'none' || shell.getAttribute('data-tab') !== 'download' : force;
      setToolkitOpen(show, show ? 'download' : null);
    }

    function createGalleryDlFloatBall() {
      return createLrrFloatBall();
    }

    function setupGalleryDlPanel() {
      var existingPanel = document.getElementById('eh-gallerydl-panel');
      if (existingPanel) return existingPanel;
      if (toolkitDownloadPanel) {
        ensureToolkitShell().querySelector('#eh-toolkit-content').appendChild(toolkitDownloadPanel);
        return toolkitDownloadPanel;
      }
      ensurePanelCss();
      var panelContainer = document.createElement('div');
      panelContainer.innerHTML = localizeHtml(GALLERY_DL_PANEL_HTML);
      fillPanelVersion(panelContainer);
      var panel = toolkitDownloadPanel = panelContainer.firstElementChild;
      ensureToolkitShell().querySelector('#eh-toolkit-content').appendChild(panel);
      panel.style.display = 'block';

      panel.querySelector('#cfg-galleryDlOriginal').checked = CONFIG.galleryDlOriginal !== false;
      panel.querySelector('#cfg-galleryDlWriteMetadata').checked = !!CONFIG.galleryDlWriteMetadata;
      panel.querySelector('#cfg-galleryDlParallel').value = String(CONFIG.galleryDlParallel);
      var modeNode = panel.querySelector('input[name="cfg-galleryDlTitleMode"][value="' + CONFIG.galleryDlTitleMode + '"]');
      if (modeNode) modeNode.checked = true;

      var radios = panel.querySelectorAll('input[name="cfg-galleryDlTitleMode"]');
      for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', function () { updateGalleryDlPreview(panel); });

      var statusBox = panel.querySelector('#eh-gdl-status');
      var downloadBtn = panel.querySelector('#eh-gdl-download');
      panel.querySelector('#eh-gdl-save').addEventListener('click', function () {
        saveGalleryDlConfig(panel).then(function () {
          updateGalleryDlStatus(statusBox, 'online', t('下载设置已保存', 'Download settings saved'), t('无需刷新页面', 'No reload required'));
        }).catch(function (e) {
          updateGalleryDlStatus(statusBox, 'offline', t('保存失败', 'Save failed'), e.message);
        });
      });
      downloadBtn.addEventListener('click', function () { startGalleryDlDownload(panel, statusBox, downloadBtn); });
      updateGalleryDlPreview(panel);
    }

    // 版本号只维护 @version 一处；面板页脚运行时读取，避免多处手写不一致。
    var SCRIPT_VERSION = '';
    try {
      if (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version)
        SCRIPT_VERSION = String(GM_info.script.version);
    } catch (e) {}

    function fillPanelVersion(container) {
      var node = container && container.querySelector('.eh-tb-version');
      if (node) node.textContent = SCRIPT_VERSION ? 'v' + SCRIPT_VERSION : '';
    }

    function ensurePanelCss() {
      if (document.getElementById('eh-toolbox-style')) return;
      var style = document.createElement('style');
      style.id = 'eh-toolbox-style';
      style.textContent = PANEL_CSS;
      (document.head || document.documentElement).appendChild(style);
    }

    function readLrrCredentialUpdate(value, clear) {
      // Explicit removal wins even if a caller supplies a conflicting replacement.
      if (clear) return { action: 'clear', value: '' };
      var key = String(value == null ? '' : value).trim();
      return key ? { action: 'replace', value: key } : { action: 'keep' };
    }

    function setupPanel() {
      var existingPanel = document.getElementById('eh-toolbox-panel');
      if (existingPanel) return existingPanel;
      if (toolkitSettingsPanel) {
        ensureToolkitShell().querySelector('#eh-toolkit-content').appendChild(toolkitSettingsPanel);
        return toolkitSettingsPanel;
      }
      ensurePanelCss();

      // 注入 HTML
      var panelContainer = document.createElement('div');
      panelContainer.innerHTML = localizeHtml(PANEL_HTML);
      fillPanelVersion(panelContainer);
      var panel = toolkitSettingsPanel = panelContainer.firstElementChild;
      
      ensureToolkitShell().querySelector('#eh-toolkit-content').appendChild(panel);
      panel.style.display = 'none';
      var themeSelect = panel.querySelector('#eh-toolkit-theme');
      themeSelect.value = ensureToolkitShell().getAttribute('data-theme');
      themeSelect.addEventListener('change', function () {
        var theme = themeSelect.value;
        ensureToolkitShell().setAttribute('data-theme', theme);
        gmSet('ehToolkitTheme', theme).catch(function (e) { runtimeConsole('warn', '[EH Toolkit] Theme preference was not saved:', e); });
      });

      // 填充当前配置
      normalizeLanguageOptions(panel);
      var langSelect = panel.querySelector('#cfg-uiLanguage');
      if (langSelect) {
        langSelect.value = CONFIG.uiLanguage;
        langSelect.addEventListener('change', function () {
          // Re-assert endonyms in case a browser translation feature altered option labels.
          normalizeLanguageOptions(panel);
          gmSet('uiLanguage', langSelect.value === 'en' ? 'en' : 'zh').then(function () { location.reload(); });
        });
      }
      var checkboxMap = {
        'enableLrrChecker': 'cfg-enableLrrChecker',
        'enableAltSearch': 'cfg-enableAltSearch',
        'enableChineseHighlight': 'cfg-enableChineseHighlight',
        'enableUncensoredLabel': 'cfg-enableUncensoredLabel',
      };
      for (var ck in checkboxMap) {
        var el = panel.querySelector('#' + checkboxMap[ck]);
        if (el) el.checked = !!CONFIG[ck];
      }
      var inputMap = {
        'lrrServerUrl': 'cfg-lrrServerUrl',
        'lrrConcurrency': 'cfg-lrrConcurrency',
        'altSearchConcurrency': 'cfg-altSearchConcurrency',
      };
      for (var ik in inputMap) {
        var el2 = panel.querySelector('#' + inputMap[ik]);
        if (el2) el2.value = CONFIG[ik];
      }

      var exportLogsBtn = panel.querySelector('#eh-tb-export-logs');
      if (exportLogsBtn) exportLogsBtn.addEventListener('click', exportRuntimeLogs);
      var resetPositionBtn = panel.querySelector('#eh-tb-reset-position');
      if (resetPositionBtn) resetPositionBtn.addEventListener('click', resetToolkitPosition);

      var keyInput = panel.querySelector('#cfg-lrrApiKey');
      var clearKeyInput = panel.querySelector('#cfg-clearLrrApiKey');
      var keyStatus = panel.querySelector('#eh-tb-api-key-status');
      var credentialConfigured = !!CONFIG.lrrApiKey;
      var credentialStateKnown = true;
      function updateCredentialStatus() {
        if (keyStatus) keyStatus.textContent = !credentialStateKnown
          ? t('API Key 保存失败，状态未确认；请重试或刷新', 'API key save failed; state unconfirmed. Retry or reload.')
          : credentialConfigured ? t('API Key：已配置', 'API key: Configured') : t('API Key：未配置', 'API key: Not configured');
      }
      if (keyInput) {
        keyInput.value = ''; // Never project the stored credential into the page DOM.
        keyInput.addEventListener('input', function () {
          if (keyInput.value && clearKeyInput) clearKeyInput.checked = false;
        });
      }
      if (clearKeyInput) clearKeyInput.addEventListener('change', function () {
        if (keyInput) { keyInput.value = ''; keyInput.disabled = clearKeyInput.checked; }
      });
      updateCredentialStatus();

      // Capture replacements once, then immediately remove them from the DOM, even
      // when a storage call throws synchronously or rejects asynchronously.
      var saveButton = panel.querySelector('#eh-tb-save');
      saveButton.addEventListener('click', async function () {
        if (saveButton.disabled) return;
        var credentialUpdate = readLrrCredentialUpdate(keyInput ? keyInput.value : '', clearKeyInput && clearKeyInput.checked);
        if (keyInput) { keyInput.value = ''; keyInput.disabled = true; }
        if (clearKeyInput) { clearKeyInput.checked = false; clearKeyInput.disabled = true; }
        saveButton.disabled = true;
        var updates = [];
        try {
          for (var ck2 in checkboxMap) {
            var el3 = panel.querySelector('#' + checkboxMap[ck2]);
            if (el3) updates.push({ key: ck2, value: el3.checked });
          }
          for (var ik2 in inputMap) {
            var el4 = panel.querySelector('#' + inputMap[ik2]);
            if (el4) {
              var val = el4.value;
              if (el4.type === 'number') val = parseInt(val, 10) || 0;
              updates.push({ key: ik2, value: val });
            }
          }
          var credentialIndex = -1;
          if (credentialUpdate.action !== 'keep') {
            credentialIndex = updates.length;
            updates.push({ key: 'lrrApiKey', value: credentialUpdate.value });
          }
          var results = await Promise.allSettled(updates.map(function (update) {
            return Promise.resolve().then(function () { return gmSet(update.key, update.value); });
          }));
          // GM writes are not transactional. Report the credential's actual write
          // outcome independently if some unrelated setting failed to persist.
          if (credentialIndex >= 0) {
            credentialStateKnown = results[credentialIndex].status === 'fulfilled';
            if (credentialStateKnown) credentialConfigured = credentialUpdate.action === 'replace';
          }
          updateCredentialStatus();
          var failedKeys = updates.filter(function (_, index) { return results[index].status === 'rejected'; })
            .map(function (update) { return update.key; });
          if (failedKeys.length) {
            recordRuntimeLog('error', 'settings.save-failed', { failedKeys: failedKeys });
            throw new Error('Settings storage write failed');
          }
          alert(t('配置已保存，页面将刷新以应用更改。', 'Settings saved. The page will reload to apply changes.'));
          location.reload();
        } catch (e) {
          // A storage implementation's exception may echo the replacement key.
          // Do not send raw exception text to console, diagnostics, or the DOM.
          recordRuntimeLog('error', 'settings.save-error', { credentialChange: credentialUpdate.action });
          alert(t('配置保存失败，部分设置可能已保存；请重试或刷新确认。', 'Saving failed; some settings may have been saved. Retry or reload to verify.'));
        } finally {
          credentialUpdate.value = '';
          updates.forEach(function (update) { update.value = null; });
          if (keyInput) { keyInput.value = ''; keyInput.disabled = false; }
          if (clearKeyInput) { clearKeyInput.checked = false; clearKeyInput.disabled = false; }
          saveButton.disabled = false;
        }
      });

      // LRR 工具按钮
      var syncIndexBtn = panel.querySelector('#eh-tb-sync-index');
      if (syncIndexBtn) syncIndexBtn.addEventListener('click', function () { syncLrrLibraryIndex(true); });
      updateLrrIndexUi();
      var statusBox = panel.querySelector('#eh-tb-lrr-status');
      var testBtn = panel.querySelector('#eh-tb-test-lrr');
      var rescanBtn = panel.querySelector('#eh-tb-rescan-lrr');
      var rescanFolderBtn = panel.querySelector('#eh-tb-rescan-folder');
      var clearBtn = panel.querySelector('#eh-tb-clear-lrr');

      if (testBtn) {
        testBtn.addEventListener('click', function () {
          testLrrConnection(statusBox, testBtn);
        });
      }

      if (rescanBtn) {
        rescanBtn.addEventListener('click', function () {
          var removed = clearCurrentPageLrrCache();
          rescanCurrentPage(false);
          syncLrrLibraryIndex(true);
          updateLrrStatus(statusBox, 'checking', 'LRR：正在重扫当前页', '已清除当前页缓存 ' + removed + ' 项');
          setTimeout(function () { testLrrConnection(statusBox, testBtn); }, 500);
        });
      }

      if (rescanFolderBtn) {
        rescanFolderBtn.addEventListener('click', function () {
          if (!confirm(t(
            '确定让 LANraragi 清空文件扫描记录、重启 Shinobu 并重新扫描已配置的档案文件夹？',
            'Clear LANraragi\'s file scan map, restart Shinobu, and rescan the configured archive folder?'
          ))) return;
          triggerLrrContentRescan(statusBox, rescanFolderBtn);
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          if (!confirm('确定清空全部LRR查重缓存并重新扫描当前页面？')) return;
          var count = clearLrrCache(false);
          rescanCurrentPage(false);
          syncLrrLibraryIndex(true);
          updateLrrStatus(statusBox, 'checking', 'LRR：缓存已清空', '共删除 ' + count + ' 项，正在重新扫描当前页');
          setTimeout(function () { testLrrConnection(statusBox, testBtn); }, 500);
        });
      }

      // 禁用查重时不发起后台 LRR 请求；手动测试仍可用。
      if (CONFIG.enableLrrChecker && CONFIG.lrrServerUrl) setTimeout(function () {
        testLrrConnection(statusBox, testBtn);
      }, 300);

      // 恢复默认
      panel.querySelector('#eh-tb-reset').addEventListener('click', function () {
        if (!confirm(t('确定恢复所有配置到默认值？', 'Restore all settings to defaults?'))) return;
        var resets = [];
        for (var dk in DEFAULT_CONFIG) resets.push(gmSet(dk, DEFAULT_CONFIG[dk]));
        Promise.all(resets).then(function () { location.reload(); });
      });
    }

    /* ================================================================
     *  初始化
     * ================================================================ */

    var allFeaturesInitialized = false;
    var uiWatchdogTimer = null;
    var uiWatchdogObserver = null;
    var uiEnsurePending = false;

    function safeRunFeature(name, fn) {
      try { return fn(); }
      catch (e) { runtimeConsole('error', '[EH Toolkit] ' + name + ' 初始化失败:', e); return null; }
    }

    function ensureFloatingUi() {
      if (!document.body || !document.documentElement) return;
      ensurePanelCss();
      var shell = ensureToolkitShell();
      if (!shell.querySelector('#eh-toolkit-content')) {
        var content = document.createElement('div');
        content.id = 'eh-toolkit-content';
        shell.appendChild(content);
      }
      var repairViews = !document.getElementById('eh-toolbox-panel') || !document.getElementById('eh-gallerydl-panel');
      if (!document.getElementById('eh-toolbox-panel')) safeRunFeature('LRR面板恢复', setupPanel);
      if (!document.getElementById('eh-gallerydl-panel')) safeRunFeature('下载面板恢复', setupGalleryDlPanel);
      if (repairViews) setToolkitTab(shell.getAttribute('data-tab'));
      if (!document.querySelector('.eh-lrr-float-ball')) safeRunFeature('LRR悬浮球恢复', createLrrFloatBall);
      if (!document.querySelector('.eh-gdl-float-ball')) safeRunFeature('下载悬浮球恢复', createGalleryDlFloatBall);
      if (toolkitLauncher) positionToolkitUi();
    }

    function scheduleEnsureFloatingUi() {
      if (uiEnsurePending) return;
      uiEnsurePending = true;
      var run = function () {
        uiEnsurePending = false;
        ensureFloatingUi();
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 0);
    }

    function removedFloatingUi(mutation) {
      var selector = '#eh-toolkit-shell, #eh-toolkit-content, #eh-toolbox-panel, #eh-gallerydl-panel, #eh-toolbox-style, .eh-lrr-float-ball, .eh-gdl-float-ball';
      return Array.prototype.some.call(mutation.removedNodes || [], function (node) {
        return node.nodeType === 1 && (node.matches(selector) || !!node.querySelector(selector));
      });
    }

    function startUiWatchdog() {
      if (!uiWatchdogTimer) uiWatchdogTimer = setInterval(ensureFloatingUi, 2000);
      if (!uiWatchdogObserver && typeof MutationObserver !== 'undefined') {
        uiWatchdogObserver = new MutationObserver(function (mutations) {
          for (var i = 0; i < mutations.length; i++) {
            if (removedFloatingUi(mutations[i])) {
              scheduleEnsureFloatingUi();
              break;
            }
          }
        });
        uiWatchdogObserver.observe(document.documentElement, { childList: true, subtree: true });
      }
      window.addEventListener('pageshow', scheduleEnsureFloatingUi, false);
      window.addEventListener('focus', scheduleEnsureFloatingUi, false);
      window.addEventListener('popstate', scheduleEnsureFloatingUi, false);
      window.addEventListener('hashchange', scheduleEnsureFloatingUi, false);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) scheduleEnsureFloatingUi();
      }, false);
    }

    function setupAllFeatures() {
      // 悬浮UI优先创建：即使后续某个功能异常，也不影响两个悬浮球出现和点击。
      ensureFloatingUi();
      startUiWatchdog();
      if (allFeaturesInitialized) return;
      allFeaturesInitialized = true;

      safeRunFeature('LRR查重', setupLrrChecker);
      safeRunFeature('中文高亮', setupChineseHighlight);
      safeRunFeature('无修正标签', setupUncensoredLabels);

      // 页面脚本若在初始化过程中改写DOM，再补一次。
      scheduleEnsureFloatingUi();
    }

    function bootWhenDomReady() {
      if (!document.body) {
        setTimeout(bootWhenDomReady, 20);
        return;
      }
      setupAllFeatures();
    }

    // 不再等待 window.load：首页/收藏夹大量缩略图加载慢时，load 可能很晚甚至被单个资源拖住。
    // DOMContentLoaded 后就创建悬浮UI；load/pageshow 仅作为二次兜底。
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootWhenDomReady, { once: true });
    else bootWhenDomReady();
    window.addEventListener('load', scheduleEnsureFloatingUi, { once: true });

  } // initScript

})();

// SmartMatch 匹配优先级：
// 1. URL精确
// 2. e-hentai/exhentai跨站URL
// 3. GID/Token
// 4. 作者+标题
// 5. 标题模糊
