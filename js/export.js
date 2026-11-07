// v2 回归（2026-11-07）：本模块在 v2 中无需改动，已与 develop 对齐复核。
/**
 * export.js —— 数据导入导出模块（S8）
 *
 * 依据《个人记账本系统开发规范 V1.0》第 10 节：
 *   - 接口：exportToJSON() / importFromJSON(file)
 *   - 导出读取 LedgerStorage.getRecords()，文件统一外壳：
 *     { app: "personal-ledger", version: "1.0", exportedAt: "...", records: [] }
 *   - 导入必须校验外壳与每一条记录；校验失败不覆盖原有数据；
 *     成功后调用 LedgerStorage.saveRecords()，由 storage 派发 ledger:updated。
 *   - 不使用 location.reload()，页面数据由事件驱动刷新。
 *
 * 提示交互统一交给 app.js 提供的 Ledger.App.toast / Ledger.App.confirm，
 * 未加载时退化为 alert / confirm，保证单独调试也能用。
 */
(function (global) {
  'use strict';

  var APP_ID = 'personal-ledger';
  var APP_VERSION = '1.0';

  function toast(message, type) {
    if (global.Ledger && global.Ledger.App && typeof global.Ledger.App.toast === 'function') {
      global.Ledger.App.toast(message, type);
    } else {
      global.alert(message);
    }
  }

  function ask(options) {
    if (global.Ledger && global.Ledger.App && typeof global.Ledger.App.confirm === 'function') {
      return global.Ledger.App.confirm(options);
    }
    return Promise.resolve(global.confirm(options.message || options.title));
  }

  function todayStamp() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : String(n); }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  function isValidDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    var dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
  }

  /** 校验单条记录，返回错误信息；合法返回空字符串 */
  function validateRecord(item, index) {
    var at = '第 ' + (index + 1) + ' 条记录';
    if (!item || typeof item !== 'object' || Array.isArray(item)) return at + '不是合法对象';
    if (item.type !== 'income' && item.type !== 'expense') return at + ' type 只能是 income / expense';
    if (typeof item.amount !== 'number' || !isFinite(item.amount) || item.amount <= 0) {
      return at + ' amount 必须是大于 0 的数字';
    }
    if (!/^\d+(\.\d{1,2})?$/.test(String(item.amount))) return at + ' amount 最多两位小数';
    if (!item.category || typeof item.category !== 'string') return at + ' category 不能为空';
    if (!isValidDate(item.date)) return at + ' date 必须是 YYYY-MM-DD 的真实日期';
    if (item.note !== undefined && item.note !== null && typeof item.note !== 'string') {
      return at + ' note 必须是字符串';
    }
    return '';
  }

  /** 解析并校验导入文件，成功返回 { records }，失败抛出可读错误 */
  function parseBackup(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error('不是合法的 JSON 文件');
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('文件结构不正确，应为本系统导出的备份对象');
    }
    if (data.app !== APP_ID) {
      throw new Error('不是「个人记账本」导出的备份（缺少 app 标记）');
    }
    if (String(data.version) !== APP_VERSION) {
      throw new Error('备份版本不兼容：需要 version = ' + APP_VERSION);
    }
    if (!Array.isArray(data.records)) {
      throw new Error('文件里缺少 records 数组');
    }
    if (data.records.length === 0) {
      throw new Error('备份文件里没有任何账单');
    }

    for (var i = 0; i < data.records.length; i++) {
      var message = validateRecord(data.records[i], i);
      if (message) throw new Error(message);
    }

    return { records: data.records };
  }

  /* ------------------------------ 导出 ------------------------------ */

  function exportToJSON() {
    if (!global.LedgerStorage || typeof global.LedgerStorage.getRecords !== 'function') {
      toast('数据存储模块未加载，无法导出', 'error');
      return false;
    }

    var records = global.LedgerStorage.getRecords();
    if (!Array.isArray(records) || records.length === 0) {
      toast('当前没有账单可以导出', 'info');
      return false;
    }

    var payload = {
      app: APP_ID,
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      records: records
    };

    try {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'ledger-backup-' + todayStamp() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 释放对象 URL，避免内存泄漏
      global.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

      toast('已导出 ' + records.length + ' 条账单', 'success');
      return true;
    } catch (err) {
      console.error('[export] 导出失败：', err);
      toast('导出失败：' + (err && err.message ? err.message : err), 'error');
      return false;
    }
  }

  /* ------------------------------ 导入 ------------------------------ */

  function importFromJSON(file) {
    if (!file) {
      toast('请先选择要导入的 JSON 文件', 'error');
      return;
    }
    if (!global.FileReader) {
      toast('当前浏览器不支持文件读取', 'error');
      return;
    }

    var reader = new FileReader();

    reader.onerror = function () {
      toast('读取文件失败，请确认文件是否损坏', 'error');
    };

    reader.onload = function (event) {
      var parsed;
      try {
        parsed = parseBackup(String(event.target.result || ''));
      } catch (err) {
        // 校验失败：原数据一条不动
        toast('导入失败：' + err.message, 'error');
        return;
      }

      ask({
        title: '导入 ' + parsed.records.length + ' 条账单？',
        message: '导入会覆盖当前全部账单，请确认已经备份现有数据。',
        confirmText: '覆盖导入',
        danger: true
      }).then(function (ok) {
        if (!ok) return;

        if (!global.LedgerStorage || typeof global.LedgerStorage.saveRecords !== 'function') {
          toast('数据存储模块未加载，无法导入', 'error');
          return;
        }

        var saved = global.LedgerStorage.saveRecords(parsed.records);
        if (saved) toast('导入成功，共 ' + parsed.records.length + ' 条账单', 'success');
        else toast('写入本地存储失败，可能是浏览器空间已满', 'error');
      });
    };

    reader.readAsText(file);
  }

  /* ------------------------------ 事件绑定 ------------------------------ */

  function bindButtons() {
    var exportBtn = document.getElementById('btn-export');
    var importBtn = document.getElementById('btn-import');
    var fileInput = document.getElementById('file-import');

    if (exportBtn) exportBtn.addEventListener('click', exportToJSON);
    else console.warn('[export] 未找到 #btn-export');

    if (importBtn && fileInput) {
      importBtn.addEventListener('click', function () { fileInput.click(); });
      fileInput.addEventListener('change', function (event) {
        var file = event.target.files && event.target.files[0];
        if (file) importFromJSON(file);
        fileInput.value = '';   // 允许重复选择同一个文件
      });
    } else {
      console.warn('[export] 未找到 #btn-import / #file-import');
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindButtons);
    } else {
      bindButtons();
    }
  }

  global.exportToJSON = exportToJSON;
  global.importFromJSON = importFromJSON;
  global.Ledger = global.Ledger || {};
  global.Ledger.Export = {
    exportToJSON: exportToJSON,
    importFromJSON: importFromJSON,
    parseBackup: parseBackup
  };
})(typeof window !== 'undefined' ? window : globalThis);