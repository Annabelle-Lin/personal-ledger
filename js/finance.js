
 // js/finance.js
 // 个人记账本 · 财务计算模块（S4）
 // 职责：总收入、总支出、余额、本月汇总、类别统计、每日趋势
 // 依赖：输入统一为 records 数组，遵循《开发规范 V1.0》：
 //   {
 //     id: String,
 //     type: 'income'|'expense',
 //     amount: Number,
 //     category: String,
 //     date: 'YYYY-MM-DD',
 //     note: String
 //   }
 //
 // 对外接口：window.Finance（浏览器）/ module.exports（Node 测试）
 //
 // 设计约定：
 //   1. 金额统一以“分”为单位累加，最后再除以 100，减少浮点误差累积；
 //   2. 非数组、null 记录、非法金额、非法日期一律跳过，不抛异常；
 //   3. 金额必须为正数，负数、0、Infinity、NaN 均不计入统计；
 //   4. 月份参数统一为 'YYYY-MM'，不传时使用当前月份。

(function (root) {
  'use strict';

  const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* ---------------- 内部工具 ---------------- */

  // 严格校验真实日期
  function isValidDate(date) {
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
      return false;
    }

    const [year, month, day] = date.split('-').map(Number);

    // 使用闰年规则和月份天数判断，避免 Date 对 0-99 年的特殊处理
    const isLeapYear =
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

    const daysInMonth = [
      31,
      isLeapYear ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31
    ];

    return day >= 1 && day <= daysInMonth[month - 1];
  }

  // 当前月份，格式 YYYY-MM
  function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // 校验月份参数；非法值回退到当前月份，避免页面统计直接崩掉
  function resolveMonth(month) {
    if (typeof month === 'string' && MONTH_RE.test(month)) return month;

    if (month !== undefined && month !== null && month !== '') {
      console.warn('[finance] 月份参数应为 "YYYY-MM"，已回退为当前月份：', month);
    }

    return currentMonth();
  }

  // 安全地把金额转为“分”。只接受数字或非空数字字符串，其余一律视为 0
  function toCents(val) {
    let num;

    if (typeof val === 'number') {
      num = val;
    } else if (typeof val === 'string' && val.trim() !== '') {
      num = Number(val);
    } else {
      return 0;
    }

    if (!Number.isFinite(num) || num <= 0) return 0;

    return Math.round((num + Number.EPSILON) * 100);
  }

  function fromCents(cents) {
    return Math.round(cents) / 100;
  }

  // 获取记录月份；非法日期返回空字符串
  function recordMonth(record) {
    return isValidDate(record.date) ? record.date.slice(0, 7) : '';
  }

  function normalizeCategory(category) {
    const text = category == null ? '' : String(category).trim();
    return text || '其他';
  }

  // 累加满足条件的金额（单位：分）
  function sumCents(records, predicate) {
    if (!Array.isArray(records)) return 0;

    let cents = 0;

    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];

      if (!record || typeof record !== 'object') continue;
      if (!predicate(record)) continue;

      cents += toCents(record.amount);
    }

    return cents;
  }

  // 一次性统计总收入/总支出（单位：分）
  // 非法日期记录不参与任何统计
  function totalsCents(records) {
    let income = 0;
    let expense = 0;

    if (!Array.isArray(records)) return { income, expense };

    for (let i = 0; i < records.length; i += 1) {
      const record = records[i];

      if (!record || typeof record !== 'object') continue;
      if (!isValidDate(record.date)) continue;

      const cents = toCents(record.amount);

      if (record.type === 'income') income += cents;
      else if (record.type === 'expense') expense += cents;
    }

    return { income, expense };
  }

  // 指定月份的某类金额（单位：分）
  function monthlyCents(records, type, month) {
    return sumCents(
      records,
      (r) => r.type === type && recordMonth(r) === month
    );
  }

  /* ---------------- 对外计算函数 ---------------- */

  // 总收入
  function calculateTotalIncome(records) {
    return fromCents(totalsCents(records).income);
  }

  // 总支出
  function calculateTotalExpense(records) {
    return fromCents(totalsCents(records).expense);
  }

  // 余额 = 总收入 - 总支出
  function calculateBalance(records) {
    const totals = totalsCents(records);
    return fromCents(totals.income - totals.expense);
  }

  // 本月收入（month 省略时取当前月）
  function calculateMonthlyIncome(records, month) {
    return fromCents(monthlyCents(records, 'income', resolveMonth(month)));
  }

  // 本月支出
  function calculateMonthlyExpense(records, month) {
    return fromCents(monthlyCents(records, 'expense', resolveMonth(month)));
  }

  // 本月结余
  function calculateMonthlyBalance(records, month) {
    const m = resolveMonth(month);

    return fromCents(
      monthlyCents(records, 'income', m) -
      monthlyCents(records, 'expense', m)
    );
  }

  // 首页汇总：一次调用拿全部数字
  function calculateSummary(records, month) {
    const m = resolveMonth(month);
    const totals = totalsCents(records);
    const monthIncome = monthlyCents(records, 'income', m);
    const monthExpense = monthlyCents(records, 'expense', m);

    return {
      totalIncome: fromCents(totals.income),
      totalExpense: fromCents(totals.expense),
      balance: fromCents(totals.income - totals.expense),
      monthlyIncome: fromCents(monthIncome),
      monthlyExpense: fromCents(monthExpense),
      monthlyBalance: fromCents(monthIncome - monthExpense)
    };
  }

  /**
   * 类别统计
   * @param {Array} records 记录数组
   * @param {{ type?: 'income'|'expense', month?: string }} [options]
   *        type 默认 'expense'；month 省略表示统计全时段
   * @returns {Array<{category: string, amount: number, percentage: number}>}
   *          按金额降序；percentage 为占该类型总额的百分比（保留两位小数）
   */
  function calculateCategoryStats(records, options) {
    const opts = options || {};
    const type = opts.type === 'income' ? 'income' : 'expense';
    const month = opts.month ? resolveMonth(opts.month) : null;

    const bucket = new Map();
    let totalCents = 0;

    if (Array.isArray(records)) {
      for (let i = 0; i < records.length; i += 1) {
        const record = records[i];

        if (!record || typeof record !== 'object' || record.type !== type) {
          continue;
        }

        // 统一跳过非法日期
        if (!isValidDate(record.date)) continue;

        if (month && recordMonth(record) !== month) continue;

        const cents = toCents(record.amount);
        if (cents <= 0) continue;

        const category = normalizeCategory(record.category);
        bucket.set(category, (bucket.get(category) || 0) + cents);
        totalCents += cents;
      }
    }

    const result = [];

    bucket.forEach((cents, category) => {
      result.push({
        category,
        amount: fromCents(cents),
        percentage: totalCents > 0
          ? Math.round((cents / totalCents) * 10000) / 100
          : 0
      });
    });

    result.sort((a, b) => b.amount - a.amount);
    return result;
  }

  /**
   * 每日收支趋势
   * @param {Array} records 记录数组
   * @param {{ startDate?: string, endDate?: string }} [options]
   *        日期格式 YYYY-MM-DD，闭区间；不传表示不限
   * @returns {Array<{date: string, income: number, expense: number}>}
   *          只包含有记录的日期，按日期升序（可直接作为图表 X 轴）
   */
  function calculateDailyTrend(records, options) {
    const opts = options || {};

    const start = isValidDate(opts.startDate) ? opts.startDate : null;
    const end = isValidDate(opts.endDate) ? opts.endDate : null;

    const dayMap = new Map();

    if (Array.isArray(records)) {
      for (let i = 0; i < records.length; i += 1) {
        const record = records[i];

        if (!record || typeof record !== 'object') continue;

        // 统一校验真实日期
        if (!isValidDate(record.date)) continue;

        if (record.type !== 'income' && record.type !== 'expense') continue;
        if (start && record.date < start) continue;
        if (end && record.date > end) continue;

        const cents = toCents(record.amount);
        if (cents <= 0) continue;

        let day = dayMap.get(record.date);

        if (!day) {
          day = { date: record.date, income: 0, expense: 0 };
          dayMap.set(record.date, day);
        }

        if (record.type === 'income') day.income += cents;
        else day.expense += cents;
      }
    }

    return Array.from(dayMap.values())
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((day) => ({
        date: day.date,
        income: fromCents(day.income),
        expense: fromCents(day.expense)
      }));
  }

  /* ---------------- 导出 ---------------- */

  const Finance = {
    currentMonth,
    calculateTotalIncome,
    calculateTotalExpense,
    calculateBalance,
    calculateMonthlyIncome,
    calculateMonthlyExpense,
    calculateMonthlyBalance,
    calculateSummary,
    calculateCategoryStats,
    calculateDailyTrend
  };

  root.Finance = Finance;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Finance;
  }
})(typeof window !== 'undefined' ? window : globalThis);
