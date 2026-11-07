/**
 * app.js —— 应用入口（S1）
 *
 * 职责：
 *   1. 页面启动时按顺序挂载各模块（表单 / 筛选 / 列表 / 图表 / 统计）；
 *   2. 维护「当前统计月份」状态，驱动顶部概览与图表；
 *   3. 统一订阅 ledger:updated 事件后刷新界面，避免各模块重复刷新；
 *   4. 提供全局轻提示 Ledger.App.toast() 与确认弹窗 Ledger.App.confirm()，
 *      供 S3 删除、S8 导入等模块复用（替代 alert / confirm）。
 *
 * 依赖（按 index.html 的加载顺序）：constants → storage → form → records →
 *   finance → chart.js → filter → charts → export → demo-data → app。
 */
(function (global) {
  'use strict';

  var Ledger = global.Ledger = global.Ledger || {};

  var state = {
    month: null,          // 当前统计月份 'YYYY-MM'
    filtered: null,       // 当前筛选结果（null 表示未筛选）
    initialized: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function currentMonth() {
    return todayStr().slice(0, 7);
  }

  function monthLabel(key) {
    var parts = String(key || '').split('-');
    if (parts.length !== 2) return key;
    return parts[0] + '年' + Number(parts[1]) + '月';
  }

  function shiftMonth(key, delta) {
    var parts = String(key).split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1 + delta, 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }

  function money(value) {
    var n = Number(value || 0);
    var parts = Math.abs(n).toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-¥' : '¥') + parts[0] + '.' + parts[1];
  }

  function allRecords() {
    if (!global.LedgerStorage || typeof global.LedgerStorage.getRecords !== 'function') return [];
    var records = global.LedgerStorage.getRecords();
    return Array.isArray(records) ? records : [];
  }

  function monthRecords(records, month) {
    return records.filter(function (record) {
      return String(record.date || '').slice(0, 7) === month;
    });
  }

  /* ============================== 轻提示 Toast ============================== */

  var ICONS = { success: '✓', error: '!', info: 'i' };

  function toast(message, type) {
    var stack = $('toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toast-stack';
      stack.className = 'toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }

    while (stack.children.length >= 3) {
      stack.removeChild(stack.firstChild);
    }

    var kind = ICONS[type] ? type : 'info';
    var el = document.createElement('div');
    el.className = 'toast toast--' + kind;
    el.innerHTML = '<span class="toast-icon" aria-hidden="true">' + ICONS[kind] + '</span>' +
      '<span class="toast-msg">' + String(message == null ? '' : message) + '</span>';
    stack.appendChild(el);

    var timer = global.setTimeout(function () {
      el.classList.add('is-leaving');
      global.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 180);
    }, 2800);

    el.addEventListener('click', function () {
      global.clearTimeout(timer);
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  }

  /* ============================== 确认弹窗 ============================== */

  function confirmDialog(options) {
    options = options || {};

    return new Promise(function (resolve) {
      var backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML =
        '<div class="modal modal--sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">' +
          '<div class="modal-head">' +
            '<h3 class="modal-title" id="confirm-title"></h3>' +
            '<button type="button" class="modal-close" data-confirm-cancel aria-label="关闭">×</button>' +
          '</div>' +
          '<div class="modal-body"><p class="modal-text"></p></div>' +
          '<div class="modal-foot">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-confirm-cancel>取消</button>' +
            '<button type="button" class="btn btn-sm" data-confirm-ok></button>' +
          '</div>' +
        '</div>';

      backdrop.querySelector('.modal-title').textContent = options.title || '请确认';
      backdrop.querySelector('.modal-text').textContent = options.message || '';

      var okBtn = backdrop.querySelector('[data-confirm-ok]');
      okBtn.textContent = options.confirmText || '确定';
      okBtn.className = 'btn btn-sm ' + (options.danger ? 'btn-danger' : 'btn-primary');

      document.body.appendChild(backdrop);

      var cancelBtn = backdrop.querySelector('[data-confirm-cancel]');
      if (cancelBtn) cancelBtn.focus();

      function close(result) {
        document.removeEventListener('keydown', onKeydown);
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        resolve(result);
      }

      function onKeydown(event) {
        if (event.key === 'Escape') close(false);
        if (event.key === 'Enter') close(true);
      }

      document.addEventListener('keydown', onKeydown);

      backdrop.addEventListener('click', function (event) {
        if (event.target === backdrop || event.target.closest('[data-confirm-cancel]')) close(false);
        if (event.target.closest('[data-confirm-ok]')) close(true);
      });
    });
  }

  /* ============================== 概览统计 ============================== */

  function deltaText(current, previous) {
    if (!previous) {
      return current > 0 ? { text: '上月无记录', tone: '' } : { text: '较上月持平', tone: '' };
    }
    var rate = (current - previous) / previous * 100;
    if (Math.abs(rate) < 0.05) return { text: '较上月持平', tone: '' };
    var arrow = rate > 0 ? '↑' : '↓';
    return {
      text: '较上月 ' + arrow + ' ' + Math.abs(rate).toFixed(1) + '%',
      tone: rate > 0 ? 'up' : 'down',
      rate: rate
    };
  }

  function cardHTML(options) {
    return '<article class="summary-card ' + (options.modifier || '') + '">' +
      '<div class="summary-label">' + options.label + '</div>' +
      '<div class="summary-value">' + money(options.value) + '</div>' +
      '<div class="summary-meta">' + (options.meta || '') + '</div>' +
    '</article>';
  }

  function renderSummary() {
    var container = $('summary-container');
    if (!container) return;

    var Finance = global.Finance;
    if (!Finance || typeof Finance.calculateSummary !== 'function') {
      container.innerHTML = '<p class="section-sub">Finance 模块未加载，无法统计</p>';
      return;
    }

    var records = allRecords();
    var month = state.month;
    var summary = Finance.calculateSummary(records, month);
    var prevSummary = Finance.calculateSummary(records, shiftMonth(month, -1));

    var inMonth = monthRecords(records, month);
    var incomeCount = inMonth.filter(function (r) { return r.type === 'income'; }).length;
    var expenseCount = inMonth.length - incomeCount;

    var noun = month === currentMonth() ? '本月' : (Number(month.slice(5)) + '月');

    var incomeDelta = deltaText(summary.monthlyIncome, prevSummary.monthlyIncome);
    var expenseDelta = deltaText(summary.monthlyExpense, prevSummary.monthlyExpense);

    function toneClass(delta, goodWhenUp) {
      if (!delta.tone) return '';
      var good = (delta.tone === 'up') === goodWhenUp;
      return good ? 'delta-good' : 'delta-bad';
    }

    container.innerHTML = '<div class="summary-grid">' +
      cardHTML({
        modifier: 'summary-card--income',
        label: noun + '收入',
        value: summary.monthlyIncome,
        meta: '<span class="' + toneClass(incomeDelta, true) + '">' + incomeDelta.text + '</span>'
      }) +
      cardHTML({
        modifier: 'summary-card--expense',
        label: noun + '支出',
        value: summary.monthlyExpense,
        meta: '<span class="' + toneClass(expenseDelta, false) + '">' + expenseDelta.text + '</span>'
      }) +
      cardHTML({
        modifier: 'summary-card--balance',
        label: noun + '结余',
        value: summary.monthlyBalance,
        meta: '收入 ' + money(summary.monthlyIncome) + ' − 支出 ' + money(summary.monthlyExpense)
      }) +
      cardHTML({
        modifier: 'summary-card--total',
        label: '累计结余',
        value: summary.balance,
        meta: '全部账单 ' + records.length + ' 笔'
      }) +
    '</div>';

    var sub = $('summary-sub');
    if (sub) {
      sub.textContent = monthLabel(month) + ' · 共 ' + inMonth.length + ' 笔记录' +
        (inMonth.length ? '（收入 ' + incomeCount + ' 笔 / 支出 ' + expenseCount + ' 笔）' : '');
    }

    var labelBtn = $('month-label');
    if (labelBtn) {
      labelBtn.textContent = monthLabel(month);
      labelBtn.title = month === currentMonth() ? '当前月份' : '点击回到本月';
      labelBtn.classList.toggle('is-current', month === currentMonth());
    }
  }

  /* ============================== 图表 ============================== */

  function renderCharts() {
    if (!Ledger.Charts || typeof Ledger.Charts.update !== 'function') return;

    var records = monthRecords(allRecords(), state.month);
    Ledger.Charts.update(records);

    var sub = $('charts-sub');
    if (sub) {
      sub.textContent = monthLabel(state.month) + ' · 共 ' + records.length + ' 笔记录';
    }
  }

  /* ============================== 刷新编排 ============================== */

  /** 切换统计月份：顶部概览、图表、账单日历三处一起改 */
  function setMonth(month) {
    if (!month || month === state.month) return;
    state.month = month;
    renderSummary();
    renderCharts();
    if (Ledger.Records && typeof Ledger.Records.setMonth === 'function') {
      Ledger.Records.setMonth(month);
    }
  }

  function applyFilter(records, conditions) {
    state.filtered = Array.isArray(records) ? records : [];
    state.conditions = conditions || null;
    if (Ledger.Records && typeof Ledger.Records.refresh === 'function') {
      Ledger.Records.refresh();
    }
  }

  function refreshAll() {
    if (Ledger.Filter && typeof Ledger.Filter.refresh === 'function') {
      Ledger.Filter.refresh();   // 触发 onChange → applyFilter → 列表刷新
    } else {
      state.filtered = null;
      if (Ledger.Records) Ledger.Records.refresh();
    }
    renderSummary();
    renderCharts();
  }

  /* ============================== 交互绑定 ============================== */

  function bindMonthSwitch() {
    var prev = $('btn-prev-month');
    var next = $('btn-next-month');
    var label = $('month-label');

    if (prev) prev.addEventListener('click', function () {
      setMonth(shiftMonth(state.month, -1));
    });

    if (next) next.addEventListener('click', function () {
      setMonth(shiftMonth(state.month, 1));
    });

    if (label) label.addEventListener('click', function () {
      if (state.month === currentMonth()) {
        toast('已经是本月了', 'info');
        return;
      }
      setMonth(currentMonth());
    });
  }

  function bindFooter() {
    var clearBtn = $('btn-clear-all');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (!allRecords().length) {
          toast('当前没有账单可以清空', 'info');
          return;
        }
        confirmDialog({
          title: '清空全部账单？',
          message: '所有账单将被删除且无法恢复，建议先导出备份。',
          confirmText: '清空',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          // suppressDemo：清空后刷新页面不再自动灌示例数据
          global.LedgerStorage.clearAll({ suppressDemo: true });
          toast('已清空全部账单', 'success');
        });
      });
    }

    var restoreBtn = $('btn-restore-demo');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', function () {
        confirmDialog({
          title: '恢复示例数据？',
          message: '会用示例账单替换当前全部数据，确定继续吗？',
          confirmText: '恢复',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          try {
            var count = Ledger.DemoData.restore();
            toast('已恢复 ' + count + ' 条示例数据', 'success');
          } catch (err) {
            toast('恢复失败：' + (err && err.message ? err.message : err), 'error');
          }
        });
      });
    }
  }

  /* ============================== 启动 ============================== */

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    state.month = currentMonth();

    // 1. 示例数据（仅空库时写入，只做一次）
    if (Ledger.DemoData && typeof Ledger.DemoData.load === 'function') {
      try {
        Ledger.DemoData.load();
      } catch (err) {
        console.warn('[app] 示例数据初始化失败：', err);
      }
    }

    // 本地存储不可用时给出明确提示，避免用户以为数据保存成功
    if (global.LedgerStorage && typeof global.LedgerStorage.isAvailable === 'function' &&
        !global.LedgerStorage.isAvailable()) {
      toast('当前浏览器禁用了本地存储，账单只在本次打开有效', 'error');
    }

    // 2. 表单
    if (Ledger.Form && typeof Ledger.Form.render === 'function') {
      Ledger.Form.render('form-container');
    }

    // 3. 筛选：先接管变化回调，再让筛选器按当前条件重算一次
    Ledger.Filter.onChange = applyFilter;

    // 4. 账单列表：数据来源交给筛选结果（未筛选时为全部）
    if (Ledger.Records) {
      Ledger.Records.render('#records-container');
      if (typeof Ledger.Records.setSource === 'function') {
        Ledger.Records.setSource(function () {
          return state.filtered === null ? allRecords() : state.filtered;
        });
      }
      // 日历翻月 → 同步顶部概览与图表
      if (typeof Ledger.Records.setOnMonthChange === 'function') {
        Ledger.Records.setOnMonthChange(setMonth);
      }
      if (typeof Ledger.Records.setMonth === 'function') {
        Ledger.Records.setMonth(state.month);
      }
    }

    // 5. 图表
    if (Ledger.Charts && typeof Ledger.Charts.init === 'function') {
      Ledger.Charts.init('#charts-container');
    }

    // 6. 交互
    bindMonthSwitch();
    bindFooter();

    // 7. 首次渲染
    refreshAll();

    // 8. 数据变化（新增 / 删除 / 修改 / 导入 / 清空 / 示例数据）统一刷新
    document.addEventListener('ledger:updated', onLedgerUpdated);

    console.log('[app] 记账本初始化完成');
  }

  /**
   * 数据变化：统一刷新；
   * 新增账单时自动跳到那笔账单所在的月份与日期，避免“记完却在列表里找不到”。
   */
  function onLedgerUpdated(event) {
    var detail = (event && event.detail) || {};

    if (detail.action === 'add' && detail.payload && detail.payload.date) {
      var date = String(detail.payload.date);
      var month = date.slice(0, 7);
      setMonth(month);
      if (Ledger.Records && typeof Ledger.Records.selectDate === 'function') {
        Ledger.Records.selectDate(date);
      }
    }

    refreshAll();
  }

  Ledger.App = {
    state: state,
    init: init,
    toast: toast,
    confirm: confirmDialog,
    setMonth: setMonth,
    refresh: refreshAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
