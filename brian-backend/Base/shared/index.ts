/**
 * @fileoverview shared 共享内核统一导出。
 *
 * 本模块为所有 Base 层 Provider 提供公共基础能力：
 * - base：Input / Context / Output 基类
 * - query：Condition / OrderBy / Page / DataObject / QueryParam / Operation 公共查询对象
 * - errors：统一错误类型
 * - aop：代理模式切面注入（日志记录、耗时统计）
 * - config：配置服务（基于关系数据库配置表的键值对读写）
 * - native：跨平台原生模块加载器（自动检测 OS/架构/ABI）
 *
 * 说明：ID 生成器（IdGenerator）与 JSON / XML 解析工具（JsonParser / XmlParser）
 * 已迁移至 ToolProvider 模块，经 `@brian-agent/base` 统一导出。
 */

// 基类与全局枚举
export { Input } from './base/Input';
export { Context } from './base/Context';
export { Output } from './base/Output';
export { InfoType, CollectionSource, ContextSource } from './base/InfoEnums';

// 查询对象
export {
  Operator,
  Logic,
  Direction,
  OperationType,
  VisualScope,
} from './query/QueryObjects';
export type {
  Condition,
  OrderBy,
  Page,
  DataObject,
  QueryParam,
  Operation,
} from './query/QueryObjects';

// 错误类型
export {
  ProviderError,
  ComponentDisabledError,
  ValidationError,
  NotFoundError,
  DatabaseError,
} from './errors';

// AOP 代理
export { AopProxy, ConsoleLogger } from './aop/AopProxy';
export type { Logger, AopProxyOptions } from './aop/AopProxy';
export type { Interceptor, InterceptContext } from './aop/Interceptor';

// 配置服务
export { ConfigService, ValueType } from './config/ConfigService';
export type { ConfigItem, IConfigStorage } from './config/ConfigService';

// 跨平台原生模块加载器
export { NativeLoader } from './native/NativeLoader';
export type { PlatformInfo, LoadResult } from './native/NativeLoader';

// Prompt 模板配置键常量
export { PROMPT_SLOTS } from './prompt/PromptConfigKeys';
export type { PromptSlot } from './prompt/PromptConfigKeys';
