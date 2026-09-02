/**
 * @fileoverview GraphDBProvider 接入层。
 *
 * DDD 中 access 层与具体业务代码分离，作为模块对外的统一入口。
 * 本层职责：
 * 1. 初始化表结构（通过 GraphDBSchemaInitializer）；
 * 2. 封装 application 层 Service，提供 (Input, Context, Output) 签名的方法调用入口；
 * 3. 通过 AOP 代理注入日志记录与耗时统计切面；
 * 4. 通过简单改造即可将方法调用转换为 RPC 调用（方法签名保持 input/output 序列化友好）。
 *
 * 上层（其他 Provider、application 层）通过本类访问图数据，不直接接触 Service。
 */

import { Metrics } from '../../shared/base/Metrics';
import { Report } from '../../shared/base/Report';
import type { RelationDBAccess } from '../../RelationDBProvider/access/RelationDBAccess';
import { GraphDBComponent } from '../../components/GraphDB/GraphDBComponent';
import type { GraphDBComponentOptions } from '../../components/GraphDB/GraphDBComponent';
import { GraphDBSchemaInitializer } from '../infrastructure/GraphDBSchemaInitializer';
import { GraphDBService } from '../application/GraphDBService';
import {
  GraphContext,
  AddGraphNodeInput,
  AddGraphNodeOutput,
  GetGraphNodeInput,
  GetGraphNodeOutput,
  UpdateGraphNodeInput,
  UpdateGraphNodeOutput,
  DelGraphNodeInput,
  DelGraphNodeOutput,
  AddGraphEdgeInput,
  AddGraphEdgeOutput,
  GetGraphEdgeInput,
  GetGraphEdgeOutput,
  UpdateGraphEdgeInput,
  UpdateGraphEdgeOutput,
  DelGraphEdgeInput,
  DelGraphEdgeOutput,
  SelectGraphInput,
  SelectGraphOutput,
  GetGraphNeighborsInput,
  GetGraphNeighborsOutput,
  ActivateGraphEdgeInput,
  ActivateGraphEdgeOutput,
  AgeGraphEdgeInput,
  AgeGraphEdgeOutput,
  VisualizedGraphInput,
  VisualizedGraphOutput,
  EnableGraphDBInput,
  EnableGraphDBOutput,
  CloseGraphDBInput,
  CloseGraphDBOutput,
} from '../domain/types';
import { AopProxy, type Logger } from '../../shared/aop/AopProxy';

/**
 * GraphDBProvider 接入层。
 *
 * 作为图数据的唯一操作入口，上层通过本类访问图数据。
 *
 * 用法示例：
 * ```typescript
 * const relationDb = new RelationDBAccess({ dbPath: './data/brian.db' });
 * await relationDb.initialize();
 *
 * const graphDb = new GraphDBAccess(relationDb);
 * await graphDb.initialize();
 *
 * const output = new AddGraphNodeOutput();
 * await graphDb.addGraphNode(
 *   { data: { node_type: 'concept', content: { text: '示例节点' } } },
 *   output, new GraphContext(),
 * );
 * console.log(output.id);
 * ```
 */
export class GraphDBAccess {
  private readonly service: GraphDBService;
  private readonly graphDb: GraphDBComponent;

  /**
   * @param relationDb RelationDBProvider 接入层实例（用于配置表）
   * @param graphDbOptions GraphDB 组件选项（图数据库文件路径等）
   * @param logger 可选日志记录器
   */
  constructor(
    relationDb: RelationDBAccess,
    graphDbOptions: GraphDBComponentOptions,
    logger?: Logger,
  ) {
    // 创建 GraphDB 组件（LeanGraph 嵌入式图数据库）
    this.graphDb = new GraphDBComponent(graphDbOptions);
    // 初始化配置表（图数据表由 LeanGraph 自动管理）
    new GraphDBSchemaInitializer(relationDb).init();
    // 创建 Service 并通过代理模式增加切面注入能力
    const rawService = new GraphDBService(this.graphDb, relationDb);
    this.service = AopProxy.wrap(rawService, { logger });
  }

  /**
   * 初始化组件：写入默认配置并恢复 enabled 状态。
   *
   * 必须在首次使用前调用。
   */
  async initialize(): Promise<void> {
    await this.service.initialize();
  }

  /** 新增节点（幂等：content 相同则返回已存在节点 ID） */
  async addGraphNode(input: AddGraphNodeInput, output: AddGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addGraphNode(input, output, context, metrics, report);
  }

  /** 获取节点 */
  async soGraphNode(input: GetGraphNodeInput, output: GetGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soGraphNode(input, output, context, metrics, report);
  }

  /** 更新节点 */
  async updateGraphNode(input: UpdateGraphNodeInput, output: UpdateGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateGraphNode(input, output, context, metrics, report);
  }

  /** 删除节点（级联删除关联边与激活数据） */
  async delGraphNode(input: DelGraphNodeInput, output: DelGraphNodeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delGraphNode(input, output, context, metrics, report);
  }

  /** 新增边（校验端点节点存在） */
  async addGraphEdge(input: AddGraphEdgeInput, output: AddGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.addGraphEdge(input, output, context, metrics, report);
  }

  /** 获取边 */
  async soGraphEdge(input: GetGraphEdgeInput, output: GetGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soGraphEdge(input, output, context, metrics, report);
  }

  /** 更新边（端点变更时校验新节点存在） */
  async updateGraphEdge(input: UpdateGraphEdgeInput, output: UpdateGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.updateGraphEdge(input, output, context, metrics, report);
  }

  /** 删除边（清理关联激活数据） */
  async delGraphEdge(input: DelGraphEdgeInput, output: DelGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.delGraphEdge(input, output, context, metrics, report);
  }

  /** 查询图数据（节点或边） */
  async selectGraph(input: SelectGraphInput, output: SelectGraphOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.selectGraph(input, output, context, metrics, report);
  }

  /** 获取邻居节点（多跳遍历） */
  async soGraphNeighbors(input: GetGraphNeighborsInput, output: GetGraphNeighborsOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.soGraphNeighbors(input, output, context, metrics, report);
  }

  /** 计算边的复合权重（静态相似度 + 动态活跃度 + 跳衰减） */
  async computeEdgeWeight(edgeId: string, hopDistance: number = 1): Promise<number> {
    return this.service.computeEdgeCompositeWeight(edgeId, hopDistance);
  }

  /** 激活边（记录事件、按天累计、更新边状态） */
  async activateGraphEdge(input: ActivateGraphEdgeInput, output: ActivateGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.activateGraphEdge(input, output, context, metrics, report);
  }

  /** 老化边（基于保留窗口判定、清理过期数据） */
  async ageGraphEdge(input: AgeGraphEdgeInput, output: AgeGraphEdgeOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.ageGraphEdge(input, output, context, metrics, report);
  }

  /** 可视化数据 */
  async visualizedGraph(input: VisualizedGraphInput, output: VisualizedGraphOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.visualizedGraph(input, output, context, metrics, report);
  }

  /** 启用/禁用图数据库 */
  async enableGraphDB(input: EnableGraphDBInput, output: EnableGraphDBOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.enableGraphDB(input, output, context, metrics, report);
  }

  /** 关闭图数据库连接（终态操作） */
  async closeGraphDB(input: CloseGraphDBInput, output: CloseGraphDBOutput, context: GraphContext, metrics?: Metrics, report?: Report,
  ): Promise<boolean> {
    return this.service.closeGraphDB(input, output, context, metrics, report);
  }
}
