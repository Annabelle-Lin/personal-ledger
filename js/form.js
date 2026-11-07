/**
 * form.js —— 记账表单模块（S2：记账表单）
 *
 * 依据《个人记账本系统开发规范 V1.0》：
 *   - 命名空间：Ledger.Form
 *   - 必须提供：render(container) / init() / validate(fields) /
 *               validateAmount(value) / buildRecord(fields)
 *   - 新增记录时调用 LedgerStorage.addRecord(record)（S7 统一存储入口），
 *     本模块禁止直接操作 localStorage。
 *   - 分类 / 存储键 / 记录类型统一取自 constants.js 的 LedgerConstants。
 *
 * 新增流程：读取表单 → 校验金额/类型/分类/日期 → 构建 Record →
 *           LedgerStorage.addRecord(record) → 触发 ledger:updated 事件。
 */
(function (global) {
  'use strict';

  // ---------- 统一常量（来自 constants.js；未加载时用规范默认值兜底，便于独立调试）----------
  var CONST = (typeof LedgerConstants !== 'undefined') ? LedgerConstants : {};
  var RECORD_TYPES = CONST.RECORD_TYPES || { INCOME: 'income', EXPENSE: 'expense' };
  var INCOME_CATEGORIES = CONST.INCOME_CATEGORIES || ['工资', '兼职', '奖学金', '生活费', '红包', '其他'];
  var EXPENSE_CATEGORIES = CONST.EXPENSE_CATEGORIES || ['餐饮', '交通', '购物', '娱乐', '学习', '医疗', '居住', '其他'];

  var TYPE_LABEL = {};
  TYPE_LABEL[RECORD_TYPES.EXPENSE] = '支出';
  TYPE_LABEL[RECORD_TYPES.INCOME] = '收入';

  // ---------- 表单元素 ID（S1 的 index.html 按此对象提供元素）----------
  var IDS = {
    form: 'ledger-form',
    type: 'ledger-type',
    amount: 'ledger-amount',
    category: 'ledger-category',
    date: 'ledger-date',
    note: 'ledger-note',
    message: 'ledger-form-message'
  };

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
    return { valid: true, value: n };
  }

  // 日期合法性：格式 YYYY-MM-DD，且是真实存在的日历日期。
  function isValidDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  // 分类合法性：必须属于对应收支类型的分类数组（避免支出选“工资”、收入选“餐饮”）。
  function isValidCategory(type, category) {
    var list = (type === RECORD_TYPES.INCOME) ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    return list.indexOf(category) !== -1;
  }

  function validate(fields) {
    var errors = {};
    var record = {};

    // type：必填，且只能是 income / expense
    if (fields.type !== RECORD_TYPES.INCOME && fields.type !== RECORD_TYPES.EXPENSE) {
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

    // category：必填 + 必须属于对应收支类型的分类
    var cat = String(fields.category == null ? '' : fields.category).trim();
    if (!cat) {
      errors.category = '请选择类别';
    } else if (record.type && !isValidCategory(record.type, cat)) {
      errors.category = '类别与收支类型不匹配';
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
    var type = typeEl.value || RECORD_TYPES.EXPENSE;
    var list = (type === RECORD_TYPES.INCOME) ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
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
      // 统一存储入口：S7 的 LedgerStorage，禁止本模块直接写 localStorage
      if (typeof LedgerStorage === 'undefined' || typeof LedgerStorage.addRecord !== 'function') {
        throw new Error('LedgerStorage 未加载，请确认 storage.js 已按顺序引入');
      }
      LedgerStorage.addRecord(result.record);

      showMessage('success', TYPE_LABEL[result.record.type] + '记录已保存：' +
        result.record.amount.toFixed(2) + ' 元（' + result.record.category + '）');
      resetForm();

      // 通知其它模块刷新（S3/S4/S5/S6 监听）
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
  var boundForm = null;

  function init() {
    var form = $(IDS.form);
    if (!form) return false;

    // 防止重复初始化：同一表单只绑定一次；render() 会生成新表单元素，则重新绑定
    if (form === boundForm) return true;

    form.addEventListener('submit', onSubmit);

    var typeEl = $(IDS.type);
    if (typeEl) typeEl.addEventListener('change', renderCategories);

    var dateEl = $(IDS.date);
    if (dateEl && !dateEl.value) dateEl.value = today();

    renderCategories();
    clearErrors();
    showMessage('', '');
    boundForm = form;
    return true;
  }

  // ---------- 标准表单模板（若 S1 未手写 HTML）----------
  var DEFAULT_HTML =
    '<form id="' + IDS.form + '" novalidate>' +
      '<div class="form-row">' +
        '<label for="' + IDS.type + '">类型</label>' +
        '<select id="' + IDS.type + '">' +
          '<option value="' + RECORD_TYPES.EXPENSE + '">支出</option>' +
          '<option value="' + RECORD_TYPES.INCOME + '">收入</option>' +
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

  // 注意：render() 会用标准表单覆盖 container 的原有 HTML。
  // 若 S1 已在 index.html 手写表单，请改调 Ledger.Form.init()，不要调用 render()。
  function render(container) {
    var el = typeof container === 'string' ? $(container) : container;
    if (!el) return false;
    el.innerHTML = DEFAULT_HTML;
    return init();
  }

  // ---------- 导出 ----------
  global.Ledger = global.Ledger || {};
  global.Ledger.Form = {
    IDS: IDS,
    render: render,
    init: init,
    validate: validate,
    validateAmount: validateAmount,
    buildRecord: buildRecord
  };
})(window);
