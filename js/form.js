// v2 回归（2026-11-07）：本模块在 v2 中无需改动，已与 develop 对齐复核。
/**
 * form.js —— 记账表单模块（S2）
 *
 * 依据《个人记账本系统开发规范 V1.0》第 5 节：
 *   - 命名空间：Ledger.Form
 *   - 必须接口：render(container) / init() / validate(fields) /
 *               validateAmount(value) / buildRecord(fields)
 *   - 新增记录必须调用 LedgerStorage.addRecord()（S7 唯一存储入口），
 *     本模块不直接操作 localStorage。
 *   - 分类、收支类型统一取自 constants.js 的 LedgerConstants。
 *
 * 交互说明：
 *   1. 收支类型用分段按钮，值写入隐藏域 #ledger-type；
 *   2. 类别用图标按钮墙，值写入隐藏域 #ledger-category；
 *   3. 金额、日期逐字段校验，错误直接显示在字段下方；
 *   4. Ctrl / ⌘ + Enter 可直接保存；
 *   5. 保存成功后保留类型 / 类别 / 日期，只清空金额与备注，方便连续记账。
 */
(function (global) {
  'use strict';

  var CONST = global.LedgerConstants || {};
  var RECORD_TYPES = CONST.RECORD_TYPES || { INCOME: 'income', EXPENSE: 'expense' };
  var INCOME_CATEGORIES = CONST.INCOME_CATEGORIES ||
    ['工资', '兼职', '奖学金', '生活费', '红包', '其他'];
  var EXPENSE_CATEGORIES = CONST.EXPENSE_CATEGORIES ||
    ['餐饮', '交通', '购物', '娱乐', '学习', '医疗', '居住', '其他'];

  var CATEGORY_ICONS = {
    '餐饮': '🍜', '交通': '🚌', '购物': '🛍️', '娱乐': '🎮',
    '学习': '📚', '医疗': '💊', '居住': '🏠', '其他': '📦',
    '工资': '💰', '兼职': '💵', '奖学金': '🎓', '生活费': '💳', '红包': '🧧'
  };

  var TYPE_LABEL = {};
  TYPE_LABEL[RECORD_TYPES.EXPENSE] = '支出';
  TYPE_LABEL[RECORD_TYPES.INCOME] = '收入';

  /** 表单元素 ID（S1 的 index.html 按此对象提供元素，本模块 render() 会自动生成） */
  var IDS = {
    form: 'ledger-form',
    type: 'ledger-type',
    amount: 'ledger-amount',
    category: 'ledger-category',
    chips: 'ledger-category-chips',
    date: 'ledger-date',
    note: 'ledger-note',
    message: 'ledger-form-message',
    submit: 'ledger-submit'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  function categoriesOf(type) {
    return type === RECORD_TYPES.INCOME ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  }

  function generateId() {
    return 'record_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ------------------------------ 校验 ------------------------------ */

  /** 金额：正数、最多两位小数，拒绝空值/负数/0/字母/科学计数法/货币符号 */
  function validateAmount(value) {
    var str = String(value == null ? '' : value).trim();
    if (!str) return { valid: false, msg: '请输入金额' };
    if (!/^\d+(\.\d{1,2})?$/.test(str)) {
      return { valid: false, msg: '金额必须为正数，最多两位小数' };
    }
    var n = Number(str);
    if (!(n > 0)) return { valid: false, msg: '金额必须大于 0' };
    if (n > 999999999) return { valid: false, msg: '金额超出合理范围' };
    return { valid: true, value: n };
  }

  function isValidDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  function isValidCategory(type, category) {
    return categoriesOf(type).indexOf(category) !== -1;
  }

  /**
   * 校验表单字段，返回 { valid, errors, record }
   * @param {{type:string, amount:string, category:string, date:string, note:string}} fields
   */
  function validate(fields) {
    fields = fields || {};
    var errors = {};
    var record = {};

    if (fields.type !== RECORD_TYPES.INCOME && fields.type !== RECORD_TYPES.EXPENSE) {
      errors.type = '请选择收入或支出';
    } else {
      record.type = fields.type;
    }

    var amt = validateAmount(fields.amount);
    if (!amt.valid) errors.amount = amt.msg;
    else record.amount = amt.value;

    var cat = String(fields.category == null ? '' : fields.category).trim();
    if (!cat) {
      errors.category = '请选择类别';
    } else if (record.type && !isValidCategory(record.type, cat)) {
      errors.category = '类别与收支类型不匹配';
    } else {
      record.category = cat;
    }

    var d = String(fields.date == null ? '' : fields.date).trim();
    if (!d) {
      errors.date = '请选择日期';
    } else if (!isValidDate(d)) {
      errors.date = '日期格式应为 YYYY-MM-DD，且必须是真实日期';
    } else {
      record.date = d;
    }

    record.note = String(fields.note == null ? '' : fields.note).trim().slice(0, 60);

    return { valid: Object.keys(errors).length === 0, errors: errors, record: record };
  }

  function buildRecord(fields) {
    var result = validate(fields);
    if (!result.valid) return null;
    result.record.id = generateId();
    return result.record;
  }

  /* ------------------------------ 表单交互 ------------------------------ */

  function showMessage(type, text) {
    var box = $(IDS.message);
    if (!box) return;
    box.textContent = text || '';
    box.className = 'form-message' + (text ? ' ' + type : '');
  }

  function clearFieldError(name) {
    var el = $(IDS[name]);
    if (el) el.classList.remove('is-invalid');
    var box = document.querySelector('[data-error-for="' + name + '"]');
    if (box) box.textContent = '';
  }

  function clearErrors() {
    ['amount', 'category', 'date', 'type'].forEach(clearFieldError);
  }

  function showErrors(errors) {
    Object.keys(errors).forEach(function (key) {
      var el = $(IDS[key]);
      if (el) el.classList.add('is-invalid');
      if (key === 'amount') {
        var wrap = document.querySelector('.amount-input');
        if (wrap) wrap.classList.add('is-invalid');
      }
      var box = document.querySelector('[data-error-for="' + key + '"]');
      if (box) box.textContent = errors[key];
    });
  }

  function renderTypeButtons() {
    var hidden = $(IDS.type);
    if (!hidden) return;
    var type = hidden.value || RECORD_TYPES.EXPENSE;
    var buttons = document.querySelectorAll('[data-form-type]');
    for (var i = 0; i < buttons.length; i++) {
      var active = buttons[i].getAttribute('data-form-type') === type;
      buttons[i].classList.toggle('is-active', active);
      buttons[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    var group = document.querySelector('.ledger-form .segmented');
    if (group) group.setAttribute('data-active', type);
  }

  function renderCategories() {
    var hidden = $(IDS.category);
    var chips = $(IDS.chips);
    var typeEl = $(IDS.type);
    if (!chips || !hidden || !typeEl) return;

    var type = typeEl.value || RECORD_TYPES.EXPENSE;
    var list = categoriesOf(type);
    var current = hidden.value;

    // 切换收支类型后，原类别可能不在新列表里，回退到第一项
    if (list.indexOf(current) === -1) current = list[0];
    hidden.value = current;

    var html = '';
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      html += '<button type="button" class="chip' + (c === current ? ' is-active' : '') +
        '" data-form-category="' + c + '" aria-pressed="' + (c === current) + '">' +
        '<span class="chip-icon" aria-hidden="true">' + (CATEGORY_ICONS[c] || '📝') + '</span>' +
        '<span>' + c + '</span></button>';
    }
    chips.innerHTML = html;
  }

  function setType(type) {
    var hidden = $(IDS.type);
    if (!hidden) return;
    hidden.value = type;
    renderTypeButtons();
    renderCategories();
    clearFieldError('type');
    updateSubmitLabel();
  }

  function setCategory(category) {
    var hidden = $(IDS.category);
    if (!hidden) return;
    hidden.value = category;
    var chips = document.querySelectorAll('[data-form-category]');
    for (var i = 0; i < chips.length; i++) {
      var active = chips[i].getAttribute('data-form-category') === category;
      chips[i].classList.toggle('is-active', active);
      chips[i].setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    clearFieldError('category');
  }

  function updateSubmitLabel() {
    var btn = $(IDS.submit);
    var typeEl = $(IDS.type);
    if (!btn || !typeEl) return;
    var isIncome = typeEl.value === RECORD_TYPES.INCOME;
    btn.textContent = isIncome ? '保存这笔收入' : '保存这笔支出';
    btn.classList.toggle('btn-primary', !isIncome);
    btn.classList.toggle('btn-submit-income', isIncome);
  }

  function readFields() {
    var typeEl = $(IDS.type);
    var amountEl = $(IDS.amount);
    var catEl = $(IDS.category);
    var dateEl = $(IDS.date);
    var noteEl = $(IDS.note);
    return {
      type: typeEl ? typeEl.value : '',
      amount: amountEl ? amountEl.value : '',
      category: catEl ? catEl.value : '',
      date: dateEl ? dateEl.value : '',
      note: noteEl ? noteEl.value : ''
    };
  }

  function resetForm() {
    var amountEl = $(IDS.amount);
    var noteEl = $(IDS.note);
    if (amountEl) amountEl.value = '';
    if (noteEl) noteEl.value = '';
    clearErrors();
    if (amountEl) amountEl.focus();
  }

  function onSubmit(event) {
    if (event) event.preventDefault();
    clearErrors();

    var fields = readFields();
    var result = validate(fields);

    if (!result.valid) {
      showErrors(result.errors);
      showMessage('error', result.errors[Object.keys(result.errors)[0]]);
      var first = $(IDS[Object.keys(result.errors)[0]]);
      if (first) first.focus();
      return;
    }

    result.record.id = generateId();

    try {
      if (!global.LedgerStorage || typeof global.LedgerStorage.addRecord !== 'function') {
        throw new Error('LedgerStorage 未加载，请检查 storage.js 的引入顺序');
      }
      // 统一存储入口；ledger:updated 由 storage.js 统一派发
      global.LedgerStorage.addRecord(result.record);

      showMessage('success', TYPE_LABEL[result.record.type] + ' ' +
        result.record.amount.toFixed(2) + ' 元（' + result.record.category +
        ' · ' + result.record.date + '）已记录');
      resetForm();
    } catch (err) {
      showMessage('error', '保存失败：' + (err && err.message ? err.message : err));
    }
  }

  /* ------------------------------ 初始化 ------------------------------ */

  var boundForm = null;

  function onClick(event) {
    var target = event.target;
    if (!target || !target.closest) return;

    var typeBtn = target.closest('[data-form-type]');
    if (typeBtn) {
      setType(typeBtn.getAttribute('data-form-type'));
      return;
    }

    var catBtn = target.closest('[data-form-category]');
    if (catBtn) {
      setCategory(catBtn.getAttribute('data-form-category'));
    }
  }

  function onKeydown(event) {
    var key = event.key || '';
    if ((event.ctrlKey || event.metaKey) && (key === 'Enter' || key === 'NumpadEnter')) {
      event.preventDefault();
      onSubmit(event);
    }
  }

  function init() {
    var form = $(IDS.form);
    if (!form) return false;
    if (form === boundForm) return true;

    form.addEventListener('submit', onSubmit);
    form.addEventListener('click', onClick);
    form.addEventListener('keydown', onKeydown);

    // 输入时即时清除该字段的错误提示
    form.addEventListener('input', function (event) {
      var el = event.target;
      if (!el || !el.id) return;
      var name = null;
      if (el.id === IDS.amount) name = 'amount';
      else if (el.id === IDS.date) name = 'date';
      if (name) {
        clearFieldError(name);
        if (name === 'amount') {
          var wrap = document.querySelector('.amount-input');
          if (wrap) wrap.classList.remove('is-invalid');
        }
      }
      // 用户重新输入后，旧的错误/成功提示不再适用
      showMessage('', '');
    });

    var dateEl = $(IDS.date);
    if (dateEl && !dateEl.value) dateEl.value = today();

    renderTypeButtons();
    renderCategories();
    updateSubmitLabel();
    boundForm = form;
    return true;
  }

  /* ------------------------------ 模板 ------------------------------ */

  var TEMPLATE =
    '<form id="' + IDS.form + '" class="ledger-form" novalidate autocomplete="off">' +
      '<div class="segmented segmented-block" role="group" aria-label="收支类型" data-active="expense">' +
        '<button type="button" class="seg-btn is-active" data-form-type="expense" aria-pressed="true">支出</button>' +
        '<button type="button" class="seg-btn" data-form-type="income" aria-pressed="false">收入</button>' +
      '</div>' +
      '<input type="hidden" id="' + IDS.type + '" value="expense">' +

      '<div class="field field-amount">' +
        '<label class="field-label" for="' + IDS.amount + '">金额</label>' +
        '<div class="amount-input">' +
          '<span class="amount-prefix" aria-hidden="true">¥</span>' +
          '<input id="' + IDS.amount + '" class="input" type="text" inputmode="decimal" ' +
                 'placeholder="0.00" aria-describedby="' + IDS.message + '">' +
        '</div>' +
        '<p class="field-error" data-error-for="amount"></p>' +
      '</div>' +

      '<div class="field">' +
        '<span class="field-label">类别</span>' +
        '<div class="chip-grid" id="' + IDS.chips + '" role="group" aria-label="账单类别"></div>' +
        '<input type="hidden" id="' + IDS.category + '" value="">' +
        '<p class="field-error" data-error-for="category"></p>' +
      '</div>' +

      '<div class="field-row">' +
        '<div class="field">' +
          '<label class="field-label" for="' + IDS.date + '">日期</label>' +
          '<input id="' + IDS.date + '" class="input" type="date">' +
          '<p class="field-error" data-error-for="date"></p>' +
        '</div>' +
      '</div>' +

      '<div class="field">' +
        '<label class="field-label" for="' + IDS.note + '">备注</label>' +
        '<input id="' + IDS.note + '" class="input" type="text" maxlength="60" ' +
               'placeholder="选填，例如：食堂午饭">' +
      '</div>' +

      '<p id="' + IDS.message + '" class="form-message" role="status"></p>' +
      '<button type="submit" id="' + IDS.submit + '" class="btn btn-primary btn-block btn-lg">保存这笔支出</button>' +
    '</form>';

  /**
   * 渲染表单
   * @param {String|HTMLElement} container 容器 id 或元素
   */
  function render(container) {
    var el = typeof container === 'string' ? $(container) : container;
    if (!el) {
      console.error('[form] 找不到表单容器：', container);
      return false;
    }
    el.innerHTML = TEMPLATE;
    boundForm = null;
    return init();
  }

  global.Ledger = global.Ledger || {};
  global.Ledger.Form = {
    IDS: IDS,
    CATEGORY_ICONS: CATEGORY_ICONS,
    render: render,
    init: init,
    validate: validate,
    validateAmount: validateAmount,
    buildRecord: buildRecord
  };
})(typeof window !== 'undefined' ? window : globalThis);
