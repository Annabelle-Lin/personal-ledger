/**
 * constants.js —— 统一常量（开发规范 V1.0 第 2 节）
 *
 * 注意：本项目用普通 <script> 加载，不使用 ES Module。
 * 通过 window.LedgerConstants 暴露，供 storage.js / form.js 等模块读取。
 */
window.LedgerConstants = {
  // 统一存储键
  STORAGE_KEY: 'ledger_records',

  // 统一收支类型
  RECORD_TYPES: {
    INCOME: 'income',
    EXPENSE: 'expense'
  },

  // 统一收入类别
  INCOME_CATEGORIES: ['工资', '兼职', '奖学金', '生活费', '红包', '其他'],

  // 统一支出类别
  EXPENSE_CATEGORIES: ['餐饮', '交通', '购物', '娱乐', '学习', '医疗', '居住', '其他']
};
