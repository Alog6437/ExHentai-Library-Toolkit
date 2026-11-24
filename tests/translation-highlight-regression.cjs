const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'ExHentai_Library_Toolkit.user.js'), 'utf8');
const start = source.indexOf('    function setupChineseHighlight(');
const end = source.indexOf('    /* ===', start);
const marker = 'eh-translation-highlight';
function node(textContent, nested = null) {
  const classes = new Set(['glink']);
  return { nodeType: 1, textContent, classes, querySelector() { return nested; }, closest() { return this; },
    getAttribute() { return [...classes].join(' '); }, classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); } } };
}
function harness(nodes, options = {}) {
  let observer, timers = [], observerCount = 0, selector;
  const styles = [];
  const ctx = vm.createContext({ CONFIG: { enableChineseHighlight: true, uiLanguage: 'zh', ...options },
    setTimeout(callback) { timers.push(callback); return timers.length; },
    MutationObserver: class { constructor(callback) { observer = callback; observerCount++; } observe() {} },
    document: { documentElement: {}, head: { appendChild(style) { styles.push(style); } },
      createElement() { return {}; }, getElementById(id) { return styles.find(s => s.id === id); },
      querySelectorAll(value) { selector = value; return nodes; } },
  });
  vm.runInContext(source.slice(start, end), ctx);
  return { ctx, nodes, styles, get selector() { return selector; }, get observerCount() { return observerCount; },
    mutate(mutation) { observer([mutation]); }, get pending() { return timers.length; }, flush() { const pending = timers; timers = []; pending.forEach(fn => fn()); } };
}
test('highlight targets actual title nodes across layouts without overwriting inline styles or whole cards', () => {
  const chinese = node('样例 [中国翻訳]'), english = node('Sample [English]'), wrapper = node('样例 [中国翻訳]', chinese);
  const h = harness([wrapper, chinese, english]); h.ctx.setupChineseHighlight();
  assert.ok(h.selector.includes('.glink')); assert.ok(h.selector.includes('.glname a'));
  assert.equal(chinese.classes.has(marker), true); assert.equal(wrapper.classes.has(marker), false);
  assert.equal(english.classes.has(marker), false); assert.match(h.styles[0].textContent, /color:#ff8d8d !important/);
});
test('language selection, case-insensitive Chinese tags and disabled preference are respected', () => {
  const a = node('[chinese] Sample'), b = node('[English] Sample'); const h = harness([a, b]);
  h.ctx.setupChineseHighlight(); assert.equal(a.classes.has(marker), true); assert.equal(b.classes.has(marker), false);
  h.ctx.CONFIG.uiLanguage = 'en'; h.ctx.setupChineseHighlight();
  assert.equal(a.classes.has(marker), false); assert.equal(b.classes.has(marker), true);
  const disabled = harness([node('[汉化]')], { enableChineseHighlight: false }); disabled.ctx.setupChineseHighlight();
  assert.equal(disabled.styles.length, 0); assert.equal(disabled.observerCount, 0);
});
test('dynamic insertion, title editing and replacement are debounced independently of LRR or uncensored features', () => {
  const a = node('Plain'); const h = harness([a], { enableLrrChecker: false, enableUncensoredLabel: false }); h.ctx.setupChineseHighlight();
  a.textContent = '[汉化] Changed';
  h.mutate({ type: 'characterData', target: { nodeType: 3, parentElement: a } });
  h.mutate({ type: 'childList', target: a }); assert.equal(h.pending, 1); h.flush(); assert.equal(a.classes.has(marker), true);
  a.textContent = 'Plain'; h.mutate({ type: 'characterData', target: a }); h.flush(); assert.equal(a.classes.has(marker), false);
  const b = node('[漢化] Replacement'); h.nodes.splice(0, 1, b);
  h.mutate({ type: 'childList', target: {}, addedNodes: [b] }); h.flush(); assert.equal(b.classes.has(marker), true);
});
test('repeated setup reuses style and observer and marker-only changes do not schedule self-loops', () => {
  const a = node('[汉化]'); const h = harness([a]); h.ctx.setupChineseHighlight(); h.ctx.setupChineseHighlight();
  assert.equal(h.styles.length, 1); assert.equal(h.observerCount, 1);
  h.mutate({ type: 'attributes', target: a, oldValue: 'glink' }); assert.equal(h.pending, 0);
  a.classes.add('host-title'); h.mutate({ type: 'attributes', target: a, oldValue: 'glink ' + marker }); assert.equal(h.pending, 1);
});
