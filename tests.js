/* =========================================================================
 * S9 测试负责人 - 测试脚本 tests.js
 * 项目：个人记账本系统（HTML + CSS + 原生 JS + LocalStorage）
 * 依据：《个人记账本系统开发规范 V1.0》（组长终审版，2026-11-07）
 *
 * 对外接口（规范第 3 节要求 S9 必须提供）：
 *   Ledger.Tests.runAll()          —— 跑全部测试
 *   Ledger.Tests.testStorage()     —— 只跑 storage 测试
 *   Ledger.Tests.testFinance()     —— 只跑 finance 测试
 *   Ledger.Tests.testFilter()      —— 只跑 filter 测试
 *   Ledger.Tests.testImportExport()—— 只跑导入导出测试
 *   （额外提供 Ledger.Tests.testForm() —— 只跑表单校验测试）
 *
 * 使用方式：
 *   1. 浏览器打开同目录 test-runner.html，自动执行 runAll() 并显示结果；
 *   2. 其他模块也可以直接调用 Ledger.Tests.runAll() 复用本测试。
 *
 * 所有测试用例按规范 V1.0 的接口与数据结构设计；
 * 模块未加载时对应用例会明确报“未定义”，不会静默跳过。
 * ========================================================================= */

/* -------------------- 接口对接区（对应规范 V1.0 第 3 节） -------------------- */
const _G = (typeof window !== 'undefined') ? window : globalThis;
const _Ledger = _G.Ledger || null;

function _bindAll(ns, names) {
  const out = {};
  if (ns) names.forEach(n => { if (typeof ns[n] === 'function') out[n] = ns[n].bind(ns); });
  return out;
}

// S7 storage.js —— 规范 4：唯一数据存储入口
const _STORAGE = _bindAll(_G.LedgerStorage, ['getRecords', 'addRecord', 'updateRecord', 'deleteRecord', 'saveRecords', 'seedIfEmpty', 'clearAll']);
// S2 form.js —— 规范 5
const _FORM = _bindAll(_Ledger && _Ledger.Form, ['render', 'init', 'validate', 'validateAmount', 'buildRecord']);
// S4 finance.js —— 规范 7
const _FINANCE = _bindAll(_G.Finance, ['currentMonth', 'calculateTotalIncome', 'calculateTotalExpense', 'calculateBalance', 'calculateMonthlyIncome', 'calculateMonthlyExpense', 'calculateMonthlyBalance', 'calculateSummary', 'calculateCategoryStats', 'calculateDailyTrend']);
// S5 filter.js —— 规范 8
const _FILTER = _bindAll(_Ledger && _Ledger.Filter, ['apply', 'reset', 'getConditions']);
// S8 export.js —— 规范 10
const _EXPORT = {
  exportToJSON:   (typeof _G.exportToJSON   === 'function') ? _G.exportToJSON   : null,
  importFromJSON: (typeof _G.importFromJSON === 'function') ? _G.importFromJSON : null,
};

// 兼容两种校验返回格式：boolean 或 {valid:boolean}
function _isInvalid(res) { return res === false || (res && typeof res === 'object' && res.valid === false); }
function _isValid(res)   { return res === true || (res && typeof res === 'object' && res.valid === true); }
/* --------------------------------------------------------------------------- */


/* -------------------- 极简测试框架 -------------------- */
const SUITES = { storage: [], finance: [], form: [], filter: [], importexport: [] };
const RESULTS = [];

function defTest(suite, name, fn) { SUITES[suite].push({ name, fn }); }

// 运行前备份真实数据、运行后恢复（含中途报错，finally 保证恢复）。
// 测试面板绝不允许污染用户的真实账单（组长 PR 审核意见 #1）。
const _STORE_KEY = (_STORAGE.KEY) || 'ledger_records';

function _snapshotData() {
  if (typeof localStorage !== 'undefined') {
    try { return { raw: localStorage.getItem(_STORE_KEY) }; } catch (e) { /* 降级走 API 快照 */ }
  }
  if (_STORAGE.getRecords) {
    try { return { api: _STORAGE.getRecords() }; } catch (e) { /* 忽略 */ }
  }
  return null;
}

function _restoreData(snap) {
  if (!snap) return;
  let restoreError = null;
  // 1) 执行恢复
  try {
    if (Object.prototype.hasOwnProperty.call(snap, 'raw')) {
      if (typeof localStorage === 'undefined') throw new Error('localStorage 不可用，无法恢复');
      if (snap.raw === null) localStorage.removeItem(_STORE_KEY);
      else localStorage.setItem(_STORE_KEY, snap.raw);
    } else if (snap.api && _STORAGE.saveRecords) {
      _STORAGE.saveRecords(snap.api);
    }
  } catch (e) {
    restoreError = e;
  }
  // 2) 恢复后一致性验证（组长复审意见：不能静默忽略恢复失败）
  let verifyError = null, consistent = false;
  try {
    const after = _snapshotData();
    consistent = _snapEqual(snap, after);
  } catch (e) {
    verifyError = e;
  }
  if (restoreError || verifyError || !consistent) {
    const detail = restoreError ? ('恢复异常：' + restoreError.message)
      : verifyError ? ('校验异常：' + verifyError.message)
      : '恢复后数据与备份不一致';
    // 明确报告：写入测试面板结果 + 控制台错误，绝不静默
    const report = '【数据安全】测试数据恢复失败 —— ' + detail + '（原始数据可能已被测试修改，请检查 localStorage 键 ' + _STORE_KEY + '）';
    RESULTS.push({ name: '【数据安全】恢复校验', ok: false, msg: report });
    if (typeof console !== 'undefined') console.error('[Ledger.Tests] ' + report);
  }
}

function _snapEqual(a, b) {
  if (!a || !b) return false;
  const aRaw = Object.prototype.hasOwnProperty.call(a, 'raw');
  const bRaw = Object.prototype.hasOwnProperty.call(b, 'raw');
  if (aRaw && bRaw) return a.raw === b.raw;
  if (!aRaw && !bRaw) return JSON.stringify(a.api || null) === JSON.stringify(b.api || null);
  return false;
}

function _runOne(t) {
  try { t.fn(); RESULTS.push({ name: t.name, ok: true, msg: '通过' }); }
  catch (e) { RESULTS.push({ name: t.name, ok: false, msg: e.message }); }
}

function runSuite(suite) {
  RESULTS.length = 0;
  const snap = _snapshotData();
  try { SUITES[suite].forEach(_runOne); }
  finally { _restoreData(snap); }
  return renderResults();
}

function runAllSuites() {
  RESULTS.length = 0;
  const snap = _snapshotData();
  try { Object.keys(SUITES).forEach(s => SUITES[s].forEach(_runOne)); }
  finally { _restoreData(snap); }
  return renderResults();
}

function assert(cond, msg) { if (!cond) throw new Error(msg || '断言失败（实际结果不符合预期）'); }

function makeRecord(over) {
  return Object.assign({
    id: 'test_' + Math.random().toString(36).slice(2, 8),
    type: 'expense',
    amount: 25.00,
    category: '餐饮',
    date: '2026-11-07',
    note: '测试用',
  }, over || {});
}

function renderResults() {
  const pass = RESULTS.filter(r => r.ok).length;
  const fail = RESULTS.length - pass;
  const summary = `共 ${RESULTS.length} 项，通过 ${pass}，失败 ${fail}`;
  if (typeof document !== 'undefined' && document.getElementById('results')) {
    const box = document.getElementById('results');
    let html = `<h2>${summary}</h2>`;
    RESULTS.forEach(r => {
      html += `<div class="row ${r.ok ? 'ok' : 'bad'}">
        <span class="tag">${r.ok ? '✅ 通过' : '❌ 失败'}</span>
        <span class="name">${r.name}</span>
        <span class="msg">${r.msg}</span></div>`;
    });
    box.innerHTML = html;
  } else {
    console.log('\n=== ' + summary + ' ===');
    RESULTS.forEach(r => console.log(`${r.ok ? '✅' : '❌'} ${r.name} —— ${r.msg}`));
  }
  return { pass, fail, total: RESULTS.length, results: RESULTS.slice() };
}


/* ============================ testStorage ============================ */
// 对应规范第 4 节（S7 唯一数据存储入口）
defTest('storage', 'storage：addRecord 后 getRecords 能读到新记录（V1.0 第4节：addRecord 返回新增记录）', () => {
  assert(_STORAGE.addRecord && _STORAGE.getRecords, 'LedgerStorage.addRecord/getRecords 未定义（storage.js 未加载）');
  const r = _STORAGE.addRecord(makeRecord());
  assert(r && r.id, 'addRecord 应返回新增的记录对象（规范第4节明确约定）');
  const all = _STORAGE.getRecords();
  assert(Array.isArray(all), 'getRecords 应返回数组');
  assert(all.some(x => x.id === r.id), '刚添加的记录应该在列表里');
});

defTest('storage', 'storage：deleteRecord 删除后记录消失（V1.0 第4节：返回 true/false）', () => {
  assert(_STORAGE.addRecord && _STORAGE.deleteRecord && _STORAGE.getRecords, 'LedgerStorage 接口未定义');
  const r = _STORAGE.addRecord(makeRecord());
  const ok = _STORAGE.deleteRecord(r.id);
  assert(ok === true, '删除已存在的记录应返回 true（规范第4节明确约定）');
  assert(!_STORAGE.getRecords().some(x => x.id === r.id), '删除后记录不应再出现');
  assert(_STORAGE.deleteRecord('不存在的id') === false, '删除不存在的记录应返回 false（规范第4节明确约定）');
});

defTest('storage', 'storage：updateRecord 能修改已有记录，找不到返回 null（V1.0 第4节）', () => {
  assert(_STORAGE.addRecord && _STORAGE.updateRecord && _STORAGE.getRecords, 'LedgerStorage 接口未定义');
  const r = _STORAGE.addRecord(makeRecord({ amount: 10, note: '改之前' }));
  const updated = _STORAGE.updateRecord(r.id, { amount: 99, note: '改之后' });
  assert(updated, 'updateRecord 应返回更新后的记录');
  assert(Math.abs(updated.amount - 99) < 1e-9 && updated.note === '改之后', '更新后的字段值应生效');
  assert(_STORAGE.updateRecord('不存在的id', { amount: 1 }) === null, '更新不存在的 id 应返回 null（规范第4节明确约定）');
});

defTest('storage', 'storage：seedIfEmpty 仅空库时写入演示数据（规范未约定返回值，只断言数据状态）', () => {
  assert(_STORAGE.saveRecords && _STORAGE.seedIfEmpty && _STORAGE.getRecords, 'LedgerStorage 接口未定义');
  _STORAGE.saveRecords([]);   // 清空；整轮测试结束会自动恢复原始数据（见数据保护）
  _STORAGE.seedIfEmpty([makeRecord({ id: 'seed_1', note: '演示数据' })]);
  assert(_STORAGE.getRecords().some(x => x.id === 'seed_1'), '空库时 seedIfEmpty 写入的演示数据应可读回');
  const count = _STORAGE.getRecords().length;
  _STORAGE.seedIfEmpty([makeRecord({ id: 'seed_2' })]);
  assert(_STORAGE.getRecords().length === count, '非空库时 seedIfEmpty 不应再写入');
});

defTest('storage', 'storage：刷新持久化（重新读取数据仍在）', () => {
  assert(_STORAGE.saveRecords && _STORAGE.getRecords, 'LedgerStorage 接口未定义');
  _STORAGE.saveRecords([makeRecord({ id: 'persist_1', amount: 12.5 })]);
  const reloaded = _STORAGE.getRecords();   // 重新从 LocalStorage 读，模拟刷新
  assert(reloaded.some(x => x.id === 'persist_1'), '重新读取后数据应还在（刷新不丢）');
});

defTest('storage', 'storage：记录符合规范第 2 节的统一数据结构', () => {
  assert(_STORAGE.addRecord && _STORAGE.getRecords, 'LedgerStorage 接口未定义');
  const r = _STORAGE.addRecord(makeRecord({ id: 'struct_1' }));
  assert(typeof r.id === 'string' && r.id, 'id 应为非空字符串');
  assert(r.type === 'income' || r.type === 'expense', 'type 只能是 income 或 expense');
  assert(typeof r.amount === 'number' && r.amount > 0, 'amount 应为大于 0 的数字');
  assert(typeof r.category === 'string', 'category 应为字符串');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(r.date), 'date 应为 YYYY-MM-DD 格式');
  assert(typeof r.note === 'string', 'note 应为字符串');
});


/* ============================ testFinance ============================ */
// 对应规范第 7 节（S4 财务统计，calculateSummary 统一返回结构）
defTest('finance', 'finance：总收入/总支出/余额计算正确', () => {
  const F = _FINANCE;
  assert(F.calculateSummary, 'Finance.calculateSummary 未定义（finance.js 未加载）');
  const records = [
    makeRecord({ type: 'income',  amount: 100 }),
    makeRecord({ type: 'expense', amount: 30 }),
    makeRecord({ type: 'expense', amount: 20 }),
  ];
  const s = F.calculateSummary(records, '2026-11');
  assert(Math.abs(s.totalIncome - 100) < 1e-9, '总收入应为 100，实际 ' + s.totalIncome);
  assert(Math.abs(s.totalExpense - 50) < 1e-9, '总支出应为 50，实际 ' + s.totalExpense);
  assert(Math.abs(s.balance - 50) < 1e-9, '余额应为 50，实际 ' + s.balance);
  // 月度统计（规范：只统计指定月份）
  assert(Math.abs(s.monthlyIncome - 100) < 1e-9, '本月收入应为 100，实际 ' + s.monthlyIncome);
  assert(Math.abs(s.monthlyExpense - 50) < 1e-9, '本月支出应为 50，实际 ' + s.monthlyExpense);
  assert(Math.abs(s.monthlyBalance - 50) < 1e-9, '本月结余应为 50，实际 ' + s.monthlyBalance);
});

defTest('finance', 'finance：月度统计只统计指定月份', () => {
  const F = _FINANCE;
  assert(F.calculateMonthlyIncome && F.calculateMonthlyExpense, 'Finance 月度统计接口未定义');
  const records = [
    makeRecord({ type: 'income', amount: 100, date: '2026-11-07' }),
    makeRecord({ type: 'income', amount: 200, date: '2026-10-15' }),
  ];
  assert(Math.abs(F.calculateMonthlyIncome(records, '2026-10') - 200) < 1e-9, '2026-10 月收入应只算 200');
  assert(Math.abs(F.calculateMonthlyIncome(records, '2026-11') - 100) < 1e-9, '2026-11 月收入应只算 100');
});


/* ============================ testForm ============================ */
// 对应规范第 5 节（S2 表单校验）
defTest('form', 'form：金额为负数应被拒绝', () => {
  assert(_FORM.validateAmount, 'Ledger.Form.validateAmount 未定义（form.js 未加载）');
  assert(_isInvalid(_FORM.validateAmount(-5)), '负数金额应判定为非法');
});

defTest('form', 'form：金额含字母/为空/0 应被拒绝', () => {
  assert(_FORM.validateAmount, 'Ledger.Form.validateAmount 未定义');
  assert(_isInvalid(_FORM.validateAmount('abc')), '字母金额应非法');
  assert(_isInvalid(_FORM.validateAmount('')), '空金额应非法');
  assert(_isInvalid(_FORM.validateAmount(0)), '金额为 0 应非法');
});

defTest('form', 'form：超两位小数/科学计数法应被拒绝（S2 校验规则）', () => {
  assert(_FORM.validateAmount, 'Ledger.Form.validateAmount 未定义');
  assert(_isInvalid(_FORM.validateAmount('1.234')), '三位小数应非法（最多两位）');
  assert(_isInvalid(_FORM.validateAmount('1e5')), '科学计数法应非法');
  const ok = _FORM.validateAmount('25.50');
  assert(_isValid(ok), '两位小数的正常金额应通过');
  if (ok && ok.value !== undefined) {
    assert(Math.abs(ok.value - 25.5) < 1e-9, '通过时应返回数字 value=25.5');
  }
});

defTest('form', 'form：必填项缺失应被拒绝（valid 严格校验；errors 结构按 S2 最终接口文档“有则检查”）', () => {
  assert(_FORM.validate, 'Ledger.Form.validate 未定义');
  const bad = _FORM.validate({ type: 'expense', amount: '', category: '餐饮', date: '', note: '' });
  assert(_isInvalid(bad), '缺少金额和日期应校验不通过');
  if (bad && bad.errors) {
    assert(bad.errors.amount || bad.errors.date, '若返回 errors，应指出具体哪个字段有问题');
  }
});

defTest('form', 'form：合法输入应通过（record 结构按 S2 最终接口文档“有则检查”）', () => {
  assert(_FORM.validate, 'Ledger.Form.validate 未定义');
  const good = _FORM.validate({ type: 'expense', amount: '25.5', category: '餐饮', date: '2026-11-07', note: '午餐' });
  assert(_isValid(good), '合法输入应校验通过');
  if (good && good.record) {
    assert(typeof good.record.amount === 'number', '若返回 record，其 amount 应为数字（S2 文档约定）');
  }
});


/* ============================ testFilter ============================ */
// 对应规范第 8 节（S5 筛选，条件格式统一）
function _conds(over) {
  return Object.assign({ type: 'all', category: 'all', startDate: '', endDate: '', keyword: '' }, over || {});
}

defTest('filter', 'filter：按类型筛选（只看支出）', () => {
  assert(_FILTER.apply, 'Ledger.Filter.apply 未定义（filter.js 未加载）');
  const records = [
    makeRecord({ id: 'a', type: 'income',  amount: 100 }),
    makeRecord({ id: 'b', type: 'expense', amount: 30 }),
  ];
  const out = _FILTER.apply(records, _conds({ type: 'expense' }));
  assert(Array.isArray(out), 'apply 应返回数组');
  assert(out.length === 1 && out[0].id === 'b', '筛选支出后只应剩 1 条且是 b');
});

defTest('filter', 'filter：按日期范围筛选', () => {
  assert(_FILTER.apply, 'Ledger.Filter.apply 未定义');
  const records = [
    makeRecord({ id: 'x', date: '2026-11-01' }),
    makeRecord({ id: 'y', date: '2026-11-10' }),
  ];
  const out = _FILTER.apply(records, _conds({ startDate: '2026-11-05', endDate: '2026-11-30' }));
  assert(out.length === 1 && out[0].id === 'y', '日期范围筛选结果不正确');
});

defTest('filter', 'filter：按备注关键词筛选', () => {
  assert(_FILTER.apply, 'Ledger.Filter.apply 未定义');
  const records = [
    makeRecord({ id: 'm', note: '午餐' }),
    makeRecord({ id: 'n', note: '打车' }),
  ];
  const out = _FILTER.apply(records, _conds({ keyword: '午餐' }));
  assert(out.length === 1 && out[0].id === 'm', '关键词筛选应只命中含“午餐”的记录');
});

defTest('filter', 'filter：apply 不修改原始数组（规范强制）', () => {
  assert(_FILTER.apply, 'Ledger.Filter.apply 未定义');
  const records = [
    makeRecord({ id: 'p1', type: 'income',  amount: 100 }),
    makeRecord({ id: 'p2', type: 'expense', amount: 30 }),
  ];
  const before = records.length;
  _FILTER.apply(records, _conds({ type: 'expense' }));
  assert(records.length === before, 'apply 不允许修改原始记录数组');
});

defTest('filter', 'filter：按类别筛选', () => {
  assert(_FILTER.apply, 'Ledger.Filter.apply 未定义');
  const records = [
    makeRecord({ id: 'c1', category: '餐饮' }),
    makeRecord({ id: 'c2', category: '交通' }),
  ];
  const out = _FILTER.apply(records, _conds({ category: '交通' }));
  assert(out.length === 1 && out[0].id === 'c2', '类别筛选应只命中该类别记录');
});

defTest('filter', 'filter：reset() / getConditions() 可用（V1.0 第8节）', () => {
  assert(_FILTER.reset && _FILTER.getConditions, 'Ledger.Filter.reset/getConditions 未定义');
  _FILTER.reset();
  const c = _FILTER.getConditions();
  assert(c && typeof c === 'object', 'getConditions 应返回条件对象');
});


/* ========================= testImportExport（S8） ========================= */
// 对应规范第 10 节。
// ⚠️ 范围说明（组长复审意见 #4）：本套件目前只做"接口存在性"检查。
// 以下功能必须等模块合并进 develop、且有 S1 页面元素后做端到端（手动）测试，
// 已列入《测试清单与Bug记录》F9–F11：
//   F9  导出 JSON 含统一外壳 { app, version, exportedAt, records }
//   F10 导入非法文件时提示失败且绝不覆盖原数据（规范硬性要求）
//   F11 导入合法文件后通过 ledger:updated 自动刷新各模块，无需手动刷新页面
defTest('importexport', 'export：exportToJSON / importFromJSON 接口已暴露', () => {
  assert(_EXPORT.exportToJSON, 'exportToJSON 未定义（export.js 未加载）');
  assert(_EXPORT.importFromJSON, 'importFromJSON 未定义（export.js 未加载）');
});


/* ============================ 对外接口（规范第 3 节） ============================ */
const LedgerTests = {
  runAll: runAllSuites,
  testStorage: () => runSuite('storage'),
  testFinance: () => runSuite('finance'),
  testFilter: () => runSuite('filter'),
  testImportExport: () => runSuite('importexport'),
  testForm: () => runSuite('form'),   // 规范未强制要求，额外提供
};

_G.Ledger = _Ledger || {};
_G.Ledger.Tests = LedgerTests;

// 兼容 Node 环境（供命令行/持续集成复用）
if (typeof module !== 'undefined' && module.exports) { module.exports = LedgerTests; }

// 自动执行：浏览器打开 test-runner.html 时跑全量测试
if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => LedgerTests.runAll());
} else if (typeof require !== 'undefined' && require.main === module) {
  LedgerTests.runAll();
}
