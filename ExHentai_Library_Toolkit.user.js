// ==UserScript==
// @name        ExHentai Library Toolkit
// @namespace   https://github.com/Alog6437/ExHentai-Library-Toolkit
// @version     1.1.0
// @description  ExHentai/E-Hentai 一体化工具：LANraragi 查重、纯浏览器图片 ZIP 下载与元数据打包、快捷收藏、全局搜索、翻译高亮及统一悬浮面板。
// @description:en  All-in-one ExHentai/E-Hentai toolkit with LANraragi duplicate checking, image ZIP downloads, metadata, favorites, search and translation highlighting.
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
// @grant        GM_registerMenuCommand
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
    galleryDlTitleMode: 'default', // default=默认标题（英文/中文/罗马音），japanese=原文/日文标题
    galleryDlOriginal: true, // true=原画，false=页面显示的压缩/缩放图
    galleryDlWriteMetadata: true,
    galleryDlParallel: 2, // 任意正整数；实际工作线程不超过图库页数

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
    enableQuickFav: true,       // 无弹窗收藏（详情页+列表页）
    enableGlobalSearch: true,   // 全局搜索栏
    enableChineseHighlight: true, // 中文翻译高亮
    enableUncensoredLabel: true, // 根据 uncensored 标签显示无修正标记
    defaultFavcat: 0,           // 默认收藏夹编号 0-9

    // --- UI 面板 ---
  };

  function gmGet(key, fallback) {
    if (typeof GM_getValue !== 'undefined') return GM_getValue(key, fallback);
    if (typeof GM !== 'undefined' && GM.getValue) return GM.getValue(key, fallback);
    return fallback;
  }

  function gmSet(key, value) {
    if (typeof GM_setValue !== 'undefined') {
      GM_setValue(key, value);
      return Promise.resolve();
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
        ['LRR 连接与性能', 'LRR Connection & Performance'],
        ['LRR 服务器', 'LRR Server'], ['可选', 'Optional'],
        ['主查重并发', 'Primary concurrency'], ['备用搜索并发', 'Alt-search concurrency'],
        ['浏览体验增强', 'Browsing Enhancements'], ['无弹窗收藏', 'Quick favorites'],
        ['无修正标签', 'Uncensored label'], ['全局搜索栏', 'Global search bar'], ['中文翻译高亮', 'English translation highlight'],
        ['默认收藏夹', 'Default favorite category'], ['高级', 'Advanced'],
        ['控制台日志', 'Console logging'], ['LRR Debug 模式', 'LRR Debug mode'],
        ['LRR：等待检测', 'LRR: Waiting for check'], ['将自动检测服务器状态', 'Server status will be checked automatically'],
        ['重新扫描当前页', 'Rescan current page'], ['测试LRR连接', 'Test LRR connection'],
        ['清空全部LRR缓存', 'Clear all LRR cache'], ['保存并刷新', 'Save & Reload'], ['恢复默认', 'Restore Defaults'],
        ['悬浮按钮开关面板 · 长按标题拖动', 'Auto-collapse after 3s · Hold title to drag'],
        ['长按拖动', 'Hold to drag'], ['图片 ZIP 下载', 'Image ZIP Download'], ['保存方式', 'Save Method'],
        ['无需 gallery-dl、Python、Bridge 或本地服务。脚本直接读取图片页、按所选画质下载图片并生成 ZIP；最终文件保存到浏览器当前下载目录。', 'No gallery-dl, Python, Bridge or local service required. The script reads image pages, downloads the selected image quality and creates a ZIP directly in the browser.'],
        ['压缩包名称', 'ZIP Name'], ['默认标题（英文/中文/罗马音）', 'Default title (English/Chinese/Romaji)'],
        ['仅获取元数据 ZIP', 'Download Metadata ZIP'],
        ['仅获取元数据：按“压缩包名称”设置生成带 [仅元数据] 前缀的 ZIP，内含 metadata.json 和 info.json，不下载图片，保存到浏览器下载目录。', 'Metadata only: create a ZIP with a [Metadata Only] prefix using the ZIP Name setting, containing metadata.json and info.json without images, and save it to the browser download directory.'],
        ['原文/日文标题（如果有）', 'Original/Japanese title (if available)'], ['ZIP 预览：', 'ZIP Preview: '],
        ['下载内容', 'Download Contents'], ['下载原画（取消后下载压缩/缩放图）', 'Download original images (uncheck for compressed/resized images)'],
        ['图片按 001.ext、002.ext… 顺序命名', 'Name images sequentially as 001.ext, 002.ext…'],
        ['打包 metadata.json + LRR兼容 info.json', 'Include metadata.json + LRR-compatible info.json'],
        ['图片命名', 'Image Naming'], ['原文件是 JPEG 时就是 001.jpg；PNG/WebP 等会保留真实扩展名，避免转码导致不再是原画。', 'JPEG stays 001.jpg; PNG/WebP and other formats keep their real extensions so images are not transcoded.'],
        ['下载性能', 'Download Performance'], ['并行任务', 'Parallel Tasks'],
        ['纯浏览器下载：就绪', 'Browser downloader: Ready'], ['在图库详情页点击“检查下载源”或直接下载', 'On a gallery page, check the download source or start downloading directly'],
        ['平均速度', 'Average Speed'], ['已写入 ZIP', 'Written to ZIP'], ['图片进度', 'Image Progress'],
        ['检查下载源', 'Check Download Source'], ['下载当前图库', 'Download Gallery'], ['保存下载设置', 'Save Download Settings']
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
      if (CONFIG.lrrDebugMode) {
        console.log.apply(console, ['[LRR Debug]'].concat(Array.from(arguments)));
      }
    }

    function log() {
      if (CONFIG.enableLogging) console.log.apply(console, arguments);
    }
    function warn() {
      if (CONFIG.enableLogging) console.warn.apply(console, arguments);
    }
    function errLog() {
      if (CONFIG.enableLogging) console.error.apply(console, arguments);
    }

    /* ================================================================
     *  纯浏览器原画下载（无 gallery-dl / 无本地 Bridge）
     * ================================================================ */

    var galleryDlBusy = false;
    var CRC32_TABLE = null;
    var ZIP32_MAX = 0xffffffff;

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

    function galleryRawRequest(options) {
      return new Promise(function (resolve, reject) {
        var req = {
          method: options.method || 'GET',
          url: options.url,
          headers: options.headers || {},
          data: options.data,
          responseType: options.responseType || 'text',
          timeout: options.timeout || 60000,
          anonymous: false,
          onprogress: options.onprogress,
          onload: function (res) {
            if (res.status >= 200 && res.status < 400) resolve(res);
            else reject(new Error('HTTP ' + res.status + '：' + (res.statusText || options.url)));
          },
          onerror: function () { reject(new Error('网络请求失败：' + options.url)); },
          ontimeout: function () { reject(new Error('请求超时：' + options.url)); },
          onabort: function () { reject(new Error('请求已取消：' + options.url)); },
        };
        if (typeof GM_xmlhttpRequest !== 'undefined') GM_xmlhttpRequest(req);
        else if (typeof GM !== 'undefined' && GM.xmlHttpRequest) GM.xmlHttpRequest(req);
        else reject(new Error('当前油猴环境不支持 GM_xmlhttpRequest'));
      });
    }

    function galleryTextRequest(url, method, data, headers, timeout) {
      return galleryRawRequest({
        method: method || 'GET', url: url, data: data, headers: headers || {},
        responseType: 'text', timeout: timeout || 60000,
      }).then(function (res) {
        var text = res.responseText || res.response || '';
        return { text: String(text), response: res };
      });
    }

    function galleryBinaryRequest(url, referer, onprogress) {
      var headers = {};
      if (referer) headers.Referer = referer;
      return galleryRawRequest({
        method: 'GET', url: url, headers: headers, responseType: 'arraybuffer', timeout: 180000, onprogress: onprogress,
      }).then(function (res) {
        var data = res.response;
        if (!(data instanceof ArrayBuffer)) throw new Error(t('图片响应不是二进制数据', 'Image response is not binary data'));
        var headersText = String(res.responseHeaders || '');
        var typeMatch = headersText.match(/(?:^|\r?\n)content-type:\s*([^;\r\n]+)/i);
        var contentType = typeMatch ? typeMatch[1].trim().toLowerCase() : '';
        if (contentType && contentType.indexOf('image/') !== 0 && contentType !== 'application/octet-stream') {
          throw new Error(t('图片请求返回了非图片内容：', 'Image request returned non-image content: ') + contentType);
        }
        if (!data.byteLength) throw new Error(t('图片响应为空', 'Image response is empty'));
        return { data: data, finalUrl: res.finalUrl || url, headers: headersText, contentType: contentType };
      });
    }

    function sleepMs(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }


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
      var metadataBtn = panel.querySelector('#eh-gdl-metadata');
      if (metadataBtn) metadataBtn.disabled = !info || galleryDlBusy;
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
      var bytesNode = metrics.querySelector('#eh-gdl-downloaded');
      var progressNode = metrics.querySelector('#eh-gdl-progress');
      var workersNode = metrics.querySelector('#eh-gdl-workers');
      if (speedNode) speedNode.textContent = data.status === 'zipping' ? t('写入 ZIP', 'Writing ZIP') : (data.status === 'done' ? t('完成', 'Done') : formatGalleryDlBytes(data.speed_bps || 0) + '/s');
      if (bytesNode) bytesNode.textContent = formatGalleryDlBytes(data.downloaded_bytes || 0);
      if (progressNode) progressNode.textContent = data.total_pages ? t((data.downloaded_files || 0) + ' / ' + data.total_pages + ' 页', (data.downloaded_files || 0) + ' / ' + data.total_pages + ' pages') : '--';
      if (workersNode) workersNode.textContent = t(String(data.workers || 1) + ' 路', String(data.workers || 1) + ' workers');
    }

    function readGalleryDlPanelConfig(panel) {
      var modeNode = panel.querySelector('input[name="cfg-galleryDlTitleMode"]:checked');
      return {
        galleryDlTitleMode: modeNode ? modeNode.value : 'default',
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

    function fetchGalleryApiMetadata(info) {
      var apiUrl = /exhentai\.org$/i.test(window.location.hostname) ? 'https://exhentai.org/api.php' : 'https://api.e-hentai.org/api.php';
      var body = JSON.stringify({ method: 'gdata', gidlist: [[parseInt(info.gid, 10), info.token]], namespace: 1 });
      return galleryTextRequest(apiUrl, 'POST', body, { 'Content-Type': 'application/json' }, 30000).then(function (res) {
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

    async function collectImagePageUrls(info, totalPages, statusBox) {
      var collected = new Map();
      var page = 0;
      var emptyRounds = 0;
      var maxPages = Math.max(5, Math.ceil((totalPages || 40) / 20) + 5);
      while (page < maxPages && (!totalPages || collected.size < totalPages)) {
        var url = info.url + (page ? ('?p=' + page) : '');
        updateGalleryDlStatus(statusBox, 'checking', t('正在读取图库页', 'Reading gallery pages'), t('缩略图页 ', 'Thumbnail page ') + (page + 1) + t(' · 已找到 ', ' · Found ') + collected.size + '/' + (totalPages || '?'));
        var res = await galleryTextRequest(url, 'GET', null, null, 45000);
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

    async function resolveDownloadImageUrl(pageUrl, useOriginal) {
      var res = await galleryTextRequest(pageUrl, 'GET', null, null, 60000);
      var doc = new DOMParser().parseFromString(res.text, 'text/html');
      var img = doc.querySelector('#img');
      var src = img && img.getAttribute('src');

      // Unchecked = use the image currently displayed on the image page (resized/compressed).
      if (!useOriginal) {
        if (src) return new URL(src, pageUrl).href;
        throw new Error(t('图片页没有可下载的压缩/缩放图', 'No compressed/resized image was found on the image page'));
      }

      var original = doc.querySelector('a[href*="/fullimg.php"], a[href*="/fullimg/"]');
      if (original && original.getAttribute('href')) return new URL(original.getAttribute('href'), pageUrl).href;
      if (src) {
        var absolute = new URL(src, pageUrl).href;
        if (/xres=org(?:[;&/]|$)/i.test(absolute)) return absolute;
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

    function MemoryZipSink() { this.parts = []; }
    MemoryZipSink.prototype.write = function (bytes) { this.parts.push(bytes); return Promise.resolve(); };
    MemoryZipSink.prototype.finish = function () { return Promise.resolve(new Blob(this.parts, { type: 'application/zip' })); };
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
    OpfsZipSink.prototype.abort = async function () {
      try { if (this.writable) await this.writable.abort(); } catch (e) {}
      this.writable = null;
      try { await this.root.removeEntry(this.name); } catch (e2) {}
    };
    OpfsZipSink.prototype.cleanup = async function () { try { await this.root.removeEntry(this.name); } catch (e) {} };

    async function createZipSink(tempName) {
      try { return await OpfsZipSink.create(tempName); }
      catch (e) { return new MemoryZipSink(); }
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

    async function testGalleryDownloader(panel, statusBox, button) {
      var info = getCurrentGalleryInfo();
      if (!info) { updateGalleryDlStatus(statusBox, 'offline', t('无法检查', 'Cannot check'), t('请在图库详情页操作', 'Please use this on a gallery detail page')); return; }
      if (button) button.disabled = true;
      try {
        var cfg = readGalleryDlPanelConfig(panel);
        updateGalleryDlStatus(statusBox, 'checking', t('正在检查当前图库', 'Checking current gallery'), cfg.galleryDlOriginal ? t('读取 API 元数据与第一页原画入口', 'Reading API metadata and the first original-image entry') : t('读取 API 元数据与第一页压缩图', 'Reading API metadata and the first compressed/resized image'));
        var meta = await fetchGalleryApiMetadata(info);
        var total = parseInt(meta.filecount, 10) || info.page_count || 0;
        var pages = await collectImagePageUrls(info, Math.min(total || 1, 1), statusBox);
        if (!pages.length) throw new Error(t('没有找到图片页', 'No image pages were found'));
        await resolveDownloadImageUrl(pages[0], cfg.galleryDlOriginal);
        updateGalleryDlStatus(statusBox, 'online', t('纯浏览器下载可用', 'Browser downloader is available'), (cfg.galleryDlOriginal ? t('原画入口正常 · ', 'Original-image entry OK · ') : t('压缩图入口正常 · ', 'Compressed/resized image entry OK · ')) + (total || '?') + t(' 页', ' pages'));
      } catch (e) {
        updateGalleryDlStatus(statusBox, 'offline', t('下载源检查失败', 'Download-source check failed'), e.message);
      } finally { if (button) button.disabled = false; }
    }

    async function startGalleryMetadataDownload(panel, statusBox, button) {
      if (galleryDlBusy) return;
      var info = getCurrentGalleryInfo();
      if (!info) { updateGalleryDlStatus(statusBox, 'offline', t('无法下载', 'Cannot download'), t('请在图库详情页操作', 'Please use this on a gallery detail page')); return; }
      var cfg = readGalleryDlPanelConfig(panel);
      var selectedTitle = sanitizeGalleryTitle(chooseGalleryTitle(info, cfg.galleryDlTitleMode));
      var zipName = t('[仅元数据] ', '[Metadata Only] ') + selectedTitle + '.zip';
      var zip = null;
      setGalleryDownloadBusy(true);
      updateGalleryDlPreview(panel);
      button.textContent = t('正在获取元数据…', 'Fetching metadata…');
      var metrics = statusBox.querySelector('#eh-gdl-metrics');
      if (metrics) metrics.style.display = 'none';
      try {
        await saveGalleryDlConfig(panel);
        updateGalleryDlStatus(statusBox, 'checking', t('正在读取元数据', 'Reading metadata'), info.url);
        var apiMeta = await fetchGalleryApiMetadata(info);
        zip = new StreamingZipWriter(new MemoryZipSink());
        await zip.add('metadata.json', new TextEncoder().encode(JSON.stringify(buildMetadata(info, apiMeta, selectedTitle, 0, cfg.galleryDlOriginal), null, 2)));
        await zip.add('info.json', new TextEncoder().encode(JSON.stringify(buildEzeInfo(info, apiMeta), null, 2)));
        var blob = await zip.finish();
        triggerZipDownload(blob, zipName);
        updateGalleryDlStatus(statusBox, 'online', t('元数据 ZIP 已生成', 'Metadata ZIP created'), zipName + ' · metadata.json + info.json');
      } catch (e) {
        updateGalleryDlStatus(statusBox, 'offline', t('元数据下载失败', 'Metadata download failed'), e.message);
      } finally {
        if (zip) { try { await zip.cleanup(); } catch (cleanupError) {} }
        setGalleryDownloadBusy(false);
        button.textContent = t('仅获取元数据 ZIP', 'Download Metadata ZIP');
        updateGalleryDlPreview(panel);
      }
    }

    async function startGalleryDlDownload(panel, statusBox, button) {
      if (galleryDlBusy) return;
      var info = getCurrentGalleryInfo();
      if (!info) { updateGalleryDlStatus(statusBox, 'offline', t('无法下载', 'Cannot download'), t('请在图库详情页操作', 'Please use this on a gallery detail page')); return; }
      var cfg = readGalleryDlPanelConfig(panel);
      var selectedTitle = sanitizeGalleryTitle(chooseGalleryTitle(info, cfg.galleryDlTitleMode));
      var zipName = selectedTitle + '.zip';
      var tempName = '.eh-pure-' + info.gid + '-' + Date.now() + '.zip';
      var zip = null;
      setGalleryDownloadBusy(true);
      updateGalleryDlPreview(panel);
      if (button) { button.disabled = true; button.textContent = t('下载中…', 'Downloading…'); }
      updateGalleryDlMetrics(statusBox, { workers: cfg.galleryDlParallel, total_pages: info.page_count || 0 }, true);
      try {
        await saveGalleryDlConfig(panel);
        updateGalleryDlStatus(statusBox, 'checking', t('正在读取元数据', 'Reading metadata'), info.url);
        var apiMeta;
        try { apiMeta = await fetchGalleryApiMetadata(info); }
        catch (metaError) { apiMeta = null; warn('[EH Downloader] metadata API failed:', metaError); }
        var totalPages = parseInt(apiMeta && apiMeta.filecount, 10) || info.page_count || 0;
        if (!totalPages) throw new Error(t('无法确定图库总页数', 'Unable to determine total gallery page count'));
        var imagePages = await collectImagePageUrls(info, totalPages, statusBox);
        if (imagePages.length !== totalPages) throw new Error(t('图片页数量不完整：', 'Incomplete image-page list: ') + imagePages.length + '/' + totalPages);

        var sink = await createZipSink(tempName);
        zip = new StreamingZipWriter(sink);
        var actualWorkers = Math.max(1, Math.min(cfg.galleryDlParallel, imagePages.length));
        var stats = { started: Date.now(), networkBytes: 0, savedBytes: 0, done: 0, total: totalPages, workers: actualWorkers };
        var nextIndex = 0;
        var failed = null;
        var writeChain = Promise.resolve();

        var lastMetricsUpdate = 0;
        function refreshMetrics(status) {
          var now = Date.now();
          // Throttle only progress rendering; ZIP/final states always update immediately.
          if (status === 'downloading' && now - lastMetricsUpdate < 100) return;
          lastMetricsUpdate = now;
          var seconds = Math.max(0.25, (now - stats.started) / 1000);
          updateGalleryDlMetrics(statusBox, {
            status: status || 'downloading', speed_bps: stats.networkBytes / seconds,
            downloaded_bytes: stats.savedBytes, downloaded_files: stats.done,
            total_pages: stats.total, workers: stats.workers,
          }, true);
        }

        async function worker(workerId) {
          while (!failed) {
            var index = nextIndex++;
            if (index >= imagePages.length) return;
            var pageNo = index + 1;
            try {
              var bin = null;
              var lastError = null;
              for (var attempt = 1; attempt <= 3; attempt++) {
                try {
                  updateGalleryDlStatus(statusBox, 'checking', cfg.galleryDlOriginal ? t('正在下载原画', 'Downloading originals') : t('正在下载压缩图', 'Downloading compressed/resized images'), t('第 ', 'Page ') + pageNo + '/' + totalPages + t(' 页 · 线程 ', ' · Worker ') + workerId + (attempt > 1 ? (t(' · 重试 ', ' · Retry ') + attempt + '/3') : ''));
                  var imageUrl = await resolveDownloadImageUrl(imagePages[index], cfg.galleryDlOriginal);
                  var lastLoaded = 0;
                  bin = await galleryBinaryRequest(imageUrl, imagePages[index], function (evt) {
                    var loaded = Number(evt.loaded || 0);
                    if (loaded > lastLoaded) { stats.networkBytes += loaded - lastLoaded; lastLoaded = loaded; refreshMetrics('downloading'); }
                  });
                  if (!lastLoaded) stats.networkBytes += bin.data.byteLength;
                  break;
                } catch (attemptError) {
                  lastError = attemptError;
                  if (attempt < 3) await sleepMs(300 * attempt);
                }
              }
              if (!bin) throw lastError || new Error(t('未知下载错误', 'Unknown download error'));
              var ext = imageExtension(bin.finalUrl, bin.contentType, bin.headers);
              var digits = Math.max(3, String(totalPages).length);
              var filename = String(pageNo).padStart(digits, '0') + ext;
              writeChain = writeChain.then(async function () {
                await zip.add(filename, bin.data);
                stats.savedBytes += bin.data.byteLength;
                stats.done++;
                refreshMetrics('downloading');
              });
              await writeChain;
            } catch (e) {
              failed = new Error(t('第 ', 'Page ') + pageNo + t(' 页失败：', ' failed: ') + e.message);
              return;
            }
          }
        }

        var workers = [];
        for (var w = 0; w < actualWorkers; w++) workers.push(worker(w + 1));
        await Promise.all(workers);
        await writeChain;
        if (failed) throw failed;

        var metadata = buildMetadata(info, apiMeta, selectedTitle, stats.done, cfg.galleryDlOriginal);
        if (cfg.galleryDlWriteMetadata) {
          await zip.add('metadata.json', new TextEncoder().encode(JSON.stringify(metadata, null, 2)));
          await zip.add('info.json', new TextEncoder().encode(JSON.stringify(buildEzeInfo(info, apiMeta), null, 2)));
        }
        updateGalleryDlStatus(statusBox, 'checking', t('正在完成 ZIP', 'Finalizing ZIP'), zipName);
        refreshMetrics('zipping');
        var blob = await zip.finish();
        triggerZipDownload(blob, zipName);
        refreshMetrics('done');
        updateGalleryDlStatus(statusBox, 'online', t('下载完成', 'Download complete'), zipName + ' · ' + stats.done + t(' 页 · ', ' pages · ') + formatGalleryDlBytes(stats.savedBytes));
        setTimeout(function () { if (zip) zip.cleanup(); }, 30 * 60 * 1000);
      } catch (e) {
        if (zip) { try { await zip.abort(); } catch (abortError) {} }
        updateGalleryDlStatus(statusBox, 'offline', t('下载失败', 'Download failed'), e.message);
      } finally {
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
    var galleriesToCheck = [];
    var lrrScanGeneration = 0; // 每次手动重扫递增，旧请求结果自动作废

    function simpleHash(str) {
      var h = 0;
      for (var i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
      return (h >>> 0).toString(16);
    }

    function createPool(limit) {
      var active = 0, queue = [];
      function runNext() {
        if (active >= limit || queue.length === 0) return;
        var item = queue.shift();
        active++;
        Promise.resolve(item.fn()).then(function (v) { active--; item.resolve(v); runNext(); },
          function (e) { active--; item.reject(e); runNext(); });
      }
      return function run(fn) {
        return new Promise(function (resolve, reject) { queue.push({ fn: fn, resolve: resolve, reject: reject }); runNext(); });
      };
    }

    var runAltSearchLimited;

    function getCache(key) {
      var cached = localStorage.getItem(key);
      if (cached) {
        try {
          var parsed = JSON.parse(cached);
          if (parsed.timestamp && (Date.now() - parsed.timestamp) < CACHE_DURATION) return parsed.data;
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
          return altOut;
        }
        var out = {};
        if (typeof original === 'object' && original) {
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

    // 只清当前页面涉及的LRR缓存
    function clearCurrentPageLrrCache() {
      var removed = 0;
      var entries = collectLrrGalleryEntries();
      entries.forEach(function (entry) {
        var exactKey = 'lrr-checker-v2-' + entry.galleryUrl;
        if (localStorage.getItem(exactKey) !== null) {
          localStorage.removeItem(exactKey);
          removed++;
        }
        var altKey = getAltCacheKeyFromTitle(entry.titleElement);
        if (altKey && localStorage.getItem(altKey) !== null) {
          localStorage.removeItem(altKey);
          removed++;
        }
      });
      return removed;
    }

    // 无需刷新浏览器，立即重新查当前列表
    function rescanCurrentPage(clearPageCache) {
      lrrScanGeneration++;
      if (clearPageCache !== false) clearCurrentPageLrrCache();

      document.querySelectorAll('.lrr-marker-span').forEach(function (el) { el.remove(); });
      seenGalleryUrls.clear();
      altSearchInflight.clear();
      galleriesToCheck.length = 0;
      runAltSearchLimited = createPool(CONFIG.altSearchConcurrency);

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
        console.error('[LRR Checker] Connection test failed:', e);
        return null;
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = t('测试LRR连接', 'Test LRR connection');
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

    function hasLrrMarker(titleElement) {
      var scope = getLrrMarkerScope(titleElement);
      return !!(scope && scope.querySelector('.lrr-marker-span'));
    }

    function formatLrrSize(bytes) {
      if (!bytes) return '';
      if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
      if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
      return bytes + ' B';
    }

    function openLrrSearch(keyword) {
      if (!keyword) return;
      var url = CONFIG.lrrServerUrl + '/search?search=' + encodeURIComponent(keyword);
      window.open(url, '_blank');
    }

    // 创建查重标签；✔ 与 ≈ 均打开 LANraragi 搜索页，不打开阅读器，不显示悬浮卡。
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
      markerSpan.title = t('点击在 LANraragi 中搜索', 'Click to search in LANraragi');

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
        openLrrSearch(keyword);
      }, true);

      var group = getGalleryMarkerGroup(titleElement);
      group.insertBefore(markerSpan, group.firstChild);
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
              var value = hasUncensoredTag(meta.tags);
              uncensoredTagCache.set(entry.key, { value: value, expires: Date.now() + 5 * 60 * 1000 });
              renderUncensoredLabel(entry.titleElement, value);
            });
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
              reject(new Error(message));
              return;
            }
            resolve(response);
          },
          onerror: function (err) { reject(err || new Error('Network error')); },
          ontimeout: function () { reject(new Error('Request timeout')); },
          onabort: function () { reject(new Error('Request aborted')); }
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

        setCache(cacheKey, result || {});
        handleResponse(result || {}, titleElement, galleryUrl, generation);
        return { success: true, galleryUrl: galleryUrl };
      } catch (e) {
        console.error('[LRR Checker] URLFinder request failed:', galleryUrl, e);
        if (generation === lrrScanGeneration)
          prependLrrMarker(titleElement, '(LRR ❓)', ['lrr-marker-error'], 'error', [], galleryUrl);
        return { success: false, galleryUrl: galleryUrl, error: e };
      }
    }

    async function fetchAltSearchHttp(searchQuery, altKey) {
      var params = new URLSearchParams();
      params.set('filter', searchQuery);
      params.set('start', '0');
      params.set('groupby_tanks', 'false');
      var searchUrl = CONFIG.lrrServerUrl + '/api/search?' + params.toString();
      var headers = {};
      if (CONFIG.lrrApiKey) headers['Authorization'] = getAuthorizationHeaderValue(CONFIG.lrrApiKey);

      var validateFn = function (status) { return (status >= 200 && status < 300) || status === 204; };
      var response = await makeRequest({
        method: 'GET', url: searchUrl, headers: headers,
        timeout: CONFIG.searchTimeoutMs, validateStatus: validateFn
      });

      if (response.status === 204) {
        await delay(2000);
        response = await makeRequest({
          method: 'GET', url: searchUrl, headers: headers,
          timeout: CONFIG.searchTimeoutMs, validateStatus: validateFn
        });
      }
      if (response.status === 204) {
        setCache(altKey, { altHit: false, altHits: [] });
        return { hit: false, hits: [] };
      }

      var body = (response.responseText || '').trim();
      if (!body) { setCache(altKey, { altHit: false, altHits: [] }); return { hit: false, hits: [] }; }

      var searchResult = JSON.parse(body);
      var searchData = Array.isArray(searchResult) ? searchResult :
        (Array.isArray(searchResult.data) ? searchResult.data : []);
      var hasHits = searchData.length > 0 ||
        (typeof searchResult.recordsFiltered === 'number' && searchResult.recordsFiltered > 0);

      // 提取命中的归档信息用于悬浮卡展示，兼容 arcid/id 与 size/filesize。
      var altHits = [];
      if (hasHits) {
        searchData.forEach(function (item) {
          if (!item) return;
          altHits.push({
            id: item.id || item.arcid || '',
            title: item.title || '',
            tags: item.tags || '',
            pagecount: item.pagecount || 0,
            filesize: item.filesize || item.size || 0
          });
        });
      }
      setCache(altKey, { altHit: hasHits, altHits: altHits });
      return { hit: hasHits, hits: altHits };
    }

    // 备用搜索不能“搜到任何结果就算命中”。LANraragi 的 filter 可能返回仅部分关键词相同的归档，
    // 因此先拿原始候选，再在本地做作者 + 标题二次校验，避免明显误报。
    async function performAlternativeSearch(searchQuery, sourceFullTitle, titleElement, generation) {
      if (hasLrrMarker(titleElement)) return { success: false, skipped: true };

      var filteredKey = 'lrr-checker-v4-alt-strict-' + simpleHash(sourceFullTitle + '|' + searchQuery);
      var cached = getCache(filteredKey);
      if (cached && typeof cached.altHit === 'boolean') {
        if (cached.altHit && generation === lrrScanGeneration)
          prependLrrMarker(titleElement, '(LRR ≈)', ['lrr-marker-file'], 'alt', cached.altHits || [], null, searchQuery);
        return { success: cached.altHit, cached: true, hits: cached.altHits || [] };
      }

      var rawKey = 'lrr-checker-v4-alt-raw-' + simpleHash(searchQuery);
      if (!altSearchInflight.has(searchQuery)) {
        var p = runAltSearchLimited(function () { return fetchAltSearchHttp(searchQuery, rawKey); });
        altSearchInflight.set(searchQuery, p);
        p.catch(function () {}).finally(function () { altSearchInflight.delete(searchQuery); });
      }

      try {
        var result = await altSearchInflight.get(searchQuery);
        if (generation !== lrrScanGeneration) return { success: false, stale: true };

        var hits = (result && result.hits ? result.hits : []).filter(function (item) {
          return item && item.title && isStrictCandidateMatch(sourceFullTitle, item.title);
        });
        var hit = hits.length > 0;
        setCache(filteredKey, { altHit: hit, altHits: hits });

        if (hit && !hasLrrMarker(titleElement))
          prependLrrMarker(titleElement, '(LRR ≈)', ['lrr-marker-file'], 'alt', hits, null, searchQuery);
        return { success: hit, hits: hits };
      } catch (e) {
        return { success: false, error: e, hits: [] };
      }
    }

    // 模糊匹配专用：忽略活动编号、作者组、语言/翻译/DL 等附加标签，只比较作品主体。
    function isLooseNoiseTag(value) {
      value = String(value || '').trim();
      return /^(?:中文|中国語|中国语|中国翻訳|中国翻译|漢化|汉化|英語|英语|英文|English|Chinese|Japanese|韓国語|韩国语|DL版|Digital|Digital版|無修正|无修正|翻訳|翻译|重嵌|机翻|機翻|個人翻譯|个人翻译)$/i.test(value);
    }

    function extractLooseAuthor(fullTitle) {
      var re = /\[([^\]]+)\]/g;
      var m;
      while ((m = re.exec(fullTitle))) {
        var value = (m[1] || '').trim();
        if (!value || isLooseNoiseTag(value)) continue;
        return { value: value, end: re.lastIndex };
      }
      return null;
    }

    function stripLooseDecorations(value) {
      value = String(value || '');
      try { value = value.normalize('NFKC'); } catch (_) {}
      value = value.replace(/\.(?:zip|cbz|rar|7z)$/i, '');
      value = value.replace(/^\s*(?:[\(\（][^\)\）]{1,50}[\)\）]\s*)+/, '');
      value = value.replace(/\[[^\]]*\]/g, ' ');
      value = value.replace(/(?:中国語|中国语|中国翻訳|中国翻译|中文|漢化|汉化|English|Chinese|DL版|Digital版?|翻訳|翻译|重嵌|机翻|機翻)/gi, ' ');
      return value.replace(/\s+/g, ' ').trim();
    }

    function normalizeLooseTitle(value) {
      value = stripLooseDecorations(value).toLowerCase();
      return value.replace(/[\s\-_.·・:：,，!！?？'"“”‘’~～\/\\|+*=#@<>《》「」『』【】\[\]\(\)（）]/g, '');
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
      fullTitle = String(fullTitle || '').trim();
      var authorInfo = extractLooseAuthor(fullTitle);
      var tail = authorInfo ? fullTitle.slice(authorInfo.end) : fullTitle;
      tail = tail.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();

      var shortTitle = tail.replace(/\s*[\(\（][^\)\）]*[\)\）].*$/, '').trim();
      if (!shortTitle) shortTitle = stripLooseDecorations(tail);
      var coreTitle = stripLooseDecorations(tail || fullTitle);

      return {
        author: authorInfo ? authorInfo.value : '',
        shortTitle: shortTitle,
        coreTitle: coreTitle
      };
    }

    function looseContainmentScore(a, b) {
      if (!a || !b) return 0;
      if (a === b) return 1;
      var shorter = a.length <= b.length ? a : b;
      var longer = a.length > b.length ? a : b;
      if (!looseKeyIsUseful(shorter) || longer.indexOf(shorter) < 0) return 0;
      return shorter.length / longer.length;
    }

    function looseAuthorMatch(sourceAuthor, candidateAuthor) {
      var a = normalizeLooseTitle(sourceAuthor);
      var b = normalizeLooseTitle(candidateAuthor);
      if (!a || !b) return false;
      if (a === b) return true;
      if (looseContainmentScore(a, b) >= 0.80) return true;
      return looseDiceScore(a, b) >= 0.82;
    }

    // “作者 + 标题”备用搜索的严格校验：作者必须一致，标题也必须高度相似。
    function isStrictCandidateMatch(sourceFullTitle, candidateTitle) {
      var sourceParts = extractLooseTitleParts(sourceFullTitle);
      var candidateParts = extractLooseTitleParts(candidateTitle);
      var sourceAuthor = sourceParts.author;
      var candidateAuthor = candidateParts.author;
      var sourceCore = normalizeLooseTitle(sourceParts.coreTitle);
      var candidateCore = normalizeLooseTitle(candidateParts.coreTitle);

      if (!sourceAuthor || !candidateAuthor || !sourceCore || !candidateCore) return false;
      if (!looseAuthorMatch(sourceAuthor, candidateAuthor)) return false;
      if (sourceCore === candidateCore) return true;
      if (looseContainmentScore(sourceCore, candidateCore) >= 0.82) return true;
      return looseDiceScore(sourceCore, candidateCore) >= 0.86;
    }

    function isLooseCandidateMatch(sourceFullTitle, searchTitle, candidateTitle) {
      var sourceParts = extractLooseTitleParts(sourceFullTitle);
      var candidateParts = extractLooseTitleParts(candidateTitle);
      var sourceCore = normalizeLooseTitle(sourceParts.coreTitle);
      var queryCore = normalizeLooseTitle(searchTitle);
      var candidateCore = normalizeLooseTitle(candidateParts.coreTitle);

      if (!candidateCore) return false;

      var sourceAuthor = sourceParts.author;
      var candidateAuthor = candidateParts.author;
      var authorMatched = !!(sourceAuthor && candidateAuthor && looseAuthorMatch(sourceAuthor, candidateAuthor));

      // 两边都有作者时，作者对不上直接排除；这是压低误报最有效的一道门槛。
      if (sourceAuthor && candidateAuthor && !authorMatched) return false;

      if (sourceCore === candidateCore || queryCore === candidateCore) return true;

      var containment = Math.max(
        looseContainmentScore(sourceCore, candidateCore),
        looseContainmentScore(queryCore, candidateCore)
      );
      var dice = Math.max(
        looseDiceScore(sourceCore, candidateCore),
        looseDiceScore(queryCore, candidateCore)
      );

      // 有作者佐证时仍要求标题至少 78% 包含覆盖或 80% Dice；
      // 候选缺作者时，仅凭标题必须达到更高阈值，避免常见短标题误撞。
      if (authorMatched) return containment >= 0.78 || dice >= 0.80;
      return containment >= 0.88 || dice >= 0.88;
    }

    async function performLooseTitleSearch(searchTitle, sourceFullTitle, titleElement, generation) {
      if (hasLrrMarker(titleElement)) return { success: false, skipped: true };

      var normalizedQuery = normalizeLooseTitle(searchTitle);
      if (!looseKeyIsUseful(normalizedQuery)) return { success: false, skipped: true };

      // 新缓存前缀避免旧版“未命中”缓存阻止新的宽松匹配。
      var filteredKey = 'lrr-checker-v4-loose-' + simpleHash(sourceFullTitle + '|' + searchTitle);
      var cached = getCache(filteredKey);
      if (cached && typeof cached.altHit === 'boolean') {
        if (cached.altHit && generation === lrrScanGeneration && !hasLrrMarker(titleElement))
          prependLrrMarker(titleElement, '(LRR ≈)', ['lrr-marker-file'], 'alt-loose', cached.altHits || [], null, searchTitle);
        return { success: cached.altHit, cached: true };
      }

      var rawKey = 'lrr-checker-v4-loose-raw-' + simpleHash(searchTitle);
      try {
        var result = await runAltSearchLimited(function () {
          return fetchAltSearchHttp(searchTitle, rawKey);
        });
        if (generation !== lrrScanGeneration) return { success: false, stale: true };

        var hits = (result && result.hits ? result.hits : []).filter(function (item) {
          return item && item.title && isLooseCandidateMatch(sourceFullTitle, searchTitle, item.title);
        });

        var hit = hits.length > 0;
        setCache(filteredKey, { altHit: hit, altHits: hits });

        if (hit && !hasLrrMarker(titleElement))
          prependLrrMarker(titleElement, '(LRR ≈)', ['lrr-marker-file'], 'alt-loose', hits, null, searchTitle);

        return { success: hit, hits: hits };
      } catch (e) {
        return { success: false, error: e, hits: [] };
      }
    }

    function handleResponse(result, titleElement, galleryUrl, generation) {
      if (generation !== undefined && generation !== lrrScanGeneration) return;
      if (hasLrrMarker(titleElement)) return;
      if (isUrlfinderHit(result)) {
        log('[LRR Checker] Found: ' + galleryUrl + ' [' + (result.matchType || 'URL匹配') + ']');
        var exactHit = extractUrlfinderHit(result);
        prependLrrMarker(titleElement, '(LRR ✔)', ['lrr-marker-downloaded'], 'urlfinder', exactHit ? [exactHit] : [], galleryUrl);
        return;
      }
      if (!CONFIG.enableAltSearch) return;

      var fullTitle = getGalleryTitlePlain(titleElement);
      var parts = extractLooseTitleParts(fullTitle);
      var author = parts.author;
      var title = parts.shortTitle;

      if (!title || !looseKeyIsUseful(normalizeLooseTitle(title))) return;

      // 一级：作者 + 主标题；二级：主标题单独搜索 + 宽松候选过滤。
      if (author && author !== title) {
        performAlternativeSearch(author + ',' + title, fullTitle, titleElement, generation).then(function (r) {
          if (r && r.success) return;
          if (generation !== lrrScanGeneration || hasLrrMarker(titleElement)) return;
          performLooseTitleSearch(title, fullTitle, titleElement, generation);
        });
      } else {
        performLooseTitleSearch(title, fullTitle, titleElement, generation);
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
        var cacheKey = 'lrr-checker-v2-' + galleryUrl;
        var cachedData = getCache(cacheKey);
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
      processInBatches(batch, processGallery, CONFIG.lrrConcurrency).catch(function (e) {
        console.error('[LRR Checker] Batch processing failed:', e);
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
        runAltSearchLimited = createPool(CONFIG.altSearchConcurrency);
        cleanupExpiredCache();
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

    // ---- 无弹窗收藏：详情页 ----
    function setupDetailPageFav() {
      if (!CONFIG.enableQuickFav) return;
      if (!/\/g\//.test(location.pathname)) return;

      // 启用标签链接（去掉 onclick）
      var xpath = "//div[@class='gt' or @class='gtl']/a[@onclick]";
      var nodes = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      var node = null, index = 0;
      while ((node = nodes.snapshotItem(index))) { node.removeAttribute('onclick'); index++; }

      // popbase 来自 exhentai 自身的 JS
      var fav_url = (typeof popbase !== 'undefined' ? popbase : '') + 'addfav';

      function fav_post() {
        var $favLink = document.querySelector('#favoritelink');
        if (!$favLink) return;
        var hasImg = $favLink.querySelector('img');
        if (hasImg) {
          // 加入收藏
          var formData = new FormData();
          formData.append('favcat', String(CONFIG.defaultFavcat));
          formData.append('favnote', '');
          formData.append('apply', 'Add to Favorites');
          formData.append('update', '1');
          fetch(fav_url, { method: 'POST', body: formData })
            .then(function () {
              var fav = document.getElementById('fav');
              var favLink = document.getElementById('favoritelink');
              if (fav) fav.innerHTML = '<div class=\"i\" style=\"background-image:url(https://exhentai.org/img/fav.png); background-position:0px -2px; margin-left:10px\" title=\"Favorites ' + CONFIG.defaultFavcat + '\"></div>';
              if (favLink) favLink.innerHTML = 'Favorites ' + CONFIG.defaultFavcat;
            });
        } else {
          // 取消收藏
          var formData2 = new FormData();
          formData2.append('favcat', 'favdel');
          formData2.append('favnote', '');
          formData2.append('apply', 'Apply Changes');
          formData2.append('update', '1');
          fetch(fav_url, { method: 'POST', body: formData2 })
            .then(function () {
              var fav2 = document.getElementById('fav');
              var favLink2 = document.getElementById('favoritelink');
              if (fav2) fav2.innerHTML = '';
              if (favLink2) favLink2.innerHTML = '<img src=\"https://exhentai.org/img/mr.gif\" /> Add to Favorites';
            });
        }
      }

      var gdf_div = document.querySelector('#gdf');
      if (gdf_div && !gdf_div.dataset.ehQuickFavBound) {
        gdf_div.dataset.ehQuickFavBound = '1';
        gdf_div.removeAttribute('onclick');
        gdf_div.addEventListener('click', fav_post, false);
      }
    }

    // ---- 全局搜索栏 ----
    function setupGlobalSearch() {
      if (!CONFIG.enableGlobalSearch) return;
      if (!/(\/g\/)|(watched)|(popular)|(favorites)/.test(location.pathname) && location.pathname !== '/') return;

      var nb_div = document.querySelector('#nb');
      if (!nb_div) return;
      if (document.getElementById('g_search')) return;

      function global_search() {
        var s = document.getElementById('g_search');
        if (s) window.location.href = '/?f_search=' + encodeURIComponent(s.value) + '&advsearch=1&f_sname=on&f_stags=on&f_sh=on&f_spf=&f_spt=';
      }

      var search_html = '<p class=\"nopm\"><input type=\"text\" id=\"g_search\" name=\"g_search\" placeholder=\"Search expunged galleries\" size=\"50\" maxlength=\"200\"><input type=\"submit\" id=\"g_search_btn\" value=\"Apply Filter\"></p>';
      var div = document.createElement('div');
      div.innerHTML = search_html.trim();
      var search_bar = div.firstChild;
      nb_div.appendChild(search_bar);

      var btn = document.querySelector('#g_search_btn');
      if (btn) btn.addEventListener('click', global_search, false);

      var input = document.querySelector('#g_search');
      if (input) {
        input.addEventListener('keydown', function (e) {
          if (e.keyCode === 13) global_search();
        });
      }

      // 悬停展开样式
      var style = document.createElement('style');
      style.innerHTML = '#nb { transition: max-height 0.2s; max-height: 47px; } #nb:hover { max-height: 100px; }';
      document.head.appendChild(style);
    }

    // ---- 无弹窗收藏：列表页 ----
    function setupListPageFav() {
      if (!CONFIG.enableQuickFav) return;
      if (!/(\/g\/)|(watched)|(popular)|(favorites)/.test(location.pathname) && location.pathname !== '/') return;

      var postedElements = document.querySelectorAll('[id*=\"posted_\"]');
      postedElements.forEach(function (dateDiv) {
        if (dateDiv.dataset.ehQuickFavBound) return;
        dateDiv.dataset.ehQuickFavBound = '1';
        var favcatTagId = dateDiv.id + '_favcat';
        var favcatBtnId = dateDiv.id + '_favbtn';

        var popUpStr = dateDiv.getAttribute('onclick') || '';
        var fav_url = null;
        // 从 onclick 中提取 popbase URL
        var urlMatch = popUpStr.match(/https?:\/\/[^'\"]+addfav/);
        if (urlMatch) fav_url = urlMatch[0];
        else if (typeof popbase !== 'undefined') fav_url = popbase + 'addfav';

        dateDiv.removeAttribute('onclick');
        dateDiv.style.cursor = 'pointer';

        // 已收藏：显示 favcat 编号标签
        if (dateDiv.getAttribute('title')) {
          var title = dateDiv.getAttribute('title');
          var favcat = title.slice(-1);
          var border_color = '#671c17';
          var background_color = '#1c563dcc';
          var styleStr = 'border-color:#e4ee2c;background-color:rgb(70 141 220 / 85%)';
          if (favcat === '0') { background_color = '#309427'; border_color = '#671c17'; styleStr = 'border-color:#e4ee2c;background-color:rgb(70 141 220 / 85%)'; }
          dateDiv.setAttribute('style', styleStr);

          var tagDiv = document.createElement('div');
          tagDiv.className = 'cs ct2';
          tagDiv.id = favcatTagId;
          tagDiv.style.cssText = 'position:absolute;top:-2px;left:-36px;width:30px;height:18px;line-height:18px;background:' + background_color + ';border-color:' + border_color + ';';
          tagDiv.textContent = 'fav' + favcat;
          dateDiv.appendChild(tagDiv);
        } else {
          // 未收藏：显示收藏按钮
          var btnDiv = document.createElement('div');
          btnDiv.className = 'cs ct2';
          btnDiv.id = favcatBtnId;
          btnDiv.style.cssText = 'position:absolute;top:-2px;left:-36px;width:30px;height:18px;line-height:18px;background:#1c563dcc;border-color:#671c17;';
          btnDiv.textContent = t('收藏', 'Fav');
          dateDiv.appendChild(btnDiv);
        }

        // 点击事件
        dateDiv.addEventListener('click', function () {
          if (!dateDiv.getAttribute('title')) {
            // 加入收藏
            if (!fav_url) return;
            var formData = new FormData();
            formData.append('favcat', String(CONFIG.defaultFavcat));
            formData.append('favnote', '');
            formData.append('apply', 'Add to Favorites');
            formData.append('update', '1');
            fetch(fav_url, { method: 'POST', body: formData })
              .then(function (res) { return res.text(); })
              .then(function (data) {
                var patt_borderColor = /borderColor=\"(.*?)\"/;
                var bcMatch = patt_borderColor.exec(data);
                var borderColor = bcMatch ? bcMatch[1] : '#671c17';
                var patt_title = /title=\"(.*?)\"/;
                var tMatch = patt_title.exec(data);
                var newTitle = tMatch ? tMatch[1] : '';
                var favcat = newTitle.slice(-1);
                var styleForFav1 = 'border-color:#e4ee2c;background-color:rgb(70 141 220 / 85%)';
                var bg = borderColor;
                if (favcat === '0') { bg = '#309427'; borderColor = '#671c17'; }

                dateDiv.setAttribute('style', styleForFav1);
                dateDiv.setAttribute('title', newTitle);

                var newTag = document.createElement('div');
                newTag.className = 'cs ct2';
                newTag.id = favcatTagId;
                newTag.style.cssText = 'position:absolute;top:-2px;left:-36px;width:30px;height:18px;line-height:18px;background:' + bg + ';border-color:' + borderColor + ';';
                newTag.textContent = 'fav' + CONFIG.defaultFavcat;
                dateDiv.appendChild(newTag);

                var oldBtn = document.getElementById(favcatBtnId);
                if (oldBtn) oldBtn.remove();
              });
          } else {
            // 取消收藏
            if (!fav_url) return;
            var formData2 = new FormData();
            formData2.append('favcat', 'favdel');
            formData2.append('favnote', '');
            formData2.append('apply', 'Apply Changes');
            formData2.append('update', '1');
            fetch(fav_url, { method: 'POST', body: formData2 })
              .then(function () {
                dateDiv.setAttribute('style', '');
                dateDiv.setAttribute('title', '');
                var oldTag = document.getElementById(favcatTagId);
                if (oldTag) oldTag.remove();

                var newBtn = document.createElement('div');
                newBtn.className = 'cs ct2';
                newBtn.id = favcatBtnId;
                newBtn.style.cssText = 'position:absolute;top:-2px;left:-36px;width:30px;height:18px;line-height:18px;background:#1c563dcc;border-color:#671c17;';
                newBtn.textContent = t('收藏', 'Fav');
                dateDiv.appendChild(newBtn);
              });
          }
        });
      });
    }

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

    var PANEL_HTML = `
<div id="eh-toolbox-panel">
  <div id="eh-toolbox-header" title="长按拖动">
    <span class="eh-tb-icon">EH</span>
    <span class="eh-tb-title">EH Library Toolkit</span>
  </div>
  <div id="eh-toolbox-body">

    <div class="eh-tb-section eh-lrr-section">
      <div class="eh-tb-section-title">界面语言 / Language</div>
      <div class="eh-tb-row"><label class="eh-lrr-field"><span>语言 / Language</span><select id="cfg-uiLanguage" translate="no" class="notranslate"><option value="zh" lang="zh-CN" translate="no">中文</option><option value="en" lang="en" translate="no" class="notranslate">English</option></select></label></div>
    </div>

    <div class="eh-tb-section eh-lrr-section">
      <div class="eh-tb-section-title">Lanraragi 查重</div>
      <div class="eh-tb-row eh-lrr-choice"><label><input type="checkbox" id="cfg-enableLrrChecker"> 启用查重</label></div>
      <div class="eh-tb-row eh-lrr-choice"><label><input type="checkbox" id="cfg-enableAltSearch"> 启用备用标题搜索</label></div>
    </div>

    <div class="eh-tb-section eh-lrr-section">
      <div class="eh-tb-section-title">LRR 连接与性能</div>
      <div class="eh-tb-row"><label class="eh-lrr-field"><span>LRR 服务器</span><input type="text" id="cfg-lrrServerUrl" class="eh-tb-input-text" placeholder="http://127.0.0.1:3000"></label></div>
      <div class="eh-tb-row"><label class="eh-lrr-field"><span>API Key</span><input type="text" id="cfg-lrrApiKey" class="eh-tb-input-text" placeholder="可选"></label></div>
      <div class="eh-lrr-grid">
        <label class="eh-lrr-mini-field"><span>主查重并发</span><input type="number" id="cfg-lrrConcurrency" class="eh-tb-input-num" min="1" value="8"></label>
        <label class="eh-lrr-mini-field"><span>备用搜索并发</span><input type="number" id="cfg-altSearchConcurrency" class="eh-tb-input-num" min="1" value="2"></label>
      </div>
    </div>

    <div class="eh-tb-section eh-lrr-section">
      <div class="eh-tb-section-title">浏览体验增强</div>
      <div class="eh-tb-row eh-browsing-options">
        <label><input type="checkbox" id="cfg-enableQuickFav"> 无弹窗收藏</label>
        <label><input type="checkbox" id="cfg-enableGlobalSearch"> 全局搜索栏</label>
        <label><input type="checkbox" id="cfg-enableChineseHighlight"> 中文翻译高亮</label>
        <label><input type="checkbox" id="cfg-enableUncensoredLabel"> 无修正标签</label>
      </div>
      <div class="eh-tb-row eh-lrr-fav-row"><label class="eh-lrr-field"><span>默认收藏夹</span><input type="number" id="cfg-defaultFavcat" class="eh-tb-input-num" min="0" max="9" value="0"><small>0～9</small></label></div>
    </div>

    <div class="eh-tb-section eh-lrr-section">
      <div class="eh-tb-section-title">高级</div>
      <div class="eh-tb-row eh-lrr-choice"><label><input type="checkbox" id="cfg-enableLogging"> 控制台日志</label></div>
      <div class="eh-tb-row eh-lrr-choice"><label><input type="checkbox" id="cfg-lrrDebugMode"> LRR Debug 模式</label></div>
    </div>

    <div id="eh-tb-lrr-status" class="eh-tb-lrr-status checking">
      <div class="eh-tb-status-main">LRR：等待检测</div>
      <div class="eh-tb-status-detail">将自动检测服务器状态</div>
    </div>

    <div class="eh-tb-actions">
      <button id="eh-tb-rescan-lrr" class="eh-tb-btn eh-tb-btn-primary">重新扫描当前页</button>
      <button id="eh-tb-test-lrr" class="eh-tb-btn eh-tb-btn-secondary">测试LRR连接</button>
    </div>
    <div class="eh-tb-actions">
      <button id="eh-tb-clear-lrr" class="eh-tb-btn eh-tb-btn-warning">清空全部LRR缓存</button>
    </div>
    <div class="eh-tb-actions">
      <button id="eh-tb-save" class="eh-tb-btn eh-tb-btn-primary">保存并刷新</button>
      <button id="eh-tb-reset" class="eh-tb-btn eh-tb-btn-secondary">恢复默认</button>
    </div>
    <div class="eh-tb-footer">ExHentai Library Toolkit v1.1.0 | 悬浮按钮开关面板 · 长按标题拖动</div>
  </div>
</div>`;

    var GALLERY_DL_PANEL_HTML = `
<div id="eh-gallerydl-panel">
  <div id="eh-gallerydl-header" title="长按拖动">
    <span class="eh-tb-icon">DL</span>
    <span class="eh-tb-title">图片 ZIP 下载</span>
  </div>
  <div id="eh-gallerydl-body">
    <div class="eh-tb-section">
      <div class="eh-tb-section-title">保存方式</div>
      <div class="eh-gdl-hint">无需 gallery-dl、Python、Bridge 或本地服务。脚本直接读取图片页、按所选画质下载图片并生成 ZIP；最终文件保存到浏览器当前下载目录。</div>
    </div>

    <div class="eh-tb-section">
      <div class="eh-tb-section-title">压缩包名称</div>
      <div class="eh-tb-row eh-gdl-choice"><label><input type="radio" name="cfg-galleryDlTitleMode" value="default"> 默认标题（英文/中文/罗马音）</label></div>
      <div class="eh-tb-row eh-gdl-choice"><label><input type="radio" name="cfg-galleryDlTitleMode" value="japanese"> 原文/日文标题（如果有）</label></div>
      <div class="eh-gdl-preview"><span>ZIP 预览：</span><strong id="eh-gdl-title-preview">-</strong><em id="eh-gdl-page-preview"></em></div>
    </div>

    <div class="eh-tb-section">
      <div class="eh-tb-section-title">下载内容</div>
      <div class="eh-tb-row eh-gdl-choice"><label><input type="checkbox" id="cfg-galleryDlOriginal"> 下载原画（取消后下载压缩/缩放图）</label></div>
      <div class="eh-tb-row eh-gdl-choice"><label><input type="checkbox" checked disabled> 图片按 001.ext、002.ext… 顺序命名</label></div>
      <div class="eh-tb-row eh-gdl-choice"><label><input type="checkbox" id="cfg-galleryDlWriteMetadata"> 打包 metadata.json + LRR兼容 info.json</label></div>
      <div class="eh-gdl-naming"><span>图片命名</span><strong>001.jpg · 002.png · 003.webp …</strong></div>
      <div class="eh-gdl-hint">原文件是 JPEG 时就是 001.jpg；PNG/WebP 等会保留真实扩展名，避免转码导致不再是原画。</div>
    </div>

    <div class="eh-tb-section">
      <div class="eh-tb-section-title">下载性能</div>
      <div class="eh-tb-row"><label class="eh-gdl-field"><span>并行任务</span><input type="number" id="cfg-galleryDlParallel" class="eh-tb-input-num" min="1" step="1" value="2"></label></div>
    </div>

    <div id="eh-gdl-status" class="eh-tb-lrr-status checking">
      <div class="eh-tb-status-main">纯浏览器下载：就绪</div>
      <div class="eh-tb-status-detail">在图库详情页点击“检查下载源”或直接下载</div>
      <div id="eh-gdl-metrics" class="eh-gdl-metrics" style="display:none">
        <div><strong id="eh-gdl-speed">--</strong><span>平均速度</span></div>
        <div><strong id="eh-gdl-downloaded">--</strong><span>已写入 ZIP</span></div>
        <div><strong id="eh-gdl-progress">--</strong><span>图片进度</span></div>
        <div><strong id="eh-gdl-workers">--</strong><span>并行任务</span></div>
      </div>
    </div>

    <div class="eh-tb-actions eh-gdl-actions">
      <button id="eh-gdl-test" class="eh-tb-btn eh-tb-btn-secondary">检查下载源</button>
      <button id="eh-gdl-download" class="eh-tb-btn eh-gdl-btn-primary">下载当前图库</button>
    </div>
    <div class="eh-tb-actions eh-gdl-actions">
      <button id="eh-gdl-metadata" class="eh-tb-btn eh-tb-btn-secondary">仅获取元数据 ZIP</button>
      <button id="eh-gdl-save" class="eh-tb-btn eh-gdl-btn-save">保存下载设置</button>
    </div>
    <div class="eh-gdl-hint">仅获取元数据：按“压缩包名称”设置生成带 [仅元数据] 前缀的 ZIP，内含 metadata.json 和 info.json，不下载图片，保存到浏览器下载目录。</div>
    <div class="eh-tb-footer">ExHentai Library Toolkit v1.1.0 · Pure Browser Downloader · LRR info.json</div>
  </div>
</div>`

    var PANEL_CSS = `
#eh-toolbox-panel, #eh-gallerydl-panel {
  position: fixed; top: 80px; right: 20px; z-index: 2147483646;
  pointer-events:auto !important;
  width: 320px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
  background: linear-gradient(145deg, #1e1e2f 0%, #252540 100%);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4); overflow: hidden;
  transition: box-shadow 0.2s;
}
#eh-toolbox-panel:hover, #eh-gallerydl-panel:hover { box-shadow: 0 12px 40px rgba(0,0,0,0.5); }

#eh-toolbox-header, #eh-gallerydl-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; cursor: pointer; user-select: none;
  background: linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%);
  color: #fff; font-weight: 600; font-size: 14px;
}
.eh-tb-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; background: rgba(255,255,255,0.2); border-radius: 6px;
  font-size: 10px; font-weight: 700; letter-spacing: -0.5px;
}
.eh-tb-title { flex: 1; }
.eh-tb-arrow { transition: transform 0.25s; font-size: 10px; }

#eh-toolbox-body, #eh-gallerydl-body {
  max-height: 600px; overflow-y: auto; padding: 12px;
  transition: max-height 0.3s ease;
}

#eh-toolbox-body::-webkit-scrollbar, #eh-gallerydl-body::-webkit-scrollbar { width: 6px; }
#eh-toolbox-body::-webkit-scrollbar-thumb, #eh-gallerydl-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }

.eh-tb-section { margin-bottom: 10px; padding: 8px 10px; background: rgba(255,255,255,0.03); border-radius: 8px; }
.eh-tb-subsection { margin: 4px 0 10px 12px; padding: 6px 8px; border-left: 2px solid rgba(162,155,254,0.3); }

.eh-tb-section-title {
  font-size: 11px; font-weight: 700; color: #a29bfe; text-transform: uppercase;
  letter-spacing: 0.8px; margin-bottom: 6px; padding-bottom: 4px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.eh-tb-row { margin-bottom: 4px; color: #c8c8e0; }
.eh-tb-row:last-child { margin-bottom: 0; }
.eh-tb-row label { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; cursor: pointer; line-height: 1.8; }
.eh-tb-row label:hover { color: #fff; }

.eh-tb-row input[type="checkbox"] {
  accent-color: #6c5ce7; width: 14px; height: 14px; cursor: pointer; flex-shrink: 0;
}
.eh-tb-input-num { width: 60px !important; }
.eh-tb-input-text { flex: 1; min-width: 0; }
.eh-tb-row input[type="number"], .eh-tb-row input[type="text"], .eh-tb-row select {
  background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;
  color: #e0e0f0; padding: 3px 6px; font-size: 12px; font-family: monospace;
}
.eh-tb-row input[type="text"] { width: 100%; }
.eh-tb-row input:focus, .eh-tb-row select:focus { outline: none; border-color: #6c5ce7; box-shadow: 0 0 0 2px rgba(108,92,231,0.2); }



#eh-gallerydl-panel {
  position: fixed; top: 150px; right: 68px; z-index: 999998;
  width: 340px;
}
#eh-gallerydl-header { background: linear-gradient(135deg, #187a60 0%, #32b58b 100%); }
#eh-gallerydl-body { max-height: 650px; }
.eh-gdl-hint { margin-top: 5px; font-size: 10px; line-height: 1.45; color: rgba(255,255,255,0.42); }
.eh-gdl-preview { margin-top: 7px; padding: 6px 8px; border-radius: 6px; background: rgba(0,0,0,0.22); color: #c8c8e0; font-size: 11px; word-break: break-all; }
.eh-gdl-preview strong { color: #7ce0bf; font-weight: 600; }
.eh-tb-row input[type="radio"] { accent-color: #32b58b; width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; }

/* LRR Toolbox：与下载面板统一布局，独立紫蓝配色，并覆盖站点 input:hover 样式 */
#eh-toolbox-panel {
  width: min(410px, calc(100vw - 24px));
  background: #171827; border-color: #3a3c58; color-scheme: dark;
  box-shadow: 0 14px 46px rgba(0,0,0,.48);
}
#eh-toolbox-header { padding: 12px 16px; background: linear-gradient(135deg,#5b4fd6,#8d82ef); }
#eh-toolbox-body { max-height: min(78vh, 720px); padding: 14px; background: linear-gradient(180deg,#1a1b2b,#161724); }
#eh-toolbox-panel .eh-tb-section {
  margin-bottom: 12px; padding: 11px 12px; border-radius: 10px;
  background: #222337; border: 1px solid #353751;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
}
#eh-toolbox-panel .eh-tb-section-title {
  margin-bottom: 9px; padding-bottom: 7px; color: #b3abff;
  border-bottom-color: #3b3d58; letter-spacing: .55px;
}
#eh-toolbox-panel .eh-tb-row { margin-bottom: 7px; color: #d8d9e8; }
#eh-toolbox-panel .eh-tb-row:last-child { margin-bottom: 0; }
#eh-toolbox-panel .eh-lrr-choice label { gap: 9px; min-height: 25px; }
#eh-toolbox-panel .eh-browsing-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 10px; }
#eh-toolbox-panel .eh-browsing-options label { flex-wrap: nowrap; gap: 6px; min-width: 0; min-height: 24px; line-height: 1.35; }
#eh-toolbox-panel .eh-lrr-field {
  display: grid; grid-template-columns: 92px minmax(0,1fr); align-items: center;
  gap: 10px; width: 100%; cursor: default; line-height: 1.35;
}
#eh-toolbox-panel .eh-lrr-field > span { color: #cdd0e2; white-space: nowrap; }
#eh-toolbox-panel .eh-lrr-field > small { color: #7f849d; font-size: 10px; white-space: nowrap; }
#eh-toolbox-panel .eh-lrr-fav-row .eh-lrr-field { grid-template-columns: 92px 76px auto; }
#eh-toolbox-panel .eh-lrr-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; margin-top: 8px; }
#eh-toolbox-panel .eh-lrr-mini-field {
  display: grid; grid-template-columns: 1fr 68px; align-items: center; gap: 8px;
  min-width: 0; padding: 8px 9px; border-radius: 8px; background: #191a2a; border: 1px solid #30324a;
  color: #c6c9db; cursor: default;
}
#eh-toolbox-panel .eh-lrr-mini-field > span { min-width: 0; font-size: 11px; line-height: 1.3; }
#eh-toolbox-panel input[type="text"],
#eh-toolbox-panel input[type="number"],
#eh-toolbox-panel select {
  box-sizing: border-box !important; min-width: 0 !important; height: 34px !important;
  margin: 0 !important; padding: 5px 9px !important; border-radius: 7px !important;
  border: 1px solid #464964 !important; background: #131522 !important;
  color: #f3f4fb !important; -webkit-text-fill-color: #f3f4fb !important;
  caret-color: #b1a9ff !important; font-size: 12px !important; font-family: Consolas, "Cascadia Mono", monospace !important;
  transition: border-color .15s, background .15s, box-shadow .15s !important;
}
#eh-toolbox-panel input[type="text"] { width: 100% !important; }
#eh-toolbox-panel input[type="number"] { width: 68px !important; text-align: center; }
#eh-toolbox-panel select { width: 100% !important; }
#eh-toolbox-panel input[type="text"]:hover,
#eh-toolbox-panel input[type="number"]:hover,
#eh-toolbox-panel select:hover {
  background: #1c1f31 !important; color: #fff !important; -webkit-text-fill-color: #fff !important;
  border-color: #686d92 !important;
}
#eh-toolbox-panel input[type="text"]:focus,
#eh-toolbox-panel input[type="number"]:focus,
#eh-toolbox-panel select:focus {
  outline: none !important; background: #11131f !important; color: #fff !important; -webkit-text-fill-color: #fff !important;
  border-color: #9b91ff !important; box-shadow: 0 0 0 3px rgba(155,145,255,.16) !important;
}
#eh-toolbox-panel input[type="text"]::placeholder { color: #7d819b !important; -webkit-text-fill-color: #7d819b !important; opacity: 1 !important; }
#eh-toolbox-panel input[type="checkbox"] { accent-color: #8e82ef; background: transparent !important; }
#eh-toolbox-panel #eh-tb-lrr-status { margin: 2px 0 7px; padding: 10px 11px; background: #1d1f31; border-color: #393c58; }
#eh-toolbox-panel .eh-tb-actions { padding: 7px 0 2px; }
#eh-toolbox-panel .eh-tb-btn-primary { background: linear-gradient(135deg,#6257db,#9288f0); }
#eh-toolbox-panel .eh-tb-btn-secondary { background: #2b2e45; color: #d9dbee; border: 1px solid #40445f; }
#eh-toolbox-panel .eh-tb-btn-secondary:hover { background: #373b56; color: #fff; }
#eh-toolbox-panel .eh-tb-btn-warning { background: #3b252f; color: #ffb0b9; border-color: #633744; }
#eh-toolbox-panel .eh-tb-btn-warning:hover { background: #53303b; color: #fff; }
#eh-toolbox-panel .eh-tb-footer { color: #666b84; padding-top: 8px; }

/* 原画下载面板：独立配色 + 强制覆盖 E-Hentai 的 input:hover 浅色样式 */
#eh-gallerydl-panel {
  width: min(410px, calc(100vw - 24px));
  background: #151b29; border-color: #334158; color-scheme: dark;
  box-shadow: 0 14px 46px rgba(0,0,0,.48);
}
#eh-gallerydl-header { padding: 12px 16px; background: linear-gradient(135deg,#1d8068,#3dbb96); }
#eh-gallerydl-body { max-height: min(78vh, 720px); padding: 14px; background: linear-gradient(180deg,#171d2c,#141a28); }
#eh-gallerydl-panel .eh-tb-section {
  margin-bottom: 12px; padding: 11px 12px; border-radius: 10px;
  background: #1d2535; border: 1px solid #2c3950;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.025);
}
#eh-gallerydl-panel .eh-tb-section-title {
  margin-bottom: 9px; padding-bottom: 7px; color: #77dfc1;
  border-bottom-color: #33445a; letter-spacing: .55px;
}
#eh-gallerydl-panel .eh-tb-row { margin-bottom: 7px; color: #d6dceb; }
#eh-gallerydl-panel .eh-tb-row:last-child { margin-bottom: 0; }
#eh-gallerydl-panel .eh-gdl-field {
  display: grid; grid-template-columns: 84px minmax(0,1fr); align-items: center;
  gap: 10px; width: 100%; cursor: default; line-height: 1.35;
}
#eh-gallerydl-panel .eh-gdl-field > span { color: #c7d0e2; white-space: nowrap; }
#eh-gallerydl-panel .eh-gdl-choice label { gap: 9px; min-height: 25px; }
#eh-gallerydl-panel .eh-tb-input-text,
#eh-gallerydl-panel .eh-tb-input-select,
#eh-gallerydl-panel input[type="text"],
#eh-gallerydl-panel input[type="number"],
#eh-gallerydl-panel select {
  box-sizing: border-box !important; width: 100% !important; min-width: 0 !important; height: 34px !important;
  margin: 0 !important; padding: 5px 9px !important; border-radius: 7px !important;
  border: 1px solid #3b4a63 !important; background: #111827 !important;
  color: #f2f5fb !important; -webkit-text-fill-color: #f2f5fb !important;
  caret-color: #7ce0bf !important; font-size: 12px !important; font-family: Consolas, "Cascadia Mono", monospace !important;
  transition: border-color .15s, background .15s, box-shadow .15s !important;
}
#eh-gallerydl-panel input[type="text"]:hover,
#eh-gallerydl-panel input[type="number"]:hover,
#eh-gallerydl-panel select:hover {
  background: #182235 !important; color: #fff !important; -webkit-text-fill-color: #fff !important;
  border-color: #5a6d8b !important;
}
#eh-gallerydl-panel input[type="text"]:focus,
#eh-gallerydl-panel input[type="number"]:focus,
#eh-gallerydl-panel select:focus {
  outline: none !important; background: #0f1726 !important; color: #fff !important; -webkit-text-fill-color: #fff !important;
  border-color: #48c7a2 !important; box-shadow: 0 0 0 3px rgba(72,199,162,.16) !important;
}
#eh-gallerydl-panel input[type="text"]::placeholder { color: #7e8aa3 !important; -webkit-text-fill-color: #7e8aa3 !important; opacity: 1 !important; }
#eh-gallerydl-panel input[type="text"]:disabled {
  background: #171d2a !important; color: #718097 !important; -webkit-text-fill-color: #718097 !important;
  border-color: #2d394c !important; opacity: .72 !important; cursor: not-allowed !important;
}
#eh-gallerydl-panel select option { background: #151d2c !important; color: #f2f5fb !important; }
#eh-gallerydl-panel input[type="radio"], #eh-gallerydl-panel input[type="checkbox"] {
  accent-color: #36bd96; background: transparent !important;
}
#eh-gallerydl-panel .eh-gdl-hint { margin-top: 8px; color: #8491a8; font-size: 10.5px; line-height: 1.55; }
#eh-gallerydl-panel .eh-gdl-naming { display:flex; justify-content:space-between; gap:10px; margin-top:8px; padding:7px 9px; border-radius:7px; background:#141b29; border:1px solid #2b3a4f; color:#9eabc0; font-size:10.5px; }
#eh-gallerydl-panel .eh-gdl-naming strong { color:#76e1c0; font-family:Consolas,"Cascadia Mono",monospace; font-weight:600; }
#eh-gallerydl-panel .eh-gdl-preview {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 3px; margin-top: 9px; padding: 8px 10px;
  background: #141b29; border: 1px solid #2b3a4f; color: #aeb8cc;
}
#eh-gallerydl-panel .eh-gdl-preview strong { color: #76e1c0; }
#eh-gallerydl-panel .eh-gdl-preview em { color: #8fa2bd; font-style: normal; white-space: nowrap; }
#eh-gallerydl-panel #eh-gdl-status { margin: 2px 0 7px; padding: 10px 11px; background: #192233; border-color: #304158; }
.eh-gdl-metrics { clear: both; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; margin-top: 9px; }
.eh-gdl-metrics > div { min-width: 0; padding: 8px 9px; border-radius: 7px; background: #111827; border: 1px solid #2a394f; }
.eh-gdl-metrics strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #7ce0bf; font-size: 13px; line-height: 1.25; }
.eh-gdl-metrics span { display: block; margin-top: 2px; color: #78869e; font-size: 9.5px; }
#eh-gallerydl-panel .eh-gdl-actions { padding: 7px 0 2px; }
#eh-gallerydl-panel .eh-gdl-btn-primary { background: linear-gradient(135deg,#1f9174,#3dc59d); color: #fff; }
#eh-gallerydl-panel .eh-gdl-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(61,197,157,.27); }
#eh-gallerydl-panel .eh-gdl-btn-save { background: #29384d; color: #dce6f5; border: 1px solid #3b506b; }
#eh-gallerydl-panel .eh-gdl-btn-save:hover { background: #334762; color: #fff; }




.lrr-match-tag {
  display:inline-block;
  margin-left:5px;
  padding:2px 6px;
  border-radius:4px;
  color:#fff;
  font-size:12px;
  cursor:pointer;
  font-weight:bold;
}
.lrr-match-tag.exact { background:#28a745; }
.lrr-match-tag.high { background:#f1c40f; color:#222; }
.lrr-match-tag.similar { background:#f1c40f; color:#222; }
.lrr-match-tag:hover { filter:brightness(1.15); }


.eh-lrr-float-ball, .eh-gdl-float-ball {
  position: fixed;
  right: 18px;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  color:white;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:18px;
  cursor:pointer;
  z-index:2147483647;
  pointer-events:auto !important;
  touch-action:manipulation;
  box-shadow:0 4px 12px rgba(0,0,0,.25);
  user-select:none;
}
.eh-lrr-float-ball {
  top: 120px;
  background: linear-gradient(135deg,#6c5ce7,#a29bfe);
}
.eh-gdl-float-ball {
  top: 168px;
  background: linear-gradient(135deg,#187a60,#32b58b);
}
.eh-lrr-float-ball:hover, .eh-gdl-float-ball:hover { transform:scale(1.08); }

.eh-tb-lrr-status {
  margin: 8px 0 4px; padding: 8px 10px; border-radius: 7px;
  border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.035);
}
.eh-tb-lrr-status::before { content: "●"; float: left; margin-right: 7px; line-height: 18px; }
.eh-tb-lrr-status.online::before { color: #46d369; }
.eh-tb-lrr-status.offline::before { color: #ff6464; }
.eh-tb-lrr-status.checking::before { color: #f0c75e; }
.eh-tb-status-main { font-size: 12px; font-weight: 700; color: #e8e8f8; line-height: 18px; }
.eh-tb-status-detail {
  clear: both; padding-top: 3px; font-size: 10px; line-height: 1.45;
  color: rgba(255,255,255,0.42); word-break: break-all;
}

.eh-tb-actions { display: flex; gap: 8px; padding: 8px 10px 4px; }
.eh-tb-btn {
  flex: 1; padding: 7px 0; border: none; border-radius: 6px;
  font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.eh-tb-btn-primary { background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: #fff; }
.eh-tb-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(108,92,231,0.4); }
.eh-tb-btn-secondary { background: rgba(255,255,255,0.08); color: #c8c8e0; }
.eh-tb-btn-secondary:hover { background: rgba(255,255,255,0.15); color: #fff; }
.eh-tb-btn-warning { background: rgba(220,53,69,0.18); color: #ff9aa5; border: 1px solid rgba(220,53,69,0.2); }
.eh-tb-btn-warning:hover { background: rgba(220,53,69,0.3); color: #fff; }
.eh-tb-btn:disabled { opacity: 0.55; cursor: wait; transform: none !important; box-shadow: none !important; }

.eh-tb-footer { text-align: center; font-size: 10px; color: rgba(255,255,255,0.2); padding: 4px 0 6px; }

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
.lrr-marker-error { color: #fff; background: linear-gradient(135deg, #dc3545, #e05656); }

/* LRR Hover Card */
`;


    // 油猴菜单入口
    function registerUserscriptMenu() {
      if (typeof GM_registerMenuCommand !== 'function') return;

      GM_registerMenuCommand(t('⚙ 打开LRR设置', '⚙ Open LRR Settings'), function () {
        ensureFloatingUi();
        toggleLrrFloatPanel(true);
      });

      GM_registerMenuCommand(t('⬇ 打开图片 ZIP 下载', '⬇ Open Image ZIP Download'), function () {
        ensureFloatingUi();
        toggleGalleryDlPanel(true);
      });

      GM_registerMenuCommand(t('🔄 重新扫描当前页面', '🔄 Rescan Current Page'), function () {
        if (typeof rescanCurrentPage === 'function') scheduleLrrRescan();
      });

      GM_registerMenuCommand(t('🧹 清理LRR缓存', '🧹 Clear LRR Cache'), function () {
        if (typeof clearLrrCache === 'function') {
          var count = clearLrrCache(false);
          alert('已清理LRR缓存：' + count + ' 项');
        }
      });

      GM_registerMenuCommand(t('🟢 测试LRR连接', '🟢 Test LRR Connection'), function () {
        var box = document.querySelector('#eh-tb-lrr-status');
        var btn = document.querySelector('#eh-tb-test-lrr');
        if (typeof testLrrConnection === 'function')
          testLrrConnection(box, btn);
      });
    }



    // 悬浮球控制面板
    function toggleLrrFloatPanel(force) {
      var panel = document.querySelector('#eh-toolbox-panel');
      if (!panel) return;

      var show = force;
      if (show === undefined) {
        show = panel.style.display === 'none';
      }

      if (show) {
        toggleGalleryDlPanel(false);
        panel.style.display = 'block';
        panel.classList.remove('collapsed');
      } else {
        panel.style.display = 'none';
      }
    }

    function createLrrFloatBall() {
      var existingBall = document.querySelector('.eh-lrr-float-ball');
      if (existingBall) return existingBall;
      if (!document.body) return null;
      var ball = document.createElement('div');
      ball.className = 'eh-lrr-float-ball';
      ball.textContent = '📚';
      ball.title = t('打开LRR控制面板', 'Open LRR control panel');
      ball.setAttribute('role', 'button');
      ball.setAttribute('tabindex', '0');

      function openPanel(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        ensureFloatingUi();
        toggleLrrFloatPanel();
      }
      ball.addEventListener('click', openPanel, false);
      ball.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') openPanel(e);
      }, false);
      document.body.appendChild(ball);
      return ball;
    }

    function toggleGalleryDlPanel(force) {
      var panel = document.querySelector('#eh-gallerydl-panel');
      if (!panel) return;
      var show = force;
      if (show === undefined) show = panel.style.display === 'none';
      panel.style.display = show ? 'block' : 'none';
      if (show) {
        toggleLrrFloatPanel(false);
        panel.classList.remove('collapsed');
        updateGalleryDlPreview(panel);
      }
    }

    function createGalleryDlFloatBall() {
      var existingBall = document.querySelector('.eh-gdl-float-ball');
      if (existingBall) return existingBall;
      if (!document.body) return null;
      var ball = document.createElement('div');
      ball.className = 'eh-gdl-float-ball';
      ball.textContent = '⬇';
      ball.title = t('打开图片 ZIP 下载面板', 'Open image ZIP download panel');
      ball.setAttribute('role', 'button');
      ball.setAttribute('tabindex', '0');

      function openPanel(e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        ensureFloatingUi();
        toggleGalleryDlPanel();
      }
      ball.addEventListener('click', openPanel, false);
      ball.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') openPanel(e);
      }, false);
      document.body.appendChild(ball);
      return ball;
    }

    function setupGalleryDlPanel() {
      var existingPanel = document.getElementById('eh-gallerydl-panel');
      if (existingPanel) return existingPanel;
      ensurePanelCss();
      var panelContainer = document.createElement('div');
      panelContainer.innerHTML = localizeHtml(GALLERY_DL_PANEL_HTML);
      var panel = panelContainer.firstElementChild;
      document.body.appendChild(panel);
      panel.style.display = 'none';

      var savedPos = gmGet('ehGalleryDlPanelPos', null);
      if (savedPos && typeof savedPos === 'object' && savedPos.top !== undefined) {
        panel.style.top = savedPos.top + 'px';
        panel.style.right = 'auto';
        panel.style.left = savedPos.left + 'px';
      }

      var header = panel.querySelector('#eh-gallerydl-header');
      makeDraggable(panel, header, 'ehGalleryDlPanelPos');

      panel.querySelector('#cfg-galleryDlOriginal').checked = CONFIG.galleryDlOriginal !== false;
      panel.querySelector('#cfg-galleryDlWriteMetadata').checked = !!CONFIG.galleryDlWriteMetadata;
      panel.querySelector('#cfg-galleryDlParallel').value = String(CONFIG.galleryDlParallel);
      var modeNode = panel.querySelector('input[name="cfg-galleryDlTitleMode"][value="' + CONFIG.galleryDlTitleMode + '"]');
      if (modeNode) modeNode.checked = true;

      var radios = panel.querySelectorAll('input[name="cfg-galleryDlTitleMode"]');
      for (var i = 0; i < radios.length; i++) radios[i].addEventListener('change', function () { updateGalleryDlPreview(panel); });

      var statusBox = panel.querySelector('#eh-gdl-status');
      var testBtn = panel.querySelector('#eh-gdl-test');
      var downloadBtn = panel.querySelector('#eh-gdl-download');
      panel.querySelector('#eh-gdl-save').addEventListener('click', function () {
        saveGalleryDlConfig(panel).then(function () {
          updateGalleryDlStatus(statusBox, 'online', t('下载设置已保存', 'Download settings saved'), t('无需刷新页面', 'No reload required'));
        }).catch(function (e) {
          updateGalleryDlStatus(statusBox, 'offline', t('保存失败', 'Save failed'), e.message);
        });
      });
      testBtn.addEventListener('click', function () { testGalleryDownloader(panel, statusBox, testBtn); });
      downloadBtn.addEventListener('click', function () { startGalleryDlDownload(panel, statusBox, downloadBtn); });
      var metadataBtn = panel.querySelector('#eh-gdl-metadata');
      metadataBtn.addEventListener('click', function () { startGalleryMetadataDownload(panel, statusBox, metadataBtn); });
      updateGalleryDlPreview(panel);
    }

    function ensurePanelCss() {
      if (document.getElementById('eh-toolbox-style')) return;
      var style = document.createElement('style');
      style.id = 'eh-toolbox-style';
      style.textContent = PANEL_CSS;
      (document.head || document.documentElement).appendChild(style);
    }

    function setupPanel() {
      var existingPanel = document.getElementById('eh-toolbox-panel');
      if (existingPanel) return existingPanel;
      ensurePanelCss();

      // 注入 HTML
      var panelContainer = document.createElement('div');
      panelContainer.innerHTML = localizeHtml(PANEL_HTML);
      var panel = panelContainer.firstElementChild;
      
      document.body.appendChild(panel);
      panel.style.display = 'none';

      // 恢复位置
      var savedPos = gmGet('ehPanelPos', null);
      if (savedPos && typeof savedPos === 'object' && savedPos.top !== undefined) {
        panel.style.top = savedPos.top + 'px';
        panel.style.right = 'auto';
        panel.style.left = savedPos.left + 'px';
      }

      // 面板始终展开；标题仅用于拖动，显隐由悬浮按钮控制。
      var header = panel.querySelector('#eh-toolbox-header');
      makeDraggable(panel, header);

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
        'enableQuickFav': 'cfg-enableQuickFav',
        'enableGlobalSearch': 'cfg-enableGlobalSearch',
        'enableChineseHighlight': 'cfg-enableChineseHighlight',
        'enableUncensoredLabel': 'cfg-enableUncensoredLabel',
        'enableLogging': 'cfg-enableLogging',
        'lrrDebugMode': 'cfg-lrrDebugMode',
      };
      for (var ck in checkboxMap) {
        var el = panel.querySelector('#' + checkboxMap[ck]);
        if (el) el.checked = !!CONFIG[ck];
      }
      var inputMap = {
        'lrrServerUrl': 'cfg-lrrServerUrl',
        'lrrApiKey': 'cfg-lrrApiKey',
        'lrrConcurrency': 'cfg-lrrConcurrency',
        'altSearchConcurrency': 'cfg-altSearchConcurrency',
        'defaultFavcat': 'cfg-defaultFavcat',
      };
      for (var ik in inputMap) {
        var el2 = panel.querySelector('#' + inputMap[ik]);
        if (el2) el2.value = CONFIG[ik];
      }

      // 保存
      panel.querySelector('#eh-tb-save').addEventListener('click', function () {
        var saves = [];
        for (var ck2 in checkboxMap) {
          var el3 = panel.querySelector('#' + checkboxMap[ck2]);
          if (el3) saves.push(gmSet(ck2, el3.checked));
        }
        for (var ik2 in inputMap) {
          var el4 = panel.querySelector('#' + inputMap[ik2]);
          if (el4) {
            var val = el4.value;
            if (el4.type === 'number') val = parseInt(val, 10) || 0;
            saves.push(gmSet(ik2, val));
          }
        }
        Promise.all(saves).then(function () {
          alert(t('配置已保存，页面将刷新以应用更改。', 'Settings saved. The page will reload to apply changes.'));
          location.reload();
        }).catch(function (e) {
          console.error('[EH Toolkit] 保存配置失败:', e);
          alert(t('配置保存失败，请打开控制台查看错误。', 'Failed to save settings. Open the console for details.'));
        });
      });

      // LRR 工具按钮
      var statusBox = panel.querySelector('#eh-tb-lrr-status');
      var testBtn = panel.querySelector('#eh-tb-test-lrr');
      var rescanBtn = panel.querySelector('#eh-tb-rescan-lrr');
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
          updateLrrStatus(statusBox, 'checking', 'LRR：正在重扫当前页', '已清除当前页缓存 ' + removed + ' 项');
          setTimeout(function () { testLrrConnection(statusBox, testBtn); }, 500);
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          if (!confirm('确定清空全部LRR查重缓存并重新扫描当前页面？')) return;
          var count = clearLrrCache(false);
          rescanCurrentPage(false);
          updateLrrStatus(statusBox, 'checking', 'LRR：缓存已清空', '共删除 ' + count + ' 项，正在重新扫描当前页');
          setTimeout(function () { testLrrConnection(statusBox, testBtn); }, 500);
        });
      }

      // 面板创建后自动检测一次LRR服务器
      setTimeout(function () {
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

    function makeDraggable(panel, handle, storageKey) {
      storageKey = storageKey || 'ehPanelPos';
      var isDragging = false;
      var startX, startY, startLeft, startTop;
      var dragTimer = null;

      handle.addEventListener('mousedown', function (e) {
        // 不干扰折叠点击
        if (e.detail === 1) {
          dragTimer = setTimeout(function () {
            isDragging = true;
            panel.style.transition = 'none';
            var rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            startX = e.clientX;
            startY = e.clientY;
            panel.style.right = 'auto';
            panel.style.left = startLeft + 'px';
            panel.style.top = startTop + 'px';
            document.body.style.cursor = 'move';
          }, 180);
        }
      });

      document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        var newLeft = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, startLeft + e.clientX - startX));
        var newTop = Math.max(0, Math.min(window.innerHeight - 40, startTop + e.clientY - startY));
        panel.style.left = newLeft + 'px';
        panel.style.top = newTop + 'px';
      });

      document.addEventListener('mouseup', function () {
        if (dragTimer) { clearTimeout(dragTimer); dragTimer = null; }
        if (isDragging) {
          isDragging = false;
          panel.style.transition = '';
          document.body.style.cursor = '';
          gmSet(storageKey, { top: parseInt(panel.style.top, 10), left: parseInt(panel.style.left, 10) });
        }
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
      catch (e) { console.error('[EH Toolkit] ' + name + ' 初始化失败:', e); return null; }
    }

    function ensureFloatingUi() {
      if (!document.body || !document.documentElement) return;
      ensurePanelCss();
      if (!document.getElementById('eh-toolbox-panel')) safeRunFeature('LRR面板恢复', setupPanel);
      if (!document.getElementById('eh-gallerydl-panel')) safeRunFeature('下载面板恢复', setupGalleryDlPanel);
      if (!document.querySelector('.eh-lrr-float-ball')) safeRunFeature('LRR悬浮球恢复', createLrrFloatBall);
      if (!document.querySelector('.eh-gdl-float-ball')) safeRunFeature('下载悬浮球恢复', createGalleryDlFloatBall);
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
      var selector = '#eh-toolbox-panel, #eh-gallerydl-panel, #eh-toolbox-style, .eh-lrr-float-ball, .eh-gdl-float-ball';
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
      safeRunFeature('详情页收藏', setupDetailPageFav);
      safeRunFeature('全局搜索', setupGlobalSearch);
      safeRunFeature('列表页收藏', setupListPageFav);
      safeRunFeature('中文高亮', setupChineseHighlight);
      safeRunFeature('无修正标签', setupUncensoredLabels);
      safeRunFeature('油猴菜单', registerUserscriptMenu);

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
