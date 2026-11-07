// export.js - S8 数据导入导出模块

// 1. 导出功能 (将数据转为 JSON 文件下载)
function exportToJSON() {
    let records = [];
    
    if (window.LedgerStorage && typeof window.LedgerStorage.getRecords === 'function') {
        records = window.LedgerStorage.getRecords(); 
    } else {
        console.warn("未找到 LedgerStorage，尝试直接读取 LocalStorage");
        records = JSON.parse(localStorage.getItem('ledger_records') || '[]');
    }
    
    if (!records || records.length === 0) {
        alert("当前没有账单数据可以导出！");
        return;
    }

    // 将对象转为格式化的 JSON 字符串
    const dataStr = JSON.stringify(records, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    // 创建隐藏的下载链接并触发点击
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    
    // 清理工作
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 2. 导入功能 
function importFromJSON(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // 校验1：必须是数组
            if (!Array.isArray(importedData)) {
                throw new Error("数据格式错误：JSON 根节点必须是数组。");
            }
            
            // 校验2：必须包含核心字段
            const isValid = importedData.every(item => 
                item.hasOwnProperty('type') && 
                item.hasOwnProperty('amount') && 
                item.hasOwnProperty('category') && 
                item.hasOwnProperty('date')
            );
            
            if (!isValid) {
                throw new Error("数据字段缺失：请检查是否符合团队约定的数据结构。");
            }
            
            // 询问用户确认覆盖
            if (confirm(`成功读取到 ${importedData.length} 条数据。确定要覆盖当前所有账单吗？`)) {
                if (window.LedgerStorage && typeof window.LedgerStorage.saveRecords === 'function') {
                    window.LedgerStorage.saveRecords(importedData);
                } else {
                    localStorage.setItem('ledger_records', JSON.stringify(importedData));
                }
                
                alert("导入成功！页面即将刷新。");
                location.reload(); // 刷新页面让列表和统计更新
            }
            
        } catch (error) {
            alert("导入失败：" + error.message);
        }
    };
    
    reader.readAsText(file);
}

// 3. 页面事件绑定
document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('btn-export');
    const importBtn = document.getElementById('btn-import');
    const fileInput = document.getElementById('file-import');

    // 绑定导出按钮
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToJSON);
    } else {
        console.warn("未找到导出按钮 (id='btn-export')，请等待 S1 完成页面。");
    }
    
    // 绑定导入按钮和文件选择框
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
    } else {
        console.warn("未找到导入按钮 (id='btn-import') 或 文件框 (id='file-import')。");
    }
});