# 用户画像展示页面产品需求文档 (PRD)

## 1. 文档概述

### 1.1 产品背景
用户画像是系统基于用户对话数据（`info_type=REQUEST` 且 `info_creator_role=USER` 的消息）逐步构建的多维度用户特征模型。本页面为信息展示页面（`/info`）的第 6 个 Tab，用于集中展示系统对用户的理解，包括画像总结、各维度分析结果、置信度与稳定性标注，以及画像随时间的版本演变历史。

### 1.2 核心目标
- **画像可视化**：将多维度画像数据（行业、知识领域、文风、学习倾向等）以结构化卡片清晰呈现。
- **可信度表达**：每个维度展示置信度与稳定性标注（stable / drifting / emerging），让用户理解画像结论的可信程度。
- **版本追溯**：支持查看画像的历史版本及其变更摘要，追踪画像随时间的演变。
- **主动生成**：提供手动触发生成画像的入口，基于最新对话更新画像。

## 2. 全局交互规范
- **入口位置**：信息展示页面顶部 Tab 栏新增「画像」页签（图标：UserRound），与「历史」「记忆」「资料库」「Tag图」「关键词图」并列。
- **懒加载**：首次切换到「画像」Tab 时才请求画像数据，避免无关页面的不必要请求。
- **空状态**：无画像数据时展示引导性空状态（插画 + 操作指引），禁止空白区域。
- **响应式**：桌面端采用三栏布局（画像总结 + 维度占 2 栏，历史版本占 1 栏），窄屏自动降级为单栏堆叠。

## 3. 功能详细说明

### 3.1 画像总结区

**位置**：主区域顶部。

| 元素 | 说明 |
| :--- | :--- |
| 标题 | 「画像总结」+ Sparkles 图标 |
| 版本号 | 右侧显示「版本 v{{profile_version}}」 |
| 总结内容 | 展示 `profile_summary`（LLM 生成的自然语言画像总结） |
| 生成时间 | 底部展示 `generated_at` 格式化时间 |

### 3.2 画像维度列表

**位置**：画像总结下方。

每个维度以独立卡片呈现，字段如下：

| 字段 | 来源 | 展示方式 |
| :--- | :--- | :--- |
| 维度名 | `dimensions` 的 key | 加粗标题 |
| 维度值 | `dimension.value` | 字符串/数组/对象分别格式化展示 |
| 置信度 | `dimension.confidence` | 百分比（如「置信度: 85%」） |
| 稳定性 | `dimension.stability` | 彩色标签（稳定/漂移中/新兴） |
| 证据 | `dimension.evidence[]` | 逐条列出（source + detail） |

**稳定性标签样式**：

| 值 | 文案 | 颜色 |
| :--- | :--- | :--- |
| `stable` | 稳定 | 绿色 |
| `drifting` | 漂移中 | 橙色 |
| `emerging` | 新兴 | 蓝色 |

**维度值格式化规则**：
- `string` → 直接展示
- `Array` → 以「、」连接
- `object` → 以「key: value · key: value」形式拼接
- `null/undefined` → 「—」

### 3.3 历史版本列表

**位置**：右侧栏。

- **排序**：按版本号倒序（最新在前）。
- **列表项内容**：版本号（v1/v2/...）、生成时间、变更摘要（`change_summary`，为空时回退 `profile_summary`）。
- **交互**：点击版本项 → 加载并展示该版本详情。
- **滚动**：列表超长时内部滚动（最大高度约 480px）。

### 3.4 版本详情

**位置**：历史版本列表下方。

- 点击历史版本后展示：版本号、生成时间、该版本 `profile_summary`、各维度值。
- 支持关闭（X 按钮）返回列表。

### 3.5 生成画像

- **入口**：画像 Tab 右上角「生成画像」按钮。
- **行为**：调用 `POST /api/profile/generate`，生成期间按钮显示 Loading 状态并禁用。
- **完成后**：自动刷新画像总结、维度、历史版本。

## 4. 数据模型定义

### 4.1 画像数据（UserProfileData）

对应 `GET /api/profile` 返回：

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `session_id` | string? | 会话范围（空为全局画像） |
| `profile_version` | number | 当前画像版本号（0 表示未生成） |
| `generated_at` | number | 生成时间戳 |
| `dimensions` | Record\<string, ProfileDimension\> | 各维度数据 |
| `profile_summary` | string | 画像总结 |
| `evolution_trend` | ProfileEvolutionItem[] | 版本演变趋势 |

### 4.2 维度数据（ProfileDimension）

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `value` | unknown | 维度值（字符串/数组/对象） |
| `confidence` | number | 置信度 0-1 |
| `evidence` | Array\<Record\> | 证据列表（source/detail 等） |
| `stability` | 'stable' \| 'drifting' \| 'emerging' | 稳定性标注 |

### 4.3 历史版本（ProfileHistoryItem）

对应 `GET /api/profile/history` 返回：

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | string | 记录 ID |
| `version` | number | 版本号 |
| `generated_at` | number | 生成时间 |
| `profile_summary` | string | 该版本总结 |
| `change_summary` | string | 相比上一版本的变更摘要 |

### 4.4 版本详情（ProfileVersionData）

对应 `GET /api/profile/version/:version` 返回：

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `version` | number | 版本号 |
| `generated_at` | number | 生成时间 |
| `dimensions` | Record\<string, ProfileDimension\> | 该版本维度数据 |
| `profile_summary` | string | 该版本总结 |

## 5. API 接口

| 接口 | 方法 | 说明 |
| :--- | :--- | :--- |
| `/api/profile` | GET | 获取完整画像（总结 + 维度 + 演变趋势） |
| `/api/profile/generate` | POST | 手动触发生成画像 |
| `/api/profile/history` | GET | 获取历史版本列表 |
| `/api/profile/version/:version` | GET | 获取指定版本详情 |

## 6. 空状态与异常处理

| 场景 | 展示 |
| :--- | :--- |
| 未生成画像（`profile_version=0`） | 空状态插画 + 「点击右上角『生成画像』基于用户对话生成第一版画像」 |
| 维度列表为空 | 「暂无维度数据」 |
| 历史版本为空 | 「暂无历史版本」 |
| API 请求失败 | 保持空状态，生成按钮可重试 |

## 7. 非功能性需求
- **性能**：画像数据量小，单次加载 ≤ 500ms；维度/历史列表无需虚拟滚动。
- **容错**：所有 API 请求失败时静默降级为空状态，不阻塞页面其他 Tab。
- **一致性**：稳定性标签、置信度展示与其他页面（配置中心画像维度）语义一致。

## 8. 验收标准
1. 画像 Tab 正常展示于信息页面顶部 Tab 栏，与其他 Tab 切换状态互不影响。
2. 未生成画像时展示引导性空状态，点击「生成画像」后能正确加载并展示画像总结、维度、历史版本。
3. 维度卡片正确展示 value、置信度、稳定性标签、证据列表；字符串/数组/对象维度值均正确格式化。
4. 历史版本列表按版本倒序，点击后正确展示该版本详情。
5. `vue-tsc` 类型检查通过，无相关类型错误。
