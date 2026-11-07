// v2 回归（2026-11-07）：本模块在 v2 中无需改动，已与 develop 对齐复核。
/*!
 * storage.js — 个人记账本 · 数据存储模块（S7）
 * 项目：简记 · 个人财务管理系统
 * 规范：遵循《个人记账本系统开发规范 V1.0》
 * 职责：LocalStorage 读写、统一数据结构、增删改查的唯一入口
 * 依赖：constants.js（可选，存在时读取 STORAGE_KEY 与 RECORD_TYPES）
 * 引入：<script src="js/constants.js"></script> 之后、其他业务脚本之前
 *
 * 对外接口（V1.0 规范第 4 节）：
 *   LedgerStorage.getRecords()               -> Array   全部记录，按日期倒序，返回副本
 *   LedgerStorage.addRecord(record)          -> Object  新增，返回带 id 的记录
 *   LedgerStorage.updateRecord(id, record)   -> Object  更新，返回更新后记录；找不到返回 null
 *   LedgerStorage.deleteRecord(id)           -> Boolean 成功 true，记录不存在 false
 *   LedgerStorage.saveRecords(records)       -> Boolean 整体替换是否成功
 *   LedgerStorage.seedIfEmpty([records])     -> Number  仅空库时初始化，返回写入条数
 *
 * 辅助接口（非规范强制，测试与集成可用）：
 *   LedgerStorage.clearAll()  allowSeedAgain()  isAvailable()  makeId()  today()
 *   KEY  getLastError()
 *
 * 全局事件（V1.0 规范第 13 条）：
 *   新增 / 修改 / 删除 / 整体替换导入 / 首次初始化示例数据 / 清空 成功后，
 *   在 document 上派发 'ledger:updated'，detail = { action, payload }
 *   action 取值：add | update | delete | replace | seed | clear
 *   ⚠ 事件由本模块统一派发，S2/S3/S8 不要再自己 dispatch 一次，
 *     否则同一操作会触发两轮刷新（列表渲染两遍、提示弹两次）。
 *
 * 统一数据结构（V1.0 规范第 2 节，字段名不得修改）：
 *   { id: "record_001", type: "expense", amount: 25.00,
 *     category: "餐饮", date: "2026-11-07", note: "午餐" }
 *   本模块额外维护 createdAt / updatedAt 两个时间戳，其他模块可忽略。
 *
 * 注意：全局对象叫 LedgerStorage，不要改成 Storage ——
 *       window.Storage 是浏览器内置接口，覆盖它会导致 localStorage 整体失效。
 */
(function (global) {
  'use strict';

  var C = global.LedgerConstants || {};
  var TYPES = C.RECORD_TYPES || { INCOME: 'income', EXPENSE: 'expense' };
  var KEY = global.LEDGER_STORAGE_KEY || C.STORAGE_KEY || 'ledger_records';
  var CLEARED_KEY = KEY + '__cleared';   // 用户主动清空后不再自动灌示例数据

  var MEMORY = [];          // localStorage 不可用时的兜底存储（仅当前页面有效）
  var available = null;     // 惰性检测结果，null 表示还没测过
  var lastError = null;
  var silent = false;       // 内部批量写入时临时关闭事件，避免重复触发

  /* ---------------- 基础工具 ---------------- */

  function clone(obj) {
    var out = {};
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    }
    return out;
  }

  function today() {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function isRealDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!m) return false;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    var dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  function makeId() {
    return 'record_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** 派发统一事件 ledger:updated，S3/S4/S5/S6 监听它刷新自己 */
  function emit(action, payload) {
    if (silent) return;
    var doc = global.document;
    if (!doc || typeof doc.dispatchEvent !== 'function') return;
    var detail = { action: action, payload: payload || null };
    try {
      var evt;
      if (typeof global.CustomEvent === 'function') {
        evt = new global.CustomEvent('ledger:updated', { detail: detail });
      } else {
        evt = doc.createEvent('CustomEvent');
        evt.initCustomEvent('ledger:updated', true, true, detail);
      }
      doc.dispatchEvent(evt);
    } catch (e) {
      console.warn('[storage] ledger:updated 事件派发失败', e);
    }
  }

  function detect() {
    if (available !== null) return available;
    try {
      var probe = '__ledger_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      available = true;
    } catch (e) {
      available = false;
      lastError = e;
      console.warn('[storage] localStorage 不可用，已降级为内存模式（刷新后数据会丢失）', e);
    }
    return available;
  }

  /* ---------------- 校验与规范化 ---------------- */

  /**
   * 把外部传入的对象整理成规范要求的 Record
   * @param {Object} input 原始输入
   * @param {Boolean} strict true=校验不过抛错（表单提交用）；false=返回 null（读取时跳过脏数据）
   */
  function buildRecord(input, strict) {
    function fail(msg) {
      if (strict) throw new Error(msg);
      return null;
    }

    if (!input || typeof input !== 'object') return fail('记录必须是一个对象');

    // type：只允许 income / expense
    var type = input.type;
    if (type !== TYPES.INCOME && type !== TYPES.EXPENSE) {
      return fail('type 只能是 "' + TYPES.INCOME + '"（收入）或 "' + TYPES.EXPENSE + '"（支出）');
    }

    // amount：允许 "25.50"、"¥25.5"，统一转数字并保留两位小数
    var rawAmount = typeof input.amount === 'string'
      ? input.amount.replace(/[,，\s￥¥$]/g, '')
      : input.amount;
    var amount = Number(rawAmount);
    if (!isFinite(amount)) return fail('amount 必须是数字，当前为：' + input.amount);
    if (amount <= 0) return fail('amount 必须大于 0');
    amount = Math.round(amount * 100) / 100;

    // date：必须是真实存在的 YYYY-MM-DD
    var date = input.date == null ? '' : String(input.date).trim();
    if (!isRealDate(date)) return fail('date 必须是真实日期，格式 YYYY-MM-DD，当前为：' + input.date);

    // category
    var category = input.category == null ? '' : String(input.category).trim();
    if (!category) {
      if (strict) return fail('category 不能为空');
      category = '其他';
    }

    // note：可空，限长避免撑爆列表
    var note = input.note == null ? '' : String(input.note).trim();
    if (note.length > 60) note = note.slice(0, 60);

    var createdAt = Number(input.createdAt) > 0 ? Number(input.createdAt) : Date.now();

    return {
      id: input.id ? String(input.id) : makeId(),
      type: type,
      amount: amount,
      category: category,
      date: date,
      note: note,
      createdAt: createdAt,
      updatedAt: Number(input.updatedAt) > 0 ? Number(input.updatedAt) : createdAt
    };
  }

  /* ---------------- 底层读写 ---------------- */

  function readRaw() {
    if (!detect()) return MEMORY.slice();

    var raw = null;
    try {
      raw = global.localStorage.getItem(KEY);
    } catch (e) {
      lastError = e;
      return [];
    }
    if (!raw) return [];

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // 数据损坏：先备份原文再返回空，避免用户数据被静默覆盖
      lastError = e;
      try { global.localStorage.setItem(KEY + '_broken_' + Date.now(), raw); } catch (ignore) {}
      console.error('[storage] 本地数据不是合法 JSON，已备份到 "' + KEY + '_broken_*"', e);
      return [];
    }

    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.records)) return parsed.records;  // 兼容 {records:[]} 旧格式
    return [];
  }

  function writeRaw(list) {
    if (!detect()) {
      MEMORY = list.slice();
      return;
    }
    global.localStorage.setItem(KEY, JSON.stringify(list));   // 失败时抛出，由调用方转成 false
  }

  function readClean() {
    var raw = readRaw();
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var rec = buildRecord(raw[i], false);   // 脏数据跳过，不让一条坏数据搞崩整个列表
      if (rec) out.push(rec);
    }
    out.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;   // 日期新的在前
      return b.createdAt - a.createdAt;                          // 同一天按录入时间倒序
    });
    return out;
  }

  /* ---------------- 对外接口 ---------------- */

  function getRecords() {
    return readClean().map(clone);   // 返回副本，调用方改了不污染存储
  }

  function saveRecords(records) {
    if (!Array.isArray(records)) {
      console.error('[storage] saveRecords 需要一个数组');
      return false;
    }
    var clean = [];
    for (var i = 0; i < records.length; i++) {
      var rec = buildRecord(records[i], false);
      if (rec) clean.push(rec);
    }
    try {
      writeRaw(clean);
    } catch (e) {
      lastError = e;
      console.error('[storage] 整体写入失败：', e);
      return false;
    }
    emit('replace', { count: clean.length });
    return true;
  }

  function addRecord(input) {
    var rec = buildRecord(input, true);
    var list = readClean();
    list.push(rec);
    writeRaw(list);
    emit('add', clone(rec));
    return clone(rec);
  }

  /**
   * 更新记录
   * @param {String} id
   * @param {Object} updatedRecord 完整记录或局部字段（如只传 {amount: 99}），两种都支持
   */
  function updateRecord(id, updatedRecord) {
    if (!id) return null;
    var list = readClean();
    var index = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === String(id)) { index = i; break; }
    }
    if (index === -1) return null;

    var merged = clone(list[index]);
    if (updatedRecord && typeof updatedRecord === 'object') {
      for (var k in updatedRecord) {
        if (Object.prototype.hasOwnProperty.call(updatedRecord, k)) merged[k] = updatedRecord[k];
      }
    }
    merged.id = list[index].id;
    merged.createdAt = list[index].createdAt;

    var next = buildRecord(merged, true);   // 改完同样要过校验
    next.updatedAt = Date.now();
    list[index] = next;
    writeRaw(list);
    emit('update', clone(next));
    return clone(next);
  }

  function deleteRecord(id) {
    if (!id) return false;
    var list = readClean();
    var next = [];
    var removed = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === String(id)) { removed = true; continue; }
      next.push(list[i]);
    }
    if (!removed) return false;
    writeRaw(next);
    emit('delete', { id: String(id) });
    return true;
  }

  /**
   * 仅当库为空时初始化示例数据（V1.0 规范第 11 节）
   * @param {Array} [records] 不传时自动取 Ledger.DemoData.getRecords()；
   *                          demo-data.js 未加载时不写入，返回 0
   * @returns {Number} 实际写入条数
   *
   * 说明：用户点击“清空全部账单”后会留下标记，刷新页面也不再自动灌示例数据，
   *       需要重新体验示例数据时调用 allowSeedAgain()。
   */
  function seedIfEmpty(records) {
    if (isCleared()) return 0;
    if (readClean().length > 0) return 0;

    var data = records;
    if (!Array.isArray(data)) {
      var demo = global.Ledger && global.Ledger.DemoData;
      data = demo && typeof demo.getRecords === 'function' ? demo.getRecords() : null;
    }
    if (!Array.isArray(data) || data.length === 0) return 0;

    var clean = [];
    for (var i = 0; i < data.length; i++) {
      var rec = buildRecord(data[i], false);
      if (rec) clean.push(rec);
    }
    if (clean.length === 0) return 0;

    writeRaw(clean);
    emit('seed', { count: clean.length });
    return clean.length;
  }

  /* -------- “已主动清空”标记：避免示例数据在刷新后又冒出来 -------- */

  function isCleared() {
    if (!detect()) return false;
    try {
      return global.localStorage.getItem(CLEARED_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function allowSeedAgain() {
    if (!detect()) return;
    try {
      global.localStorage.removeItem(CLEARED_KEY);
    } catch (ignore) {}
  }

  /**
   * 清空全部账单
   * @param {{suppressDemo?: Boolean}} [options]
   *        suppressDemo=true 时留下“已主动清空”标记，刷新后不再自动写入示例数据
   *        （页面“清空全部账单”按钮传 true）；默认行为是完全重置，示例数据可再次初始化
   */
  function clearAll(options) {
    writeRaw([]);
    if (options && options.suppressDemo) {
      if (detect()) {
        try {
          global.localStorage.setItem(CLEARED_KEY, '1');
        } catch (ignore) {}
      }
    } else {
      allowSeedAgain();
    }
    emit('clear', { count: 0 });
  }


  function isAvailable() {
    return detect();
  }

  global.LedgerStorage = {
    KEY: KEY,
    getRecords: getRecords,
    addRecord: addRecord,
    updateRecord: updateRecord,
    deleteRecord: deleteRecord,
    saveRecords: saveRecords,
    seedIfEmpty: seedIfEmpty,
    clearAll: clearAll,
    allowSeedAgain: allowSeedAgain,
    isAvailable: isAvailable,
    makeId: makeId,
    today: today,
    getLastError: function () { return lastError; }
  };

  // 兼容 Node 环境下的单元测试（浏览器里这段不生效）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LedgerStorage;
  }
})(typeof window !== 'undefined' ? window : globalThis);
