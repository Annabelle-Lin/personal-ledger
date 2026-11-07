/*!
 * storage.js — 个人记账本 · 数据存储模块（S7）
 * 项目：简记 · 个人财务管理系统
 * 职责：LocalStorage 读写、统一数据结构、增删改查的唯一入口
 * 依赖：原生 JS
 * 引入：<script src="js/storage.js"></script>，必须放在 form.js / records.js / finance.js 之前
 *
 * 对外接口（挂在 window.LedgerStorage 上）：
 *   getRecords()              -> Array   取全部记录（按日期倒序，返回的是副本）
 *   saveRecords(records)      -> Number  整表覆盖写入，返回实际写入条数
 *   addRecord(record)         -> Object  新增一条，返回带 id 的完整记录
 *   updateRecord(id, patch)   -> Object  局部更新，返回更新后的记录；找不到返回 null
 *   deleteRecord(id)          -> Boolean 删除成功 true，记录不存在 false
 *   clearAll()                -> void    清空
 *   seedIfEmpty(records)      -> Number  库为空时才写入演示数据
 *   makeId()                  -> String  生成唯一 id
 *   isAvailable()             -> Boolean localStorage 是否可用（false 表示降级为内存模式）
 *
 * 数据结构：
 *   { id: "record_xxx", type: "income" | "expense", amount: 25.5,
 *     category: "餐饮", date: "2026-11-07", note: "午饭",
 *     createdAt: 1762492800000, updatedAt: 1762492800000 }
 *
 * 注意：全局对象叫 LedgerStorage，——
 *       window.Storage 是浏览器内置接口，覆盖它会导致 localStorage 整体失效。
 */
(function (global) {
  'use strict';

  var KEY = global.LEDGER_STORAGE_KEY || 'ledger_records';
  var MEMORY = [];          // localStorage 不可用时的兜底存储
  var available = null;     // 惰性检测结果，null 表示还没测过
  var lastError = null;

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
   * 把外部传进来的对象整理成标准记录
   * @param {Object} input  原始输入
   * @param {Boolean} strict true=校验不过就抛错；false=校验不过返回 null
   */
  function buildRecord(input, strict) {
    function fail(msg) {
      if (strict) throw new Error(msg);
      return null;
    }

    if (!input || typeof input !== 'object') return fail('记录必须是一个对象');

    // 类型
    var type = input.type;
    if (type !== 'income' && type !== 'expense') {
      return fail('type 只能是 "income"（收入）或 "expense"（支出）');
    }

    // 金额：允许 "25.50" 这类写法，但必须能转成数字
    var rawAmount = typeof input.amount === 'string'
      ? input.amount.replace(/[,，\s￥¥$]/g, '')
      : input.amount;
    var amount = Number(rawAmount);
    if (!isFinite(amount)) return fail('amount 必须是数字，当前为：' + input.amount);
    if (amount <= 0) return fail('amount 必须大于 0');
    amount = Math.round(amount * 100) / 100;   // 统一保留两位小数

    // 日期
    var date = input.date == null ? '' : String(input.date).trim();
    if (!isRealDate(date)) return fail('date 必须是真实日期，格式 YYYY-MM-DD，当前为：' + input.date);

    // 类别
    var category = input.category == null ? '' : String(input.category).trim();
    if (!category) {
      if (strict) return fail('category 不能为空');
      category = '其他';
    }

    // 备注
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
    try {
      global.localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      lastError = e;
      throw new Error('保存失败：浏览器存储空间不足或被禁用（' + (e && e.name) + '）');
    }
  }

  function readClean() {
    var raw = readRaw();
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var rec = buildRecord(raw[i], false);   // 脏数据直接跳过，不让一条坏数据搞崩整个列表
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
    return readClean().map(clone);   // 返回副本，调用方改了不会污染存储
  }

  function saveRecords(records) {
    if (!Array.isArray(records)) throw new Error('saveRecords 需要一个数组');
    var clean = [];
    for (var i = 0; i < records.length; i++) {
      var rec = buildRecord(records[i], false);
      if (rec) clean.push(rec);
    }
    writeRaw(clean);
    return clean.length;
  }

  function addRecord(input) {
    var rec = buildRecord(input, true);
    var list = readRaw().map(function (r) { return buildRecord(r, false); })
                        .filter(function (r) { return r !== null; });
    list.push(rec);
    writeRaw(list);
    return clone(rec);
  }

  function updateRecord(id, patch) {
    if (!id) return null;
    var list = readClean();
    var target = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === String(id)) { target = i; break; }
    }
    if (target === null) return null;

    var merged = clone(list[target]);
    if (patch && typeof patch === 'object') {
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) merged[k] = patch[k];
      }
    }
    merged.id = list[target].id;
    merged.createdAt = list[target].createdAt;

    var next = buildRecord(merged, true);   // 改完也要过一遍校验
    next.updatedAt = Date.now();
    list[target] = next;
    writeRaw(list);
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
    return true;
  }

  function clearAll() {
    writeRaw([]);
  }

  function seedIfEmpty(records) {
    if (!Array.isArray(records)) return 0;
    if (readClean().length > 0) return 0;
    return saveRecords(records);
  }

  function isAvailable() {
    return detect();
  }

  global.LedgerStorage = {
    KEY: KEY,
    getRecords: getRecords,
    saveRecords: saveRecords,
    addRecord: addRecord,
    updateRecord: updateRecord,
    deleteRecord: deleteRecord,
    clearAll: clearAll,
    seedIfEmpty: seedIfEmpty,
    makeId: makeId,
    isAvailable: isAvailable,
    today: today,
    getLastError: function () { return lastError; }
  };

  // 兼容 Node 环境下的单元测试
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.LedgerStorage;
  }
})(typeof window !== 'undefined' ? window : globalThis);
