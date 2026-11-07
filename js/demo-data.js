
(function (global) {
  'use strict';

  // Demo records: use the unified six-field Record structure.
  var demoRecords = [
    {
      id: 'demo_001',
      type: 'income',
      amount: 5000,
      category: '\u5de5\u8d44',
      date: '2026-11-01',
      note: '11\u6708\u5de5\u8d44'
    },
    {
      id: 'demo_002',
      type: 'expense',
      amount: 35,
      category: '\u9910\u996e',
      date: '2026-11-02',
      note: '\u65e9\u9910'
    },
    {
      id: 'demo_003',
      type: 'expense',
      amount: 120,
      category: '\u8d2d\u7269',
      date: '2026-11-03',
      note: '\u8d2d\u4e70\u751f\u6d3b\u7528\u54c1'
    },
    {
      id: 'demo_004',
      type: 'income',
      amount: 800,
      category: '\u517c\u804c',
      date: '2026-11-04',
      note: '\u517c\u804c\u6536\u5165'
    },
    {
      id: 'demo_005',
      type: 'expense',
      amount: 45,
      category: '\u4ea4\u901a',
      date: '2026-11-05',
      note: '\u6253\u8f66'
    },
    {
      id: 'demo_006',
      type: 'expense',
      amount: 200,
      category: '\u5a31\u4e50',
      date: '2026-11-06',
      note: '\u7535\u5f71\u7968'
    },
    {
      id: 'demo_007',
      type: 'expense',
      amount: 60,
      category: '\u9910\u996e',
      date: '2026-11-07',
      note: '\u5348\u9910'
    },
    {
      id: 'demo_008',
      type: 'income',
      amount: 300,
      category: '\u517c\u804c',
      date: '2026-11-07',
      note: '\u8bbe\u8ba1\u517c\u804c'
    },
    {
      id: 'demo_009',
      type: 'expense',
      amount: 150,
      category: '\u8d2d\u7269',
      date: '2026-11-07',
      note: '\u8d2d\u4e70\u8863\u670d'
    },
    {
      id: 'demo_010',
      type: 'expense',
      amount: 80,
      category: '\u5b66\u4e60',
      date: '2026-11-07',
      note: '\u8d2d\u4e70\u5b66\u4e60\u8d44\u6599'
    }
  ];

  // Return copies so callers cannot modify the original demo data.
  function getRecords() {
    return demoRecords.map(function (record) {
      return Object.assign({}, record);
    });
  }

  // Initialize demo data through the S7 storage interface.
  function load() {
    if (
      !global.LedgerStorage ||
      typeof global.LedgerStorage.seedIfEmpty !== 'function'
    ) {
      throw new Error(
        'LedgerStorage is not available. Load js/storage.js first.'
      );
    }

    var inserted = global.LedgerStorage.seedIfEmpty(getRecords());

    // Notify other modules only when demo records were actually inserted.
    if (
      inserted > 0 &&
      typeof global.dispatchEvent === 'function' &&
      typeof global.Event === 'function'
    ) {
      global.dispatchEvent(new global.Event('ledger:updated'));
    }

    return inserted;
  }

  // Export the standardized S12 namespace.
  global.Ledger = global.Ledger || {};

  global.Ledger.DemoData = {
    getRecords: getRecords,
    load: load
  };

})(typeof window !== 'undefined' ? window : globalThis);
