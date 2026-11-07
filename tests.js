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

/* -------------------- 项目函数名配置（只改这里！） -------------------- */
const API = {
  // storage.js 提供的函数（来自方案文档）
  getRecords:   typeof getRecords   !== 'undefined' ? getRecords   : null,
  saveRecords:  typeof saveRecords  !== 'undefined' ? saveRecords  : null,
  addRecord:    typeof addRecord    !== 'undefined' ? addRecord    : null,
  deleteRecord: typeof deleteRecord !== 'undefined' ? deleteRecord : null,

  // finance.js：计算总收入/总支出/余额（函数名请按你们实际代码改）
  calculateTotals: typeof calculateTotals !== 'undefined' ? calculateTotals : null,

  // filter.js：按条件筛选记录（函数名请按你们实际代码改）
  filterRecords: typeof filterRecords !== 'undefined' ? filterRecords : null,

  // form.js：金额/必填校验（返回 true=合法，false=非法；函数名请按实际改）
  validateAmount: typeof validateAmount !== 'undefined' ? validateAmount : null,
  validateForm:   typeof validateForm   !== 'undefined' ? validateForm   : null,
};
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

test('storage：刷新持久化（LocalStorage 真正存住了）', () => {
  assert(API.saveRecords && API.getRecords, 'storage 函数未定义');
  const sample = [makeRecord({ id: 'persist_1', amount: 12.5 })];
  API.saveRecords(sample);
  // 模拟“刷新”：重新从 LocalStorage 读
  const reloaded = API.getRecords();
  assert(reloaded.some(x => x.id === 'persist_1'), '重新读取后数据应还在（刷新不丢）');
});

test('finance：calculateTotals 计算收入/支出/余额正确', () => {
  assert(API.calculateTotals, 'finance.js 未定义 calculateTotals，请改 API 配置');
  const records = [
    makeRecord({ type: 'income',  amount: 100 }),
    makeRecord({ type: 'expense', amount: 30 }),
    makeRecord({ type: 'expense', amount: 20 }),
  ];
  const t = API.calculateTotals(records);
  assert(Math.abs(t.income - 100) < 1e-9, '总收入应为 100，实际 ' + t.income);
  assert(Math.abs(t.expense - 50) < 1e-9, '总支出应为 50，实际 ' + t.expense);
  assert(Math.abs(t.balance - 50) < 1e-9, '余额应为 50，实际 ' + t.balance);
});


/* ======================== 二、异常输入测试 ======================== */
test('form：金额为负数应被拒绝', () => {
  if (API.validateAmount) {
    assert(API.validateAmount(-5) === false, '负数金额应判定为非法');
  } else if (API.validateForm) {
    const res = API.validateForm(makeRecord({ amount: -5 }));
    assert(res === false, '负数金额表单应校验不通过');
  } else {
    throw new Error('form.js 未定义 validateAmount/validateForm，无法测金额校验');
  }
});

test('form：金额含字母/为空应被拒绝', () => {
  if (API.validateAmount) {
    assert(API.validateAmount('abc') === false, '字母金额应非法');
    assert(API.validateAmount('') === false || API.validateAmount(null) === false, '空金额应非法');
  } else if (API.validateForm) {
    assert(API.validateForm(makeRecord({ amount: 'abc' })) === false, '字母金额应不通过');
  } else {
    throw new Error('form.js 未定义校验函数，无法测异常输入');
  }
});

test('form：必填项（类型/金额/日期）缺失应被拒绝', () => {
  assert(API.validateForm, 'form.js 未定义 validateForm');
  const bad = makeRecord({});
  delete bad.amount;       // 缺金额
  delete bad.date;         // 缺日期
  assert(API.validateForm(bad) === false, '缺少必填项应校验不通过');
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
