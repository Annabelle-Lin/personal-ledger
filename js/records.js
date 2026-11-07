/**
 * records.js —— 账单明细模块（S3）
 *
 * 依据《个人记账本系统开发规范 V1.0》第 6 节：
 *   - 命名空间：Ledger.Records
 *   - 必须接口：render(container) / refresh() / deleteRecord(id)
 *   - 删除必须走 LedgerStorage.deleteRecord()，本模块不保存数据。
 *
 * 交互：左侧月历 + 右侧明细
 *   - 日历显示当前统计月份，每个日期下方标出当日支出/收入；
 *   - 点某个日期 → 右侧只显示这一天的账单；点“整月”→ 显示整月账单；
 *   - 日历上可以直接翻月，并把月份同步给顶部概览与图表。
 *
 * 数据来源优先级：
 *   1. setSource(fn) 注入的数据提供者（S1 在筛选后注入，保证列表与筛选联动）；
 *   2. 未注入时直接读取 LedgerStorage.getRecords()。
 *
 * 扩展接口（供 S1 集成）：
 *   setSource(fn)        注入数据源
 *   setMonth('YYYY-MM')  同步统计月份
 *   setOnMonthChange(fn) 日历翻月时通知外部
 *   selectDate('YYYY-MM-DD') 选中某天
 */
(function (global) {
  'use strict';

  var Ledger = global.Ledger = global.Ledger || {};
  var Records = {};

  var CONST = global.LedgerConstants || {};
  var INCOME_CATEGORIES = CONST.INCOME_CATEGORIES ||
    ['工资', '兼职', '奖学金', '生活费', '红包', '其他'];
  var EXPENSE_CATEGORIES = CONST.EXPENSE_CATEGORIES ||
    ['餐饮', '交通', '购物', '娱乐', '学习', '医疗', '居住', '其他'];

  var ICONS = {
    '餐饮': '🍜', '交通': '🚌', '购物': '🛍️', '娱乐': '🎮',
    '学习': '📚', '医疗': '💊', '居住': '🏠', '其他': '📦',
    '工资': '💰', '兼职': '💵', '奖学金': '🎓', '生活费': '💳', '红包': '🧧'
  };

  var WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var WEEK_HEADS = ['一', '二', '三', '四', '五', '六', '日'];

  var container = null;
  var source = null;
  var bound = false;
  var currentModal = null;

  var state = {
    month: null,          // 'YYYY-MM'
    selectedDate: null,   // 'YYYY-MM-DD'，null 表示整月
    onMonthChange: null
  };

  /* ------------------------------ 工具 ------------------------------ */

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function toNumber(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function formatMoney(value) {
    var n = toNumber(value);
    var negative = n < 0;
    var parts = Math.abs(n).toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (negative ? '-¥' : '¥') + parts[0] + '.' + parts[1];
  }

  /** 日历格子里的极简金额：339 / 1.8k / 12k */
  function compactAmount(value) {
    var n = Math.abs(toNumber(value));
    if (n >= 10000) return Math.round(n / 1000) + 'k';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
    if (n >= 100) return String(Math.round(n));
    return n % 1 === 0 ? String(n) : n.toFixed(1);
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function currentMonth() {
    return todayStr().slice(0, 7);
  }

  function monthOf(date) {
    return String(date || '').slice(0, 7);
  }

  function shiftMonthKey(key, delta) {
    var parts = String(key).split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1 + delta, 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }

  function monthLabel(key) {
    var parts = String(key || '').split('-');
    if (parts.length !== 2) return key;
    return parts[0] + '年' + Number(parts[1]) + '月';
  }

  function dateLabel(dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
    if (!m) return { main: dateStr || '日期未知', weekday: '' };
    var weekday = WEEKDAYS[new Date(+m[1], +m[2] - 1, +m[3]).getDay()];
    var main = (+m[2]) + '月' + (+m[3]) + '日';
    if (dateStr === todayStr()) main = '今天 · ' + main;
    return { main: main, weekday: weekday };
  }

  function getRecords() {
    if (typeof source === 'function') {
      var fromSource = source();
      return Array.isArray(fromSource) ? fromSource.slice() : [];
    }
    if (!global.LedgerStorage) {
      console.error('[records] LedgerStorage 未加载，请检查 storage.js 的引入顺序');
      return [];
    }
    var records = global.LedgerStorage.getRecords();
    return Array.isArray(records) ? records : [];
  }

  function sumOf(records) {
    var income = 0;
    var expense = 0;
    for (var i = 0; i < records.length; i++) {
      if (records[i].type === 'income') income += toNumber(records[i].amount);
      else expense += toNumber(records[i].amount);
    }
    return { income: income, expense: expense, count: records.length };
  }

  function groupByDate(records) {
    var groups = [];
    var index = {};
    records.forEach(function (record) {
      var key = String(record.date || '');
      if (!index[key]) {
        index[key] = { date: key, records: [] };
        groups.push(index[key]);
      }
      index[key].records.push(record);
    });
    return groups;
  }

  function sortRecords(records) {
    return records.slice().sort(function (a, b) {
      var da = String(a.date || '');
      var db = String(b.date || '');
      if (da !== db) return da < db ? 1 : -1;
      return toNumber(b.createdAt) - toNumber(a.createdAt);
    });
  }

  function notify(message, type) {
    if (Ledger.App && typeof Ledger.App.toast === 'function') {
      Ledger.App.toast(message, type);
    } else {
      console.info('[records]', message);
    }
  }

  function confirmAction(options) {
    if (Ledger.App && typeof Ledger.App.confirm === 'function') {
      return Ledger.App.confirm(options);
    }
    return Promise.resolve(global.confirm(options.message || options.title || '确认操作？'));
  }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  /* ------------------------------ 日历 ------------------------------ */

  /** 按日期汇总（用当前数据源，可能已被筛选） */
  function dailyMap(records) {
    var map = {};
    records.forEach(function (record) {
      var key = String(record.date || '');
      if (!map[key]) map[key] = { income: 0, expense: 0, count: 0 };
      var bucket = map[key];
      bucket.count += 1;
      if (record.type === 'income') bucket.income += toNumber(record.amount);
      else bucket.expense += toNumber(record.amount);
    });
    return map;
  }

  function buildCalendar(allRecords, month) {
    var parts = String(month).split('-');
    var year = Number(parts[0]);
    var monthIndex = Number(parts[1]) - 1;

    var firstDay = new Date(year, monthIndex, 1);
    var startOffset = (firstDay.getDay() + 6) % 7;            // 周一为第一列
    var daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    var map = dailyMap(allRecords);
    var selected = state.selectedDate;
    var today = todayStr();

    var cells = '';
    for (var i = 0; i < totalCells; i++) {
      var dayNumber = i - startOffset + 1;
      var cellDate = new Date(year, monthIndex, dayNumber);
      var dateStr = cellDate.getFullYear() + '-' + pad2(cellDate.getMonth() + 1) + '-' + pad2(cellDate.getDate());
      var inMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
      var info = map[dateStr];
      var classes = ['cal-day'];

      if (!inMonth) classes.push('is-out');
      if (dateStr === today) classes.push('is-today');
      if (dateStr === selected) classes.push('is-selected');
      if (info && info.expense > 0) classes.push('has-expense');
      if (info && info.income > 0) classes.push('has-income');

      var amountHTML = '';
      if (info) {
        if (info.expense > 0) {
          amountHTML = '<span class="cal-amt cal-amt--expense">' + compactAmount(info.expense) + '</span>';
        } else if (info.income > 0) {
          amountHTML = '<span class="cal-amt cal-amt--income">' + compactAmount(info.income) + '</span>';
        }
      }

      var titleParts = [];
      if (info) {
        titleParts.push('支出 ' + formatMoney(info.expense));
        titleParts.push('收入 ' + formatMoney(info.income));
        titleParts.push(info.count + ' 笔');
      } else {
        titleParts.push('无账单');
      }

      cells += '<button type="button" class="' + classes.join(' ') + '" data-date="' + dateStr + '"' +
        ' title="' + esc(cellDate.getMonth() + 1 + '月' + cellDate.getDate() + '日 · ' + titleParts.join(' · ')) + '"' +
        ' aria-label="' + esc(cellDate.getMonth() + 1 + '月' + cellDate.getDate() + '日，' + titleParts.join('，')) + '"' +
        ' aria-pressed="' + (dateStr === selected ? 'true' : 'false') + '">' +
        '<span class="cal-num">' + cellDate.getDate() + '</span>' +
        amountHTML +
      '</button>';
    }

    var card = el('div', 'calendar-card');
    card.innerHTML =
      '<div class="calendar-head">' +
        '<button type="button" class="icon-btn" data-cal-nav="-1" aria-label="上一个月">‹</button>' +
        '<span class="calendar-title">' + monthLabel(month) + '</span>' +
        '<button type="button" class="icon-btn" data-cal-nav="1" aria-label="下一个月">›</button>' +
      '</div>' +
      '<div class="calendar-weekdays">' +
        WEEK_HEADS.map(function (w) { return '<span>' + w + '</span>'; }).join('') +
      '</div>' +
      '<div class="calendar-days">' + cells + '</div>' +
      '<div class="calendar-legend">' +
        '<span class="legend-item"><i class="dot dot--expense"></i>支出</span>' +
        '<span class="legend-item"><i class="dot dot--income"></i>收入</span>' +
        '<span class="legend-tip">点日期看当天明细</span>' +
      '</div>';

    return card;
  }

  /* ------------------------------ 明细行 ------------------------------ */

  function buildRow(record) {
    var isIncome = record.type === 'income';
    var item = document.createElement('div');
    item.className = 'record-item';
    item.dataset.id = String(record.id || '');
    item.dataset.action = 'detail';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', (record.category || '未分类') + ' ' +
      (isIncome ? '收入 ' : '支出 ') + formatMoney(record.amount) + '，点击查看详情');

    item.innerHTML =
      '<span class="record-icon ' + (isIncome ? 'record-icon--income' : 'record-icon--expense') +
        '" aria-hidden="true">' + (ICONS[record.category] || '📝') + '</span>' +
      '<div class="record-main">' +
        '<div class="record-title">' + esc(record.category || '未分类') +
          '<span class="record-badge ' + (isIncome ? 'record-badge--income' : 'record-badge--expense') + '">' +
            (isIncome ? '收入' : '支出') + '</span>' +
        '</div>' +
        '<div class="record-note">' + (record.note ? esc(record.note) : '无备注') + '</div>' +
      '</div>' +
      '<div class="record-amount ' + (isIncome ? 'record-amount--income' : 'record-amount--expense') + '">' +
        (isIncome ? '+' : '-') + formatMoney(record.amount) +
      '</div>' +
      '<div class="record-actions">' +
        '<button type="button" class="icon-action" data-action="detail">详情</button>' +
        '<button type="button" class="icon-action icon-action--danger" data-action="delete">删除</button>' +
      '</div>';

    return item;
  }

  /* ------------------------------ 明细面板 ------------------------------ */

  function buildDayPanel(monthRecords) {
    var selected = state.selectedDate;
    var list = selected
      ? monthRecords.filter(function (r) { return String(r.date) === selected; })
      : monthRecords;

    var sums = sumOf(list);

    var card = el('div', 'day-card');
    var head = el('div', 'day-card-head');

    var title;
    var sub;
    if (selected) {
      var label = dateLabel(selected);
      title = label.main + (label.weekday ? '<span class="weekday"> ' + label.weekday + '</span>' : '');
      sub = sums.count + ' 笔 · 支出 ' + formatMoney(sums.expense) + ' · 收入 ' + formatMoney(sums.income);
    } else {
      title = '整月账单';
      sub = sums.count + ' 笔 · 支出 ' + formatMoney(sums.expense) + ' · 收入 ' + formatMoney(sums.income);
    }

    head.innerHTML =
      '<div>' +
        '<h3 class="day-card-title">' + title + '</h3>' +
        '<p class="day-card-sub">' + sub + '</p>' +
      '</div>' +
      '<div class="records-tools">' +
        '<button type="button" class="btn btn-sm ' + (selected === todayStr() ? 'btn-soft' : 'btn-ghost') + '"' +
          ' data-action="today">今天</button>' +
        '<button type="button" class="btn btn-sm ' + (!selected ? 'btn-soft' : 'btn-ghost') + '"' +
          ' data-action="whole-month">整月</button>' +
      '</div>';
    card.appendChild(head);

    var body = el('div', 'day-card-list');

    if (list.length === 0) {
      body.innerHTML =
        '<div class="day-card-empty">' +
          '<div class="empty-icon" aria-hidden="true">🗓️</div>' +
          '<p>' + (selected ? '这一天没有账单记录' : '本月没有符合条件的账单') + '</p>' +
          '<p class="day-card-empty-tip">' +
            (selected ? '换一天看看，或点“整月”浏览本月全部记录' : '换个筛选条件试试，或去左侧记一笔') +
          '</p>' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="focus-form">去记一笔</button>' +
        '</div>';
    } else if (selected) {
      sortRecords(list).forEach(function (record) {
        body.appendChild(buildRow(record));
      });
    } else {
      var groups = groupByDate(sortRecords(list));
      groups.forEach(function (group) {
        var sumsOfDay = sumOf(group.records);
        var label = dateLabel(group.date);
        var stats = [];
        if (sumsOfDay.expense > 0) stats.push('支出 ' + formatMoney(sumsOfDay.expense));
        if (sumsOfDay.income > 0) stats.push('收入 ' + formatMoney(sumsOfDay.income));

        var head2 = el('div', 'day-head');
        head2.innerHTML =
          '<span class="day-date">' + esc(label.main) +
            (label.weekday ? '<span class="weekday">' + label.weekday + '</span>' : '') +
          '</span>' +
          '<span class="day-stats">' + stats.join(' · ') + '</span>';
        body.appendChild(head2);

        var wrap = el('div', 'day-list');
        group.records.forEach(function (record) {
          wrap.appendChild(buildRow(record));
        });
        body.appendChild(wrap);
      });
    }

    card.appendChild(body);
    return card;
  }

  /* ------------------------------ 整体渲染 ------------------------------ */

  function buildHead(month, monthRecords) {
    var sums = sumOf(monthRecords);

    var head = el('div', 'records-head');
    head.innerHTML =
      '<div class="section-head-main">' +
        '<h2 class="section-title">账单明细</h2>' +
        '<p class="section-sub">' + monthLabel(month) + ' · 共 ' + sums.count + ' 笔 · 收入 ' +
          formatMoney(sums.income) + ' · 支出 ' + formatMoney(sums.expense) + '</p>' +
      '</div>';
    return head;
  }

  /* ------------------------------ 详情 / 编辑弹窗 ------------------------------ */

  function closeModal() {
    if (!currentModal) return;
    if (currentModal.parentNode) currentModal.parentNode.removeChild(currentModal);
    currentModal = null;
    document.removeEventListener('keydown', onModalKeydown);
  }

  function onModalKeydown(event) {
    if (event.key === 'Escape') closeModal();
  }

  function categoryOptions(type, selected) {
    var list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return list.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === selected ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  function openModal(record) {
    closeModal();

    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.dataset.modalBackdrop = 'true';
    backdrop.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">' +
        '<div class="modal-head">' +
          '<h3 class="modal-title" id="record-modal-title">账单详情</h3>' +
          '<button type="button" class="modal-close" data-modal-close aria-label="关闭">×</button>' +
        '</div>' +
        '<div class="modal-body" data-modal-body></div>' +
        '<div class="modal-foot"></div>' +
      '</div>';

    currentModal = backdrop;
    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onModalKeydown);

    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop || event.target.closest('[data-modal-close]')) {
        closeModal();
      }
    });

    showDetailView(record);

    var closeBtn = backdrop.querySelector('[data-modal-close]');
    if (closeBtn) closeBtn.focus();
  }

  function showDetailView(record) {
    if (!currentModal) return;
    var isIncome = record.type === 'income';
    var body = currentModal.querySelector('[data-modal-body]');
    var foot = currentModal.querySelector('.modal-foot');
    var title = currentModal.querySelector('.modal-title');
    if (title) title.textContent = '账单详情';

    body.innerHTML =
      '<div class="detail-list">' +
        '<div class="detail-row"><span class="detail-label">类型</span><span class="detail-value ' +
          (isIncome ? 'detail-value--income' : 'detail-value--expense') + '">' +
          (isIncome ? '收入' : '支出') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">金额</span><span class="detail-value ' +
          (isIncome ? 'detail-value--income' : 'detail-value--expense') + '">' +
          formatMoney(record.amount) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">类别</span><span class="detail-value">' +
          esc(record.category) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">日期</span><span class="detail-value">' +
          esc(record.date) + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">备注</span><span class="detail-value">' +
          (record.note ? esc(record.note) : '—') + '</span></div>' +
        '<div class="detail-row"><span class="detail-label">编号</span><span class="detail-value">' +
          esc(record.id) + '</span></div>' +
      '</div>';

    foot.className = 'modal-foot modal-foot--split';
    foot.innerHTML =
      '<button type="button" class="btn btn-ghost btn-sm" data-modal-delete>删除</button>' +
      '<div style="display:flex;gap:8px">' +
        '<button type="button" class="btn btn-soft btn-sm" data-modal-edit>编辑</button>' +
        '<button type="button" class="btn btn-primary btn-sm" data-modal-close>完成</button>' +
      '</div>';

    foot.querySelector('[data-modal-edit]').addEventListener('click', function () {
      showEditView(record);
    });
    foot.querySelector('[data-modal-delete]').addEventListener('click', function () {
      closeModal();
      requestDelete(record.id);
    });
  }

  function showEditView(record) {
    if (!currentModal) return;
    var body = currentModal.querySelector('[data-modal-body]');
    var foot = currentModal.querySelector('.modal-foot');
    var title = currentModal.querySelector('.modal-title');
    if (title) title.textContent = '编辑账单';

    body.innerHTML =
      '<div class="edit-grid">' +
        '<label class="edit-field"><span>类型</span>' +
          '<select class="select" data-edit="type">' +
            '<option value="expense"' + (record.type === 'expense' ? ' selected' : '') + '>支出</option>' +
            '<option value="income"' + (record.type === 'income' ? ' selected' : '') + '>收入</option>' +
          '</select></label>' +
        '<label class="edit-field"><span>金额</span>' +
          '<input class="input" type="text" inputmode="decimal" data-edit="amount" value="' +
            esc(toNumber(record.amount).toFixed(2)) + '"></label>' +
        '<label class="edit-field"><span>类别</span>' +
          '<select class="select" data-edit="category">' +
            categoryOptions(record.type, record.category) + '</select></label>' +
        '<label class="edit-field"><span>日期</span>' +
          '<input class="input" type="date" data-edit="date" value="' + esc(record.date) + '"></label>' +
        '<label class="edit-field edit-field--full"><span>备注</span>' +
          '<input class="input" type="text" maxlength="60" data-edit="note" value="' +
            esc(record.note || '') + '"></label>' +
      '</div>' +
      '<p class="field-error" data-edit-error></p>';

    foot.className = 'modal-foot';
    foot.innerHTML =
      '<button type="button" class="btn btn-ghost btn-sm" data-edit-cancel>取消</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-edit-save>保存修改</button>';

    var typeEl = body.querySelector('[data-edit="type"]');
    var catEl = body.querySelector('[data-edit="category"]');

    typeEl.addEventListener('change', function () {
      catEl.innerHTML = categoryOptions(typeEl.value, catEl.value);
    });

    foot.querySelector('[data-edit-cancel]').addEventListener('click', function () {
      showDetailView(record);
    });

    foot.querySelector('[data-edit-save]').addEventListener('click', function () {
      saveEdit(record, body);
    });
  }

  function saveEdit(record, body) {
    var errorEl = body.querySelector('[data-edit-error]');
    function fail(msg) {
      if (errorEl) errorEl.textContent = msg;
    }

    var type = body.querySelector('[data-edit="type"]').value;
    var amountText = String(body.querySelector('[data-edit="amount"]').value || '').trim();
    var category = body.querySelector('[data-edit="category"]').value;
    var date = String(body.querySelector('[data-edit="date"]').value || '').trim();
    var note = String(body.querySelector('[data-edit="note"]').value || '').trim();

    if (!/^\d+(\.\d{1,2})?$/.test(amountText) || !(Number(amountText) > 0)) {
      return fail('金额必须为正数，最多两位小数');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return fail('日期格式应为 YYYY-MM-DD');
    }
    var allowed = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    if (allowed.indexOf(category) === -1) {
      return fail('类别与收支类型不匹配');
    }

    if (!global.LedgerStorage || typeof global.LedgerStorage.updateRecord !== 'function') {
      return fail('LedgerStorage 未加载，无法修改');
    }

    var updated = global.LedgerStorage.updateRecord(record.id, {
      type: type,
      amount: Number(amountText),
      category: category,
      date: date,
      note: note
    });

    if (!updated) return fail('保存失败：记录不存在或存储不可用');

    closeModal();
    notify('账单已更新', 'success');
  }

  /* ------------------------------ 事件 ------------------------------ */

  function requestDelete(id) {
    confirmAction({
      title: '删除这笔账单？',
      message: '删除后无法恢复。',
      confirmText: '删除',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      if (Records.deleteRecord(id)) notify('已删除 1 笔账单', 'success');
      else notify('删除失败：记录不存在', 'error');
    });
  }

  function findRecord(id) {
    var list = getRecords();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) return list[i];
    }
    return null;
  }

  function focusForm() {
    var amount = document.getElementById('ledger-amount');
    if (amount) {
      amount.focus();
      amount.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function applyMonth(month) {
    if (month === state.month) return;
    state.month = month;
    state.selectedDate = monthOf(todayStr()) === month ? todayStr() : null;
    Records.refresh();
  }

  function changeMonth(delta) {
    var next = shiftMonthKey(state.month, delta);
    if (typeof state.onMonthChange === 'function') {
      state.onMonthChange(next);
      // 外部（S1）会回调 Records.setMonth()，这里只兜底一次
      if (state.month !== next) applyMonth(next);
    } else {
      applyMonth(next);
    }
  }

  function selectDate(date) {
    if (!date) return;
    state.selectedDate = date;
    var month = monthOf(date);
    if (month !== state.month) {
      state.month = month;
      if (typeof state.onMonthChange === 'function') {
        state.onMonthChange(month);
      }
    }
    Records.refresh();
  }

  function selectToday() {
    var today = todayStr();
    selectDate(today);
  }

  function onContainerClick(event) {
    var target = event.target;
    if (!target || !target.closest) return;

    var dayEl = target.closest('[data-date]');
    if (dayEl) {
      selectDate(dayEl.getAttribute('data-date'));
      return;
    }

    var nav = target.closest('[data-cal-nav]');
    if (nav) {
      changeMonth(Number(nav.getAttribute('data-cal-nav')));
      return;
    }

    var actionEl = target.closest('[data-action]');
    if (!actionEl) return;

    var action = actionEl.getAttribute('data-action');

    if (action === 'focus-form') {
      focusForm();
      return;
    }
    if (action === 'today') {
      selectToday();
      return;
    }
    if (action === 'whole-month') {
      state.selectedDate = null;
      Records.refresh();
      return;
    }

    var item = target.closest('.record-item');
    if (!item) return;
    var record = findRecord(item.dataset.id);
    if (!record) return;

    if (action === 'delete') {
      event.stopPropagation();
      requestDelete(record.id);
      return;
    }

    if (action === 'detail') openModal(record);
  }

  function onContainerKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var item = event.target.closest && event.target.closest('.record-item');
    if (!item || event.target !== item) return;
    event.preventDefault();
    var record = findRecord(item.dataset.id);
    if (record) openModal(record);
  }

  /* ------------------------------ 对外接口 ------------------------------ */

  Records.render = function (target) {
    if (typeof target === 'string') {
      container = document.querySelector(target);
    } else if (target && target.nodeType === 1) {
      container = target;
    }
    if (!container) container = document.getElementById('records-container');

    if (!container) {
      console.error('[records] 找不到账单容器 records-container');
      return false;
    }

    if (!bound) {
      container.addEventListener('click', onContainerClick);
      container.addEventListener('keydown', onContainerKeydown);
      bound = true;
    }

    if (!state.month) state.month = currentMonth();
    if (state.selectedDate === null && state.month === currentMonth()) {
      state.selectedDate = todayStr();
    }

    Records.refresh();
    return true;
  };

  Records.refresh = function () {
    if (!container) container = document.getElementById('records-container');
    if (!container) return false;

    closeModal();

    var all = sortRecords(getRecords());
    var month = state.month || currentMonth();
    var monthRecords = all.filter(function (record) {
      return monthOf(record.date) === month;
    });

    container.innerHTML = '';
    container.appendChild(buildHead(month, monthRecords));

    var layout = el('div', 'records-layout');
    layout.appendChild(buildCalendar(all, month));
    layout.appendChild(buildDayPanel(monthRecords));
    container.appendChild(layout);

    return true;
  };

  Records.deleteRecord = function (id) {
    if (!id) return false;
    if (!global.LedgerStorage || typeof global.LedgerStorage.deleteRecord !== 'function') {
      console.error('[records] LedgerStorage 未加载，无法删除');
      return false;
    }
    return global.LedgerStorage.deleteRecord(id) === true;
  };

  /** 注入数据来源（S1 在筛选后调用），保证列表只显示筛选结果 */
  Records.setSource = function (fn) {
    source = typeof fn === 'function' ? fn : null;
    return Records.refresh();
  };

  /** 同步统计月份（S1 在顶部月份切换时调用） */
  Records.setMonth = function (month) {
    if (!month) return;
    applyMonth(month);
  };

  /** 选中某一天（S1 在新增账单后调用，自动跳到那笔账单的日期） */
  Records.selectDate = function (date) {
    if (date) selectDate(date);
  };

  /** 日历翻月时通知外部 */
  Records.setOnMonthChange = function (fn) {
    state.onMonthChange = typeof fn === 'function' ? fn : null;
  };

  Records.getMonth = function () {
    return state.month;
  };

  Records.getSelectedDate = function () {
    return state.selectedDate;
  };

  Records.getRecords = function () {
    return getRecords();
  };

  global.Ledger.Records = Records;
})(typeof window !== 'undefined' ? window : globalThis);
