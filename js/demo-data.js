// v2 回归（2026-11-07）：本模块在 v2 中无需改动，已与 develop 对齐复核。
/**
 * demo-data.js —— 示例数据模块（S12）
 *
 * 依据《个人记账本系统开发规范 V1.0》第 11 节：
 *   - 命名空间：Ledger.DemoData
 *   - 接口：getRecords() / load()
 *   - 示例数据必须符合统一 Record 格式，且不得在其他模块重复定义。
 *
 * 设计说明：
 *   1. 数据覆盖 2026 年 9 / 10 / 11 三个月，方便演示“切换月份 + 图表变化”；
 *   2. 类别全部取自 constants.js，金额最多两位小数；
 *   3. load() 只在本地没有账单时写入（调用 S7 的 seedIfEmpty）；
 *   4. restore() 供页面“恢复示例数据”按钮使用：先清空再重新写入。
 */
(function (global) {
  'use strict';

  // 同一天多条记录时用 createdAt 控制展示顺序（越大越靠前）
  var BASE_TIME = 1793000000000;

  function rec(index, type, amount, category, date, note) {
    return {
      id: 'demo_' + ('00' + index).slice(-3),
      type: type,
      amount: amount,
      category: category,
      date: date,
      note: note,
      createdAt: BASE_TIME + index * 60000,
      updatedAt: BASE_TIME + index * 60000
    };
  }

  var DEMO_RECORDS = [
    // ---------------- 2026 年 9 月 ----------------
    rec(1, 'income', 1500, '生活费', '2026-09-01', '九月生活费'),
    rec(2, 'expense', 22, '餐饮', '2026-09-02', '食堂午饭'),
    rec(3, 'expense', 6, '交通', '2026-09-03', '地铁通勤'),
    rec(4, 'expense', 89, '学习', '2026-09-05', '专业课教材'),
    rec(5, 'expense', 35, '餐饮', '2026-09-08', '和室友聚餐'),
    rec(6, 'expense', 45, '娱乐', '2026-09-12', '电影票'),
    rec(7, 'income', 800, '奖学金', '2026-09-15', '校级奖学金'),
    rec(8, 'expense', 129, '购物', '2026-09-18', '秋季外套'),
    rec(9, 'expense', 28, '餐饮', '2026-09-22', '外卖晚餐'),
    rec(10, 'expense', 200, '居住', '2026-09-26', '宿舍水电费'),
    rec(11, 'expense', 36, '医疗', '2026-09-28', '感冒药'),

    // ---------------- 2026 年 10 月 ----------------
    rec(12, 'income', 1500, '生活费', '2026-10-01', '十月生活费'),
    rec(13, 'expense', 320, '交通', '2026-10-02', '回家高铁票'),
    rec(14, 'expense', 68, '餐饮', '2026-10-03', '家人聚餐'),
    rec(15, 'expense', 99, '购物', '2026-10-06', '双肩包'),
    rec(16, 'expense', 24, '餐饮', '2026-10-09', '食堂午饭'),
    rec(17, 'income', 600, '兼职', '2026-10-12', '家教两课时'),
    rec(18, 'expense', 58, '娱乐', '2026-10-15', '同学聚会'),
    rec(19, 'expense', 45, '学习', '2026-10-18', '网课会员'),
    rec(20, 'expense', 31, '餐饮', '2026-10-21', '外卖'),
    rec(21, 'expense', 12, '交通', '2026-10-24', '打车回校'),
    rec(22, 'expense', 210, '购物', '2026-10-27', '运动鞋'),
    rec(23, 'expense', 26, '餐饮', '2026-10-30', '食堂晚饭'),

    // ---------------- 2026 年 11 月 ----------------
    rec(24, 'income', 1800, '生活费', '2026-11-01', '十一月生活费'),
    rec(25, 'expense', 26, '餐饮', '2026-11-02', '食堂午饭'),
    rec(26, 'expense', 8, '交通', '2026-11-03', '地铁'),
    rec(27, 'income', 500, '兼职', '2026-11-04', '家教两课时'),
    rec(28, 'expense', 158, '购物', '2026-11-05', '冬季卫衣'),
    rec(29, 'expense', 39, '娱乐', '2026-11-06', '电影票'),
    rec(30, 'expense', 24, '餐饮', '2026-11-07', '食堂午饭'),
    rec(31, 'expense', 66, '学习', '2026-11-07', '打印资料'),
    rec(32, 'income', 200, '红包', '2026-11-07', '生日红包'),
    rec(33, 'expense', 18, '餐饮', '2026-11-07', '早餐')
  ];

  /** 返回示例数据副本，调用方修改不会污染原始数据 */
  function getRecords() {
    return DEMO_RECORDS.map(function (record) {
      return Object.assign({}, record);
    });
  }

  function storage() {
    if (!global.LedgerStorage || typeof global.LedgerStorage.seedIfEmpty !== 'function') {
      throw new Error('LedgerStorage 未加载，无法初始化示例数据');
    }
    return global.LedgerStorage;
  }

  /**
   * 首次进入时初始化示例数据（库里有数据就不动）
   * @returns {Number} 实际写入条数
   */
  function load() {
    return storage().seedIfEmpty(getRecords());
  }

  /** “恢复示例数据”：清空后重新写入，供页面按钮调用 */
  function restore() {
    var s = storage();
    s.clearAll();
    if (typeof s.allowSeedAgain === 'function') s.allowSeedAgain();
    return s.seedIfEmpty(getRecords());
  }

  global.Ledger = global.Ledger || {};
  global.Ledger.DemoData = {
    getRecords: getRecords,
    load: load,
    restore: restore
  };
})(typeof window !== 'undefined' ? window : globalThis);
