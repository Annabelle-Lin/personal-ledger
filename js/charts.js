/**
 * charts.js —— 统计图表模块（S6）
 *
 * 依据《个人记账本系统开发规范 V1.0》第 9 节：
 *   - 命名空间：Ledger.Charts
 *   - 必须接口：init(container) / update(records) / destroy()
 *   - 图表数据全部来自 S4 Finance 的统计结果，本模块不重复实现财务计算；
 *   - 本模块不读写 LocalStorage。
 *
 * 三张图：
 *   1. 收入 vs 支出（柱状图）
 *   2. 支出分类占比（环形图）
 *   3. 每日收支趋势（折线图）
 *
 * 数据驱动方式：S1 在数据或月份变化后调用 Ledger.Charts.update(records)，
 * 传入已按月份筛选的记录，保证图表与顶部“本月概览”口径一致。
 */
(function (root) {
  'use strict';

  var Ledger = root.Ledger = root.Ledger || {};

  var COLORS = {
    income: '#10b981',
    expense: '#e11d48',
    incomeSoft: 'rgba(16, 185, 129, 0.12)',
    expenseSoft: 'rgba(225, 29, 72, 0.10)',
    palette: ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ec4899', '#14b8a6', '#94a3b8']
  };

  var CARDS = [
    { key: 'comparison', id: 'chart-comparison', title: '收入 vs 支出', note: '本月合计' },
    { key: 'category', id: 'chart-category', title: '支出分类占比', note: '按类别' },
    { key: 'trend', id: 'chart-trend', title: '每日收支趋势', note: '按日', wide: true }
  ];

  var instances = {};
  var container = null;

  function ChartCtor() {
    return root.Chart || null;
  }

  function money(value) {
    return '¥' + Number(value || 0).toFixed(2);
  }

  function createCard(meta) {
    var card = root.document.createElement('div');
    card.className = 'chart-card' + (meta.wide ? ' chart-card--wide' : '');
    card.setAttribute('data-chart', meta.key);

    var title = root.document.createElement('div');
    title.className = 'chart-title';
    title.innerHTML = '<span>' + meta.title + '</span>' +
      '<span class="chart-legend-note">' + meta.note + '</span>';
    card.appendChild(title);

    var body = root.document.createElement('div');
    body.className = 'chart-body';

    var canvas = root.document.createElement('canvas');
    canvas.id = meta.id;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', meta.title + '图表');
    body.appendChild(canvas);
    card.appendChild(body);

    container.appendChild(card);
    return card;
  }

  function cardOf(key) {
    return container ? container.querySelector('[data-chart="' + key + '"]') : null;
  }

  function canvasOf(key) {
    var meta = null;
    CARDS.forEach(function (item) { if (item.key === key) meta = item; });
    if (!meta) return null;
    var card = cardOf(key);
    return card ? card.querySelector('#' + meta.id) : null;
  }

  function destroyOne(key) {
    if (instances[key]) {
      instances[key].destroy();
      instances[key] = null;
    }
  }

  function destroyAll() {
    CARDS.forEach(function (meta) { destroyOne(meta.key); });
  }

  function emptyCard(key, text) {
    destroyOne(key);
    var card = cardOf(key);
    if (!card) return;

    var body = card.querySelector('.chart-body');
    if (!body) return;

    var canvas = body.querySelector('canvas');
    if (canvas) canvas.style.display = 'none';

    var tip = body.querySelector('.charts-empty');
    if (!tip) {
      tip = root.document.createElement('div');
      tip.className = 'charts-empty';
      body.appendChild(tip);
    }
    tip.innerHTML = '<span class="charts-empty-icon" aria-hidden="true">📊</span><span>' + text + '</span>';
    tip.style.display = 'flex';
  }

  function clearEmpty(key) {
    var card = cardOf(key);
    if (!card) return;
    var tip = card.querySelector('.charts-empty');
    if (tip) tip.style.display = 'none';
    var canvas = card.querySelector('canvas');
    if (canvas) canvas.style.display = 'block';
  }

  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 450 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            padding: 14,
            font: { size: 12 },
            color: '#4a5568'
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          padding: 10,
          cornerRadius: 8,
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          displayColors: false
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#97a3b6', font: { size: 11 } }
        },
        y: {
          beginAtZero: true,
          border: { display: false },
          grid: { color: '#eef2f8' },
          ticks: {
            color: '#97a3b6',
            font: { size: 11 },
            callback: function (value) { return '¥' + value; }
          }
        }
      }
    };
  }

  function renderComparison(summary) {
    destroyOne('comparison');
    var canvas = canvasOf('comparison');
    if (!canvas) return;

    var options = baseOptions();
    options.plugins.legend.display = false;
    options.plugins.tooltip.callbacks = {
      label: function (ctx) { return money(ctx.raw); }
    };

    // 注意：这里用 totalIncome / totalExpense（传入记录的合计），
    // 不能用 monthlyIncome —— 那是“当前自然月”的口径，切到其他月份会变成 0。
    instances.comparison = new (ChartCtor())(canvas, {
      type: 'bar',
      data: {
        labels: ['收入', '支出'],
        datasets: [{
          data: [summary.totalIncome, summary.totalExpense],
          backgroundColor: [COLORS.income, COLORS.expense],
          borderRadius: 8,
          maxBarThickness: 76
        }]
      },
      options: options
    });
  }

  function renderCategory(stats) {
    destroyOne('category');
    var canvas = canvasOf('category');
    if (!canvas) return;

    var options = baseOptions();
    delete options.scales;

    options.cutout = '62%';
    options.plugins.tooltip.callbacks = {
      label: function (ctx) {
        var item = stats[ctx.dataIndex];
        return item.category + '：' + money(item.amount) +
          '（' + Number(item.percentage).toFixed(1) + '%）';
      }
    };

    instances.category = new (ChartCtor())(canvas, {
      type: 'doughnut',
      data: {
        labels: stats.map(function (item) { return item.category; }),
        datasets: [{
          data: stats.map(function (item) { return item.amount; }),
          backgroundColor: stats.map(function (_, i) {
            return COLORS.palette[i % COLORS.palette.length];
          }),
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 6
        }]
      },
      options: options
    });
  }

  function renderTrend(trend) {
    destroyOne('trend');
    var canvas = canvasOf('trend');
    if (!canvas) return;

    var options = baseOptions();
    options.interaction = { mode: 'index', intersect: false };
    options.plugins.tooltip.callbacks = {
      label: function (ctx) { return ctx.dataset.label + '：' + money(ctx.raw); }
    };

    function dataset(label, key, color, soft) {
      return {
        label: label,
        data: trend.map(function (item) { return item[key]; }),
        borderColor: color,
        backgroundColor: soft,
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: '#fff',
        pointBorderColor: color,
        pointBorderWidth: 2
      };
    }

    instances.trend = new (ChartCtor())(canvas, {
      type: 'line',
      data: {
        labels: trend.map(function (item) {
          var parts = String(item.date).split('-');
          return parts.length === 3 ? (+parts[1]) + '/' + (+parts[2]) : item.date;
        }),
        datasets: [
          dataset('收入', 'income', COLORS.income, COLORS.incomeSoft),
          dataset('支出', 'expense', COLORS.expense, COLORS.expenseSoft)
        ]
      },
      options: options
    });
  }

  /* ------------------------------ 对外接口 ------------------------------ */

  function init(target) {
    var el = typeof target === 'string'
      ? root.document.querySelector(target)
      : target;

    if (!el) {
      console.error('[charts] 找不到图表容器 #charts-container');
      return false;
    }

    destroy();

    container = el;
    container.classList.add('chart-grid');
    container.innerHTML = '';

    CARDS.forEach(createCard);

    if (!ChartCtor()) {
      CARDS.forEach(function (meta) {
        emptyCard(meta.key, 'Chart.js 未加载，请检查 vendor/chart.umd.min.js');
      });
      return false;
    }

    return true;
  }

  /**
   * 渲染 / 刷新图表
   * @param {Array} [records] 记录数组；省略时读取 LedgerStorage
   * @returns {Number} 参与统计的记录条数
   */
  function update(records) {
    if (!container) {
      console.warn('[charts] 请先调用 Ledger.Charts.init(container)');
      return 0;
    }

    var list = records;
    if (!Array.isArray(list)) {
      list = (root.LedgerStorage && typeof root.LedgerStorage.getRecords === 'function')
        ? root.LedgerStorage.getRecords() : [];
    }

    if (!ChartCtor()) return 0;

    var Finance = root.Finance;
    if (!Finance || typeof Finance.calculateSummary !== 'function') {
      CARDS.forEach(function (meta) {
        emptyCard(meta.key, 'Finance 模块未加载');
      });
      return 0;
    }

    if (!list.length) {
      CARDS.forEach(function (meta) {
        emptyCard(meta.key, '所选月份暂无记录');
      });
      return 0;
    }

    var summary = Finance.calculateSummary(list);
    var categoryStats = Finance.calculateCategoryStats(list, { type: 'expense' });
    var trend = Finance.calculateDailyTrend(list);

    // 收入 vs 支出
    if (summary.totalIncome === 0 && summary.totalExpense === 0) {
      emptyCard('comparison', '所选月份暂无收支');
    } else {
      clearEmpty('comparison');
      renderComparison(summary);
    }

    // 支出分类占比
    if (!categoryStats.length) {
      emptyCard('category', '所选月份没有支出记录');
    } else {
      clearEmpty('category');
      renderCategory(categoryStats);
    }

    // 每日趋势
    if (!trend.length) {
      emptyCard('trend', '所选月份暂无趋势数据');
    } else {
      clearEmpty('trend');
      renderTrend(trend);
    }

    return list.length;
  }

  function destroy() {
    destroyAll();
    if (container) {
      container.innerHTML = '';
      container.classList.remove('chart-grid');
    }
    container = null;
  }

  Ledger.Charts = {
    init: init,
    update: update,
    destroy: destroy,
    COLORS: COLORS
  };
})(typeof window !== 'undefined' ? window : globalThis);
