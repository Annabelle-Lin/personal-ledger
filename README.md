# 简记 - 个人记账本系统 (Personal Ledger)

## 1. 项目简介
本项目为 2026 年 11 月 7 日现场编程作业，开发一个基于 Web 的个人记账本系统。用户可记录日常收入与支出，查看历史记录，并按日期、类别等维度查询统计，附带图表展示。项目采用纯前端技术栈（HTML/CSS/原生 JS），数据持久化存储于浏览器 LocalStorage，并采用了**事件驱动架构**进行模块解耦。

## 2. 团队分工与交付物
| 编号 | 岗位 | 交付物 | 具体职责 |
|---|---|---|---|
| S1 | 前端负责人 | index.html | 首页布局、页面框架、提供表单元素挂载点 |
| S2 | 记账表单 | form.js | 表单注入/绑定、必填与合法性校验、新增记录 |
| S3 | 账单列表 | records.js | 监听更新事件、账单渲染、删除记录 |
| S4 | 财务计算 | finance.js | 收入、支出、余额、多维度汇总计算 |
| S5 | 筛选查询 | filter.js | 日期、类别、收支类型、金额范围筛选 |
| S6 | 统计图表 | charts.js | 收支趋势、类别占比图表渲染 |
| S7 | 数据存储 | storage.js | 统一数据读写、增删改查接口、事件派发 |
| S8 | 数据导入导出 | export.js | 严格格式化 JSON/CSV 导出；安全导入及校验 |
| S9 | 测试负责人 | tests.js | 编写测试用例、测试数据保护机制 |
| S10 | UI 体验优化 | style.css | 统一配色、响应式布局与交互反馈 |
| S11 | GitHub 与文档 | README.md | 文档编写、接口规范整理、协作记录整理 |
| S12 | 演示与发布 | demo-data.js | 演示数据生成、版本发布管理 |
| S13 | 项目总负责人 | main 分支 | 架构设计、接口审查、代码合并与集成 |

## 3. 核心数据结构 (Data Contract)
所有模块的数据交互必须严格遵守以下 JSON 格式（金额必须是数字类型，禁止包含 createdAt 等额外非必需字段）：

{
  "id": "record_001",
  "type": "expense",
  "amount": 25.00,
  "category": "餐饮",
  "date": "2026-11-07",
  "note": "午餐"
}

*(注：type 取自 LedgerConstants（income/expense）；date 必须是严格的 YYYY-MM-DD 格式且需为真实存在的日期；底层计算使用整数分以避免精度丢失)*

## 4. 架构设计与核心接口规范
系统采用**事件驱动架构（Event-Driven）**。底层数据变更后，通过派发全局事件，上层 UI 模块（列表、图表、统计）监听事件后自动刷新，实现了极低的模块耦合度。

### 4.1 数据存储与事件中心 (S7 - LedgerStorage)
- 统一操作 LocalStorage 键名 `ledger_records`。
- **事件派发**：所有增删改操作成功后，会在 `document` 上派发 `ledger:updated` 事件。S3/S4/S5/S6 无需手动调用彼此，只需监听此事件即可刷新。
- **核心接口**：
  - `getRecords()`: 获取所有记录。
  - `addRecord(record)`: 新增单条记录。
  - `deleteRecord(id)` / `updateRecord(id, updates)`: 删除/更新记录。
  - `saveRecords(records)`: 批量覆盖保存，返回 `true` / `false`。
  - `seedIfEmpty()`: 若无数据，自动加载 S12 提供的演示数据。

### 4.2 记账表单模块 (S2 - Ledger.Form)
- **依赖**：`LedgerStorage.addRecord`、`LedgerConstants`。
- **核心接口**：
  - `Ledger.Form.render(container)` / `init()`: 注入表单并绑定事件 / 绑定已存在的表单元素。
  - `Ledger.Form.validate(fields)`: 校验必填项、金额（正数，最多两位小数，拒绝 `abc` 或 `1.234`）、真实日期（拒绝 `2026-02-31`）。
  - `Ledger.Form.buildRecord(fields)`: 校验通过后生成带 ID 的完整记录对象。
- **交互**：新增成功后派发 `ledger:updated`，触发全局刷新。

### 4.3 财务统计模块 (S4 - finance.js)
- **设计**：金额计算内部统一采用**整数分（Cents）**计算，避免浮点数精度丢失。
- **核心接口**：
  - `totalsCents()`: 计算总收入与总支出（需严格跳过非法日期）。
  - 提供多维度的分类汇总函数，供 S6 图表模块调用。

### 4.4 数据导入导出模块 (S8 - export.js)
- **导出规范**：导出的 JSON 严格包含统一外壳 `{ app: "personal-ledger", version: "1.0", exportedAt: "...", records: [] }`。
- **导入规范**：严格校验外壳及记录内部必填字段。导入失败时不覆盖原数据；导入成功后调用 S7 的 `saveRecords()`，并自动触发 `ledger:updated` 事件刷新页面，不使用 `location.reload()`。

### 4.5 测试模块 (S9 - tests.js)
- 提供独立的 `test-runner.html` 和自动化测试面板。
- **数据保护机制**：测试前自动备份用户真实数据，测试结束后恢复；若测试中途报错，使用 `finally` 及一致性验证确保数据不丢失。
- **测试覆盖**：涵盖 Storage 读写、Finance 计算、Form 校验、Filter 筛选及 Import/Export 接口。

## 5. Git 协作与质量保障
- **分支策略**：`main` (最终稳定版) <- `develop` (开发集成分支) <- `feature/SX-模块名` (个人分支)。
- **代码审查（Code Review）**：所有 PR 必须经组长（S13）审查。审查重点包括接口约定一致性、边界条件处理（如非法日期）、是否遵守唯一数据入口原则等。
- **提交规范**：使用 `feat`、`fix`、`docs`、`test` 等前缀清晰描述变更内容。

---
*详细常量定义及底层规范请参阅：[开发规范.md](./开发规范.md)*

