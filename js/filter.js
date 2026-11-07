/*!
 * filter.js —— 简记·个人财务管理系统 / S5 筛选查询模块
 * ------------------------------------------------------------------
 * 职责：按 收支类型 / 类别 / 日期范围 / 金额范围 / 关键词 筛选账单。
 * 依赖：无第三方库；只读账单数据，不修改 records，不写 LocalStorage。
 * 数据：统一记录结构 { id, type: 'income'|'expense', amount: number,
 *        category: string, date: 'YYYY-MM-DD', note: string }
 * 规范接口（V1.0）：Ledger.Filter.apply(records, conditions)
 *                  Ledger.Filter.reset()
 *                  Ledger.Filter.getConditions()
 * 条件字段：type / category / startDate / endDate / keyword
 *          （minAmount / maxAmount 为 S5 金额筛选扩展，可选）
 * 暴露：window.LedgerFilter（旧接口，保留兼容）/ module.exports（Node 测试）
 *
 * 快速接入：
 *   <div id="filter-container"></div>
 *   <script src="js/storage.js"></script>
 *   <script src="js/filter.js"></script>
 *   <script>
 *     Ledger.Filter.onChange = function (records, conditions) { renderList(records); };
 *   </script>
 *   filter.js 会自动挂载 #filter-container，并监听 ledger:updated。
 * ------------------------------------------------------------------
 */
(function (root, factory) {
  'use strict';
  var api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LedgerFilter = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var STORAGE_KEY = 'ledger_records';
  var FILTER_FIELDS = ['type', 'category', 'dateFrom', 'dateTo', 'amountMin', 'amountMax', 'keyword'];
  var DEFAULT_CRITERIA = Object.freeze({
    type: 'all',
    category: 'all',
    dateFrom: '',
    dateTo: '',
    amountMin: null,
    amountMax: null,
    keyword: ''
  });

  /* ============================ 基础工具 ============================ */

  function trimStr(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * 把任意输入解析为数字金额；无法解析时返回 null。
   * 兼容 "¥1,200"、"25.5"、25.5 等写法。
   */
  function toAmount(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return isFinite(value) ? value : null;
    var text = String(value).replace(/[\s,，¥￥$]/g, '');
    if (!text) return null;
    var n = Number(text);
    return isFinite(n) ? n : null;
  }

  function formatMoney(value) {
    var n = toAmount(value);
    if (n === null) n = 0;
    var negative = n < 0;
    var parts = Math.abs(n).toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (negative ? '-¥' : '¥') + parts[0] + '.' + parts[1];
  }

  /* ============================ 日期处理 ============================ */

  function isRealDate(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    var date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  /** 严格校验 YYYY-MM-DD（含 2 月 30 日这类非法日期）。 */
  function isValidDateStr(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimStr(value));
    if (!m) return false;
    return isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  /** 把 Date、"2026/11/7"、"2026.11.07" 统一成 YYYY-MM-DD，失败返回 ''。 */
  function normalizeDateStr(value) {
    if (value instanceof Date && !isNaN(value.getTime())) return formatDate(value);
    var text = trimStr(value);
    if (!text) return '';
    var m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
    if (m) {
      var y = Number(m[1]);
      var mo = Number(m[2]);
      var d = Number(m[3]);
      return isRealDate(y, mo, d) ? y + '-' + pad2(mo) + '-' + pad2(d) : '';
    }
    return isValidDateStr(text) ? text : '';
  }

  function formatDate(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  /* ============================ 条件与匹配 ============================ */

  /** 兼容 'income'/'收入' 与 'expense'/'支出' 两类写法。 */
  function normalizeType(value) {
    var text = trimStr(value).toLowerCase();
    if (text === 'income' || text === 'in' || text === '收入' || text === '收') return 'income';
    if (text === 'expense' || text === 'out' || text === '支出' || text === '支') return 'expense';
    return '';
  }

  /** 金额统一取绝对值，避免队友把支出存成 -25 时筛选不到。 */
  function recordAmount(record) {
    var n = toAmount(record && record.amount);
    return n === null ? 0 : Math.abs(n);
  }

  /** 表单原始值 → 规范条件（空值归一为 all / '' / null）。 */
  function normalizeCriteria(raw) {
    raw = raw || {};
    var type = normalizeType(raw.type);
    var category = trimStr(raw.category);
    var amountMin = trimStr(raw.amountMin) === '' ? null : toAmount(raw.amountMin);
    var amountMax = trimStr(raw.amountMax) === '' ? null : toAmount(raw.amountMax);

    return {
      type: type || 'all',
      category: category || 'all',
      dateFrom: normalizeDateStr(raw.dateFrom),
      dateTo: normalizeDateStr(raw.dateTo),
      amountMin: amountMin === null ? null : Math.abs(amountMin),
      amountMax: amountMax === null ? null : Math.abs(amountMax),
      keyword: trimStr(raw.keyword)
    };
  }

  /**
   * 校验表单条件，返回 { valid, errors, message }。
   * 控制器在条件非法时不会触发筛选，避免把错误输入当成“无结果”。
   */
  function validateCriteria(raw) {
    raw = raw || {};
    var errors = {};
    var dateFrom = trimStr(raw.dateFrom);
    var dateTo = trimStr(raw.dateTo);

    if (dateFrom && !isValidDateStr(dateFrom)) {
      errors.dateFrom = '开始日期格式应为 YYYY-MM-DD';
    }
    if (dateTo && !isValidDateStr(dateTo)) {
      errors.dateTo = '结束日期格式应为 YYYY-MM-DD';
    }
    if (!errors.dateFrom && !errors.dateTo && dateFrom && dateTo && dateFrom > dateTo) {
      errors.dateTo = '结束日期不能早于开始日期';
    }

    var minRaw = trimStr(raw.amountMin);
    var maxRaw = trimStr(raw.amountMax);
    var min = minRaw === '' ? null : toAmount(minRaw);
    var max = maxRaw === '' ? null : toAmount(maxRaw);

    if (minRaw !== '' && min === null) {
      errors.amountMin = '金额下限必须是数字';
    } else if (min !== null && min < 0) {
      errors.amountMin = '金额下限不能为负数';
    }

    if (maxRaw !== '' && max === null) {
      errors.amountMax = '金额上限必须是数字';
    } else if (max !== null && max < 0) {
      errors.amountMax = '金额上限不能为负数';
    }

    if (min !== null && max !== null && min > max) {
      errors.amountMax = '金额上限不能小于金额下限';
    }

    var keys = Object.keys(errors);
    return {
      valid: keys.length === 0,
      errors: errors,
      message: keys.length ? errors[keys[0]] : ''
    };
  }

  /** 内部匹配函数：criteria 必须已 normalize。 */
  function matchNormalized(record, criteria) {
    if (!record || typeof record !== 'object') return false;

    if (criteria.type !== 'all' && normalizeType(record.type) !== criteria.type) {
      return false;
    }

    if (criteria.category !== 'all' && trimStr(record.category) !== criteria.category) {
      return false;
    }

    if (criteria.keyword) {
      var haystack = (trimStr(record.note) + ' ' + trimStr(record.category)).toLowerCase();
      if (haystack.indexOf(criteria.keyword.toLowerCase()) === -1) return false;
    }

    if (criteria.amountMin !== null || criteria.amountMax !== null) {
      var amount = recordAmount(record);
      if (criteria.amountMin !== null && amount < criteria.amountMin) return false;
      if (criteria.amountMax !== null && amount > criteria.amountMax) return false;
    }

    if (criteria.dateFrom || criteria.dateTo) {
      var date = normalizeDateStr(record.date);
      if (!date) return false;
      if (criteria.dateFrom && date < criteria.dateFrom) return false;
      if (criteria.dateTo && date > criteria.dateTo) return false;
    }

    return true;
  }

  /** 对外的单条匹配，自己会先规范化条件。 */
  function matchRecord(record, criteria) {
    return matchNormalized(record, normalizeCriteria(criteria));
  }

  /** 核心：返回符合全部条件的新数组，保持原顺序，不改动入参。 */
  function applyFilters(records, criteria) {
    if (!Array.isArray(records)) return [];
    var normalized = normalizeCriteria(criteria);
    var result = [];
    for (var i = 0; i < records.length; i++) {
      if (matchNormalized(records[i], normalized)) result.push(records[i]);
    }
    return result;
  }

  /* ============================ 统计辅助 ============================ */

  function summarize(records) {
    var list = Array.isArray(records) ? records : [];
    var income = 0;
    var expense = 0;
    for (var i = 0; i < list.length; i++) {
      var record = list[i];
      if (!record) continue;
      var amount = recordAmount(record);
      var type = normalizeType(record.type);
      if (type === 'income') income += amount;
      else if (type === 'expense') expense += amount;
    }
    return {
      count: list.length,
      income: round2(income),
      expense: round2(expense),
      balance: round2(income - expense)
    };
  }

  function groupByCategory(records) {
    var list = Array.isArray(records) ? records : [];
    var map = Object.create(null);

    for (var i = 0; i < list.length; i++) {
      var record = list[i];
      if (!record) continue;
      var category = trimStr(record.category) || '未分类';
      if (!map[category]) {
        map[category] = { category: category, count: 0, income: 0, expense: 0 };
      }
      var bucket = map[category];
      var amount = recordAmount(record);
      var type = normalizeType(record.type);
      bucket.count += 1;
      if (type === 'income') bucket.income += amount;
      else if (type === 'expense') bucket.expense += amount;
    }

    return Object.keys(map).map(function (key) {
      var item = map[key];
      return {
        category: item.category,
        count: item.count,
        income: round2(item.income),
        expense: round2(item.expense),
        total: round2(item.income + item.expense)
      };
    }).sort(function (a, b) {
      return b.total - a.total || a.category.localeCompare(b.category, 'zh-Hans-CN');
    });
  }

  function getCategories(records) {
    var list = Array.isArray(records) ? records : [];
    var seen = Object.create(null);
    var categories = [];
    for (var i = 0; i < list.length; i++) {
      var category = trimStr(list[i] && list[i].category);
      if (category && category !== 'all' && !seen[category]) {
        seen[category] = true;
        categories.push(category);
      }
    }
    categories.sort(function (a, b) { return a.localeCompare(b, 'zh-Hans-CN'); });
    return categories;
  }

  /* ============================ 条件描述 ============================ */

  /** 已生效条件 → [{ key, label }]，用于筛选标签展示。 */
  function activeChips(criteria) {
    var c = normalizeCriteria(criteria);
    var chips = [];

    if (c.type !== 'all') {
      chips.push({ key: 'type', label: '类型：' + (c.type === 'income' ? '收入' : '支出') });
    }
    if (c.category !== 'all') {
      chips.push({ key: 'category', label: '类别：' + c.category });
    }
    if (c.dateFrom || c.dateTo) {
      var range = c.dateFrom && c.dateTo
        ? c.dateFrom + ' 至 ' + c.dateTo
        : (c.dateFrom ? c.dateFrom + ' 起' : '截至 ' + c.dateTo);
      chips.push({ key: 'date', label: '日期：' + range });
    }
    if (c.amountMin !== null || c.amountMax !== null) {
      var amount = c.amountMin !== null && c.amountMax !== null
        ? formatMoney(c.amountMin) + ' ~ ' + formatMoney(c.amountMax)
        : (c.amountMin !== null ? '≥ ' + formatMoney(c.amountMin) : '≤ ' + formatMoney(c.amountMax));
      chips.push({ key: 'amount', label: '金额：' + amount });
    }
    if (c.keyword) {
      chips.push({ key: 'keyword', label: '关键词：' + c.keyword });
    }
    return chips;
  }

  function describeCriteria(criteria) {
    var chips = activeChips(criteria);
    return chips.length ? chips.map(function (chip) { return chip.label; }).join(' · ') : '全部账单';
  }

  function isDefaultCriteria(criteria) {
    var c = normalizeCriteria(criteria);
    return c.type === 'all' && c.category === 'all' && !c.dateFrom && !c.dateTo &&
      c.amountMin === null && c.amountMax === null && !c.keyword;
  }

  /** 唯一数据源：LedgerStorage（S7）。S5 只读，不直接操作 LocalStorage。 */
  var warnedMissingStorage = false;

  function defaultGetRecords() {
    var storage = root && root.LedgerStorage;
    if (storage && typeof storage.getRecords === 'function') {
      try {
        var records = storage.getRecords();
        return Array.isArray(records) ? records : [];
      } catch (err) {
        console.warn('[Ledger.Filter] LedgerStorage.getRecords() 读取失败：', err);
        return [];
      }
    }

    if (!warnedMissingStorage) {
      warnedMissingStorage = true;
      console.warn('[Ledger.Filter] 未找到 LedgerStorage，请确认已按规范加载 js/storage.js');
    }
    return [];
  }

  /* ============================ 筛选栏 UI ============================ */

  function resolveElement(target) {
    if (!target) return null;
    if (typeof target === 'string') {
      if (typeof document === 'undefined') return null;
      return document.querySelector(target);
    }
    if (typeof target === 'object' && target.nodeType === 1) return target;
    return null;
  }

  /** 在空容器里生成标准筛选栏（S1/S10 也可以自己写 HTML 后关掉 autoMount）。 */
  function mountFilterBar(container) {
    container.innerHTML = [
      '<form class="flt-bar" role="search" aria-label="账单筛选" novalidate>',
      '  <div class="flt-bar__head">',
      '    <p class="flt-bar__title">筛选账单</p>',
      '    <div class="flt-presets" role="group" aria-label="快捷日期范围">',
      '      <button type="button" class="flt-preset" data-filter-preset="all">全部</button>',
      '      <button type="button" class="flt-preset" data-filter-preset="thisMonth">本月</button>',
      '      <button type="button" class="flt-preset" data-filter-preset="last7">近 7 天</button>',
      '      <button type="button" class="flt-preset" data-filter-preset="last30">近 30 天</button>',
      '    </div>',
      '  </div>',
      '  <div class="flt-grid">',
      '    <label class="flt-field">',
      '      <span class="flt-field__label">收支类型</span>',
      '      <select class="flt-control" data-filter="type" aria-label="收支类型">',
      '        <option value="all">全部类型</option>',
      '        <option value="income">收入</option>',
      '        <option value="expense">支出</option>',
      '      </select>',
      '    </label>',
      '    <label class="flt-field">',
      '      <span class="flt-field__label">类别</span>',
      '      <select class="flt-control" data-filter="category" aria-label="账单类别">',
      '        <option value="all">全部类别</option>',
      '      </select>',
      '    </label>',
      '    <label class="flt-field">',
      '      <span class="flt-field__label">开始日期</span>',
      '      <input class="flt-control" type="date" data-filter="dateFrom" aria-label="开始日期">',
      '    </label>',
      '    <label class="flt-field">',
      '      <span class="flt-field__label">结束日期</span>',
      '      <input class="flt-control" type="date" data-filter="dateTo" aria-label="结束日期">',
      '    </label>',
      '    <label class="flt-field">',
      '      <span class="flt-field__label">金额下限</span>',
      '      <input class="flt-control" type="number" min="0" step="0.01" inputmode="decimal" data-filter="amountMin" aria-label="金额下限" placeholder="不限">',
      '    </label>',
      '    <label class="flt-field">',
      '      <span class="flt-field__label">金额上限</span>',
      '      <input class="flt-control" type="number" min="0" step="0.01" inputmode="decimal" data-filter="amountMax" aria-label="金额上限" placeholder="不限">',
      '    </label>',
      '    <label class="flt-field flt-field--wide">',
      '      <span class="flt-field__label">关键词</span>',
      '      <input class="flt-control" type="search" data-filter="keyword" aria-label="按备注或类别搜索" placeholder="搜索备注或类别，例如：午餐、交通">',
      '    </label>',
      '  </div>',
      '  <div class="flt-bar__foot">',
      '    <div class="flt-chips" data-filter-chips aria-live="polite"></div>',
      '    <button type="button" class="flt-reset" data-filter-reset>重置</button>',
      '  </div>',
      '  <p class="flt-error" data-filter-error role="alert" hidden></p>',
      '  <p class="flt-summary" data-filter-summary aria-live="polite"></p>',
      '</form>'
    ].join('\n');
    return container;
  }

  function createFilterController(options) {
    options = options || {};

    var rootEl = resolveElement(options.root);
    if (!rootEl) {
      throw new Error('[LedgerFilter] 找不到筛选容器，请检查 options.root');
    }
    rootEl.classList.add('flt-root');

    var autoMount = options.autoMount !== false;
    if (autoMount && !rootEl.querySelector('[data-filter]')) {
      mountFilterBar(rootEl);
    }

    var elements = {};
    FILTER_FIELDS.forEach(function (name) {
      elements[name] = rootEl.querySelector('[data-filter="' + name + '"]');
    });

    var missing = FILTER_FIELDS.filter(function (name) { return !elements[name]; });
    if (missing.length) {
      console.warn('[LedgerFilter] 缺少筛选控件：' + missing.join('、') + '，对应条件将被忽略。');
    }

    var errorEl = rootEl.querySelector('[data-filter-error]');
    var summaryEl = rootEl.querySelector('[data-filter-summary]');
    var chipsEl = rootEl.querySelector('[data-filter-chips]');
    var timer = null;
    var destroyed = false;
    var lastCategorySignature = null;

    function getDefaultCriteria() {
      return {
        type: DEFAULT_CRITERIA.type,
        category: DEFAULT_CRITERIA.category,
        dateFrom: DEFAULT_CRITERIA.dateFrom,
        dateTo: DEFAULT_CRITERIA.dateTo,
        amountMin: DEFAULT_CRITERIA.amountMin,
        amountMax: DEFAULT_CRITERIA.amountMax,
        keyword: DEFAULT_CRITERIA.keyword
      };
    }

    var lastCriteria = getDefaultCriteria();

    function readRecords() {
      var source = typeof options.getRecords === 'function' ? options.getRecords : defaultGetRecords;
      try {
        var list = source();
        return Array.isArray(list) ? list : [];
      } catch (err) {
        console.warn('[LedgerFilter] 读取账单失败，按空列表处理：', err);
        return [];
      }
    }

    function setField(name, value) {
      var el = elements[name];
      if (!el) return;
      el.value = value === null || value === undefined ? '' : String(value);
    }

    function readForm() {
      return {
        type: elements.type ? elements.type.value : 'all',
        category: elements.category ? elements.category.value : 'all',
        dateFrom: elements.dateFrom ? elements.dateFrom.value : '',
        dateTo: elements.dateTo ? elements.dateTo.value : '',
        amountMin: elements.amountMin ? elements.amountMin.value : '',
        amountMax: elements.amountMax ? elements.amountMax.value : '',
        keyword: elements.keyword ? elements.keyword.value : ''
      };
    }

    function resetFields() {
      FILTER_FIELDS.forEach(function (name) {
        setField(name, name === 'type' || name === 'category' ? 'all' : '');
      });
    }

    function showErrors(check) {
      FILTER_FIELDS.forEach(function (name) {
        var el = elements[name];
        if (!el) return;
        var message = check.errors[name];
        if (message) {
          el.classList.add('is-invalid');
          el.setAttribute('aria-invalid', 'true');
          el.title = message;
        } else {
          el.classList.remove('is-invalid');
          el.removeAttribute('aria-invalid');
          el.removeAttribute('title');
        }
      });

      if (!errorEl) return;
      if (check.valid) {
        errorEl.textContent = '';
        errorEl.hidden = true;
      } else {
        errorEl.textContent = check.message;
        errorEl.hidden = false;
      }
    }

    function syncCategories(records) {
      var select = elements.category;
      if (!select) return;

      var categories = getCategories(records);
      var current = select.value || 'all';
      if (current !== 'all' && categories.indexOf(current) === -1) {
        categories.push(current);
      }

      var signature = categories.join('\u0001');
      if (signature === lastCategorySignature) return;
      lastCategorySignature = signature;

      var html = ['<option value="all">全部类别</option>'];
      categories.forEach(function (category) {
        html.push('<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + '</option>');
      });
      select.innerHTML = html.join('');
      select.value = current;
      if (select.value !== current) select.value = 'all';
    }

    function renderChips(criteria) {
      if (!chipsEl) return;
      var chips = activeChips(criteria);
      if (!chips.length) {
        chipsEl.innerHTML = '<span class="flt-chip flt-chip--muted">全部账单</span>';
        return;
      }
      var html = chips.map(function (chip) {
        return '<span class="flt-chip">' + escapeHtml(chip.label) +
          '<button type="button" class="flt-chip__x" data-filter-clear="' + chip.key +
          '" aria-label="清除' + escapeHtml(chip.label) + '">×</button></span>';
      });
      html.push('<button type="button" class="flt-chip-clear" data-filter-clear="all">清除全部</button>');
      chipsEl.innerHTML = html.join('');
    }

    function renderSummary(records) {
      if (!summaryEl) return;
      var s = summarize(records);
      summaryEl.textContent = '共 ' + s.count + ' 笔 · 收入 ' + formatMoney(s.income) +
        ' · 支出 ' + formatMoney(s.expense) + ' · 结余 ' + formatMoney(s.balance);
    }

    function emit(reason) {
      if (destroyed) return;
      clearTimeout(timer);
      timer = null;

      var raw = readForm();
      var check = validateCriteria(raw);
      showErrors(check);
      if (!check.valid) return;

      var criteria = normalizeCriteria(raw);
      var all = readRecords();
      syncCategories(all);
      var filtered = applyFilters(all, criteria);

      lastCriteria = criteria;
      renderChips(criteria);
      renderSummary(filtered);

      if (typeof options.onChange === 'function') {
        try {
          options.onChange(filtered, criteria, { total: all.length, reason: reason });
        } catch (err) {
          console.error('[LedgerFilter] onChange 回调执行出错：', err);
        }
      }
    }

    function scheduleEmit() {
      clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        emit('input');
      }, options.debounceMs == null ? 280 : options.debounceMs);
    }

    function applyPreset(preset) {
      var now = new Date();
      if (preset === 'all') {
        setField('dateFrom', '');
        setField('dateTo', '');
        return;
      }

      var from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (preset === 'thisMonth') {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (preset === 'last7') {
        from.setDate(from.getDate() - 6);
      } else if (preset === 'last30') {
        from.setDate(from.getDate() - 29);
      }
      setField('dateFrom', formatDate(from));
      setField('dateTo', formatDate(now));
    }

    function clearField(key) {
      if (key === 'type') setField('type', 'all');
      else if (key === 'category') setField('category', 'all');
      else if (key === 'date') {
        setField('dateFrom', '');
        setField('dateTo', '');
      } else if (key === 'amount') {
        setField('amountMin', '');
        setField('amountMax', '');
      } else if (key === 'keyword') {
        setField('keyword', '');
      } else if (key === 'all') {
        resetFields();
      }
    }

    function reset() {
      resetFields();
      showErrors({ valid: true, errors: {}, message: '' });
      emit('reset');
    }

    function onSubmit(event) {
      event.preventDefault();
      emit('submit');
    }

    function onInput(event) {
      var el = event.target && event.target.closest ? event.target.closest('[data-filter]') : null;
      if (!el) return;
      var name = el.getAttribute('data-filter');
      if (name === 'keyword' || name === 'amountMin' || name === 'amountMax') {
        scheduleEmit();
      }
    }

    function onChange(event) {
      var el = event.target && event.target.closest ? event.target.closest('[data-filter]') : null;
      if (!el) return;
      clearTimeout(timer);
      timer = null;
      emit('change');
    }

    function onClick(event) {
      var target = event.target;
      if (!target || !target.closest) return;

      var preset = target.closest('[data-filter-preset]');
      if (preset) {
        applyPreset(preset.getAttribute('data-filter-preset'));
        emit('preset');
        return;
      }

      var clear = target.closest('[data-filter-clear]');
      if (clear) {
        clearField(clear.getAttribute('data-filter-clear'));
        emit('clear');
        return;
      }

      if (target.closest('[data-filter-reset]')) {
        reset();
      }
    }

    rootEl.addEventListener('submit', onSubmit);
    rootEl.addEventListener('input', onInput);
    rootEl.addEventListener('change', onChange);
    rootEl.addEventListener('click', onClick);

    syncCategories(readRecords());
    emit('init');

    return {
      version: VERSION,
      root: rootEl,

      /** 手动重新筛选（例如新增/删除账单后由外部调用）。 */
      apply: function () {
        emit('manual');
      },

      /** 数据变化后刷新：重新读取数据 + 类别下拉 + 结果。 */
      refresh: function () {
        emit('refresh');
      },

      reset: reset,

      /** 按条件 key 清除：type / category / date / amount / keyword / all。 */
      clear: function (key) {
        clearField(key || 'all');
        emit('clear');
      },

      getCriteria: function () {
        return normalizeCriteria(lastCriteria);
      },

      /** 当前数据源下、按当前条件的筛选结果。 */
      getFiltered: function () {
        return applyFilters(readRecords(), lastCriteria);
      },

      setCriteria: function (partial) {
        partial = partial || {};
        FILTER_FIELDS.forEach(function (name) {
          if (Object.prototype.hasOwnProperty.call(partial, name)) {
            setField(name, partial[name]);
          }
        });
        emit('set');
      },

      destroy: function () {
        destroyed = true;
        clearTimeout(timer);
        rootEl.removeEventListener('submit', onSubmit);
        rootEl.removeEventListener('input', onInput);
        rootEl.removeEventListener('change', onChange);
        rootEl.removeEventListener('click', onClick);
      }
    };
  }

  /* ==================== V1.0 规范接口适配层 ==================== */

  var activeController = null;
  var currentConditions = null;

  function createDefaultConditions() {
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

  function cloneConditions(conditions) {
    var source = conditions || createDefaultConditions();
    return {
      type: source.type,
      category: source.category,
      startDate: source.startDate,
      endDate: source.endDate,
      keyword: source.keyword,
      minAmount: source.minAmount === undefined ? null : source.minAmount,
      maxAmount: source.maxAmount === undefined ? null : source.maxAmount
    };
  }

  /** 规范条件（startDate/endDate）→ 内部条件（dateFrom/dateTo）。 */
  function conditionsToCriteria(conditions) {
    conditions = conditions || {};
    return {
      type: conditions.type,
      category: conditions.category,
      dateFrom: conditions.startDate !== undefined ? conditions.startDate : conditions.dateFrom,
      dateTo: conditions.endDate !== undefined ? conditions.endDate : conditions.dateTo,
      amountMin: conditions.minAmount !== undefined ? conditions.minAmount : conditions.amountMin,
      amountMax: conditions.maxAmount !== undefined ? conditions.maxAmount : conditions.amountMax,
      keyword: conditions.keyword
    };
  }

  /** 内部条件 → 规范条件；金额字段作为 S5 扩展一起返回。 */
  function criteriaToConditions(criteria) {
    var normalized = normalizeCriteria(criteria);
    return {
      type: normalized.type,
      category: normalized.category,
      startDate: normalized.dateFrom,
      endDate: normalized.dateTo,
      keyword: normalized.keyword,
      minAmount: normalized.amountMin,
      maxAmount: normalized.amountMax
    };
  }

  function getCurrentConditions() {
    if (activeController) {
      currentConditions = criteriaToConditions(activeController.getCriteria());
    }
    return cloneConditions(currentConditions);
  }

  /** 创建控制器并让它成为 Ledger.Filter 的当前实例。 */
  function createTrackedController(options) {
    options = options || {};
    var userOnChange = options.onChange;
    var merged = {};
    Object.keys(options).forEach(function (key) {
      merged[key] = options[key];
    });

    merged.onChange = function (records, criteria, meta) {
      currentConditions = criteriaToConditions(criteria);

      if (typeof userOnChange === 'function') {
        try {
          userOnChange(records, criteria, meta);
        } catch (err) {
          console.error('[Ledger.Filter] onChange 回调执行出错：', err);
        }
      }

      var namespace = root && root.Ledger && root.Ledger.Filter;
      if (namespace && typeof namespace.onChange === 'function') {
        try {
          namespace.onChange(records, cloneConditions(currentConditions), meta);
        } catch (err) {
          console.error('[Ledger.Filter] Ledger.Filter.onChange 回调执行出错：', err);
        }
      }
    };

    activeController = createFilterController(merged);
    currentConditions = criteriaToConditions(activeController.getCriteria());
    return activeController;
  }

  function installLedgerFilterNamespace() {
    if (!root || typeof root !== 'object') return;

    root.Ledger = root.Ledger || {};
    root.Ledger.Filter = {
      /** V1.0：按条件筛选，返回新数组，不修改原数据。 */
      apply: function (records, conditions) {
        var effective = conditions === undefined ? getCurrentConditions() : conditions;
        return applyFilters(records, conditionsToCriteria(effective));
      },

      /** V1.0：重置筛选条件；已挂载 UI 时同步重置表单。 */
      reset: function () {
        if (activeController) {
          activeController.reset();
        } else {
          currentConditions = createDefaultConditions();
        }
      },

      /** V1.0：返回当前筛选条件（金额为扩展字段）。 */
      getConditions: function () {
        return getCurrentConditions();
      },

      /* 以下为接入扩展，不属于 V1.0 必选接口 */
      init: function (options) {
        return createTrackedController(options);
      },
      refresh: function () {
        if (activeController) activeController.refresh();
      },
      getController: function () {
        return activeController;
      },
      onChange: null
    };
  }

  /** 页面存在 #filter-container 时自动初始化，S1 无需额外调用。 */
  function autoInitFilter() {
    if (activeController || typeof document === 'undefined') return;
    var container = document.getElementById('filter-container');
    if (!container) return;
    createTrackedController({
      root: container,
      getRecords: defaultGetRecords
    });
  }

  installLedgerFilterNamespace();

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoInitFilter);
    } else {
      autoInitFilter();
    }

    document.addEventListener('ledger:updated', function () {
      if (activeController) activeController.refresh();
    });
  }

  /* ============================== 导出 ============================== */

  return {
    VERSION: VERSION,
    STORAGE_KEY: STORAGE_KEY,
    FILTER_FIELDS: FILTER_FIELDS.slice(),
    DEFAULT_CRITERIA: DEFAULT_CRITERIA,

    getDefaultCriteria: function () {
      return {
        type: 'all',
        category: 'all',
        dateFrom: '',
        dateTo: '',
        amountMin: null,
        amountMax: null,
        keyword: ''
      };
    },
    createDefaultConditions: createDefaultConditions,
    conditionsToCriteria: conditionsToCriteria,
    criteriaToConditions: criteriaToConditions,
    normalizeCriteria: normalizeCriteria,
    normalizeType: normalizeType,
    normalizeDateStr: normalizeDateStr,
    isValidDateStr: isValidDateStr,
    validateCriteria: validateCriteria,
    matchRecord: matchRecord,
    applyFilters: applyFilters,
    summarize: summarize,
    groupByCategory: groupByCategory,
    getCategories: getCategories,
    describeCriteria: describeCriteria,
    isDefaultCriteria: isDefaultCriteria,
    formatMoney: formatMoney,
    toAmount: toAmount,
    mountFilterBar: mountFilterBar,
    createFilterController: createFilterController
  };
});
