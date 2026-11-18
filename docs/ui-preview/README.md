# 紧凑界面验收预览

截图由 Chromium 执行本仓库真实 userscript 生成，不是设计稿。背景为虚构速写集与几何占位图；页面、下载和 API 响应全部本地模拟，没有访问 E-Hentai / ExHentai 或真实 LANraragi。

## 截图

- [默认收起状态](<01-collapsed-desktop.png>)：只有右上角 34 × 34 px 入口。
- [桌面整体](<02-download-desktop.png>)：面板宽 340 px，内容在面板内滚动。
- [下载](<download-panel.png>)、[查重](<check-panel.png>)、[设置](<settings-panel.png>)。
- [浅色主题](<download-panel-light.png>)、[下载暂停](<paused-panel.png>)、[390 px 窄屏](<03-mobile.png>)。
- [拖动至左下后向上展开](<dragged-desktop.png>)、[拖动与窄屏自动避让](<dragged-mobile.png>)。

## 重现

需要 Node.js、Playwright 及 Chromium。Playwright 仅用于开发验收，不是 userscript 运行依赖。

```sh
npm install --prefix /tmp/elt-ui-preview-tools playwright
NODE_PATH=/tmp/elt-ui-preview-tools/node_modules /tmp/elt-ui-preview-tools/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/elt-ui-preview-tools/node_modules node tools/capture-ui.cjs
NODE_PATH=/tmp/elt-ui-preview-tools/node_modules node tools/test-lrr-index-browser.cjs
NODE_PATH=/tmp/elt-ui-preview-tools/node_modules node tools/test-settings-browser.cjs
NODE_PATH=/tmp/elt-ui-preview-tools/node_modules node tools/test-position-browser.cjs
NODE_PATH=/tmp/elt-ui-preview-tools/node_modules node tools/test-simplified-browser.cjs
node --check ExHentai_Library_Toolkit.user.js
node --test tests/*.cjs
```

从仓库根目录运行。脚本会覆盖本目录截图和 [浏览器验证记录](<verification.json>)。

浏览器断言覆盖右上角入口与向下展开、新配置默认并发 5、短屏边界、单入口、标签切换、面板大小、深浅主题、API Key 掩码、暂停中止请求、收起保留任务、继续保留进度、放弃清理、窄屏边界、UI 被宿主页移除后的恢复，以及无浏览器异常、无外部网络请求。设置专项验收将 GM 存储留在浏览器页面之外，验证已存 Key 不回填 DOM、空输入保存保留、新 Key 替换、显式清除以及存储失败后原 Key 保留和临时输入清空。精简专项验收确保中文高亮、真实标签驱动的无修正标记和动态列表徽标仍生效，旧收藏／搜索配置不会接管原生控件，已移除的入口不存在，性能参数默认折叠且日志导出保留。真实站点登录、额度、封禁及油猴扩展差异不在此模拟验收范围内。
