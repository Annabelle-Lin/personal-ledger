# 简记 · 个人记账本系统（Personal Ledger）

> 2026-11-07《软件工程与软件工程实践》现场编程作业 · 福州大学 计算机与大数据学院
> 技术栈：HTML5 + CSS3 + 原生 JavaScript（无构建工具）+ Chart.js（本地 vendor）

## 1. 项目简介

「简记」是一个纯前端的个人记账本：记录每天的收支，按日期、类别、金额筛选查询，
用统计卡片和图表看清钱花到哪里去了。数据保存在浏览器的 LocalStorage 中，
不依赖后端、不联网也能完整演示。

代码采用**按成员分模块 + 全局命名空间 + 事件驱动**的架构：
每个成员只负责一个文件，模块之间只通过约定的接口和 `ledger:updated` 事件通信，
所有数据读写必须经过 S7 的 `LedgerStorage`。

## 2. 功能清单（对照作业需求）

| 作业需求 | 本项目实现 | 主要模块 |
| --- | --- | --- |
| ① 基础记账：日期、金额、类别、备注 | 分段切换收入/支出、类别图标墙、金额与日期逐字段校验；数据写入 LocalStorage（JSON 结构） | S2 `form.js`、S7 `storage.js` |
| ② 查看数据：查看最近几笔记录 | **月历视图**：每个日期标出当日支出/收入，点日期只看当天明细，也可切换"整月"浏览；每条可看详情、可编辑、可删除 | S3 `records.js` |
| ③ 收支统计：按日期、类别、金额查看总收入/总支出 | 顶部「本月概览」4 张卡片（收入/支出/结余/累计结余）+ 环比；月份前后切换；筛选栏支持类型、类别、日期区间、金额区间、关键词，并实时合计 | S4 `finance.js`、S5 `filter.js`、S1 `app.js` |
| ④ 用户友好 | 响应式布局（桌面双栏 / 手机单栏）、空状态引导、Toast 轻提示、自定义确认弹窗、表单错误定位、`Ctrl + Enter` 快捷保存、键盘可操作 | S10 `style.css`、S1 `app.js`、S2/S3 |
| ⑤ 附加功能：简单图表 | 收入 vs 支出柱状图、支出分类占比环形图、每日收支趋势折线图；随月份联动 | S6 `charts.js` |
| 其他（加分项） | JSON 导入/导出（严格校验、失败不覆盖）、示例数据一键恢复、单元测试面板 | S8 `export.js`、S12 `demo-data.js`、S9 `tests/` |

## 3. 快速开始

> ⚠️ **必须先解压整个文件夹，再双击里面的 `index.html`。**
> 如果只打开 `index.html` 一个文件（比如在压缩包预览窗口里直接双击 HTML），
> `css/`、`js/`、`vendor/` 都不在旁边，页面会既没样式也没内容——页面顶部会自动给出红色提示。

**方式一：直接双击 `index.html`**（Chrome / Edge 均可，已验证 LocalStorage 可用）。
`index.html` 必须与 `css/`、`js/`、`vendor/` 三个文件夹处在同一层。

**方式二（推荐，行为最接近线上）：**在项目根目录启动一个静态服务器：

```bash
python -m http.server 8080
# 浏览器打开 http://localhost:8080/index.html
```

首次打开会自动写入 33 条示例账单（覆盖 2026 年 9/10/11 三个月，方便演示月份切换与图表）。
页面底部提供「恢复示例数据」「清空全部账单」，清空后刷新页面不会再次自动写入示例数据。

**自动化测试：**浏览器打开 `tests/test-runner.html`，自动执行 `Ledger.Tests.runAll()`，
当前结果为 **20 / 20 全部通过**。测试开始前会备份真实数据、结束后恢复，不会污染账单。

## 4. 目录结构

```
personal-ledger/
├── index.html                 # 页面骨架：概览、表单、图表、筛选、明细、导入导出
├── README.md                  # 项目说明（本文件）
├── 开发规范.md                # 团队接口约定 V1.0 + 整合期补充约定
├── css/
│   └── style.css              # 全站样式：设计令牌 + 组件 + 响应式
├── js/
│   ├── constants.js           # 统一常量：存储键、收支类型、类别
│   ├── storage.js             # S7 唯一数据入口（LocalStorage CRUD + 事件派发）
│   ├── form.js                # S2 记账表单
│   ├── records.js             # S3 账单明细（分组、详情、编辑、删除）
│   ├── finance.js             # S4 财务统计（整数分计算，避免浮点误差）
│   ├── filter.js              # S5 筛选查询（条件 + 筛选栏 UI）
│   ├── charts.js              # S6 图表（Chart.js）
│   ├── export.js              # S8 导入导出 JSON
│   ├── demo-data.js           # S12 示例数据
│   └── app.js                 # S1 启动编排、月份状态、Toast/确认弹窗
├── vendor/
│   └── chart.umd.min.js       # Chart.js 本地包（离线可用）
└── tests/
    ├── tests.js               # S9 测试用例（storage / finance / form / filter / import-export）
    ├── test-runner.html       # S9 测试面板（可视化结果）
    └── storage-test.html      # S7 存储模块自测页
```

## 5. 团队分工

| 编号 | 角色 | 交付文件 | 主要职责 |
| --- | --- | --- | --- |
| S1 | 页面与集成 | `index.html`、`js/app.js`、`vendor/` | 页面骨架、模块挂载顺序、月份状态、统一刷新、Toast/确认弹窗 |
| S2 | 记账表单 | `js/form.js` | 表单渲染、校验、构建记录、调用存储 |
| S3 | 账单明细 | `js/records.js` | 列表分组渲染、详情、编辑、删除 |
| S4 | 财务统计 | `js/finance.js` | 收入/支出/余额/月度/分类/趋势计算 |
| S5 | 筛选查询 | `js/filter.js` | 条件规范化、筛选匹配、筛选栏 UI |
| S6 | 统计图表 | `js/charts.js` | 三类图表渲染与空状态 |
| S7 | 数据存储 | `js/storage.js` | LocalStorage CRUD、数据校验、事件派发 |
| S8 | 导入导出 | `js/export.js` | JSON 导出、严格校验导入 |
| S9 | 测试 | `tests/tests.js`、`tests/test-runner.html` | 测试用例与测试面板 |
| S10 | UI/样式 | `css/style.css` | 设计令牌、组件样式、响应式 |
| S11 | 文档 | `README.md` | 项目介绍、运行说明、接口说明 |
| S12 | 示例数据 | `js/demo-data.js` | 跨月示例数据、初始化与恢复 |
| S13 | 项目管理 | `开发规范.md`、`main` 分支 | 接口规范、代码审查、冲突处理、发布 |

## 6. 数据结构与常量

所有模块共用同一条记录（字段名不得修改）：

```json
{
  "id": "record_001",
  "type": "expense",
  "amount": 25.00,
  "category": "餐饮",
  "date": "2026-11-07",
  "note": "午餐"
}
```

- `type`：`income`（收入）/ `expense`（支出）；
- `amount`：正数，最多两位小数（内部按“分”累加，避免 `0.1 + 0.2` 浮点误差）；
- `date`：`YYYY-MM-DD`，必须是真实存在的日期（`2026-02-31` 会被拒绝）；
- `note`：选填，最长 60 字。

存储层会额外维护 `createdAt` / `updatedAt` 两个**内部时间戳**，用于同一天内的排序，
业务模块可忽略；导入导出时允许携带，不影响兼容性。

统一常量见 `js/constants.js`：

```js
window.LedgerConstants = {
  STORAGE_KEY: 'ledger_records',
  RECORD_TYPES: { INCOME: 'income', EXPENSE: 'expense' },
  INCOME_CATEGORIES: ['工资', '兼职', '奖学金', '生活费', '红包', '其他'],
  EXPENSE_CATEGORIES: ['餐饮', '交通', '购物', '娱乐', '学习', '医疗', '居住', '其他']
};
```

## 7. 模块接口

| 模块 | 接口 |
| --- | --- |
| S7 存储 | `LedgerStorage.getRecords()`、`addRecord(record)`、`updateRecord(id, patch)`、`deleteRecord(id)`、`saveRecords(records)`、`seedIfEmpty(records?)`、`clearAll({suppressDemo})`、`allowSeedAgain()` |
| S2 表单 | `Ledger.Form.render(container)`、`init()`、`validate(fields)`、`validateAmount(value)`、`buildRecord(fields)`、`IDS` |
| S3 明细 | `Ledger.Records.render(container)`、`refresh()`、`deleteRecord(id)`、`setSource(fn)`（筛选联动）、`setMonth(month)`、`selectDate(date)`、`setOnMonthChange(fn)` |
| S4 统计 | `Finance.currentMonth()`、`calculateTotalIncome/Expense/Balance()`、`calculateMonthlyIncome/Expense/Balance()`、`calculateSummary()`、`calculateCategoryStats()`、`calculateDailyTrend()` |
| S5 筛选 | `Ledger.Filter.apply(records, conditions)`、`reset()`、`getConditions()`、`init({root, onChange})`、`refresh()` |
| S6 图表 | `Ledger.Charts.init(container)`、`update(records)`、`destroy()` |
| S8 导入导出 | `exportToJSON()`、`importFromJSON(file)`、`Ledger.Export.parseBackup(text)` |
| S9 测试 | `Ledger.Tests.runAll()`、`testStorage()`、`testFinance()`、`testForm()`、`testFilter()`、`testImportExport()` |
| S12 示例 | `Ledger.DemoData.getRecords()`、`load()`、`restore()` |
| S1 入口 | `Ledger.App.init()`、`Ledger.App.toast(message, type)`、`Ledger.App.confirm(options)`、`Ledger.App.refresh()` |

### 7.1 事件机制

数据变化后由 S7 在 `document` 上派发统一事件：

```js
document.addEventListener('ledger:updated', function (e) {
  // e.detail.action: add | update | delete | replace | seed | clear
});
```

新增、修改、删除、导入、示例初始化、清空都会触发；**单纯筛选或切换月份不触发**，
由 S1 直接调用对应模块刷新，避免重复渲染。

### 7.2 集成关系（S1 负责编排）

- 页面加载：S12 示例数据 → S2 表单 → S5 筛选 → S3 日历与明细 → S6 图表 → S1 概览；
- 筛选变化：S5 通过 `Ledger.Filter.onChange` 把筛选结果交给 S1，
  S1 用 `Ledger.Records.setSource()` 注入数据源并刷新日历与明细；
- 月份联动：顶部月份切换调用 `Ledger.Records.setMonth()`；日历翻月时通过
  `Ledger.Records.setOnMonthChange()` 回调 S1，三处（概览 / 图表 / 日历）始终同一个月；
- 数据变化：S1 监听 `ledger:updated`，统一触发 `Filter.refresh()`、概览与图表刷新；
  新增账单时自动跳到那笔账单的月份与日期，避免“记完却在列表里找不到”；
- 图表口径：S1 把本月记录传给 `Ledger.Charts.update(records)`，
  图表内部用记录的合计值（`totalIncome / totalExpense`）作图，切到任何月份都正确。

## 8. 验收与测试

**自动化：**打开 `tests/test-runner.html`，当前 **20 / 20 通过**，控制台无报错。

**手工验收清单：**

1. 新增一笔支出 / 收入 → 日历、当日明细、概览、图表同步变化，并自动跳到该日期；
2. 输入 `-5`、`abc`、`1.234`、空日期 → 全部被拦截并给出字段提示；
3. 点日历上的某一天 → 右侧只显示当天明细；点“整月” → 显示整月全部记录；
4. 按类型、类别、日期区间、金额区间、关键词筛选 → 日历与明细同步收敛；
5. 切换月份（顶部或日历） → 概览、图表、日历三处一起变，点月份标签回到本月；
6. 点击账单 → 详情 → 编辑金额保存 → 明细更新；删除 → 二次确认后消失；
7. 导出 JSON → 文件包含 `app/version/exportedAt/records`；导入非法文件 → 提示失败且原数据不变；
8. 清空全部账单 → 出现空状态，刷新后不再自动灌注示例数据；恢复示例数据 → 回到 33 条；
9. 浏览器缩放到手机宽度 → 单列布局，日历与明细正常。

## 9. 协作规范

- 分支：`main`（发布）← `develop`（集成）← `feature/SX-模块名`（个人）；
- 每人只改自己负责的文件，改动前先 `git pull` 同步 `develop`；
- 提交信息带前缀：`feat(SX): …` / `fix(SX): …` / `docs(SX): …` / `test(SX): …`；
- 所有 PR 由 S13 审查后合并，重点看接口一致性与边界条件；
- 发布：在 GitHub 上打 tag / release，附 `index.html` + `js/` + `css/` + `vendor/`。

## 10. 已知边界

- LocalStorage 约 5MB，适合个人记账量级；不支持多设备同步；
- 数据只存在当前浏览器中，换浏览器 / 清缓存会丢失，重要数据请导出 JSON 备份；
- 图表依赖 `vendor/chart.umd.min.js`，请勿删除该文件；
- 页面为纯静态文件，可直接用文件协议打开，但推荐用本地 HTTP 服务器访问以获得一致行为。

---

*接口细节与补充约定见 [开发规范.md](./开发规范.md)。*
