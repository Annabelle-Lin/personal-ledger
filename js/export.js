(function (global) {
    'use strict';

    // 1. 导出功能
    function exportToJSON() {
        if (!global.LedgerStorage || typeof global.LedgerStorage.getRecords !== 'function') {
            alert("错误：未找到数据存储模块，无法导出！");
            return;
        }

        const records = global.LedgerStorage.getRecords();
        
        if (!records || records.length === 0) {
            alert("当前没有账单数据可以导出！");
            return;
        }

        const exportData = {
            app: "personal-ledger",
            version: "1.0",
            exportedAt: new Date().toISOString(),
            records: records
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = `ledger_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // 2. 导入功能 
    function importFromJSON(file) {
        const reader = new FileReader();
        reader.onerror = function() {
            alert("导入失败：文件读取发生错误，请重试。");
        };

        reader.onload = function(e) {
            try {
                const parsedData = JSON.parse(e.target.result);

                if (!parsedData || parsedData.app !== "personal-ledger" || parsedData.version !== "1.0" || !Array.isArray(parsedData.records)) {
                    throw new Error("文件格式错误或版本不兼容：请确认是本系统 V1.0 导出的备份文件。");
                }
                
                const importedRecords = parsedData.records;

                if (importedRecords.length === 0) {
                    throw new Error("文件中没有包含任何账单记录。");
                }

                for (let i = 0; i < importedRecords.length; i++) {
                    const item = importedRecords[i];
                    
                    if (!item.id || typeof item.id !== 'string') {
                        throw new Error(`第 ${i + 1} 条数据错误：id 必须是非空字符串。`);
                    }
                    if (item.type !== 'income' && item.type !== 'expense') {
                        throw new Error(`第 ${i + 1} 条数据错误：type 只能是 income 或 expense。`);
                    }
                    if (typeof item.amount !== 'number' || !isFinite(item.amount) || item.amount <= 0) {
                        throw new Error(`第 ${i + 1} 条数据错误：amount 必须是大于 0 的有效数字。`);
                    }
                    if (!item.category || typeof item.category !== 'string') {
                        throw new Error(`第 ${i + 1} 条数据错误：category 必须是字符串。`);
                    }
                    if (!item.note || typeof item.note !== 'string') {
                        if (typeof item.note !== 'string') {
                            throw new Error(`第 ${i + 1} 条数据错误：note 必须是字符串。`);
                        }
                    }
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (!item.date || !dateRegex.test(item.date)) {
                        throw new Error(`第 ${i + 1} 条数据错误：date 必须是 YYYY-MM-DD 格式。`);
                    }
                }
                
                if (confirm(`校验通过，成功读取到 ${importedRecords.length} 条数据。确定要覆盖当前所有账单吗？`)) {
                    if (global.LedgerStorage && typeof global.LedgerStorage.saveRecords === 'function') {
                        
                        const isSuccess = global.LedgerStorage.saveRecords(importedRecords);
                        
                        if (isSuccess) {
                            alert("导入成功！页面数据已更新。");

                            if (typeof global.document !== 'undefined' && typeof global.CustomEvent === 'function') {
                                global.document.dispatchEvent(new global.CustomEvent('ledger:updated', { detail: { action: 'replace', source: 'import' }}));
                            }
                        } else {
                            throw new Error("写入本地存储失败，可能是浏览器存储空间不足。");
                        }
                    } else {
                        throw new Error("未找到数据存储模块，无法保存。");
                    }
                }
                
            } catch (error) {
                alert("导入失败：" + error.message);
            }
        };
        
        reader.readAsText(file);
    }

    // 3. 页面事件绑定

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            const exportBtn = document.getElementById('btn-export');
            const importBtn = document.getElementById('btn-import');
            const fileInput = document.getElementById('file-import');

            if (exportBtn) {
                exportBtn.addEventListener('click', exportToJSON);
            }
            
            if (importBtn && fileInput) {
                importBtn.addEventListener('click', () => {
                    fileInput.click(); 
                });

                fileInput.addEventListener('change', (event) => {
                    const file = event.target.files[0];
                    if (file) {
                        importFromJSON(file);
                    }
                    fileInput.value = ''; 
                });
            }
        });
    }

    global.exportToJSON = exportToJSON;
    global.importFromJSON = importFromJSON;

})(typeof window !== 'undefined' ? window : globalThis);