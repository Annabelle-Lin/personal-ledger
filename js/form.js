/**
 * form.js —— 记账表单模块（S2：记账表单）
 *
 * 职责：
 *   1. 收入 / 支出新增表单
 *   2. 必填校验（类型、金额、类别、日期）
 *   3. 金额合法性校验（正数、最多两位小数、无货币符号/负号/科学计数法）
 *   4. 新增记录（写入 LocalStorage）
 *
 * 与其它模块的约定（见分工方案第三节）：
 *   - 统一数据结构：{ id, type, amount, category, date, note }
 *       type:   "income" | "expense"
 *       amount: 数字（如 25.00），不能存成带货币符号的字符串
 *       date:   "YYYY-MM-DD"
 *   - 统一存储键：ledger_records
 *   - 存储接口：优先调用 storage.js 暴露的 Ledger.Storage
 *       getRecords() / saveRecords(records) / addRecord(record) / deleteRecord(id)
 *     storage.js（S7）尚未集成时，本文件用同键的内置兼容实现，保证 S2 能独立联调。
 *   - 新增成功后，向 document 派发 "ledger:updated" 自定义事件，
 *     供账单列表(records.js)、财务统计(finance.js)、图表(charts.js)刷新。
 *
 * 对外接口（全局命名空间 Ledger.Form）：
 *   - Ledger.Form.render(container)   // 将标准表单注入到指定容器并绑定事件
 *   - Ledger.Form.init()              // 若 index.html 已手写表单，仅绑定事件
 *   - Ledger.Form.validate(fields)    // 校验，返回 { valid, errors, record }
 *   - Ledger.Form.buildRecord(fields) // 校验并组装记录（含 id），失败返回 null
 */
(function (global) {
  'use strict';

  // ---------- 存储键 ----------
  var STORAGE_KEY = 'ledger_records';

  // ---------- 内置兼容存储（仅当 storage.js 未提供 Ledger.Storage 时使用）----------
  // 与 storage.js 使用同一个 localStorage 键，后续可无缝替换，不会产生两套数据。
  var fallbackStorage = {
    getRecords: function () {
      try {
        var raw = global.localStorage.getItem(STORAGE_KEY);
        var data = raw ? JSON.parse(raw) : [];
        return Array.isArray(data) ? data : [];
      } catch (e) {
        return [];
      }
    },
    saveRecords: function (records) {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(records || []));
    },
    addRecord: function (record) {
      var records = this.getRecords();
      records.push(record);
      this.saveRecords(records);
      return record;
    },
    deleteRecord: function (id) {
      var records = this.getRecords().filter(function (r) { return r.id !== id; });
      this.saveRecords(records);
    }
  };

  // 每次调用时再解析，这样即使 storage.js 在 form.js 之后加载也能正确接管。
  function storage() {
    if (global.Ledger && global.Ledger.Storage) {
      return global.Ledger.Storage;
    }
    return fallbackStorage;
  }

  // ---------- 表单字段约定 ----------
  // 若 S1 在 index.html 里手写表单，请按下列 id 命名；也可直接调用 render() 注入标准表单。
  var IDS = {
    form: 'ledger-form',
    type: 'ledger-type',
    amount: 'ledger-amount',
    category: 'ledger-category',
    date: 'ledger-date',
    note: 'ledger-note',
    message: 'ledger-form-message'
  };

  var CATEGORIES = {
    expense: ['餐饮', '交通', '购物', '居住', '娱乐', '医疗', '教育', '其他'],
    income: ['工资', '奖金', '理财', '兼职', '其他']
  };

  var TYPE_LABEL = { expense: '支出', income: '收入' };

  // ---------- 工具函数 ----------
  function $(id) {
    return document.getElementById(id);
  }

  function generateId() {
    return 'record_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function today() {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // ---------- 校验 ----------
  // 金额合法性：正整数或最多两位小数；不允许空、负、0、货币符号、科学计数法。
  function validateAmount(value) {
    var str = String(value == null ? '' : value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(str)) {
      return { valid: false, msg: '金额必须为正数，最多两位小数' };
    }
    var n = Number(str);
    if (!(n > 0)) {
      return { valid: false, msg: '金额必须大于 0' };
    }
    if (n > 999999999) {
      return { valid: false, msg: '金额超出合理范围' };
    }
    return { valid: true, value: Math.round(n * 100) / 100 };
  }

  // 日期合法性：格式 YYYY-MM-DD，且是真实存在的日历日期。
  function isValidDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  function validate(fields) {
    var errors = {};
    var record = {};

    // type：必填，且只能是 income 或 expense
    if (fields.type !== 'income' && fields.type !== 'expense') {
      errors.type = '请选择收入或支出';
    } else {
      record.type = fields.type;
    }

    // amount：必填 + 合法性
    var amt = validateAmount(fields.amount);
    if (!amt.valid) {
      errors.amount = amt.msg;
    } else {
      record.amount = amt.value;
    }

    // category：必填
    var cat = String(fields.category == null ? '' : fields.category).trim();
    if (!cat) {
      errors.category = '请选择类别';
    } else {
      record.category = cat;
    }

    // date：必填 + 格式
    var d = String(fields.date == null ? '' : fields.date).trim();
    if (!d) {
      errors.date = '请选择日期';
    } else if (!isValidDate(d)) {
      errors.date = '日期格式应为 YYYY-MM-DD';
    } else {
      record.date = d;
    }

    // note：选填
    record.note = String(fields.note == null ? '' : fields.note).trim();

    return {
      valid: Object.keys(errors).length === 0,
      errors: errors,
      record: record
    };
  }

  // ---------- 组装记录 ----------
  function buildRecord(fields) {
    var result = validate(fields);
    if (!result.valid) return null;
    result.record.id = generateId();
    return result.record;
  }

  // ---------- 表单交互 ----------
  function showMessage(type, text) {
    var box = $(IDS.message);
    if (!box) return;
    box.textContent = text || '';
    box.className = 'form-message ' + type;
    box.style.display = text ? 'block' : 'none';
  }

  function setFieldError(id, hasError) {
    var el = $(id);
    if (!el) return;
    if (hasError) {
      el.classList.add('error');
    } else {
      el.classList.remove('error');
    }
  }

  function clearErrors() {
    ['type', 'amount', 'category', 'date'].forEach(function (key) {
      setFieldError(IDS[key], false);
    });
  }

  function renderCategories() {
    var typeEl = $(IDS.type);
    var catEl = $(IDS.category);
    if (!typeEl || !catEl) return;
    var type = typeEl.value || 'expense';
    var list = CATEGORIES[type] || CATEGORIES.expense;
    catEl.innerHTML = '';
    list.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      catEl.appendChild(opt);
    });
  }

  function readFields() {
    var typeEl = $(IDS.type);
    return {
      type: typeEl ? typeEl.value : '',
      amount: ($(IDS.amount) || {}).value,
      category: ($(IDS.category) || {}).value,
      date: ($(IDS.date) || {}).value,
      note: ($(IDS.note) || {}).value
    };
  }

  function onSubmit(e) {
    if (e) e.preventDefault();
    clearErrors();

    var fields = readFields();
    var result = validate(fields);

    if (!result.valid) {
      Object.keys(result.errors).forEach(function (key) {
        setFieldError(IDS[key], true);
      });
      var firstKey = Object.keys(result.errors)[0];
      showMessage('error', result.errors[firstKey]);
      return;
    }

    result.record.id = generateId();
    try {
      storage().addRecord(result.record);
      showMessage('success', TYPE_LABEL[result.record.type] + '记录已保存：' +
        result.record.amount.toFixed(2) + ' 元（' + result.record.category + '）');
      resetForm();

      // 通知其它模块刷新
      var evt;
      try {
        evt = new CustomEvent('ledger:updated', { detail: { record: result.record } });
      } catch (err) {
        evt = document.createEvent('Event');
        evt.initEvent('ledger:updated', true, true);
      }
      document.dispatchEvent(evt);
    } catch (err) {
      showMessage('error', '保存失败：' + (err && err.message ? err.message : err));
    }
  }

  function resetForm() {
    var form = $(IDS.form);
    if (form && typeof form.reset === 'function') form.reset();
    var dateEl = $(IDS.date);
    if (dateEl) dateEl.value = today();
    renderCategories();
  }

  // ---------- 初始化 ----------
  function init() {
    var form = $(IDS.form);
    if (!form) return false;

    form.addEventListener('submit', onSubmit);

    var typeEl = $(IDS.type);
    if (typeEl) typeEl.addEventListener('change', renderCategories);

    var dateEl = $(IDS.date);
    if (dateEl && !dateEl.value) dateEl.value = today();

    renderCategories();
    clearErrors();
    showMessage('', '');
    return true;
  }

  // ---------- 标准表单模板（若 S1 未手写 HTML）----------
  // 金额用 type="text" + inputmode="decimal"，便于校验时给出精确的金额错误提示。
  var DEFAULT_HTML =
    '<form id="' + IDS.form + '" novalidate>' +
      '<div class="form-row">' +
        '<label for="' + IDS.type + '">类型</label>' +
        '<select id="' + IDS.type + '">' +
          '<option value="expense">支出</option>' +
          '<option value="income">收入</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-row">' +
        '<label for="' + IDS.amount + '">金额</label>' +
        '<input type="text" id="' + IDS.amount + '" inputmode="decimal" placeholder="0.00">' +
      '</div>' +
      '<div class="form-row">' +
        '<label for="' + IDS.category + '">类别</label>' +
        '<select id="' + IDS.category + '"></select>' +
      '</div>' +
      '<div class="form-row">' +
        '<label for="' + IDS.date + '">日期</label>' +
        '<input type="date" id="' + IDS.date + '">' +
      '</div>' +
      '<div class="form-row">' +
        '<label for="' + IDS.note + '">备注</label>' +
        '<input type="text" id="' + IDS.note + '" placeholder="选填">' +
      '</div>' +
      '<p id="' + IDS.message + '" class="form-message"></p>' +
      '<button type="submit">保存记录</button>' +
    '</form>';

  function render(container) {
    var el = typeof container === 'string' ? $(container) : container;
    if (!el) return false;
    el.innerHTML = DEFAULT_HTML;
    return init();
  }

  // ---------- 导出 ----------
  global.Ledger = global.Ledger || {};
  global.Ledger.Form = {
    STORAGE_KEY: STORAGE_KEY,
    CATEGORIES: CATEGORIES,
    IDS: IDS,
    render: render,
    init: init,
    validate: validate,
    validateAmount: validateAmount,
    buildRecord: buildRecord
  };
})(window);
