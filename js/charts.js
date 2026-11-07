/**
 * charts.js
 * S6：统计图表模块
 *
 * 对外接口（V1.0）：
 *   Ledger.Charts.init(container)
 *   Ledger.Charts.update(records)
 *   Ledger.Charts.destroy()
 *
 * 数据来源：
 *   S7 LedgerStorage.getRecords()
 * 统计来源：
 *   S4 Finance.calculateSummary()
 *   S4 Finance.calculateCategoryStats()
 *   S4 Finance.calculateDailyTrend()
 *
 * 本文件不直接读写 localStorage，也不自行实现财务统计逻辑。
 */
(function (root) {
  'use strict';

  const Ledger = root.Ledger = root.Ledger || {};

  const COLORS = {
    income: '#20B486',
    expense: '#F07868',
    palette: [
      '#6C8AE4',
      '#F4B860',
      '#9B85D5',
      '#54B6C2',
      '#E58BA8',
      '#8CBF8C',
      '#A5A5A5',
      '#D6A56D'
    ]
  };

  const CANVAS_IDS = {
    comparison: 'incomeExpenseChart',
    category: 'expenseCategoryChart',
    trend: 'dailyTrendChart'
  };

  const chartInstances = {
    comparison: null,
    category: null,
    trend: null
  };

  let chartContainer = null;
  let currentRecords = [];
  let listeningForUpdates = false;

  function getChartConstructor() {
    return root.Chart || null;
  }

  function getCanvas(id) {
    return chartContainer ? chartContainer.querySelector('#' + id) : null;
  }

  function createCanvas(container, id) {
    let canvas = container.querySelector('#' + id);

    if (!canvas) {
      canvas = root.document.createElement('canvas');
      canvas.id = id;
      container.appendChild(canvas);
    }

    return canvas;
  }

  function destroyChart(name) {
    if (chartInstances[name]) {
      chartInstances[name].destroy();
      chartInstances[name] = null;
    }
  }

  function destroyCharts() {
    destroyChart('comparison');
    destroyChart('category');
    destroyChart('trend');
  }

  function clearEmptyState() {
    if (!chartContainer) return;

    const empty = chartContainer.querySelector('.charts-empty');
    if (empty) empty.remove();

    const canvases = chartContainer.querySelectorAll('canvas');
    for (let i = 0; i < canvases.length; i += 1) {
      canvases[i].style.display = 'block';
    }
  }

  function showEmptyState(message) {
    destroyCharts();
    if (!chartContainer) return;

    const canvases = chartContainer.querySelectorAll('canvas');
    for (let i = 0; i < canvases.length; i += 1) {
      canvases[i].style.display = 'none';
    }

    let empty = chartContainer.querySelector('.charts-empty');
    if (!empty) {
      empty = root.document.createElement('div');
      empty.className = 'charts-empty';
      chartContainer.appendChild(empty);
    }

    empty.textContent = message;
    empty.style.cssText = 'text-align:center;padding:48px 16px;color:#9CA3AF;font-size:14px;';
  }

  function getFinance() {
    const Finance = root.Finance;
    const methods = [
      'calculateSummary',
      'calculateCategoryStats',
      'calculateDailyTrend'
    ];

    if (!Finance || methods.some(function (name) {
      return typeof Finance[name] !== 'function';
    })) {
      return null;
    }

    return Finance;
  }

  function readRecords(records) {
    if (Array.isArray(records)) return records;

    if (root.LedgerStorage && typeof root.LedgerStorage.getRecords === 'function') {
      const stored = root.LedgerStorage.getRecords();
      return Array.isArray(stored) ? stored : [];
    }

    console.error('[charts] 未找到 S7 LedgerStorage.getRecords()');
    return [];
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  function renderComparison(summary) {
    destroyChart('comparison');

    const canvas = getCanvas(CANVAS_IDS.comparison);
    if (!canvas) return;

    chartInstances.comparison = new (getChartConstructor())(canvas, {
      type: 'bar',
      data: {
        labels: ['收入', '支出'],
        datasets: [{
          label: '金额（元）',
          data: [summary.totalIncome, summary.totalExpense],
          backgroundColor: [COLORS.income, COLORS.expense],
          borderRadius: 8,
          maxBarThickness: 90
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return formatMoney(context.raw);
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }

  function renderCategory(stats) {
    destroyChart('category');

    const canvas = getCanvas(CANVAS_IDS.category);
    if (!canvas) return;

    chartInstances.category = new (getChartConstructor())(canvas, {
      type: 'doughnut',
      data: {
        labels: stats.map(function (item) { return item.category; }),
        datasets: [{
          data: stats.map(function (item) { return item.amount; }),
          backgroundColor: stats.map(function (_, index) {
            return COLORS.palette[index % COLORS.palette.length];
          }),
          borderWidth: 3,
          borderColor: '#ffffff',
          hoverOffset: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, padding: 16 }
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const item = stats[context.dataIndex];
                return item.category + '：' + formatMoney(item.amount) +
                  '（' + item.percentage.toFixed(2) + '%）';
              }
            }
          }
        }
      }
    });
  }

  function renderTrend(trend) {
    destroyChart('trend');

    const canvas = getCanvas(CANVAS_IDS.trend);
    if (!canvas) return;

    chartInstances.trend = new (getChartConstructor())(canvas, {
      type: 'line',
      data: {
        labels: trend.map(function (item) { return item.date; }),
        datasets: [
          {
            label: '收入',
            data: trend.map(function (item) { return item.income; }),
            borderColor: COLORS.income,
            backgroundColor: 'rgba(32, 180, 134, 0.12)',
            fill: true,
            tension: 0.35,
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 7
          },
          {
            label: '支出',
            data: trend.map(function (item) { return item.expense; }),
            borderColor: COLORS.expense,
            backgroundColor: 'rgba(240, 120, 104, 0.12)',
            fill: true,
            tension: 0.35,
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
          tooltip: {
            callbacks: {
              label: function (context) {
                return context.dataset.label + '：' + formatMoney(context.raw);
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true }
        }
      }
    });
  }

  function update(records) {
    if (!chartContainer) {
      console.warn('[charts] 请先调用 Ledger.Charts.init(container)');
      return 0;
    }

    if (!getChartConstructor()) {
      showEmptyState('Chart.js 尚未加载，请检查 script 引入顺序。');
      return 0;
    }

    const Finance = getFinance();
    if (!Finance) {
      showEmptyState('Finance 模块未加载，无法生成图表。');
      return 0;
    }

    currentRecords = readRecords(records);

    if (currentRecords.length === 0) {
      showEmptyState('暂无收支记录');
      return 0;
    }

    clearEmptyState();

    const summary = Finance.calculateSummary(currentRecords);
    const categoryStats = Finance.calculateCategoryStats(currentRecords, {
      type: 'expense'
    });
    const dailyTrend = Finance.calculateDailyTrend(currentRecords);

    renderComparison(summary);
    renderCategory(categoryStats);
    renderTrend(dailyTrend);

    return currentRecords.length;
  }

  function handleLedgerUpdated() {
    update();
  }

  function bindStorageEvent() {
    if (listeningForUpdates || !root.document || typeof root.document.addEventListener !== 'function') {
      return;
    }
    root.document.addEventListener('ledger:updated', handleLedgerUpdated);
    listeningForUpdates = true;
  }

  function unbindStorageEvent() {
    if (!listeningForUpdates || !root.document || typeof root.document.removeEventListener !== 'function') {
      return;
    }
    root.document.removeEventListener('ledger:updated', handleLedgerUpdated);
    listeningForUpdates = false;
  }

  function init(container) {
    if (typeof container === 'string') {
      container = root.document.querySelector(container);
    }

    if (!container || typeof container.querySelector !== 'function') {
      console.error('[charts] 无效的图表容器');
      return;
    }

    destroy();
    chartContainer = container;

    createCanvas(chartContainer, CANVAS_IDS.comparison);
    createCanvas(chartContainer, CANVAS_IDS.category);
    createCanvas(chartContainer, CANVAS_IDS.trend);

    bindStorageEvent();
    update();
  }

  function destroy() {
    unbindStorageEvent();
    destroyCharts();
    chartContainer = null;
    currentRecords = [];
  }

  Ledger.Charts = {
    init: init,
    update: update,
    destroy: destroy
  };

  // 兼容 Node.js 测试；浏览器中仍使用 window.Ledger.Charts
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Ledger.Charts;
  }
})(typeof window !== 'undefined' ? window : globalThis);
