// v2 回归（2026-11-07）：本模块在 v2 中无需改动，已与 develop 对齐复核。
/**
 * filter.js —— 账单筛选查询模块（S5）
 *
 * 依据《个人记账本系统开发规范 V1.0》第 8 节：
 *   - 命名空间：Ledger.Filter
 *   - 必须接口：apply(records, conditions) / reset() / getConditions()
 *   - conditions = { type, category, startDate, endDate, keyword }
 *     type: all | income | expense；category: 具体类别或 all；
 *     startDate / endDate: YYYY-MM-DD（闭区间）；keyword: 备注关键词。
 *   - apply() 返回新数组，绝不修改原始记录数组。
 *   - 本模块只读数据，不写 LocalStorage。
 *
 * 扩展接口（不改变上面的规范接口，供 S1 集成使用）：
 *   init({ root, getRecords, onChange })  在容器中挂载筛选栏
 *   refresh()                             数据变化后重新统计
 *   getController()                       取到当前控制器实例
 *   Ledger.Filter.onChange = fn           全局筛选变化回调
 *
 * 金额区间（minAmount / maxAmount）为需求中“按金额查看”提供的扩展条件，
 * getConditions() 会一并返回，规范接口仍保持向后兼容。
 */
(function (global) {
  'use strict';

  var Ledger = global.Ledger = global.Ledger || {};

  /* ============================ 纯逻辑部分 ============================ */

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function trim(value) {
    return value == null ? '' : String(value).trim();
  }

  function isValidDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trim(str));
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  function normalizeType(value) {
    var text = trim(value).toLowerCase();
    if (text === 'income' || text === '收入' || text === 'in') return 'income';
    if (text === 'expense' || text === '支出' || text === 'out') return 'expense';
    return 'all';
  }

  function toAmount(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return isFinite(value) ? Math.abs(value) : null;
    var text = trim(value).replace(/[\s,，¥￥$]/g, '');
    if (!text) return null;
    var n = Number(text);
    return isFinite(n) ? Math.abs(n) : null;
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function formatMoney(value) {
    var n = toAmount(value);
    if (n === null) n = 0;
    var parts = n.toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '¥' + parts[0] + '.' + parts[1];
  }

  function defaultConditions() {
    return {
      type: 'all',
      category: 'all',
      startDate: '',
      endDate: '',
      keyword: '',
      minAmount: null,
      maxAmount: null
    };
  }

  /** 把任意输入整理成规范条件；非法日期视为“不限”，非法金额视为 null。 */
  function normalizeConditions(conditions) {
    var raw = conditions || {};
    var out = defaultConditions();

    out.type = normalizeType(raw.type);
    out.category = trim(raw.category) || 'all';
    out.startDate = isValidDate(raw.startDate) ? trim(raw.startDate) : '';
    out.endDate = isValidDate(raw.endDate) ? trim(raw.endDate) : '';
    out.keyword = trim(raw.keyword).toLowerCase();

    var min = toAmount(raw.minAmount);
    var max = toAmount(raw.maxAmount);
    out.minAmount = min;
    out.maxAmount = max;

    return out;
  }

  function recordAmount(record) {
    var n = toAmount(record && record.amount);
    return n === null ? 0 : n;
  }

  function matches(record, conditions) {
    if (!record || typeof record !== 'object') return false;
    var c = conditions;

    if (c.type !== 'all' && normalizeType(record.type) !== c.type) return false;
    if (c.category !== 'all' && trim(record.category) !== c.category) return false;

    if (c.keyword) {
      var haystack = (trim(record.note) + ' ' + trim(record.category)).toLowerCase();
      if (haystack.indexOf(c.keyword) === -1) return false;
    }

    if (c.minAmount !== null || c.maxAmount !== null) {
      var amount = recordAmount(record);
      if (c.minAmount !== null && amount < c.minAmount) return false;
      if (c.maxAmount !== null && amount > c.maxAmount) return false;
    }

    if (c.startDate || c.endDate) {
      var date = trim(record.date);
      if (!isValidDate(date)) return false;
      if (c.startDate && date < c.startDate) return false;
      if (c.endDate && date > c.endDate) return false;
    }

    return true;
  }

  /**
   * 规范接口：按条件筛选账单
   * @param {Array} records 原始记录（不会被修改）
   * @param {Object} [conditions] 省略时使用页面当前筛选条件
   * @returns {Array} 新的记录数组
   */
  function apply(records, conditions) {
    if (!Array.isArray(records)) return [];
    var c = normalizeConditions(conditions === undefined ? Ledger.Filter.getConditions() : conditions);
    var out = [];
    for (var i = 0; i < records.length; i++) {
      if (matches(records[i], c)) out.push(records[i]);
    }
    return out;
  }

  function summarize(records) {
    var list = Array.isArray(records) ? records : [];
    var income = 0;
    var expense = 0;
    for (var i = 0; i < list.length; i++) {
      var amount = recordAmount(list[i]);
      if (list[i].type === 'income') income += amount;
      else if (list[i].type === 'expense') expense += amount;
    }
    return {
      count: list.length,
      income: round2(income),
      expense: round2(expense),
      balance: round2(income - expense)
    };
  }

  function isDefault(conditions) {
    var c = normalizeConditions(conditions);
    return c.type === 'all' && c.category === 'all' && !c.startDate && !c.endDate &&
      !c.keyword && c.minAmount === null && c.maxAmount === null;
  }

  function readStorage() {
    if (!global.LedgerStorage || typeof global.LedgerStorage.getRecords !== 'function') {
      console.warn('[filter] LedgerStorage 未加载，请确认已按规范加载 js/storage.js');
      return [];
    }
    try {
      var records = global.LedgerStorage.getRecords();
      return Array.isArray(records) ? records : [];
    } catch (err) {
      console.warn('[filter] 读取账单失败：', err);
      return [];
    }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ============================ 筛选栏 UI ============================ */

  var TEMPLATE = '' +
    '<form class="filter-card" role="search" aria-label="账单筛选" novalidate>' +
      '<div class="filter-grid">' +
        '<div class="filter-field filter-field--type">' +
          '<span>收支类型</span>' +
          '<div class="segmented segmented-block" role="group" aria-label="收支类型筛选">' +
            '<button type="button" class="seg-btn is-active" data-type-value="all" aria-pressed="true">全部</button>' +
            '<button type="button" class="seg-btn" data-type-value="income" aria-pressed="false">收入</button>' +
            '<button type="button" class="seg-btn" data-type-value="expense" aria-pressed="false">支出</button>' +
          '</div>' +
          '<input type="hidden" data-filter="type" value="all">' +
        '</div>' +

        '<label class="filter-field">' +
          '<span>类别</span>' +
          '<select class="select" data-filter="category" aria-label="账单类别">' +
            '<option value="all">全部类别</option>' +
          '</select>' +
        '</label>' +

        '<label class="filter-field">' +
          '<span>开始日期</span>' +
          '<input class="input" type="date" data-filter="startDate" aria-label="开始日期">' +
        '</label>' +

        '<label class="filter-field">' +
          '<span>结束日期</span>' +
          '<input class="input" type="date" data-filter="endDate" aria-label="结束日期">' +
        '</label>' +

        '<label class="filter-field">' +
          '<span>金额下限</span>' +
          '<input class="input" type="number" min="0" step="0.01" inputmode="decimal" ' +
                 'data-filter="minAmount" placeholder="不限" aria-label="金额下限">' +
        '</label>' +

        '<label class="filter-field">' +
          '<span>金额上限</span>' +
          '<input class="input" type="number" min="0" step="0.01" inputmode="decimal" ' +
                 'data-filter="maxAmount" placeholder="不限" aria-label="金额上限">' +
        '</label>' +

        '<label class="filter-field filter-field--search">' +
          '<span>备注关键词</span>' +
          '<input class="input" type="search" data-filter="keyword" ' +
                 'placeholder="输入备注里的字，例如：午饭" aria-label="备注关键词">' +
        '</label>' +
      '</div>' +

      '<div class="filter-foot">' +
        '<div class="filter-presets" role="group" aria-label="快捷日期">' +
          '<button type="button" class="preset-btn" data-preset="thisMonth">本月</button>' +
          '<button type="button" class="preset-btn" data-preset="last7">近 7 天</button>' +
          '<button type="button" class="preset-btn" data-preset="last30">近 30 天</button>' +
          '<button type="button" class="preset-btn is-active" data-preset="all">不限日期</button>' +
        '</div>' +
        '<div class="filter-chips" data-chips aria-live="polite"></div>' +
        '<div class="filter-summary" data-summary aria-live="polite"></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-reset>重置</button>' +
      '</div>' +

      '<p class="filter-error" data-error role="alert" hidden></p>' +
    '</form>';

  var FIELDS = ['type', 'category', 'startDate', 'endDate', 'minAmount', 'maxAmount', 'keyword'];

  function createController(options) {
    options = options || {};

    var root = typeof options.root === 'string'
      ? global.document.querySelector(options.root)
      : options.root;

    if (!root || root.nodeType !== 1) {
      throw new Error('[filter] 找不到筛选容器 #filter-container');
    }

    if (!root.querySelector('[data-filter="type"]')) {
      root.innerHTML = TEMPLATE;
    }

    var els = {};
    FIELDS.forEach(function (name) {
      els[name] = root.querySelector('[data-filter="' + name + '"]');
    });

    var chipsEl = root.querySelector('[data-chips]');
    var summaryEl = root.querySelector('[data-summary]');
    var errorEl = root.querySelector('[data-error]');
    var typeButtons = root.querySelectorAll('[data-type-value]');
    var presetButtons = root.querySelectorAll('[data-preset]');
    var categorySelect = els.category;

    var current = defaultConditions();
    var timer = null;
    var destroyed = false;
    var lastCategoryKey = null;

    function readRecords() {
      var fn = typeof options.getRecords === 'function' ? options.getRecords : readStorage;
      try {
        var list = fn();
        return Array.isArray(list) ? list : [];
      } catch (err) {
        console.warn('[filter] 读取账单失败：', err);
        return [];
      }
    }

    function readForm() {
      var raw = {};
      FIELDS.forEach(function (name) {
        raw[name] = els[name] ? els[name].value : '';
      });
      return raw;
    }

    function setField(name, value) {
      var el = els[name];
      if (!el) return;
      el.value = value == null ? '' : String(value);
    }

    function syncTypeButtons() {
      var value = els.type ? els.type.value : 'all';
      for (var i = 0; i < typeButtons.length; i++) {
        var active = typeButtons[i].getAttribute('data-type-value') === value;
        typeButtons[i].classList.toggle('is-active', active);
        typeButtons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }

    function syncPresets() {
      var start = els.startDate ? els.startDate.value : '';
      var end = els.endDate ? els.endDate.value : '';
      var matched = 'all';

      if (start || end) {
        var now = new Date();
        var today = todayStr();
        var monthStart = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-01';
        matched = '';
        if (start === monthStart && end === today) matched = 'thisMonth';
        else if (end === today && start === addDays(-6)) matched = 'last7';
        else if (end === today && start === addDays(-29)) matched = 'last30';
      }

      for (var j = 0; j < presetButtons.length; j++) {
        presetButtons[j].classList.toggle('is-active',
          presetButtons[j].getAttribute('data-preset') === matched);
      }
    }

    function addDays(delta) {
      var d = new Date();
      d.setDate(d.getDate() + delta);
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    }

    function syncCategories() {
      if (!categorySelect) return;
      var records = readRecords();
      var seen = {};
      var categories = [];
      records.forEach(function (record) {
        var c = trim(record.category);
        if (c && !seen[c]) {
          seen[c] = true;
          categories.push(c);
        }
      });
      categories.sort(function (a, b) { return a.localeCompare(b, 'zh-Hans-CN'); });

      var currentValue = categorySelect.value || 'all';
      if (currentValue !== 'all' && categories.indexOf(currentValue) === -1) {
        categories.push(currentValue);
      }

      var key = categories.join('|') + '#' + currentValue;
      if (key === lastCategoryKey) return;
      lastCategoryKey = key;

      var html = '<option value="all">全部类别</option>';
      categories.forEach(function (c) {
        html += '<option value="' + esc(c) + '">' + esc(c) + '</option>';
      });
      categorySelect.innerHTML = html;
      categorySelect.value = currentValue;
      if (categorySelect.value !== currentValue) categorySelect.value = 'all';
    }

    function validate(raw) {
      var errors = {};
      if (raw.startDate && !isValidDate(raw.startDate)) errors.startDate = '开始日期格式应为 YYYY-MM-DD';
      if (raw.endDate && !isValidDate(raw.endDate)) errors.endDate = '结束日期格式应为 YYYY-MM-DD';
      if (!errors.startDate && !errors.endDate && raw.startDate && raw.endDate && raw.startDate > raw.endDate) {
        errors.endDate = '结束日期不能早于开始日期';
      }

      var min = toAmount(raw.minAmount);
      var max = toAmount(raw.maxAmount);
      if (trim(raw.minAmount) !== '' && min === null) errors.minAmount = '金额下限必须是数字';
      if (trim(raw.maxAmount) !== '' && max === null) errors.maxAmount = '金额上限必须是数字';
      if (min !== null && max !== null && min > max) errors.maxAmount = '金额上限不能小于金额下限';

      var keys = Object.keys(errors);
      return { valid: keys.length === 0, errors: errors, message: keys.length ? errors[keys[0]] : '' };
    }

    function showErrors(check) {
      FIELDS.forEach(function (name) {
        var el = els[name];
        if (!el) return;
        if (check.errors[name]) {
          el.classList.add('is-invalid');
          el.setAttribute('aria-invalid', 'true');
        } else {
          el.classList.remove('is-invalid');
          el.removeAttribute('aria-invalid');
        }
      });

      if (!errorEl) return;
      if (check.valid) {
        errorEl.hidden = true;
        errorEl.textContent = '';
      } else {
        errorEl.hidden = false;
        errorEl.textContent = check.message;
      }
    }

    function chipsOf(c) {
      var chips = [];
      if (c.type !== 'all') chips.push({ key: 'type', text: c.type === 'income' ? '收入' : '支出' });
      if (c.category !== 'all') chips.push({ key: 'category', text: '类别：' + c.category });
      if (c.startDate || c.endDate) {
        chips.push({
          key: 'date',
          text: c.startDate && c.endDate
            ? c.startDate + ' ~ ' + c.endDate
            : (c.startDate ? c.startDate + ' 起' : '截至 ' + c.endDate)
        });
      }
      if (c.minAmount !== null || c.maxAmount !== null) {
        chips.push({
          key: 'amount',
          text: c.minAmount !== null && c.maxAmount !== null
            ? formatMoney(c.minAmount) + ' ~ ' + formatMoney(c.maxAmount)
            : (c.minAmount !== null ? '≥ ' + formatMoney(c.minAmount) : '≤ ' + formatMoney(c.maxAmount))
        });
      }
      if (c.keyword) chips.push({ key: 'keyword', text: '关键词：' + c.keyword });
      return chips;
    }

    function renderChips(c) {
      if (!chipsEl) return;
      var chips = chipsOf(c);
      if (!chips.length) {
        chipsEl.innerHTML = '<span class="filter-chip filter-chip--muted">全部账单</span>';
        return;
      }
      var html = '';
      chips.forEach(function (chip) {
        html += '<span class="filter-chip">' + esc(chip.text) +
          '<button type="button" class="filter-chip__x" data-clear="' + chip.key +
          '" aria-label="移除条件：' + esc(chip.text) + '">×</button></span>';
      });
      chipsEl.innerHTML = html;
    }

    function renderSummary(filtered) {
      if (!summaryEl) return;
      var s = summarize(filtered);
      summaryEl.innerHTML = '共 <strong>' + s.count + '</strong> 笔 · 收入 <strong>' +
        formatMoney(s.income) + '</strong> · 支出 <strong>' + formatMoney(s.expense) +
        '</strong> · 结余 <strong>' + formatMoney(s.balance) + '</strong>';
    }

    function emit(reason) {
      if (destroyed) return;
      if (timer) {
        global.clearTimeout(timer);
        timer = null;
      }

      var raw = readForm();
      var check = validate(raw);
      showErrors(check);
      if (!check.valid) return;

      syncCategories();

      var conditions = normalizeConditions(raw);
      var all = readRecords();
      var filtered = apply(all, conditions);

      current = conditions;
      renderChips(conditions);
      renderSummary(filtered);
      syncTypeButtons();
      syncPresets();

      var meta = { total: all.length, reason: reason || 'change' };

      if (typeof options.onChange === 'function') {
        try {
          options.onChange(filtered, normalizeConditions(conditions), meta);
        } catch (err) {
          console.error('[filter] onChange 回调出错：', err);
        }
      }

      if (typeof Ledger.Filter.onChange === 'function' && options.onChange !== Ledger.Filter.onChange) {
        try {
          Ledger.Filter.onChange(filtered, normalizeConditions(conditions), meta);
        } catch (err) {
          console.error('[filter] Ledger.Filter.onChange 回调出错：', err);
        }
      }
    }

    function scheduleEmit() {
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(function () {
        timer = null;
        emit('input');
      }, 260);
    }

    function resetFields() {
      FIELDS.forEach(function (name) {
        setField(name, name === 'type' || name === 'category' ? 'all' : '');
        if (els[name]) {
          els[name].classList.remove('is-invalid');
          els[name].removeAttribute('aria-invalid');
        }
      });
      if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = '';
      }
    }

    function clearCondition(key) {
      if (key === 'type') setField('type', 'all');
      else if (key === 'category') setField('category', 'all');
      else if (key === 'date') {
        setField('startDate', '');
        setField('endDate', '');
      } else if (key === 'amount') {
        setField('minAmount', '');
        setField('maxAmount', '');
      } else if (key === 'keyword') {
        setField('keyword', '');
      }
    }

    function applyPreset(preset) {
      var today = todayStr();
      if (preset === 'all') {
        setField('startDate', '');
        setField('endDate', '');
      } else if (preset === 'thisMonth') {
        var d = new Date();
        setField('startDate', d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-01');
        setField('endDate', today);
      } else if (preset === 'last7') {
        setField('startDate', addDays(-6));
        setField('endDate', today);
      } else if (preset === 'last30') {
        setField('startDate', addDays(-29));
        setField('endDate', today);
      }
    }

    /* -------- 事件 -------- */

    root.addEventListener('submit', function (event) {
      event.preventDefault();
      emit('submit');
    });

    root.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;

      var typeBtn = target.closest('[data-type-value]');
      if (typeBtn) {
        setField('type', typeBtn.getAttribute('data-type-value'));
        emit('type');
        return;
      }

      var preset = target.closest('[data-preset]');
      if (preset) {
        applyPreset(preset.getAttribute('data-preset'));
        emit('preset');
        return;
      }

      var clear = target.closest('[data-clear]');
      if (clear) {
        clearCondition(clear.getAttribute('data-clear'));
        emit('clear');
        return;
      }

      if (target.closest('[data-reset]')) {
        resetFields();
        emit('reset');
      }
    });

    root.addEventListener('input', function (event) {
      var el = event.target;
      if (!el || !el.getAttribute) return;
      var name = el.getAttribute('data-filter');
      if (name === 'keyword' || name === 'minAmount' || name === 'maxAmount') scheduleEmit();
    });

    root.addEventListener('change', function (event) {
      var el = event.target;
      if (!el || !el.getAttribute) return;
      if (el.getAttribute('data-filter')) emit('change');
    });

    function destroy() {
      destroyed = true;
      if (timer) global.clearTimeout(timer);
      timer = null;
    }

    /* -------- 首次渲染 -------- */
    syncCategories();
    emit('init');

    return {
      root: root,
      /** 条件变化后手动重新筛选 */
      apply: function () { emit('manual'); },
      /** 数据变化后重新读取并刷新 */
      refresh: function () { emit('refresh'); },
      reset: function () { resetFields(); emit('reset'); },
      getConditions: function () { return normalizeConditions(current); },
      getFiltered: function () { return apply(readRecords(), current); },
      setConditions: function (partial) {
        var merged = normalizeConditions(Object.assign({}, current, partial || {}));
        setField('type', merged.type);
        setField('category', merged.category);
        setField('startDate', merged.startDate);
        setField('endDate', merged.endDate);
        setField('minAmount', merged.minAmount === null ? '' : merged.minAmount);
        setField('maxAmount', merged.maxAmount === null ? '' : merged.maxAmount);
        setField('keyword', merged.keyword);
        emit('set');
      },
      destroy: destroy
    };
  }

  /* ============================ 对外接口 ============================ */

  var controller = null;

  Ledger.Filter = {
    /** 规范接口 */
    apply: apply,
    reset: function () {
      if (controller) controller.reset();
    },
    getConditions: function () {
      return controller ? controller.getConditions() : defaultConditions();
    },

    /** 集成扩展 */
    init: function (options) {
      if (controller) controller.destroy();
      controller = createController(options);
      return controller;
    },
    refresh: function () {
      if (controller) controller.refresh();
    },
    getController: function () {
      return controller;
    },
    /** 由 S1 赋值为函数，筛选变化时回调 */
    onChange: null,

    /** 工具（测试与其他模块可复用） */
    defaultConditions: defaultConditions,
    normalizeConditions: normalizeConditions,
    summarize: summarize,
    isDefault: isDefault,
    formatMoney: formatMoney,
    isValidDate: isValidDate
  };

  /** 页面存在 #filter-container 时自动挂载，S1 无需手动初始化 */
  function autoInit() {
    if (controller) return;
    var container = global.document && global.document.getElementById('filter-container');
    if (!container) return;
    try {
      controller = createController({ root: container, getRecords: readStorage });
    } catch (err) {
      console.error('[filter] 筛选栏初始化失败：', err);
    }
  }

  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', autoInit);
    } else {
      autoInit();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
