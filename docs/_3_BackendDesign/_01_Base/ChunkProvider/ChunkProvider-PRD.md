# ChunkProvider

## 1. 设计目标

提供文本分块（Chunking）能力，采用滑动窗口 + 重叠机制，支持文本字符串和文件路径两种输入方式。

## 2. 功能设计

### 2.1. 对文本内容分块（chunkText）

**功能**：对传入的文本字符串进行滑动窗口分块
**入参**：
- input：ChunkTextInput（继承 Input），包含以下字段：
  - content：待分块的文本内容（必选）
  - config：分块配置（可选）
    - windowSize：窗口大小，字符数（默认 500）
    - overlapRatio：重叠比例，0-1（默认 0.2，即 20%）
- context：ChunkContext（继承 Context）
- output：ChunkTextOutput（继承 Output），承载返回内容：
  - chunks：分块结果列表，每项包含 index（序号）、content（内容）、startOffset（起始偏移）、endOffset（结束偏移）

**处理流程**：
1. 校验 content 非空
2. 合并默认配置
3. 计算步长 `step = windowSize × (1 - overlapRatio)`
4. 从位置 0 开始，窗口大小为 windowSize，每次前进 step
5. 截取窗口内文本作为一 chunk，记录偏移量
6. 重复直到超出文本末尾

### 2.2. 对文件内容分块（chunkFile）

**功能**：对流式读取的文件进行滑动窗口分块，避免大文件一次性加载到内存
**入参**：
- input：ChunkFileInput（继承 Input），包含以下字段：
  - filePath：文件绝对路径（必选）
  - config：分块配置（可选，同 chunkText）
- context：ChunkFileContext（继承 Context）
- output：ChunkFileOutput（继承 Output），承载返回内容：
  - chunks：分块结果列表

**处理流程**：
1. 校验 filePath 非空
2. 使用 Node.js createReadStream + readline 逐行读取文件
3. 维护滚动缓冲区：容量为 `windowSize / 30 + 100` 行
4. 当缓冲区行数超过容量时，对缓冲区做滑动窗口分块，保留末尾未完整 chunk
5. 处理完所有行后，对剩余缓冲区做最终分块

## 3. 核心算法

### 滑动窗口 + 重叠

```
窗口大小 = windowSize (默认 500 字符)
重叠比例 = overlapRatio (默认 0.2)
步长 = windowSize × (1 - overlapRatio) (默认 400)

示例：windowSize=500, overlapRatio=0.2
Chunk 0: [0, 500)
Chunk 1: [400, 900)  ← 重叠 100 字符
Chunk 2: [800, 1300)
...
```

## 4. 模块结构

```
Base/ChunkProvider/
  index.ts              # 统一导出
  domain/types.ts        # Input/Output/Context 类型
  application/
    ChunkService.ts      # 核心分块逻辑
  access/
    ChunkAccess.ts       # 接入层（AOP 代理）
```

## 5. 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| windowSize | 500 | 窗口大小（字符数） |
| overlapRatio | 0.2 | 重叠比例（0-1），0.2 表示前后 chunk 有 20% 内容重叠 |

## 6. 内存优化

文件模式下使用流式读取：
- 滚动缓冲区容量根据 windowSize 动态计算
- 缓冲区满时立即分块并释放已处理内容
- 大文件（GB 级）可正常处理，不会 OOM

## 7. 递归分隔符文本分块器（RecursiveTextSplitter）

在滑动窗口分块之外，新增 LangChain 风格的递归分隔符分块器（`application/RecursiveTextSplitter.ts`），供向量化等语义敏感场景使用。

### 7.1. 设计目标

优先在语义边界（段落、换行、句号、空格等）切分长文本，避免在句子中间生硬断开；不足一块时合并，超出时递归降级到下一级分隔符，最终按字符硬切。

### 7.2. 分隔符（DEFAULT_SEPARATORS）

按优先级从高到低：`\n\n`（段落）、`\n`（换行）、`。！？!?`（句末）、`；;`（分号）、`，,`（逗号）、` `（空格）、`''`（字符硬切）。

### 7.3. 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| chunkSize | 512 | 分块最大字符数（码点数） |
| chunkOverlap | 64 | 相邻 chunk 重叠字符数，须 < chunkSize |

### 7.4. 导出

- `RecursiveTextSplitter`：静态方法 `splitText(text, options)`、`charLength(text)`；
- `DEFAULT_SEPARATORS`、`RecursiveSplitOptions` 类型。
