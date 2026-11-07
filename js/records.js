(function () {
    "use strict";

    window.Ledger = window.Ledger || {};

    const Records = {};

    let recordsContainer = null;
    let eventBound = false;

    /**
     * 获取账单数据
     * 统一通过 S7 存储模块读取
     */
    function getRecords() {
        if (!window.LedgerStorage) {
            console.error("LedgerStorage 未加载，请检查 storage.js 的加载顺序。");
            return [];
        }

        const records = window.LedgerStorage.getRecords();

        return Array.isArray(records) ? records : [];
    }

    /**
     * 按日期倒序排列
     */
    function sortRecords(records) {
        return [...records].sort((a, b) => {
            return String(b.date || "").localeCompare(String(a.date || ""));
        });
    }

    /**
     * 格式化金额
     */
    function formatAmount(amount) {
        const number = Number(amount);

        if (!Number.isFinite(number)) {
            return "0.00";
        }

        return number.toFixed(2);
    }

    /**
     * 创建元素并设置文本
     */
    function createElement(tag, className, text) {
        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined && text !== null) {
            element.textContent = text;
        }

        return element;
    }

    /**
     * 创建空列表提示
     */
    function showEmptyState() {
        const empty = createElement("div", "records-empty");

        const icon = createElement("div", "records-empty-icon", "🧾");
        const title = createElement("h3", "records-empty-title", "暂无账单记录");
        const description = createElement(
            "p",
            "records-empty-description",
            "还没有添加任何账单，快去记录你的第一笔收支吧！"
        );

        empty.appendChild(icon);
        empty.appendChild(title);
        empty.appendChild(description);

        recordsContainer.appendChild(empty);
    }

    /**
     * 创建单条账单
     */
    function createRecordItem(record) {
        const item = createElement("div", "record-item");

        item.dataset.id = String(record.id);

        const isIncome = record.type === "income";

        // 左侧分类图标
        const icon = createElement(
            "div",
            "record-icon " + (isIncome ? "income-icon" : "expense-icon"),
            getCategoryIcon(record.category)
        );

        // 账单主要信息
        const info = createElement("div", "record-info");

        const category = createElement(
            "div",
            "record-category",
            record.category || "未分类"
        );

        const note = createElement(
            "div",
            "record-note",
            record.note || "暂无备注"
        );

        const date = createElement(
            "div",
            "record-date",
            record.date || "日期未知"
        );

        info.appendChild(category);
        info.appendChild(note);
        info.appendChild(date);

        // 金额
        const amount = createElement(
            "div",
            "record-amount " + (isIncome ? "income-amount" : "expense-amount"),
            (isIncome ? "+" : "-") + "¥" + formatAmount(record.amount)
        );

        // 操作区域
        const actions = createElement("div", "record-actions");

        const detailButton = createElement(
            "button",
            "record-detail-btn",
            "详情"
        );

        detailButton.type = "button";
        detailButton.dataset.action = "detail";

        const deleteButton = createElement(
            "button",
            "record-delete-btn",
            "删除"
        );

        deleteButton.type = "button";
        deleteButton.dataset.action = "delete";

        actions.appendChild(detailButton);
        actions.appendChild(deleteButton);

        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(amount);
        item.appendChild(actions);

        return item;
    }

    /**
     * 根据分类返回图标
     */
    function getCategoryIcon(category) {
        const icons = {
            "餐饮": "🍜",
            "交通": "🚗",
            "购物": "🛍️",
            "娱乐": "🎮",
            "学习": "📚",
            "医疗": "💊",
            "居住": "🏠",
            "工资": "💰",
            "兼职": "💵",
            "奖学金": "🎓",
            "生活费": "💳",
            "红包": "🧧",
            "其他": "📦"
        };

        return icons[category] || "📝";
    }

    /**
     * 创建账单详情弹窗
     */
    function showDetail(record) {
        const oldModal = recordsContainer.querySelector(".record-modal");

        if (oldModal) {
            oldModal.remove();
        }

        const modal = createElement("div", "record-modal");

        const content = createElement("div", "record-modal-content");

        const header = createElement("div", "record-modal-header");

        const title = createElement("h3", "", "账单详情");

        const closeButton = createElement("button", "record-modal-close", "×");
        closeButton.type = "button";
        closeButton.dataset.action = "close";

        header.appendChild(title);
        header.appendChild(closeButton);

        const body = createElement("div", "record-modal-body");

        const fields = [
            ["账单类型", record.type === "income" ? "收入" : "支出"],
            ["金额", "¥" + formatAmount(record.amount)],
            ["分类", record.category || "未分类"],
            ["日期", record.date || "日期未知"],
            ["备注", record.note || "暂无备注"],
            ["记录编号", record.id || "未知"]
        ];

        fields.forEach(([label, value]) => {
            const row = createElement("div", "record-detail-row");

            const labelElement = createElement(
                "span",
                "record-detail-label",
                label
            );

            const valueElement = createElement(
                "span",
                "record-detail-value",
                value
            );

            row.appendChild(labelElement);
            row.appendChild(valueElement);

            body.appendChild(row);
        });

        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);

        recordsContainer.appendChild(modal);
    }

    /**
     * 绑定列表操作事件
     * 使用事件委托，避免重复绑定
     */
    function bindEvents() {
        if (eventBound || !recordsContainer) {
            return;
        }

        recordsContainer.addEventListener("click", function (event) {
            const button = event.target.closest("button[data-action]");

            if (!button || !recordsContainer.contains(button)) {
                return;
            }

            const action = button.dataset.action;

            if (action === "close") {
                const modal = recordsContainer.querySelector(".record-modal");

                if (modal) {
                    modal.remove();
                }

                return;
            }

            const item = button.closest(".record-item");

            if (!item) {
                return;
            }

            const id = item.dataset.id;

            if (action === "detail") {
                const record = getRecords().find(
                    record => String(record.id) === id
                );

                if (record) {
                    showDetail(record);
                }
            }

            if (action === "delete") {
                const confirmed = window.confirm(
                    "确定要删除这条账单记录吗？删除后无法恢复。"
                );

                if (confirmed) {
                    Records.deleteRecord(id);
                }
            }
        });

        eventBound = true;
    }

    /**
     * 监听账单数据更新事件
     */
    function bindUpdateEvent() {
        if (Records._updateEventBound) {
            return;
        }

        document.addEventListener("ledger:updated", function () {
            Records.refresh();
        });

        Records._updateEventBound = true;
    }

    /**
     * 首次渲染账单列表
     *
     * Ledger.Records.render(container)
     */
    Records.render = function (container) {
        if (typeof container === "string") {
            recordsContainer = document.querySelector(container);
        } else if (container instanceof HTMLElement) {
            recordsContainer = container;
        } else {
            recordsContainer = document.getElementById("records-container");
        }

        if (!recordsContainer) {
            console.error("未找到账单列表容器 records-container。");
            return;
        }

        bindEvents();
        bindUpdateEvent();

        Records.refresh();
    };

    /**
     * 重新获取数据并刷新列表
     *
     * Ledger.Records.refresh()
     */
    Records.refresh = function () {
        if (!recordsContainer) {
            recordsContainer = document.getElementById("records-container");
        }

        if (!recordsContainer) {
            console.error("未找到账单列表容器 records-container。");
            return;
        }

        const records = sortRecords(getRecords());

        // 清空原有列表
        recordsContainer.innerHTML = "";

        // 列表标题
        const header = createElement("div", "records-header");

        const title = createElement("h2", "records-title", "账单明细");

        const count = createElement(
            "span",
            "records-count",
            "共 " + records.length + " 条记录"
        );

        header.appendChild(title);
        header.appendChild(count);

        recordsContainer.appendChild(header);

        // 没有账单时显示空状态
        if (records.length === 0) {
            showEmptyState();
            return;
        }

        // 创建账单列表
        const list = createElement("div", "records-list");

        records.forEach(record => {
            list.appendChild(createRecordItem(record));
        });

        recordsContainer.appendChild(list);
    };

    /**
     * 删除账单记录
     *
     * Ledger.Records.deleteRecord(id)
     */
 Records.deleteRecord = function (id) {
    if (!window.LedgerStorage) {
        console.error("LedgerStorage 未加载，无法删除账单。");
        return false;
    }

    const success = window.LedgerStorage.deleteRecord(id);

    if (!success) {
        console.error("删除账单失败，记录不存在或存储操作失败。");
        return false;
    }

    return true;
};

    // 暴露模块
    window.Ledger.Records = Records;

})();