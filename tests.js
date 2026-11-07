/* =========================================================================
 * S9 测试负责人 - 测试脚本 tests.js
 * 项目：个人记账本系统（HTML + CSS + 原生 JS + LocalStorage）
 *
 * 这是给“测试负责人(S9)”用的测试代码。
 * 作用是：自动检查其他同学写的模块（storage / finance / form / filter 等）
 * 有没有按预期工作，而不是靠你手动一个个点。
 *
 * 怎么用？看同目录下的 test-runner.html，用浏览器打开它就能跑测试，
 * 页面会直接显示每个测试“通过 / 失败”，非常直观。
 *
 * ⚠️ 重要：下面“项目函数名配置”里的函数名，是按方案文档推测的。
 *    如果你们团队实际写的函数名不一样，只改这一块就行，
 *    不用动下面的测试逻辑。
 * ========================================================================= */

/* -------------------- 项目接口配置（只改这里！） -------------------- */
// ✅ S7 storage 已确认并经 S9 实测：全局 LedgerStorage（组长问题1也倾向此命名）
// ✅ S4 finance 候选版：全局 Finance.*（待组长《开发规范.md》终审）
// ✅ S2 form 候选版：Ledger.Form.*（待终审；问题1/2待解决，命名可能调整）
// ✅ S8 export 候选版：全局 exportToJSON() / importFromJSON(file)
// ⏳ S5 filter 接口未提供，暂用 filterRecords(records, criteria) 占位
// 命名空间探测做了兼容：终审后即使挂到 Ledger.* 下也能自动找到。
function _bindAll(ns, names) {
  const out = {};
  if (ns) names.forEach(n => { if (typeof ns[n] === 'function') out[n] = ns[n].bind(ns); });
  return out;
}
const _G = (typeof window !== 'undefined') ? window : globalThis;
const _Ledger = _G.Ledger || null;

const _storageNS  = _G.LedgerStorage || (_Ledger && _Ledger.Storage) || null;
const _financeNS  = _G.Finance || (_Ledger && _Ledger.Finance) || null;
const _formNS     = (_Ledger && _Ledger.Form) || _G.LedgerForm || null;

const _STORAGE_API = _bindAll(_storageNS, ['getRecords', 'addRecord', 'updateRecord', 'deleteRecord', 'saveRecords', 'seedIfEmpty', 'clearAll']);
const _FINANCE_API = _bindAll(_financeNS, ['calculateTotalIncome', 'calculateTotalExpense', 'calculateBalance', 'calculateSummary', 'calculateMonthlyIncome', 'calculateMonthlyExpense', 'calculateMonthlyBalance', 'calculateCategoryStats', 'calculateDailyTrend', 'currentMonth']);
const _FORM_API    = _bindAll(_formNS, ['validate', 'validateAmount', 'buildRecord', 'render', 'init']);

const API = {
  storage: _STORAGE_API,
  finance: _FINANCE_API,
  form:    _FORM_API,

  // 便捷别名（测试里少打点字）
  getRecords:   _STORAGE_API.getRecords   || null,
  saveRecords:  _STORAGE_API.saveRecords  || null,
  addRecord:    _STORAGE_API.addRecord    || null,
  updateRecord: _STORAGE_API.updateRecord || null,
  deleteRecord: _STORAGE_API.deleteRecord || null,
  seedIfEmpty:  _STORAGE_API.seedIfEmpty  || null,

  // filter.js（S5）：接口未提供，占位待补
  filterRecords: (typeof _G.filterRecords === 'function') ? _G.filterRecords : ((_Ledger && typeof _Ledger.Filter === 'object' && typeof _Ledger.Filter.filter === 'function') ? _Ledger.Filter.filter.bind(_Ledger.Filter) : null),

  // export.js（S8）：依赖页面按钮与下载行为，本面板只做“接口存在性”检查
  exportToJSON:   (typeof _G.exportToJSON   === 'function') ? _G.exportToJSON   : null,
  importFromJSON: (typeof _G.importFromJSON === 'function') ? _G.importFromJSON : null,
};

// 兼容两种校验返回格式：boolean 或 {valid:boolean}
function _isInvalid(res) {
  return res === false || (res && typeof res === 'object' && res.valid === false);
}
function _isValid(res) {
  return res === true || (res && typeof res === 'object' && res.valid === true);
}
/* ---------------------------------------------------------------------- */


/* -------------------- 极简测试框架（不用理解，直接用） -------------------- */
const RESULTS = [];

function test(name, fn) {
  try {
    fn();
    RESULTS.push({ name, ok: true, msg: '通过' });
  } catch (e) {
    RESULTS.push({ name, ok: false, msg: e.message });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败（实际结果不符合预期）');
}

// 造一条测试用的记录
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

// 在浏览器里把结果画到页面上；在 Node 里打印到控制台
function renderResults() {
  const pass = RESULTS.filter(r => r.ok).length;
  const fail = RESULTS.length - pass;
  const summary = `共 ${RESULTS.length} 项，通过 ${pass}，失败 ${fail}`;
  if (typeof document !== 'undefined') {
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
  return { pass, fail, total: RESULTS.length };
}


/* ============================ 一、功能测试 ============================ */
// 注意：这些测试依赖其他同学先把模块写出来。如果模块还没好，
// 运行时会提示“函数未定义”，这很正常——等他们提交后再跑一遍即可。

test('storage：addRecord 后 getRecords 能读到新记录', () => {
  assert(API.addRecord && API.getRecords, 'storage.js 函数未定义，请确认 addRecord/getRecords 已实现');
  const r = makeRecord();
  API.addRecord(r);
  const all = API.getRecords();
  assert(Array.isArray(all), 'getRecords 应返回数组');
  assert(all.some(x => x.id === r.id), '刚添加的记录应该在列表里');
});

test('storage：deleteRecord 能删除指定记录', () => {
  assert(API.addRecord && API.deleteRecord && API.getRecords, 'storage 函数未定义');
  const r = makeRecord();
  API.addRecord(r);
  API.deleteRecord(r.id);
  assert(!API.getRecords().some(x => x.id === r.id), '删除后记录不应再出现');
});

test('storage：updateRecord 能修改已有记录', () => {
  assert(API.addRecord && API.updateRecord && API.getRecords, 'storage 函数未定义');
  const r = makeRecord({ amount: 10, note: '改之前' });
  API.addRecord(r);
  API.updateRecord(r.id, { amount: 99, note: '改之后' });
  const found = API.getRecords().find(x => x.id === r.id);
  assert(found, '更新后记录应仍存在');
  assert(Math.abs(found.amount - 99) < 1e-9 && found.note === '改之后', '更新后的字段值应生效');
});

test('storage：seedIfEmpty 空数据时能填充演示数据', () => {
  assert(API.saveRecords && API.seedIfEmpty && API.getRecords, 'storage 函数未定义');
  API.saveRecords([]);                        // 先清空
  const seeded = API.seedIfEmpty([            // S7 实现：需传入演示数据数组
    makeRecord({ id: 'seed_1', category: '演示', note: '演示数据' }),
  ]);
  assert(seeded > 0, '空库时 seedIfEmpty 应写入数据');
  assert(API.getRecords().some(x => x.id === 'seed_1'), 'seedIfEmpty 写入的演示数据应可读回');
  // 再次调用不应重复写入（只在空库时生效）
  const again = API.seedIfEmpty([makeRecord({ id: 'seed_2' })]);
  assert(again === 0, '非空库时 seedIfEmpty 不应再写入');
});

test('storage：刷新持久化（LocalStorage 真正存住了）', () => {
  assert(API.saveRecords && API.getRecords, 'storage 函数未定义');
  const sample = [makeRecord({ id: 'persist_1', amount: 12.5 })];
  API.saveRecords(sample);
  // 模拟“刷新”：重新从 LocalStorage 读
  const reloaded = API.getRecords();
  assert(reloaded.some(x => x.id === 'persist_1'), '重新读取后数据应还在（刷新不丢）');
});

test('finance（S4）：总收入/总支出/余额计算正确', () => {
  const F = API.finance;
  assert(F && (F.calculateSummary || (F.calculateTotalIncome && F.calculateTotalExpense && F.calculateBalance)),
    'Finance 未定义（S4 模块未加载或未按接口暴露）');
  const records = [
    makeRecord({ type: 'income',  amount: 100 }),
    makeRecord({ type: 'expense', amount: 30 }),
    makeRecord({ type: 'expense', amount: 20 }),
  ];
  if (F.calculateSummary) {
    const s = F.calculateSummary(records);
    assert(Math.abs(s.totalIncome - 100) < 1e-9, '总收入应为 100，实际 ' + s.totalIncome);
    assert(Math.abs(s.totalExpense - 50) < 1e-9, '总支出应为 50，实际 ' + s.totalExpense);
    assert(Math.abs(s.totalBalance - 50) < 1e-9, '总余额应为 50，实际 ' + s.totalBalance);
  } else {
    assert(Math.abs(F.calculateTotalIncome(records) - 100) < 1e-9, '总收入应为 100');
    assert(Math.abs(F.calculateTotalExpense(records) - 50) < 1e-9, '总支出应为 50');
    assert(Math.abs(F.calculateBalance(records) - 50) < 1e-9, '余额应为 50');
  }
});


/* ======================== 二、异常输入测试 ======================== */
// S2 的接口（候选版）：Ledger.Form.validateAmount(value) → {valid, value|msg}
//                     Ledger.Form.validate(fields)      → {valid, errors, record}
test('form（S2）：金额为负数应被拒绝', () => {
  const FM = API.form;
  assert(FM && FM.validateAmount, 'Ledger.Form.validateAmount 未定义（S2 模块未加载）');
  assert(_isInvalid(FM.validateAmount(-5)), '负数金额应判定为非法');
});

test('form（S2）：金额含字母/为空应被拒绝', () => {
  const FM = API.form;
  assert(FM && FM.validateAmount, 'Ledger.Form.validateAmount 未定义');
  assert(_isInvalid(FM.validateAmount('abc')), '字母金额应非法');
  assert(_isInvalid(FM.validateAmount('')), '空金额应非法');
});

test('form（S2）：必填项缺失应被拒绝并给出错误提示', () => {
  const FM = API.form;
  assert(FM && FM.validate, 'Ledger.Form.validate 未定义');
  const bad = FM.validate({ type: 'expense', amount: '', category: '餐饮', date: '', note: '' });
  assert(_isInvalid(bad), '缺少金额和日期应校验不通过');
  assert(bad.errors && (bad.errors.amount || bad.errors.date), '应通过 errors 指出具体哪个字段有问题');
});


/* ============================ 三、筛选测试 ============================ */
test('filter：按类型筛选（只看支出）', () => {
  assert(API.filterRecords, 'filter.js 未定义 filterRecords，请改 API 配置');
  const records = [
    makeRecord({ id: 'a', type: 'income',  amount: 100 }),
    makeRecord({ id: 'b', type: 'expense', amount: 30 }),
  ];
  const out = API.filterRecords(records, { type: 'expense' });
  assert(out.length === 1 && out[0].id === 'b', '筛选支出后只应剩 1 条且是 b');
});

test('filter：按日期范围筛选', () => {
  assert(API.filterRecords, 'filter.js 未定义 filterRecords');
  const records = [
    makeRecord({ id: 'x', date: '2026-11-01' }),
    makeRecord({ id: 'y', date: '2026-11-10' }),
  ];
  const out = API.filterRecords(records, { dateFrom: '2026-11-05', dateTo: '2026-11-30' });
  assert(out.length === 1 && out[0].id === 'y', '日期范围筛选结果不正确');
});


/* ======================== 三-2、导出导入测试（S8） ======================== */
test('export（S8）：exportToJSON / importFromJSON 接口已暴露', () => {
  assert(API.exportToJSON, 'export.js 未定义 exportToJSON（S8 接口）');
  assert(API.importFromJSON, 'export.js 未定义 importFromJSON（S8 接口）');
});


/* ======================== 四、回归测试（集成后跑） ======================== */
// “回归测试”就是：别人改完代码、合并到主分支后，
// 把上面的功能测试再整体跑一遍，确认老功能没被改坏。
// 这里直接复用上面的测试即可——你每次集成后打开 test-runner.html 跑一次，
// 对比上一次的通过数量，如果变少了，就说明有人改坏了，去查 Bug 记录。

// 自动运行（浏览器打开页面时执行）
if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', renderResults);
} else if (typeof module !== 'undefined' && require.main === module) {
  renderResults();
}
