# 个人记账本系统 (Personal Ledger)

## 1. 项目简介
本项目为 2026 年 11 月 7 日现场编程作业，开发一个基于 Web 的个人记账本系统。用户可记录日常收入与支出，查看历史记录，并按日期、类别等维度查询统计，附带图表展示。纯前端实现，数据存于 LocalStorage。

## 2. 团队分工
| 编号 | 岗位 | 交付物 |
|---|---|---|
| S1 | 前端负责人 | index.html |
| S2 | 记账表单 | form.js |
| S3 | 账单列表 | records.js |
| S4 | 财务计算 | finance.js |
| S5 | 筛选查询 | filter.js |
| S6 | 统计图表 | charts.js |
| S7 | 数据存储 | storage.js |
| S8 | 数据导入导出 | export.js |
| S9 | 测试负责人 | tests.js |
| S10 | UI 体验优化 | style.css |
| S11 | GitHub 与文档 | README.md |
| S12 | 演示与发布 | demo-data.js |
| S13 | 项目总负责人 | 代码审查与集成 |

## 3. 统一数据结构 (接口契约)
所有模块的数据交互必须严格遵守以下 JSON 格式：
{
  id: "record_001",
  type: "expense", // income 或 expense
  amount: 25.00,   // 数字类型
  category: "餐饮",
  date: "2026-11-07", // YYYY-MM-DD
  note: "午餐"
}

## 4. Git 协作规范
- 主分支：`main` (仅组长合并)
- 开发分支：`develop`
- 个人分支：`feature/SX-模块名` (如 `feature/S2-form`)
- 提交信息规范：`feat` (新功能), `fix` (修复), `docs` (文档)