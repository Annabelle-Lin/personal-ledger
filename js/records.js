
/*!
 * records.js — 个人记账本 · 账单列表模块（S3）
 * 项目：简记 · 个人财务管理系统
 * 规范：遵循《个人记账本系统开发规范 V1.0》
 *
 * 职责：
 * 1. 渲染账单列表
 * 2. 按日期倒序排列账单
 * 3. 展示收入和支出信息
 * 4. 查看账单详情
 * 5. 删除账单记录
 *
 * 依赖：
 * LedgerStorage（S7 数据存储模块）
 *
 * 对外接口：
 * Ledger.Records.render(container)
 * Ledger.Records.refresh()
 * Ledger.Records.deleteRecord(id)
 *
 * 注意：
 * 1. 本模块不直接操作 localStorage。
 * 2. 删除数据由 S7 负责触发 ledger:updated。
 * 3. 本模块只监听 ledger:updated，不重复派发事件。
 */

(function (window, document) {
    "use strict";

    // ==========================================
    // 1. 初始化命名空间
    // ==========================================

    window.Ledger = window.Ledger || {};

    const Ledger = window.Ledger;

    // ==========================================
    // 2. 内部状态
    // ==========================================

    // 保存所有已经渲染的容器
    const containers = new Set();

    // 记录已经绑定事件的容器
    // 使用 WeakSet 避免同一容器重复绑定事件
    const eventBoundContainers = new WeakSet();

    // ==========================================
    // 3. 获取账单数据
    // ==========================================

    /**
     * 从 S7 存储模块获取账单
     * @returns {Array}
     */
    function getRecords() {
        if (
            !window.LedgerStorage ||
            typeof window.LedgerStorage.getRecords !== "function"
        ) {
            console.error(
                "LedgerStorage 未加载，请检查 storage.js 是否正确引入。"
            );

            return [];
        }

        const records = window.LedgerStorage.getRecords();

        return Array.isArray(records) ? records : [];
    }

    // ==========================================
    // 4. 账单排序
    // ==========================================

    /**
     * 按日期倒序排列
     * 日期较新的账单排在前面
     *
     * @param {Array} records
     * @returns {Array}
     */
    function sortRecords(records) {
        return [...records].sort(function (a, b) {
            const dateA = new Date(a.date).getTime() || 0;
            const dateB = new Date(b.date).getTime() || 0;

            return dateB - dateA;
        });
    }

    // ==========================================
    // 5. 金额格式化
    // ==========================================

    /**
     * 格式化金额
     * @param {number} amount
     * @returns {string}
     */
    function formatAmount(amount) {
        const number = Number(amount);

        if (!Number.isFinite(number)) {
            return "0.00";
        }

        return number.toFixed(2);
    }

    // ==========================================
    // 6. 获取分类图标
    // ==========================================

    /**
     * 根据账单分类返回图标
     *
     * @param {string} category
     * @returns {string}
     */
    function getCategoryIcon(category) {
        const icons = {
            "餐饮": "🍜",
            "交通": "🚗",
            "购物": "🛍️",
            "娱乐": "🎮",
            "学习": "📚",
            "医疗": "🏥",
            "居住": "🏠",
            "工资": "💰",
            "兼职": "💼",
            "奖学金": "🎓",
            "生活费": "💵",
            "红包": "🧧",
            "其他": "📦"
        };

        return icons[category] || "📋";
    }

    // ==========================================
    // 7. 创建 DOM 元素
    // ==========================================

    /**
     * 创建 HTML 元素
     *
     * @param {string} tag
     * @param {string} className
     * @param {string} text
     * @returns {HTMLElement}
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

    // ==========================================
    // 8. 创建空状态
    // ==========================================

    /**
     * 没有账单时显示空状态
     *
     * @returns {HTMLElement}
     */
    function createEmptyState() {
        const empty = createElement(
            "div",
            "records-empty"
        );

        const icon = createElement(
            "div",
            "records-empty-icon",
            "📝"
        );

        const title = createElement(
            "p",
            "records-empty-title",
            "暂无账单记录"
        );

        const description = createElement(
            "p",
            "records-empty-description",
            "添加一笔账单，开始记录你的收支吧！"
        );

        empty.appendChild(icon);
        empty.appendChild(title);
        empty.appendChild(description);

        return empty;
    }

    // ==========================================
    // 9. 创建单条账单
    // ==========================================

    /**
     * 创建单条账单 DOM
     *
     * @param {Object} record
     * @returns {HTMLElement}
     */
    function createRecordItem(record) {
        const isIncome = record.type === "income";

        const item = createElement(
            "div",
            "record-item"
        );

        item.dataset.id = record.id;

        // 左侧分类图标
        const icon = createElement(
            "div",
            "record-icon",
            getCategoryIcon(record.category)
        );

        // 中间账单信息
        const info = createElement(
            "div",
            "record-info"
        );

        const category = createElement(
            "div",
            "record-category",
            record.category || "其他"
        );

        const date = createElement(
            "div",
            "record-date",
            record.date || ""
        );

        const note = createElement(
            "div",
            "record-note",
            record.note || "暂无备注"
        );

        info.appendChild(category);
        info.appendChild(date);
        info.appendChild(note);

        // 右侧金额
        const amount = createElement(
            "div",
            isIncome
                ? "record-amount income"
                : "record-amount expense"
        );

        const sign = isIncome ? "+" : "-";

        amount.textContent =
            sign + "¥" + formatAmount(record.amount);

        // 操作按钮
        const actions = createElement(
            "div",
            "record-actions"
        );

        const detailButton = createElement(
            "button",
            "record-detail-btn",
            "详情"
        );

        detailButton.type = "button";
        detailButton.dataset.action = "detail";
        detailButton.dataset.id = record.id;

        const deleteButton = createElement(
            "button",
            "record-delete-btn",
            "删除"
        );

        deleteButton.type = "button";
        deleteButton.dataset.action = "delete";
        deleteButton.dataset.id = record.id;

        actions.appendChild(detailButton);
        actions.appendChild(deleteButton);

        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(amount);
        item.appendChild(actions);

        return item;
    }

    // ==========================================
    // 10. 渲染账单列表
    // ==========================================

    /**
     * 将账单渲染到指定容器
     *
     * @param {HTMLElement} container
     */
    function renderRecords(container) {
        const records = sortRecords(getRecords());

        // 清空原有内容
        container.innerHTML = "";

        // 创建列表容器
        const list = createElement(
            "div",
            "records-list"
        );

        // 没有数据时显示空状态
        if (records.length === 0) {
            list.appendChild(createEmptyState());
        } else {
            records.forEach(function (record) {
                list.appendChild(createRecordItem(record));
            });
        }

        container.appendChild(list);
    }

    // ==========================================
    // 11. 查看账单详情
    // ==========================================

    /**
     * 显示账单详情
     *
     * @param {HTMLElement} container
     * @param {string} id
     */
    function showDetail(container, id) {
        const records = getRecords();

        const record = records.find(function (item) {
            return String(item.id) === String(id);
        });

        if (!record) {
            window.alert("未找到该账单记录。");
            return;
        }

        // 防止重复创建详情窗口
        const oldModal = container.querySelector(
            ".record-detail-modal"
        );

        if (oldModal) {
            oldModal.remove();
        }

        // 创建详情窗口
        const modal = createElement(
            "div",
            "record-detail-modal"
        );

        const content = createElement(
            "div",
            "record-detail-content"
        );

        const title = createElement(
            "h3",
            "record-detail-title",
            "账单详情"
        );

        const typeText =
            record.type === "income" ? "收入" : "支出";

        const fields = [
            ["收支类型", typeText],
            ["金额", "¥" + formatAmount(record.amount)],
            ["分类", record.category || "其他"],
            ["日期", record.date || ""],
            ["备注", record.note || "暂无备注"]
        ];

        content.appendChild(title);

        fields.forEach(function (field) {
            const row = createElement(
                "div",
                "record-detail-row"
            );

            const label = createElement(
                "span",
                "record-detail-label",
                field[0]
            );

            const value = createElement(
                "span",
                "record-detail-value",
                field[1]
            );

            row.appendChild(label);
            row.appendChild(value);

            content.appendChild(row);
        });

        const closeButton = createElement(
            "button",
            "record-detail-close",
            "关闭"
        );

        closeButton.type = "button";
        closeButton.dataset.action = "close-detail";

        content.appendChild(closeButton);
        modal.appendChild(content);

        container.appendChild(modal);
    }

    // ==========================================
    // 12. 绑定事件
    // ==========================================

    /**
     * 为指定容器绑定事件
     *
     * @param {HTMLElement} container
     */
    function bindEvents(container) {
        if (!container) {
            return;
        }

        // 当前容器已经绑定过事件，不再重复绑定
        if (eventBoundContainers.has(container)) {
            return;
        }

        eventBoundContainers.add(container);

        // 使用事件委托处理按钮点击
        container.addEventListener("click", function (event) {
            const target = event.target;

            // 防止点击非元素节点时出错
            if (!(target instanceof Element)) {
                return;
            }

            // 查看详情
            const detailButton = target.closest(
                "[data-action='detail']"
            );

            if (
                detailButton &&
                container.contains(detailButton)
            ) {
                const id = detailButton.dataset.id;

                showDetail(container, id);

                return;
            }

            // 删除账单
            const deleteButton = target.closest(
                "[data-action='delete']"
            );

            if (
                deleteButton &&
                container.contains(deleteButton)
            ) {
                const id = deleteButton.dataset.id;

                const confirmed = window.confirm(
                    "确定删除这条账单记录吗？"
                );

                if (confirmed) {
                    Ledger.Records.deleteRecord(id);
                }

                return;
            }

            // 关闭详情
            const closeButton = target.closest(
                "[data-action='close-detail']"
            );

            if (
                closeButton &&
                container.contains(closeButton)
            ) {
                const modal = closeButton.closest(
                    ".record-detail-modal"
                );

                if (modal) {
                    modal.remove();
                }
            }
        });
    }

    // ==========================================
    // 13. 公开接口：render
    // ==========================================

    /**
     * 首次渲染账单列表
     *
     * @param {HTMLElement|string} container
     */
    function render(container) {
        let target = container;

        // 支持传入选择器
        if (typeof target === "string") {
            target = document.querySelector(target);
        }

        // 未传入容器时使用默认容器
        if (!target) {
            target = document.getElementById(
                "records-container"
            );
        }

        if (
            !target ||
            !(target instanceof window.HTMLElement)
        ) {
            console.error(
                "账单列表渲染失败：未找到有效的容器。"
            );

            return;
        }

        // 保存容器
        containers.add(target);

        // 为当前容器绑定事件
        bindEvents(target);

        // 渲染账单
        renderRecords(target);
    }

    // ==========================================
    // 14. 公开接口：refresh
    // ==========================================

    /**
     * 重新获取数据并刷新所有已注册容器
     */
    function refresh() {
        // 删除已经脱离页面的容器
        containers.forEach(function (container) {
            if (!container.isConnected) {
                containers.delete(container);
            }
        });

        // 刷新所有已注册容器
        containers.forEach(function (container) {
            renderRecords(container);
        });
    }

    // ==========================================
    // 15. 公开接口：deleteRecord
    // ==========================================

    /**
     * 删除账单记录
     *
     * 通过 S7 存储模块删除。
     * S7 内部负责触发 ledger:updated。
     * S3 不重复派发事件。
     *
     * @param {string} id
     * @returns {boolean}
     */
    function deleteRecord(id) {
        if (
            !window.LedgerStorage ||
            typeof window.LedgerStorage.deleteRecord !== "function"
        ) {
            console.error(
                "LedgerStorage.deleteRecord 不存在，请检查 storage.js。"
            );

            return false;
        }

        const success = window.LedgerStorage.deleteRecord(id);

        if (!success) {
            window.alert(
                "删除失败，该账单可能已经不存在。"
            );

            return false;
        }

        // S7 已经触发 ledger:updated
        // S3 不再重复触发事件

        return true;
    }

    // ==========================================
    // 16. 监听全局数据更新事件
    // ==========================================

    /**
     * S7 在 document 上派发 ledger:updated。
     * S3 在 document 上监听并刷新列表。
     */
    document.addEventListener(
        "ledger:updated",
        function () {
            refresh();
        }
    );

    // ==========================================
    // 17. 暴露公开接口
    // ==========================================

    Ledger.Records = {
        render: render,
        refresh: refresh,
        deleteRecord: deleteRecord
    };

})(window, document);

