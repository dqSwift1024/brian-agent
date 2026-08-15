# 工具页面产品需求文档 (PRD)

## 1. 文档概述

| 项目 | 内容 |
| :--- | :--- |
| **页面名称** | 开发工具集 (Developer Tools) |
| **所属模块** | 系统工具 |
| **目标用户** | 开发者、系统维护者 |
| **核心价值** | 提供 ID 生成、JSON/XML 检查格式化压缩、正则表达式匹配等常用开发工具，统一由后端 ToolProvider 提供能力 |

## 2. 页面布局结构

页面采用 Tab 切换布局，顶部为导航图标切换（与其他页面一致），内容区包含 4 个 Tab：

1. **ID 生成**
2. **JSON 工具**
3. **XML 工具**
4. **正则表达式**

## 3. 功能详细设计

### 3.1 ID 生成

- 输入：数量（1-1000，默认 1）
- 操作：点击「生成」按钮调用 `POST /api/tool/id`，后端返回 UUID v4 列表
- 展示：以列表展示生成的 UUID，每项提供「复制」按钮

### 3.2 JSON 工具

- 输入：JSON 文本（textarea）、缩进选择（2 / 4 空格）
- 操作按钮：
  - 「检查」：调用 `POST /api/tool/json/check`，返回合法性及错误信息
  - 「格式化」：调用 `POST /api/tool/json/format`，返回缩进美化后的 JSON
  - 「压缩」：调用 `POST /api/tool/json/minify`，返回单行压缩后的 JSON
- 展示：结果区显示成功/失败状态，成功结果以等宽字体展示并提供「复制」按钮

### 3.3 XML 工具

- 输入：XML 文本（textarea）、缩进选择（2 / 4 空格）
- 操作按钮：同 JSON（检查 / 格式化 / 压缩），分别调用 `POST /api/tool/xml/check|format|minify`
- 展示：同 JSON 工具

### 3.4 正则表达式

- 输入：
  - 正则表达式 pattern
  - 标志 flags（g / i / m / s，可选）
  - 待匹配文本（textarea）
- 操作：点击「匹配」按钮调用 `POST /api/tool/regex`
- 展示：
  - 匹配状态（匹配成功 / 无匹配）
  - 匹配次数
  - 匹配结果列表（全局匹配时展示所有匹配）
  - 捕获组（非全局匹配且存在命名/捕获组时展示）
  - 非法正则或非法 flags 时展示错误信息

## 4. 后端接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/tool/id` | 生成 ID（入参 `count`） |
| POST | `/api/tool/json/check` | JSON 检查 |
| POST | `/api/tool/json/format` | JSON 格式化 |
| POST | `/api/tool/json/minify` | JSON 压缩 |
| POST | `/api/tool/xml/check` | XML 检查 |
| POST | `/api/tool/xml/format` | XML 格式化 |
| POST | `/api/tool/xml/minify` | XML 压缩 |
| POST | `/api/tool/regex` | 正则匹配 |

## 5. 交互规范

- 所有结果支持一键复制到剪贴板；
- 处理失败时展示明确的错误信息（红色），成功时展示成功状态（绿色）；
- 文本输入区使用等宽字体（font-mono），支持纵向拉伸；
- 页面遵循浅色 / 深色主题与 i18n（页面标题「工具」/ "Tools"）。
