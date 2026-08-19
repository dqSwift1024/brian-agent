/**
 * @fileoverview Config 应用服务层。
 *
 * ConfigService 是系统级配置的统一入口，提供：
 * 1. 配置元数据注册管理
 * 2. 三层权限模型（Layer → Module → Category）
 * 3. 向下层模块代理所有配置操作
 * 4. Base 资源管理代理（LLM/Soul/Skill/MCP/Prompt）
 */

import type { RelationDBAccess, Logger, IdGenerator, CronAccess } from '@brian-agent/base';
import { GetCronTaskInput, GetCronTaskOutput, CronContext, SetCronTaskInput, SetCronTaskOutput } from '@brian-agent/base';
import { Operator, ValidationError, NotFoundError } from '@brian-agent/base';
import type { DataObject, Condition } from '@brian-agent/base';
import {
  ConfigService as BaseConfigService,
  LLM_CONFIG_TABLE,
  SOUL_CONFIG_TABLE,
  SKILL_CONFIG_TABLE,
  MCP_CONFIG_TABLE,
  PROMPTS_CONFIG_TABLE,
  MQ_CONFIG_TABLE,
  GRAPHDB_CONFIG_TABLE,
  VECTORDB_CONFIG_TABLE,
  RELATIONDB_CONFIG_TABLE,
  TOOL_CONFIG_TABLE,
} from '@brian-agent/base';

import type { LLMCoreAccess, InfoCoreAccess, MCPCoreAccess, SkillCoreAccess, SoulCoreAccess } from '@brian-agent/core';
import {
  ConfigLLMCoreOutput,
  ConfigMcpCoreOutput,
  ConfigSkillCoreOutput, SoSkillRuleOutput,
  ConfigSoulCoreOutput, SoSoulRuleOutput,
  SoInfoTagConfigOutput, SoInfoSummaryConfigOutput, SoInfoConfigOutput,
  SoInfoVectorConfigOutput, SoInfoContextConfigOutput,
} from '@brian-agent/core';
import type {
  ConfigLLMCoreInput, LLMCoreContext,
  LimitLLMInput, LimitLLMOutput, CheckLLMQuotaInput, CheckLLMQuotaOutput,
} from '@brian-agent/core';
import type {
  UpdateInfoTagConfigInput, UpdateInfoTagConfigOutput,
  UpdateInfoSummaryConfigInput, UpdateInfoSummaryConfigOutput,
  UpdateInfoConfigInput, UpdateInfoConfigOutput,
  UpdateInfoVectorConfigInput, UpdateInfoVectorConfigOutput,
  UpdateInfoContextConfigInput, UpdateInfoContextConfigOutput,
  SoInfoTagConfigInput, SoInfoSummaryConfigInput,
  SoInfoConfigInput, SoInfoVectorConfigInput, SoInfoContextConfigInput,
  InfoCoreContext,
} from '@brian-agent/core';
import type {
  ConfigMcpCoreInput, McpCoreContext,
} from '@brian-agent/core';
import type {
  ConfigSkillCoreInput, SkillCoreContext,
  UpdateSkillRuleInput, UpdateSkillRuleOutput,
  SoSkillRuleInput,
} from '@brian-agent/core';
import type {
  ConfigSoulCoreInput, SoulCoreContext,
  UpdateSoulRuleInput, UpdateSoulRuleOutput,
  SoSoulRuleInput,
} from '@brian-agent/core';

import type {
  WriterAgentAccess, EvolutorAgentAccess, AgentLibraryAccess,
  AgentBuilderAccess, AgentExecutionAccess, AgentStrategyAccess, AgentContextAccess,
  PlannerAgentAccess,
} from '@brian-agent/agent';
import type {
  ConfigWriterAgentInput, ConfigWriterAgentOutput, WriterAgentContext,
} from '@brian-agent/agent';
import type {
  ConfigEvolutorAgentInput, ConfigEvolutorAgentOutput, EvolutorAgentContext,
} from '@brian-agent/agent';
import type {
  ConfigPlannerAgentInput, ConfigPlannerAgentOutput, PlannerAgentContext,
} from '@brian-agent/agent';
import type {
  ConfigAgentLibraryInput, ConfigAgentLibraryOutput, AgentLibraryContext,
} from '@brian-agent/agent';
import type {
  ConfigAgentBuilderInput, ConfigAgentBuilderOutput, AgentBuilderContext,
} from '@brian-agent/agent';
import type {
  ConfigAgentExecutionInput, ConfigAgentExecutionOutput, AgentExecutionContext,
} from '@brian-agent/agent';
import type {
  ConfigAgentStrategyInput, ConfigAgentStrategyOutput, AgentStrategyContext,
} from '@brian-agent/agent';
import type {
  ConfigAgentContextInput, ConfigAgentContextOutput, AgentContextContext,
} from '@brian-agent/agent';

import type {
  OrchestrationEntryAccess, OrchestrationStrategyAccess,
  OrchestrationExecutionAccess, OrchestrationVisualizationAccess, JSONNodeAccess,
} from '@brian-agent/orchestration';
import type {
  ConfigOrchestrationEntryInput, ConfigOrchestrationEntryOutput, OrchestrationEntryContext,
} from '@brian-agent/orchestration';
import type {
  ConfigOrchestrationStrategyInput, ConfigOrchestrationStrategyOutput, OrchestrationStrategyContext,
} from '@brian-agent/orchestration';
import type {
  ConfigOrchestrationExecutionInput, ConfigOrchestrationExecutionOutput, OrchestrationExecutionContext,
} from '@brian-agent/orchestration';
import type {
  ConfigOrchestrationVisualizationInput, ConfigOrchestrationVisualizationOutput, OrchestrationVisualizationContext,
} from '@brian-agent/orchestration';
import type {
  ConfigJSONNodeInput, ConfigJSONNodeOutput, JSONNodeContext,
} from '@brian-agent/orchestration';

import type {
  LLMAccess, SoulAccess, SkillAccess, MCPAccess, PromptsAccess, LogAccess,
  MQAccess, GraphDBAccess, VectorDBAccess,
} from '@brian-agent/base';
import type {
  ConfigLogInput, ConfigLogOutput, LogContext,
} from '@brian-agent/base';
import type {
  AddLLMProviderInput, AddLLMProviderOutput, UpdateLLMProviderInput, UpdateLLMProviderOutput,
  DelLLMProviderInput, DelLLMProviderOutput, SoLLMProviderInput, SoLLMProviderOutput,
  TestLLMProviderInput, TestLLMProviderOutput, ListLLMInput, ListLLMOutput,
  AddLLMInput, AddLLMOutput, UpdateLLMInput, UpdateLLMOutput,
  DelLLMInput, DelLLMOutput, SoLLMInput, SoLLMOutput, GetLLMInput, GetLLMOutput,
  LLMContext,
} from '@brian-agent/base';
import type {
  AddSoulInput, AddSoulOutput, UpdateSoulInput, UpdateSoulOutput,
  DelSoulInput, DelSoulOutput, SoSoulInput, SoSoulOutput, GetSoulInput, GetSoulOutput,
  SoulContext,
} from '@brian-agent/base';
import type {
  AddSkillInput, AddSkillOutput, UpdateSkillInput, UpdateSkillOutput,
  DelSkillInput, DelSkillOutput, SoSkillInput, SoSkillOutput, GetSkillInput, GetSkillOutput,
  ExecSkillInput, ExecSkillOutput,
  SkillContext,
} from '@brian-agent/base';
import type {
  AddMcpProviderInput, AddMcpProviderOutput, UpdateMcpProviderInput, UpdateMcpProviderOutput,
  DelMcpProviderInput, DelMcpProviderOutput, SoMcpProviderInput, SoMcpProviderOutput,
  TestMcpProviderInput, TestMcpProviderOutput, ListMcpInput, ListMcpOutput,
  InstallMcpInput, InstallMcpOutput, StartMcpInput, StartMcpOutput,
  StopMcpInput, StopMcpOutput, UninstallMcpInput, UninstallMcpOutput,
  UpdateMcpInput, UpdateMcpOutput, GetMcpInput, GetMcpOutput, SoMcpInput, SoMcpOutput,
  McpContext,
} from '@brian-agent/base';
import type {
  AddPromptInput, AddPromptOutput, UpdatePromptInput, UpdatePromptOutput,
  DelPromptInput, DelPromptOutput, SoPromptInput, SoPromptOutput, GetPromptInput, GetPromptOutput,
  PromptContext,
} from '@brian-agent/base';

import type { Input, Context, Output } from '@brian-agent/base';

import {
  ConfigContext,
  UpdateLayerPrivilegeInput,
  UpdateLayerPrivilegeOutput,
  UpdateModulePrivilegeInput,
  UpdateModulePrivilegeOutput,
  GetConfigDetailInput,
  GetConfigDetailOutput,
  GetConfigItemInput,
  GetConfigItemOutput,
  UpdateConfigInput,
  UpdateConfigOutput,
  ConfigConfigInput,
  ConfigConfigOutput,
  CONFIG_LAYER_PRIVILEGE_TABLE,
  CONFIG_MODULE_PRIVILEGE_TABLE,
  CONFIG_CONFIG_TABLE,
  VALID_LAYERS,
  type ConfigRegistration,
} from '../domain/types';
import { ALL_CONFIG_REGISTRATIONS, LAYER_LABELS, MODULE_LABELS, CATEGORY_LABELS, MODULE_ENTITY_TYPES } from '../domain/configRegistrations';

export class ConfigService {
  private readonly relationDb: RelationDBAccess;
  private readonly llmAccess: LLMAccess;
  private readonly soulAccess: SoulAccess;
  private readonly skillAccess: SkillAccess;
  private readonly mcpAccess: MCPAccess;
  private readonly promptsAccess: PromptsAccess;
  private readonly logAccess: LogAccess;
  private readonly mqAccess: MQAccess;
  private readonly graphDBAccess: GraphDBAccess;
  private readonly vectorDBAccess: VectorDBAccess;
  private readonly llmCore: LLMCoreAccess;
  private readonly infoCore: InfoCoreAccess;
  private readonly mcpCore: MCPCoreAccess;
  private readonly skillCore: SkillCoreAccess;
  private readonly soulCore: SoulCoreAccess;
  private readonly writerAgent: WriterAgentAccess;
  private readonly evolutorAgent: EvolutorAgentAccess;
  private readonly plannerAgent: PlannerAgentAccess;
  private readonly agentLibrary: AgentLibraryAccess;
  private readonly agentBuilder: AgentBuilderAccess;
  private readonly agentExecution: AgentExecutionAccess;
  private readonly agentStrategy: AgentStrategyAccess;
  private readonly agentContext: AgentContextAccess;
  private readonly orchestrationEntry: OrchestrationEntryAccess;
  private readonly orchestrationStrategy: OrchestrationStrategyAccess;
  private readonly orchestrationExecution: OrchestrationExecutionAccess;
  private readonly orchestrationVisualization: OrchestrationVisualizationAccess;
  private readonly jsonNode: JSONNodeAccess;
  private readonly chatAccess: any;
  private readonly selfLearningAccess: any;
  private readonly userProfileAccess: any;
  private readonly visualizationAccess: any;
  private readonly cronAccess: CronAccess;

  /** 内存静态注册表：配置项元数据直接来自 configRegistrations 静态定义（不再写 config_registry 表） */
  private readonly registryMap: Map<string, ConfigRegistration> = new Map(
    ALL_CONFIG_REGISTRATIONS.map((r) => [r.config_key, r]),
  );

  /** Base 层 Provider 模块名 → 对应配置表名映射（config_key 前缀 `模块.key`） */
  private static readonly BASE_PROVIDER_CONFIG_TABLES: Record<string, string> = {
    llm_provider: LLM_CONFIG_TABLE,
    soul_provider: SOUL_CONFIG_TABLE,
    skill_provider: SKILL_CONFIG_TABLE,
    mcp_provider: MCP_CONFIG_TABLE,
    prompts_provider: PROMPTS_CONFIG_TABLE,
    mq_provider: MQ_CONFIG_TABLE,
    graphdb_provider: GRAPHDB_CONFIG_TABLE,
    vectordb_provider: VECTORDB_CONFIG_TABLE,
    relationdb_provider: RELATIONDB_CONFIG_TABLE,
    tool_provider: TOOL_CONFIG_TABLE,
  };

  constructor(
    relationDb: RelationDBAccess,
    llmAccess: LLMAccess,
    soulAccess: SoulAccess,
    skillAccess: SkillAccess,
    mcpAccess: MCPAccess,
    promptsAccess: PromptsAccess,
    logAccess: LogAccess,
    mqAccess: MQAccess,
    graphDBAccess: GraphDBAccess,
    vectorDBAccess: VectorDBAccess,
    llmCore: LLMCoreAccess,
    infoCore: InfoCoreAccess,
    mcpCore: MCPCoreAccess,
    skillCore: SkillCoreAccess,
    soulCore: SoulCoreAccess,
    writerAgent: WriterAgentAccess,
    evolutorAgent: EvolutorAgentAccess,
    plannerAgent: PlannerAgentAccess,
    agentLibrary: AgentLibraryAccess,
    agentBuilder: AgentBuilderAccess,
    agentExecution: AgentExecutionAccess,
    agentStrategy: AgentStrategyAccess,
    agentContext: AgentContextAccess,
    orchestrationEntry: OrchestrationEntryAccess,
    orchestrationStrategy: OrchestrationStrategyAccess,
    orchestrationExecution: OrchestrationExecutionAccess,
    orchestrationVisualization: OrchestrationVisualizationAccess,
    jsonNode: JSONNodeAccess,
    chatAccess: any,
    selfLearningAccess: any,
    userProfileAccess: any,
    visualizationAccess: any,
    cronAccess: CronAccess,
  ) {
    this.relationDb = relationDb;
    this.llmAccess = llmAccess;
    this.soulAccess = soulAccess;
    this.skillAccess = skillAccess;
    this.mcpAccess = mcpAccess;
    this.promptsAccess = promptsAccess;
    this.logAccess = logAccess;
    this.mqAccess = mqAccess;
    this.graphDBAccess = graphDBAccess;
    this.vectorDBAccess = vectorDBAccess;
    this.llmCore = llmCore;
    this.infoCore = infoCore;
    this.mcpCore = mcpCore;
    this.skillCore = skillCore;
    this.soulCore = soulCore;
    this.writerAgent = writerAgent;
    this.evolutorAgent = evolutorAgent;
    this.plannerAgent = plannerAgent;
    this.agentLibrary = agentLibrary;
    this.agentBuilder = agentBuilder;
    this.agentExecution = agentExecution;
    this.agentStrategy = agentStrategy;
    this.agentContext = agentContext;
    this.orchestrationEntry = orchestrationEntry;
    this.orchestrationStrategy = orchestrationStrategy;
    this.orchestrationExecution = orchestrationExecution;
    this.orchestrationVisualization = orchestrationVisualization;
    this.jsonNode = jsonNode;
    this.chatAccess = chatAccess;
    this.selfLearningAccess = selfLearningAccess;
    this.userProfileAccess = userProfileAccess;
    this.visualizationAccess = visualizationAccess;
    this.cronAccess = cronAccess;
  }

  // =========================================================================
  // updateLayerPrivilege
  // =========================================================================

  async updateLayerPrivilege(
    input: UpdateLayerPrivilegeInput,
    _context: ConfigContext,
    output: UpdateLayerPrivilegeOutput,
  ): Promise<boolean> {
    if (!input.layer || !VALID_LAYERS.includes(input.layer as any)) {
      throw new ValidationError(`layer 必须是 ${VALID_LAYERS.join('/')} 之一`);
    }

    const now = Date.now();
    const existing = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: input.layer },
    ]);

    const data: DataObject[] = [{ field: 'updated', value: now }];
    if (input.readable !== undefined) data.push({ field: 'readable', value: input.readable ? 1 : 0 });
    if (input.writable !== undefined) data.push({ field: 'writable', value: input.writable ? 1 : 0 });

    if (existing) {
      await this.relationDb.update(CONFIG_LAYER_PRIVILEGE_TABLE, data, [
        { field: 'layer', operator: Operator.EQ, value: input.layer },
      ]);
    } else {
      const id = this.generateId();
      await this.relationDb.insert(CONFIG_LAYER_PRIVILEGE_TABLE, [
        { field: 'id', value: id },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'layer', value: input.layer },
        { field: 'readable', value: input.readable !== false ? 1 : 0 },
        { field: 'writable', value: input.writable !== false ? 1 : 0 },
      ]);
    }

    const record = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: input.layer },
    ]);
    output.privilege = record ? this.rowToRecord(record) : {};
    return true;
  }

  // =========================================================================
  // updateModulePrivilege
  // =========================================================================

  async updateModulePrivilege(
    input: UpdateModulePrivilegeInput,
    _context: ConfigContext,
    output: UpdateModulePrivilegeOutput,
  ): Promise<boolean> {
    if (!input.module) {
      throw new ValidationError('module 不能为空');
    }

    const existing = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: input.module },
    ]);

    const layer = existing ? (existing.layer as string) : 'APPLICATION';

    const layerPriv = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: layer },
    ]);

    const now = Date.now();
    const data: DataObject[] = [{ field: 'updated', value: now }];

    if (input.readable !== undefined) {
      if (input.readable && layerPriv) {
        const layerReadable = (layerPriv.readable as number) === 1;
        if (!layerReadable) {
          throw new ValidationError(`无法启用模块 ${input.module} 的可读性：其所属层 ${layer} 的可读性为 false`);
        }
      }
      data.push({ field: 'readable', value: input.readable ? 1 : 0 });
    }

    if (input.writable !== undefined) {
      if (input.writable && layerPriv) {
        const layerWritable = (layerPriv.writable as number) === 1;
        if (!layerWritable) {
          throw new ValidationError(`无法启用模块 ${input.module} 的可写性：其所属层 ${layer} 的可写性为 false`);
        }
      }
      data.push({ field: 'writable', value: input.writable ? 1 : 0 });
    }

    if (existing) {
      await this.relationDb.update(CONFIG_MODULE_PRIVILEGE_TABLE, data, [
        { field: 'module', operator: Operator.EQ, value: input.module },
      ]);
    } else {
      const id = this.generateId();
      await this.relationDb.insert(CONFIG_MODULE_PRIVILEGE_TABLE, [
        { field: 'id', value: id },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'module', value: input.module },
        { field: 'layer', value: layer },
        { field: 'readable', value: input.readable !== false ? 1 : 0 },
        { field: 'writable', value: input.writable !== false ? 1 : 0 },
      ]);
    }

    const record = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: input.module },
    ]);
    output.privilege = record ? this.buildModulePrivilegeWithEffective(record, layerPriv) : {};
    return true;
  }

  // =========================================================================
  // getConfigDetail
  // =========================================================================

  async getConfigDetail(
    input: GetConfigDetailInput,
    _context: ConfigContext,
    output: GetConfigDetailOutput,
  ): Promise<boolean> {
    const layerRows = await this.relationDb.select(CONFIG_LAYER_PRIVILEGE_TABLE);
    const moduleRows = await this.relationDb.select(CONFIG_MODULE_PRIVILEGE_TABLE);

    const layerPrivMap = new Map<string, Record<string, unknown>>(
      layerRows.map((r) => [r.layer as string, r]),
    );
    const modulePrivMap = new Map<string, Record<string, unknown>>(
      moduleRows.map((r) => [r.module as string, r]),
    );

    const layerMap = new Map<string, Record<string, unknown>>();
    const moduleMap = new Map<string, { module: Record<string, unknown>; layerName: string }>();

    // 直接遍历静态定义收集 layer / module 节点
    for (const reg of ALL_CONFIG_REGISTRATIONS) {
      const layerName = reg.layer;
      if (input.layer && input.layer !== layerName) continue;
      if (!layerMap.has(layerName)) {
        const lr = layerPrivMap.get(layerName);
        const layerInfo = LAYER_LABELS[layerName];
        layerMap.set(layerName, {
          layer: layerName,
          label: layerInfo?.label ?? layerName,
          desc: layerInfo?.desc ?? '',
          readable: lr ? (lr.readable as number) === 1 : true,
          writable: lr ? (lr.writable as number) === 1 : true,
          modules: [] as Array<Record<string, unknown>>,
        });
      }

      const moduleName = reg.module;
      if (input.module && input.module !== moduleName) continue;
      // 以「层.模块」为键，避免不同层同名模块（如 ORCHESTRATION 与 APPLICATION 的 visualization）被合并
      const moduleKey = `${layerName}.${moduleName}`;
      if (!moduleMap.has(moduleKey)) {
        const mr = modulePrivMap.get(moduleName);
        const layerNode = layerMap.get(layerName);
        const layerReadable = layerNode ? (layerNode.readable as boolean) : true;
        const layerWritable = layerNode ? (layerNode.writable as boolean) : true;
        const modReadable = mr ? (mr.readable as number) === 1 : true;
        const modWritable = mr ? (mr.writable as number) === 1 : true;
        const modNode = {
          module: moduleName,
          label: (MODULE_LABELS[moduleName]?.label) ?? moduleName,
          desc: (MODULE_LABELS[moduleName]?.desc) ?? '',
          readable: modReadable,
          writable: modWritable,
          effective_readable: layerReadable && modReadable,
          effective_writable: layerWritable && modWritable,
          entity_types: (MODULE_ENTITY_TYPES[moduleName]) ?? [],
          categories: [] as Array<Record<string, unknown>>,
        };
        moduleMap.set(moduleKey, { module: modNode, layerName });
        if (layerNode) {
          (layerNode.modules as Array<Record<string, unknown>>).push(modNode);
        }
      }
    }

    // 直接遍历静态定义生成配置项
    for (const reg of ALL_CONFIG_REGISTRATIONS) {
      const moduleName = reg.module;
      const layerName = reg.layer;
      const category = reg.category;
      if (input.layer && input.layer !== layerName) continue;
      if (input.module && input.module !== moduleName) continue;
      if (input.category && input.category !== category) continue;

      const modEntry = moduleMap.get(`${layerName}.${moduleName}`);
      if (!modEntry) continue;
      const modNode = modEntry.module;
      const layerNode = layerMap.get(layerName);
      const layerReadable = layerNode ? (layerNode.readable as boolean) : true;
      const layerWritable = layerNode ? (layerNode.writable as boolean) : true;
      const modReadable = modNode.readable as boolean;
      const modWritable = modNode.writable as boolean;

      const configReadable = reg.readable !== false;
      const configWritable = reg.writable !== false;
      const effectiveReadable = layerReadable && modReadable && configReadable;
      const effectiveWritable = layerWritable && modWritable && configWritable;

      if (input.readable_only && !effectiveReadable) continue;

      const catList = modNode.categories as Array<Record<string, unknown>>;
      let catNode = catList.find((c) => c.category === category);
      if (!catNode) {
        const catInfo = CATEGORY_LABELS[category];
        catNode = {
          category,
          label: catInfo?.label ?? category,
          desc: catInfo?.desc ?? '',
          items: [] as Array<Record<string, unknown>>,
        };
        catList.push(catNode);
      }

      let currentValue: unknown = null;
      try {
        currentValue = await this.getCurrentValue(reg.config_key);
      } catch {
        currentValue = null;
      }

      (catNode.items as Array<Record<string, unknown>>).push({
        config_key: reg.config_key,
        config_name: reg.config_name,
        config_description: reg.config_description,
        config_type: reg.config_type,
        config_default: reg.config_default ?? null,
        config_enum_values: reg.config_enum_values ?? null,
        readable: configReadable,
        writable: configWritable,
        effective_readable: effectiveReadable,
        effective_writable: effectiveWritable,
        current_value: currentValue,
      });
    }

    output.layers = Array.from(layerMap.values());
    return true;
  }

  // =========================================================================
  // getConfigItem
  // =========================================================================

  async getConfigItem(
    input: GetConfigItemInput,
    _context: ConfigContext,
    output: GetConfigItemOutput,
  ): Promise<boolean> {
    if (!input.config_key) {
      throw new ValidationError('config_key 不能为空');
    }

    const reg = this.registryMap.get(input.config_key);
    if (!reg) {
      throw new NotFoundError('config_key', input.config_key);
    }

    const layer = reg.layer;
    const module = reg.module;

    const layerPriv = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: layer },
    ]);
    const modulePriv = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: module },
    ]);

    const registryLike = {
      readable: reg.readable !== false ? 1 : 0,
      writable: reg.writable !== false ? 1 : 0,
    };
    const effectiveReadable = this.computeEffectiveReadable(registryLike, layerPriv, modulePriv);
    const effectiveWritable = this.computeEffectiveWritable(registryLike, layerPriv, modulePriv);

    let currentValue: unknown = null;
    try {
      currentValue = await this.getCurrentValue(input.config_key);
    } catch {
      currentValue = null;
    }

    output.config_item = {
      config_key: reg.config_key,
      config_name: reg.config_name,
      config_description: reg.config_description,
      config_type: reg.config_type,
      config_default: reg.config_default ?? null,
      config_enum_values: reg.config_enum_values ?? null,
      layer,
      module,
      category: reg.category,
      readable: reg.readable !== false,
      writable: reg.writable !== false,
      effective_readable: effectiveReadable,
      effective_writable: effectiveWritable,
      current_value: currentValue,
    };
    return true;
  }

  // =========================================================================
  // updateConfig
  // =========================================================================

  async updateConfig(
    input: UpdateConfigInput,
    _context: ConfigContext,
    output: UpdateConfigOutput,
  ): Promise<boolean> {
    if (!input.config_key) {
      throw new ValidationError('config_key 不能为空');
    }
    if (input.value === undefined) {
      throw new ValidationError('value 不能为空');
    }

    const reg = this.registryMap.get(input.config_key);
    if (!reg) {
      throw new NotFoundError('config_key', input.config_key);
    }

    const layer = reg.layer;
    const module = reg.module;

    const layerPriv = await this.relationDb.selectOne(CONFIG_LAYER_PRIVILEGE_TABLE, [
      { field: 'layer', operator: Operator.EQ, value: layer },
    ]);
    const modulePriv = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: module },
    ]);

    const registryLike = {
      readable: reg.readable !== false ? 1 : 0,
      writable: reg.writable !== false ? 1 : 0,
    };
    const effectiveWritable = this.computeEffectiveWritable(registryLike, layerPriv, modulePriv);
    if (!effectiveWritable) {
      throw new ValidationError(`配置项 ${input.config_key} 不可写`);
    }

    this.validateValueType(input.value, reg.config_type);

    await this.routeUpdateConfig(input.config_key, input.value);

    return true;
  }

  // =========================================================================
  // configConfig (self-config)
  // =========================================================================

  async configConfig(
    input: ConfigConfigInput,
    _context: ConfigContext,
    output: ConfigConfigOutput,
  ): Promise<boolean> {
    const existing = await this.relationDb.selectOne(CONFIG_CONFIG_TABLE, []);
    const now = Date.now();

    const data: DataObject[] = [{ field: 'updated', value: now }];
    if (input.default_readable !== undefined) {
      data.push({ field: 'default_readable', value: input.default_readable ? 1 : 0 });
    }
    if (input.default_writable !== undefined) {
      data.push({ field: 'default_writable', value: input.default_writable ? 1 : 0 });
    }

    if (existing) {
      await this.relationDb.update(CONFIG_CONFIG_TABLE, data, [
        { field: 'id', operator: Operator.EQ, value: existing.id },
      ]);
    } else {
      const id = this.generateId();
      await this.relationDb.insert(CONFIG_CONFIG_TABLE, [
        { field: 'id', value: id },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'default_readable', value: input.default_readable !== false ? 1 : 0 },
        { field: 'default_writable', value: input.default_writable !== false ? 1 : 0 },
      ]);
    }

    const record = await this.relationDb.selectOne(CONFIG_CONFIG_TABLE, []);
    output.config = record ? this.rowToRecord(record) : {};
    return true;
  }

  // =========================================================================
  // Helper methods
  // =========================================================================

  private generateId(): string {
    const { IdGenerator } = require('@brian-agent/base');
    return IdGenerator.generate();
  }

  private rowToRecord(row: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === 'readable' || key === 'writable' || key === 'default_readable' || key === 'default_writable') {
        result[key] = value === 1;
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private computeEffectiveReadable(
    registry: Record<string, unknown> | null,
    layerPriv: Record<string, unknown> | null,
    modulePriv: Record<string, unknown> | null,
  ): boolean {
    const layerReadable = layerPriv ? (layerPriv.readable as number) === 1 : true;
    const modReadable = modulePriv ? (modulePriv.readable as number) === 1 : true;
    const configReadable = registry ? (registry.readable as number) === 1 : true;
    return layerReadable && modReadable && configReadable;
  }

  private computeEffectiveWritable(
    registry: Record<string, unknown> | null,
    layerPriv: Record<string, unknown> | null,
    modulePriv: Record<string, unknown> | null,
  ): boolean {
    const layerWritable = layerPriv ? (layerPriv.writable as number) === 1 : true;
    const modWritable = modulePriv ? (modulePriv.writable as number) === 1 : true;
    const configWritable = registry ? (registry.writable as number) === 1 : true;
    return layerWritable && modWritable && configWritable;
  }

  private buildModulePrivilegeWithEffective(
    modRecord: Record<string, unknown>,
    layerPriv: Record<string, unknown> | null,
  ): Record<string, unknown> {
    const layerReadable = layerPriv ? (layerPriv.readable as number) === 1 : true;
    const layerWritable = layerPriv ? (layerPriv.writable as number) === 1 : true;
    const modReadable = (modRecord.readable as number) === 1;
    const modWritable = (modRecord.writable as number) === 1;
    return {
      ...this.rowToRecord(modRecord),
      effective_readable: layerReadable && modReadable,
      effective_writable: layerWritable && modWritable,
    };
  }

  private async ensureModulePrivilege(module: string, layer: string): Promise<void> {
    const existing = await this.relationDb.selectOne(CONFIG_MODULE_PRIVILEGE_TABLE, [
      { field: 'module', operator: Operator.EQ, value: module },
    ]);
    if (!existing) {
      const now = Date.now();
      await this.relationDb.insert(CONFIG_MODULE_PRIVILEGE_TABLE, [
        { field: 'id', value: this.generateId() },
        { field: 'created', value: now },
        { field: 'updated', value: now },
        { field: 'module', value: module },
        { field: 'layer', value: layer },
        { field: 'readable', value: 1 },
        { field: 'writable', value: 1 },
      ]);
    }
  }

  private validateValueType(value: unknown, configType: string): void {
    switch (configType.toUpperCase()) {
      case 'STRING':
        if (typeof value !== 'string') throw new ValidationError(`期望 STRING 类型，实际为 ${typeof value}`);
        break;
      case 'INT':
      case 'INTEGER':
        if (typeof value !== 'number' || !Number.isInteger(value)) throw new ValidationError(`期望 INT 类型，实际为 ${typeof value}`);
        break;
      case 'DOUBLE':
      case 'FLOAT':
      case 'NUMBER':
        if (typeof value !== 'number') throw new ValidationError(`期望 NUMBER 类型，实际为 ${typeof value}`);
        break;
      case 'BOOLEAN':
      case 'BOOL':
        if (typeof value !== 'boolean') throw new ValidationError(`期望 BOOLEAN 类型，实际为 ${typeof value}`);
        break;
      case 'JSON':
      case 'OBJECT':
        if (typeof value !== 'object' || value === null) throw new ValidationError(`期望 OBJECT 类型，实际为 ${typeof value}`);
        break;
      case 'ARRAY':
        if (!Array.isArray(value)) throw new ValidationError(`期望 ARRAY 类型，实际为 ${typeof value}`);
        break;
      default:
        break;
    }
  }

  // =========================================================================
  // getCurrentValue - fetches current config value from lower layer
  // =========================================================================

  /**
   * 匹配 Base 层 Provider 模块名（config_key 前缀 `模块.key`）。
   * 命中返回模块名，否则返回 null。
   */
  private matchBaseProviderModule(configKey: string): string | null {
    const dot = configKey.indexOf('.');
    if (dot <= 0) return null;
    const module = configKey.slice(0, dot);
    return module in ConfigService.BASE_PROVIDER_CONFIG_TABLES ? module : null;
  }

  /**
   * 读取 Base 层 Provider 的配置项真实值。
   *
   * 直接读各 Provider 的 xxx_config 表（key 不带模块前缀），
   * 未写入时回退到静态定义中的 config_default。
   */
  private async readBaseProviderConfig(configKey: string, module: string): Promise<unknown> {
    const table = ConfigService.BASE_PROVIDER_CONFIG_TABLES[module];
    const key = configKey.slice(module.length + 1);
    const reg = this.registryMap.get(configKey);
    const type = (reg?.config_type ?? 'STRING').toUpperCase();
    const def = reg?.config_default;
    const svc = new BaseConfigService(this.relationDb, table);

    switch (type) {
      case 'BOOLEAN':
        return svc.getBoolean(key, def === true || def === 'true' || def === 1);
      case 'INT':
      case 'INTEGER':
        return svc.getInt(key, typeof def === 'number' ? def : 0);
      case 'DOUBLE':
      case 'FLOAT':
      case 'NUMBER':
        return svc.getDouble(key, typeof def === 'number' ? def : 0);
      default: {
        const raw = await svc.getString(key, def !== null && def !== undefined ? String(def) : undefined);
        return raw !== undefined ? raw : (def ?? null);
      }
    }
  }

  private async getCurrentValue(configKey: string): Promise<unknown> {
    const baseModule = this.matchBaseProviderModule(configKey);
    if (baseModule) {
      return this.readBaseProviderConfig(configKey, baseModule);
    }
    if (configKey.startsWith('log_provider.')) {
      const out: any = {};
      await this.logAccess.configLog({} as ConfigLogInput, {} as LogContext, out);
      const cfg = (out.config ?? {}) as Record<string, unknown>;
      const field = configKey.split('.').pop() ?? '';
      return field ? (cfg[field] ?? null) : null;
    }
    if (configKey.startsWith('info_core.tag_config.')) {
      const out = new SoInfoTagConfigOutput();
      await this.infoCore.soInfoTagConfig({} as SoInfoTagConfigInput, {} as InfoCoreContext, out);
      return this.extractConfigValue(out, 'tag_config', configKey);
    }
    if (configKey.startsWith('info_core.summary_config.')) {
      const out = new SoInfoSummaryConfigOutput();
      await this.infoCore.soInfoSummaryConfig({} as SoInfoSummaryConfigInput, {} as InfoCoreContext, out);
      return this.extractConfigValue(out, 'summary_config', configKey);
    }
    if (configKey.startsWith('info_core.vector_config.')) {
      const out = new SoInfoVectorConfigOutput();
      await this.infoCore.soInfoVectorConfig({} as SoInfoVectorConfigInput, {} as InfoCoreContext, out);
      return this.extractConfigValue(out, 'vector_config', configKey);
    }
    if (configKey.startsWith('info_core.context_config.')) {
      const out = new SoInfoContextConfigOutput();
      await this.infoCore.soInfoContextConfig({} as SoInfoContextConfigInput, {} as InfoCoreContext, out);
      return this.extractConfigValue(out, 'context_config', configKey);
    }
    if (configKey.startsWith('info_core.config.')) {
      const out = new SoInfoConfigOutput();
      await this.infoCore.soInfoConfig({} as SoInfoConfigInput, {} as InfoCoreContext, out);
      return this.extractConfigValue(out, 'config', configKey);
    }
    if (configKey.startsWith('llm_core.')) {
      const out = new ConfigLLMCoreOutput();
      await this.llmCore.configLLMCore({} as ConfigLLMCoreInput, {} as LLMCoreContext, out);
      return this.extractConfigValue(out, 'llm_core', configKey);
    }
    if (configKey.startsWith('mcp_core.')) {
      const out = new ConfigMcpCoreOutput();
      await this.mcpCore.configMCPCore({} as ConfigMcpCoreInput, {} as McpCoreContext, out);
      return this.extractConfigValue(out, 'mcp_core', configKey);
    }
    if (configKey.startsWith('skill_core.regen_rate') || configKey.startsWith('skill_core.similarity_threshold') || configKey.startsWith('skill_core.prompt_template_id')) {
      const out = new ConfigSkillCoreOutput();
      await this.skillCore.configSkillCore({} as ConfigSkillCoreInput, {} as SkillCoreContext, out);
      return this.extractConfigValue(out, 'skill_core', configKey);
    }
    if (configKey.startsWith('skill_core.opt_rule')) {
      const out = new SoSkillRuleOutput();
      await this.skillCore.soSkillRule({} as SoSkillRuleInput, {} as SkillCoreContext, out);
      const first = (out.list ?? [])[0];
      if (!first) return null;
      const key = configKey.split('skill_core.opt_rule.')[1];
      return (first as unknown as Record<string, unknown>)[key] ?? null;
    }
    if (configKey.startsWith('soul_core.regen_rate') || configKey.startsWith('soul_core.similarity_threshold') || configKey.startsWith('soul_core.prompt_template_id') || configKey.startsWith('soul_core.llm_id')) {
      const out = new ConfigSoulCoreOutput();
      await this.soulCore.configSoulCore({} as ConfigSoulCoreInput, {} as SoulCoreContext, out);
      return this.extractConfigValue(out, 'soul_core', configKey);
    }
    if (configKey.startsWith('soul_core.opt_rule')) {
      const out = new SoSoulRuleOutput();
      await this.soulCore.soSoulRule({} as SoSoulRuleInput, {} as SoulCoreContext, out);
      const first = (out.list ?? [])[0];
      if (!first) return null;
      const key = configKey.split('soul_core.opt_rule.')[1];
      return (first as unknown as Record<string, unknown>)[key] ?? null;
    }
    if (configKey.startsWith('planner_agent.')) {
      return this.getConfigFromAccess(
        configKey, 'planner_agent',
        (i: any, c: any, o: any) => this.plannerAgent.configPlannerAgent(i, c, o),
      );
    }
    if (configKey.startsWith('writer_agent.')) {
      return this.getConfigFromAccess(
        configKey, 'writer_agent',
        (i: any, c: any, o: any) => this.writerAgent.configWriterAgent(i, c, o),
      );
    }
    if (configKey.startsWith('evolutor_agent.')) {
      return this.getConfigFromAccess(
        configKey, 'evolutor_agent',
        (i: any, c: any, o: any) => this.evolutorAgent.configEvolutorAgent(i, c, o),
      );
    }
    if (configKey.startsWith('agent_context.')) {
      const out: any = {};
      await this.agentContext.configAgentContext({} as any, {} as any, out);
      const field = configKey.split('.').pop() ?? '';
      return field ? (out[field] ?? null) : null;
    }
    if (configKey.startsWith('agent_library.')) {
      return this.getConfigFromAccess(
        configKey, 'agent_library',
        (i: any, c: any, o: any) => this.agentLibrary.configAgentLibrary(i, c, o),
      );
    }
    if (configKey.startsWith('agent_builder.')) {
      return this.getConfigFromAccess(
        configKey, 'agent_builder',
        (i: any, c: any, o: any) => this.agentBuilder.configAgentBuilder(i, c, o),
      );
    }
    if (configKey.startsWith('agent_execution.')) {
      return this.getConfigFromAccess(
        configKey, 'agent_execution',
        (i: any, c: any, o: any) => this.agentExecution.configAgentExecution(i, c, o),
      );
    }
    if (configKey.startsWith('agent_strategy.')) {
      return this.getConfigFromAccess(
        configKey, 'agent_strategy',
        (i: any, c: any, o: any) => this.agentStrategy.configAgentStrategy(i, c, o),
      );
    }
    if (configKey.startsWith('orchestration.')) {
      const out: any = {};
      if (configKey.startsWith('orchestration.visualization')) {
        await this.orchestrationVisualization.configOrchestrationVisualization({}, {} as any, out);
      } else if (configKey.startsWith('orchestration.execution')) {
        await this.orchestrationExecution.configOrchestrationExecution({}, {} as any, out);
      } else if (configKey.startsWith('orchestration.strategy')) {
        await this.orchestrationStrategy.configOrchestrationStrategy({}, {} as any, out);
      } else if (configKey.startsWith('orchestration.entry')) {
        await this.orchestrationEntry.configOrchestrationEntry({}, {} as any, out);
      } else if (configKey.startsWith('orchestration.jsonnode')) {
        await this.jsonNode.configJSONNode({}, {} as any, out);
      }
      const cfg = (out.config ?? {}) as Record<string, unknown>;
      const field = configKey.split('.').pop() ?? '';
      return field ? (cfg[field] ?? null) : null;
    }
    if (configKey.startsWith('chat.')) {
      return this.getConfigFromAccess(
        configKey, 'chat',
        (i: any, c: any, o: any) => this.chatAccess.configChat(i, c, o),
      );
    }
    if (configKey.startsWith('self_learning.')) {
      // 定时任务 cron 由 CronProvider 统一管理（与定时任务展示页面同一时间源）
      if (configKey === 'self_learning.tag_aging_cron' || configKey === 'self_learning.orphan_tag_check_cron') {
        const taskName = configKey === 'self_learning.tag_aging_cron' ? 'tag_aging' : 'orphan_tag_check';
        const out = new GetCronTaskOutput();
        await this.cronAccess.getCronTask(Object.assign(new GetCronTaskInput(), { name: taskName }), new CronContext(), out);
        return out.task ? out.task.cron : null;
      }
      return this.getConfigFromAccess(
        configKey, 'self_learning',
        (i: any, c: any, o: any) => this.selfLearningAccess.configSelfLearning(i, c, o),
      );
    }
    if (configKey.startsWith('user_profile.')) {
      return this.getConfigFromAccess(
        configKey, 'user_profile',
        (i: any, c: any, o: any) => this.userProfileAccess.configUserProfile(i, c, o),
      );
    }
    if (configKey.startsWith('visualization.')) {
      const out: any = {};
      await this.visualizationAccess.configVisualization({}, {} as any, out);
      const cfg = (out.config ?? {}) as Record<string, unknown>;
      if (configKey.startsWith('visualization.max_nodes_per_graph')) return cfg.max_nodes_per_graph ?? null;
      if (configKey.startsWith('visualization.default_message_summary_length')) return cfg.default_message_summary_length ?? null;
      if (configKey.startsWith('visualization.resolve_content_by_default')) return cfg.resolve_content_by_default === 1;
      return null;
    }

    const reg = this.registryMap.get(configKey);
    if (reg && reg.config_default !== undefined) {
      return reg.config_default;
    }

    return null;
  }

  private extractConfigValue(out: any, _prefix: string, _configKey: string): unknown {
    if (out && typeof out === 'object') {
      if ('config' in out && out.config !== undefined) return out.config;
      if ('value' in out) return out.value;
      return out;
    }
    return null;
  }

  private async getConfigFromAccess(
    _configKey: string,
    _prefix: string,
    fn: (input: any, context: any, output: any) => Promise<boolean>,
  ): Promise<unknown> {
    const out: any = {};
    await fn({}, {}, out);
    return this.extractConfigValue(out, _prefix, _configKey);
  }

  // =========================================================================
  // routeUpdateConfig - routes update to correct lower-layer method
  // =========================================================================

  /**
   * 写入 Base 层 Provider 的配置项。
   *
   * - `enabled` 走 Provider 的 enableXxx 方法，保证运行时内存状态同步；
   * - 其余参数直接写各 Provider 的 xxx_config 表（这些参数均为运行时实时读取，写表即时生效）。
   */
  private async writeBaseProviderConfig(configKey: string, module: string, value: unknown): Promise<void> {
    const key = configKey.slice(module.length + 1);
    if (key === 'enabled') {
      await this.setProviderEnabled(module, value as boolean);
      return;
    }

    // 向量数据库距离度量变更需同步运行时组件（有向量数据时 applyMetric 抛错，阻止写入）
    if (module === 'vectordb_provider' && key === 'default_distance_metric') {
      await this.vectorDBAccess.applyMetric(value as string);
    }

    const table = ConfigService.BASE_PROVIDER_CONFIG_TABLES[module];
    const reg = this.registryMap.get(configKey);
    const type = (reg?.config_type ?? 'STRING').toUpperCase();
    const valueType =
      type.startsWith('BOOLEAN') ? 'BOOLEAN'
      : type.startsWith('INT') ? 'INT'
      : type.startsWith('DOUBLE') || type.startsWith('FLOAT') || type.startsWith('NUMBER') ? 'DOUBLE'
      : 'STRING';
    const svc = new BaseConfigService(this.relationDb, table);
    await svc.set(key, value, valueType);
  }

  /**
   * 调用对应 Provider 的 enable 方法切换组件启用状态。
   */
  private async setProviderEnabled(module: string, enable: boolean): Promise<void> {
    switch (module) {
      case 'llm_provider':
        await this.llmAccess.enableLLM({ enable } as any, {} as any, {} as any);
        return;
      case 'soul_provider':
        await this.soulAccess.enableSoul({ enable } as any, {} as any, {} as any);
        return;
      case 'skill_provider':
        await this.skillAccess.enableSkill({ enable } as any, {} as any, {} as any);
        return;
      case 'mcp_provider':
        await this.mcpAccess.enableMCP({ enable } as any, {} as any, {} as any);
        return;
      case 'prompts_provider':
        await this.promptsAccess.enablePrompts({ enable } as any, {} as any, {} as any);
        return;
      case 'mq_provider':
        await this.mqAccess.enableMQ({ enable } as any, {} as any, {} as any);
        return;
      case 'graphdb_provider':
        await this.graphDBAccess.enableGraphDB({ enable } as any, {} as any, {} as any);
        return;
      case 'vectordb_provider':
        await this.vectorDBAccess.enableVectorDB({ enable } as any, {} as any, {} as any);
        return;
      case 'relationdb_provider':
        await this.relationDb.enableDB({ enable } as any, {} as any, {} as any);
        return;
      default:
        throw new ValidationError(`未知 Base Provider 模块 ${module}`);
    }
  }

  private async routeUpdateConfig(configKey: string, value: unknown): Promise<void> {
    const baseModule = this.matchBaseProviderModule(configKey);
    if (baseModule) {
      await this.writeBaseProviderConfig(configKey, baseModule, value);
      return;
    }

    const prefix = configKey;

    if (prefix.startsWith('log_provider.')) {
      const input: any = {};
      if (prefix.startsWith('log_provider.enabled')) input.enabled = value as boolean;
      else if (prefix.startsWith('log_provider.default_level')) input.default_level = value as string;
      else if (prefix.startsWith('log_provider.file_path')) input.file_path = value as string;
      else if (prefix.startsWith('log_provider.max_file_size')) input.max_file_size = value as number;
      else if (prefix.startsWith('log_provider.retention_days')) input.retention_days = value as number;
      else if (prefix.startsWith('log_provider.write_mode')) input.write_mode = value as string;
      const output: any = {};
      await this.logAccess.configLog(input as ConfigLogInput, {} as LogContext, output);
      return;
    }

    if (prefix.startsWith('llm_core.regen_rate') || prefix.startsWith('llm_core.similarity_threshold') || prefix.startsWith('llm_core.prompt_template_id')) {
      const input: any = {};
      if (prefix.startsWith('llm_core.regen_rate')) input.regen_rate = value;
      if (prefix.startsWith('llm_core.similarity_threshold')) input.similarity_threshold = value;
      if (prefix.startsWith('llm_core.prompt_template_id')) input.prompt_template_id = value as string;
      const output: any = {};
      await this.llmCore.configLLMCore(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('llm_core.quota_')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.llmCore.limitLLM(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('mcp_core.')) {
      const input: any = {};
      if (prefix.startsWith('mcp_core.regen_rate')) input.regen_rate = value;
      if (prefix.startsWith('mcp_core.similarity_threshold')) input.similarity_threshold = value;
      if (prefix.startsWith('mcp_core.prompt_template_id')) input.prompt_template_id = value as string;
      const output: any = {};
      await this.mcpCore.configMCPCore(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('skill_core.regen_rate') || prefix.startsWith('skill_core.similarity_threshold') || prefix.startsWith('skill_core.prompt_template_id')) {
      const input: any = {};
      if (prefix.startsWith('skill_core.regen_rate')) input.regen_rate = value;
      if (prefix.startsWith('skill_core.similarity_threshold')) input.similarity_threshold = value;
      if (prefix.startsWith('skill_core.prompt_template_id')) input.prompt_template_id = value as string;
      const output: any = {};
      await this.skillCore.configSkillCore(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('skill_core.opt_rule')) {
      const key = prefix.split('skill_core.opt_rule.')[1];
      if (key) {
        const existing = await this.relationDb.selectOne('skill_opt_rule', []);
        const now = Date.now();
        if (existing) {
          await this.relationDb.update('skill_opt_rule', [
            { field: key, value: Number(value) },
            { field: 'updated', value: now },
          ], [{ field: 'id', operator: Operator.EQ, value: existing.id as string }]);
        } else {
          const { v4: uuidv4 } = await import('uuid');
          await this.relationDb.insert('skill_opt_rule', [
            { field: 'id', value: uuidv4() },
            { field: 'created', value: now },
            { field: 'updated', value: now },
            { field: 'days', value: key === 'days' ? Number(value) : 30 },
            { field: 'min_usage_count', value: key === 'min_usage_count' ? Number(value) : 5 },
          ]);
        }
      }
      return;
    }
    if (prefix.startsWith('soul_core.regen_rate') || prefix.startsWith('soul_core.similarity_threshold') || prefix.startsWith('soul_core.prompt_template_id') || prefix.startsWith('soul_core.llm_id')) {
      const input: any = {};
      if (prefix.startsWith('soul_core.regen_rate')) input.regen_rate = value;
      if (prefix.startsWith('soul_core.similarity_threshold')) input.similarity_threshold = value;
      if (prefix.startsWith('soul_core.prompt_template_id')) input.prompt_template_id = value as string;
      if (prefix.startsWith('soul_core.llm_id')) input.llm_id = value as string;
      const output: any = {};
      await this.soulCore.configSoulCore(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('soul_core.opt_rule')) {
      const key = prefix.split('soul_core.opt_rule.')[1];
      if (key) {
        const existing = await this.relationDb.selectOne('soul_opt_rule', []);
        const now = Date.now();
        if (existing) {
          await this.relationDb.update('soul_opt_rule', [
            { field: key, value: Number(value) },
            { field: 'updated', value: now },
          ], [{ field: 'id', operator: Operator.EQ, value: existing.id as string }]);
        } else {
          const { v4: uuidv4 } = await import('uuid');
          await this.relationDb.insert('soul_opt_rule', [
            { field: 'id', value: uuidv4() },
            { field: 'created', value: now },
            { field: 'updated', value: now },
            { field: 'days', value: key === 'days' ? Number(value) : 30 },
            { field: 'min_usage_count', value: key === 'min_usage_count' ? Number(value) : 5 },
          ]);
        }
      }
      return;
    }
    if (prefix.startsWith('info_core.tag_config.')) {
      const input: any = {};
      if (prefix.startsWith('info_core.tag_config.llm_id')) input.llm_id = value as string;
      else if (prefix.startsWith('info_core.tag_config.prompt_template_id')) input.prompt_template_id = value as string;
      else if (prefix.startsWith('info_core.tag_config.tag_top_k')) input.tag_top_k = Number(value);
      else if (prefix.startsWith('info_core.tag_config.enable')) input.enable = value ? 1 : 0;
      const output: any = {};
      await this.infoCore.updateInfoTagConfig(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('info_core.summary_config.')) {
      const input: any = {};
      if (prefix.startsWith('info_core.summary_config.llm_id')) input.llm_id = value as string;
      else if (prefix.startsWith('info_core.summary_config.prompt_template_id')) input.prompt_template_id = value as string;
      else if (prefix.startsWith('info_core.summary_config.enable')) input.enable = value ? 1 : 0;
      else if (prefix.startsWith('info_core.summary_config.threshold')) input.threshold = Number(value);
      else if (prefix.startsWith('info_core.summary_config.info_types')) input.info_types = value as string;
      const output: any = {};
      await this.infoCore.updateInfoSummaryConfig(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('info_core.vector_config.')) {
      const input: any = {};
      if (prefix.startsWith('info_core.vector_config.llm_id')) input.llm_id = value as string;
      else if (prefix.startsWith('info_core.vector_config.dimension')) input.dimension = Number(value);
      else if (prefix.startsWith('info_core.vector_config.enable')) input.enable = value ? 1 : 0;
      const output: any = {};
      await this.infoCore.updateInfoVectorConfig(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('info_core.context_config.')) {
      const input: any = {};
      if (prefix.startsWith('info_core.context_config.base_timeline_count')) input.base_timeline_count = Number(value);
      else if (prefix.startsWith('info_core.context_config.base_tag_relative_count')) input.base_tag_relative_count = Number(value);
      else if (prefix.startsWith('info_core.context_config.base_similarity_count')) input.base_similarity_count = Number(value);
      else if (prefix.startsWith('info_core.context_config.base_keyword_count')) input.base_keyword_count = Number(value);
      else if (prefix.startsWith('info_core.context_config.base_random_count')) input.base_random_count = Number(value);
      else if (prefix.startsWith('info_core.context_config.total')) input.total = Number(value);
      else if (prefix.startsWith('info_core.context_config.enable_snapshot_persistence')) input.enable_snapshot_persistence = value ? 1 : 0;
      else if (prefix.startsWith('info_core.context_config.priority_order')) input.priority_order = String(value);
      const output: any = {};
      await this.infoCore.updateInfoContextConfig(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('info_core.config.')) {
      const input: any = {};
      if (prefix.startsWith('info_core.config.alive_max_days')) input.alive_max_days = Number(value);
      const output: any = {};
      await this.infoCore.updateInfoConfig(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('planner_agent.')) {
      const input: any = {};
      if (prefix.startsWith('planner_agent.complexity_decompose_threshold')) input.complexity_decompose_threshold = value as number;
      else if (prefix.startsWith('planner_agent.plan_prompt_template_id')) input.plan_prompt_template_id = value as string;
      else if (prefix.startsWith('planner_agent.max_subtask_count')) input.max_subtask_count = value as number;
      else if (prefix.startsWith('planner_agent.llm_id')) input.llm_id = value as string;
      const output: any = {};
      await this.plannerAgent.configPlannerAgent(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('writer_agent.')) {
      const input: any = {};
      if (prefix.startsWith('writer_agent.write_prompt_template_id')) input.write_prompt_template_id = value as string;
      else if (prefix.startsWith('writer_agent.llm_id')) input.llm_id = value as string;
      else if (prefix.startsWith('writer_agent.default_language')) input.default_language = value as string;
      else if (prefix.startsWith('writer_agent.default_style')) input.default_style = value as string;
      else if (prefix.startsWith('writer_agent.default_depth')) input.default_depth = value as string;
      else if (prefix.startsWith('writer_agent.default_format')) input.default_format = value as string;
      const output: any = {};
      await this.writerAgent.configWriterAgent(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('evolutor_agent.')) {
      const input: any = {};
      if (prefix.startsWith('evolutor_agent.eval_work_prompt_template_id')) input.eval_work_prompt_template_id = value as string;
      else if (prefix.startsWith('evolutor_agent.eval_write_prompt_template_id')) input.eval_write_prompt_template_id = value as string;
      else if (prefix.startsWith('evolutor_agent.optimize_threshold')) input.optimize_threshold = value as number;
      else if (prefix.startsWith('evolutor_agent.eval_frequency_threshold')) input.eval_frequency_threshold = value as number;
      else if (prefix.startsWith('evolutor_agent.eval_schedule_interval_ms')) input.eval_schedule_interval_ms = value as number;
      else if (prefix.startsWith('evolutor_agent.eval_batch_size')) input.eval_batch_size = value as number;
      else if (prefix.startsWith('evolutor_agent.llm_id')) input.llm_id = value as string;
      const output: any = {};
      await this.evolutorAgent.configEvolutorAgent(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('agent_context.')) {
      const input: any = {};
      if (prefix.startsWith('agent_context.max_context_items')) input.max_context_items = value as number;
      else if (prefix.startsWith('agent_context.enable_snapshot_persistence')) input.enable_snapshot_persistence = value as boolean;
      const output: any = {};
      await this.agentContext.configAgentContext(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('agent_library.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.agentLibrary.configAgentLibrary(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('agent_builder.')) {
      const input: any = {};
      if (prefix.startsWith('agent_builder.task_analysis_prompt_template_id')) input.task_analysis_prompt_template_id = value as string;
      else if (prefix.startsWith('agent_builder.auto_optimize')) input.auto_optimize = value as boolean;
      const output: any = {};
      await this.agentBuilder.configAgentBuilder(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('agent_execution.')) {
      const input: any = {};
      if (prefix.startsWith('agent_execution.think_prompt_template_id')) input.think_prompt_template_id = value as string;
      else if (prefix.startsWith('agent_execution.reflect_prompt_template_id')) input.reflect_prompt_template_id = value as string;
      else if (prefix.startsWith('agent_execution.answer_prompt_template_id')) input.answer_prompt_template_id = value as string;
      else if (prefix.startsWith('agent_execution.default_max_iterations')) input.default_max_iterations = value as number;
      else if (prefix.startsWith('agent_execution.async_worker_interval')) input.async_worker_interval = value as number;
      const output: any = {};
      await this.agentExecution.configAgentExecution(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('agent_strategy.')) {
      const input = { config_key: configKey, value } as any;
      const output: any = {};
      await this.agentStrategy.configAgentStrategy(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('orchestration.entry')) {
      const input: any = {};
      if (prefix.startsWith('orchestration.entry.complexity_decompose_threshold')) input.complexity_decompose_threshold = value as number;
      else if (prefix.startsWith('orchestration.entry.strategy_prompt_template_id')) input.strategy_prompt_template_id = value as string;
      else if (prefix.startsWith('orchestration.entry.default_strategy')) input.default_strategy = value as string;
      else if (prefix.startsWith('orchestration.entry.max_recent_works')) input.max_recent_works = value as number;
      else if (prefix.startsWith('orchestration.entry.async_worker_interval')) input.async_worker_interval = value as number;
      const output: any = {};
      await this.orchestrationEntry.configOrchestrationEntry(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('orchestration.strategy')) {
      const input: any = {};
      if (prefix.startsWith('orchestration.strategy.default_strategy_id')) input.default_strategy_id = value as string;
      else if (prefix.startsWith('orchestration.strategy.max_plan_retries')) input.max_plan_retries = value as number;
      const output: any = {};
      await this.orchestrationStrategy.configOrchestrationStrategy(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('orchestration.execution')) {
      const input: any = {};
      if (prefix.startsWith('orchestration.execution.max_concurrent')) input.max_concurrent = value as number;
      else if (prefix.startsWith('orchestration.execution.dag_timeout_ms')) input.dag_timeout_ms = value as number;
      const output: any = {};
      await this.orchestrationExecution.configOrchestrationExecution(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('orchestration.visualization')) {
      const input: any = {};
      if (prefix.startsWith('orchestration.visualization.max_nodes_in_graph')) input.max_nodes_in_graph = value as number;
      const output: any = {};
      await this.orchestrationVisualization.configOrchestrationVisualization(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('orchestration.jsonnode')) {
      const input: any = {};
      if (prefix.startsWith('orchestration.jsonnode.max_execution_depth')) input.max_execution_depth = value as number;
      else if (prefix.startsWith('orchestration.jsonnode.node_timeout_ms')) input.node_timeout_ms = value as number;
      else if (prefix.startsWith('orchestration.jsonnode.trace_enabled')) input.trace_enabled = value as number;
      const output: any = {};
      await this.jsonNode.configJSONNode(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('chat.')) {
      const input: any = {};
      if (prefix.startsWith('chat.max_messages_per_session')) input.max_messages_per_session = Number(value);
      else if (prefix.startsWith('chat.sse_heartbeat_interval_ms')) input.sse_heartbeat_interval_ms = Number(value);
      else if (prefix.startsWith('chat.default_history_lastN')) input.default_history_lastN = Number(value);
      const output: any = {};
      await this.chatAccess.configChat(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('self_learning.')) {
      // 定时任务 cron 写入 CronProvider（与定时任务展示页面同一时间源）
      if (prefix === 'self_learning.tag_aging_cron' || prefix === 'self_learning.orphan_tag_check_cron') {
        const taskName = prefix === 'self_learning.tag_aging_cron' ? 'tag_aging' : 'orphan_tag_check';
        await this.cronAccess.setCronTask(Object.assign(new SetCronTaskInput(), { name: taskName, cron: value as string }), new CronContext(), new SetCronTaskOutput());
        return;
      }
      const input: any = {};
      if (prefix.startsWith('self_learning.random_factor')) input.random_factor = Number(value);
      else if (prefix.startsWith('self_learning.document_weight')) input.document_weight = Number(value);
      else if (prefix.startsWith('self_learning.conversation_weight')) input.conversation_weight = Number(value);
      else if (prefix.startsWith('self_learning.tag_maintenance_weight')) input.tag_maintenance_weight = Number(value);
      else if (prefix.startsWith('self_learning.learning_interval_ms')) input.learning_interval_ms = Number(value);
      else if (prefix.startsWith('self_learning.default_learning_rate')) input.default_learning_rate = Number(value);
      else if (prefix.startsWith('self_learning.tag_connection_check_interval_ms')) input.tag_connection_check_interval_ms = Number(value);
      else if (prefix.startsWith('self_learning.tag_aging_cron')) input.tag_aging_cron = value as string;
      else if (prefix.startsWith('self_learning.orphan_tag_check_cron')) input.orphan_tag_check_cron = value as string;
      else if (prefix.startsWith('self_learning.document_split_threshold')) input.document_split_threshold = Number(value);
      else if (prefix.startsWith('self_learning.chunk_overlap_ratio')) input.chunk_overlap_ratio = Number(value);
      else if (prefix.startsWith('self_learning.document_query_prompt_template_id')) input.document_query_prompt_template_id = value as string;
      else if (prefix.startsWith('self_learning.document_query_llm_id')) input.document_query_llm_id = value as string;
      const output: any = {};
      await this.selfLearningAccess.configSelfLearning(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('user_profile.')) {
      const input: any = {};
      if (prefix.startsWith('user_profile.auto_generate_interval_ms')) input.auto_generate_interval_ms = Number(value);
      else if (prefix.startsWith('user_profile.profile_analysis_prompt_template_id')) input.profile_analysis_prompt_template_id = value as string;
      else if (prefix.startsWith('user_profile.max_conversation_sample_count')) input.max_conversation_sample_count = Number(value);
      else if (prefix.startsWith('user_profile.profile_retention_versions')) input.profile_retention_versions = Number(value);
      else if (prefix.startsWith('user_profile.min_confidence_threshold')) input.min_confidence_threshold = Number(value);
      const output: any = {};
      await this.userProfileAccess.configUserProfile(input, {} as any, output);
      return;
    }
    if (prefix.startsWith('visualization.')) {
      const input: any = {};
      if (prefix.startsWith('visualization.max_nodes_per_graph')) input.max_nodes_per_graph = value as number;
      else if (prefix.startsWith('visualization.default_message_summary_length')) input.default_message_summary_length = value as number;
      else if (prefix.startsWith('visualization.resolve_content_by_default')) input.resolve_content_by_default = value as boolean;
      const output: any = {};
      await this.visualizationAccess.configVisualization(input, {} as any, output);
      return;
    }

    // 未匹配到具体模块路由：静态定义中的配置项应全部有对应修改路由
    throw new ValidationError(`配置项 ${configKey} 未实现修改路由`);
  }

  // =========================================================================
  // LLM Proxy methods
  // =========================================================================

  async addLLMProviderProxy(input: AddLLMProviderInput, context: LLMContext, output: AddLLMProviderOutput): Promise<boolean> {
    return this.llmAccess.addLLMProvider(input, context, output);
  }

  async updateLLMProviderProxy(input: UpdateLLMProviderInput, context: LLMContext, output: UpdateLLMProviderOutput): Promise<boolean> {
    return this.llmAccess.updateLLMProvider(input, context, output);
  }

  async delLLMProviderProxy(input: DelLLMProviderInput, context: LLMContext, output: DelLLMProviderOutput): Promise<boolean> {
    return this.llmAccess.delLLMProvider(input, context, output);
  }

  async soLLMProviderProxy(input: SoLLMProviderInput, context: LLMContext, output: SoLLMProviderOutput): Promise<boolean> {
    return this.llmAccess.soLLMProvider(input, context, output);
  }

  async testLLMProviderProxy(input: TestLLMProviderInput, context: LLMContext, output: TestLLMProviderOutput): Promise<boolean> {
    return this.llmAccess.testLLMProvider(input, context, output);
  }

  async listLLMProxy(input: ListLLMInput, context: LLMContext, output: ListLLMOutput): Promise<boolean> {
    return this.llmAccess.listLLM(input, context, output);
  }

  async addLLMProxy(input: AddLLMInput, context: LLMContext, output: AddLLMOutput): Promise<boolean> {
    return this.llmAccess.addLLM(input, context, output);
  }

  async updateLLMProxy(input: UpdateLLMInput, context: LLMContext, output: UpdateLLMOutput): Promise<boolean> {
    return this.llmAccess.updateLLM(input, context, output);
  }

  async delLLMProxy(input: DelLLMInput, context: LLMContext, output: DelLLMOutput): Promise<boolean> {
    return this.llmAccess.delLLM(input, context, output);
  }

  async soLLMProxy(input: SoLLMInput, context: LLMContext, output: SoLLMOutput): Promise<boolean> {
    return this.llmAccess.soLLM(input, context, output);
  }

  async getLLMProxy(input: GetLLMInput, context: LLMContext, output: GetLLMOutput): Promise<boolean> {
    return this.llmAccess.getLLM(input, context, output);
  }

  // =========================================================================
  // Soul Proxy methods
  // =========================================================================

  async addSoulProxy(input: AddSoulInput, context: SoulContext, output: AddSoulOutput): Promise<boolean> {
    return this.soulAccess.addSoul(input, context, output);
  }

  async updateSoulProxy(input: UpdateSoulInput, context: SoulContext, output: UpdateSoulOutput): Promise<boolean> {
    return this.soulAccess.updateSoul(input, context, output);
  }

  async delSoulProxy(input: DelSoulInput, context: SoulContext, output: DelSoulOutput): Promise<boolean> {
    return this.soulAccess.delSoul(input, context, output);
  }

  async soSoulProxy(input: SoSoulInput, context: SoulContext, output: SoSoulOutput): Promise<boolean> {
    return this.soulAccess.soSoul(input, context, output);
  }

  async getSoulProxy(input: GetSoulInput, context: SoulContext, output: GetSoulOutput): Promise<boolean> {
    return this.soulAccess.getSoul(input, context, output);
  }

  async getSoulRuleProxy(input: SoSoulRuleInput, context: SoulCoreContext, output: SoSoulRuleOutput): Promise<boolean> {
    return this.soulCore.soSoulRule(input, context, output);
  }

  async updateSoulRuleProxy(input: UpdateSoulRuleInput, context: SoulCoreContext, output: UpdateSoulRuleOutput): Promise<boolean> {
    return this.soulCore.updateSoulRule(input, context, output);
  }

  // =========================================================================
  // Skill Proxy methods
  // =========================================================================

  async addSkillProxy(input: AddSkillInput, context: SkillContext, output: AddSkillOutput): Promise<boolean> {
    return this.skillAccess.addSkill(input, context, output);
  }

  async updateSkillProxy(input: UpdateSkillInput, context: SkillContext, output: UpdateSkillOutput): Promise<boolean> {
    return this.skillAccess.updateSkill(input, context, output);
  }

  async delSkillProxy(input: DelSkillInput, context: SkillContext, output: DelSkillOutput): Promise<boolean> {
    return this.skillAccess.delSkill(input, context, output);
  }

  async soSkillProxy(input: SoSkillInput, context: SkillContext, output: SoSkillOutput): Promise<boolean> {
    return this.skillAccess.soSkill(input, context, output);
  }

  async execSkillProxy(input: ExecSkillInput, context: SkillContext, output: ExecSkillOutput): Promise<boolean> {
    return this.skillAccess.execSkill(input, context, output);
  }

  async getSkillProxy(input: GetSkillInput, context: SkillContext, output: GetSkillOutput): Promise<boolean> {
    return this.skillAccess.getSkill(input, context, output);
  }

  async getSkillRuleProxy(input: SoSkillRuleInput, context: SkillCoreContext, output: SoSkillRuleOutput): Promise<boolean> {
    return this.skillCore.soSkillRule(input, context, output);
  }

  async updateSkillRuleProxy(input: UpdateSkillRuleInput, context: SkillCoreContext, output: UpdateSkillRuleOutput): Promise<boolean> {
    return this.skillCore.updateSkillRule(input, context, output);
  }

  // =========================================================================
  // MCP Proxy methods
  // =========================================================================

  async addMcpProviderProxy(input: AddMcpProviderInput, context: McpContext, output: AddMcpProviderOutput): Promise<boolean> {
    return this.mcpAccess.addMcpProvider(input, context, output);
  }

  async updateMcpProviderProxy(input: UpdateMcpProviderInput, context: McpContext, output: UpdateMcpProviderOutput): Promise<boolean> {
    return this.mcpAccess.updateMcpProvider(input, context, output);
  }

  async delMcpProviderProxy(input: DelMcpProviderInput, context: McpContext, output: DelMcpProviderOutput): Promise<boolean> {
    return this.mcpAccess.delMcpProvider(input, context, output);
  }

  async soMcpProviderProxy(input: SoMcpProviderInput, context: McpContext, output: SoMcpProviderOutput): Promise<boolean> {
    return this.mcpAccess.soMcpProvider(input, context, output);
  }

  async testMcpProviderProxy(input: TestMcpProviderInput, context: McpContext, output: TestMcpProviderOutput): Promise<boolean> {
    return this.mcpAccess.testMcpProvider(input, context, output);
  }

  async listMcpProxy(input: ListMcpInput, context: McpContext, output: ListMcpOutput): Promise<boolean> {
    return this.mcpAccess.listMcp(input, context, output);
  }

  async installMcpProxy(input: InstallMcpInput, context: McpContext, output: InstallMcpOutput): Promise<boolean> {
    return this.mcpAccess.installMcp(input, context, output);
  }

  async startMcpProxy(input: StartMcpInput, context: McpContext, output: StartMcpOutput): Promise<boolean> {
    return this.mcpAccess.startMcp(input, context, output);
  }

  async stopMcpProxy(input: StopMcpInput, context: McpContext, output: StopMcpOutput): Promise<boolean> {
    return this.mcpAccess.stopMcp(input, context, output);
  }

  async uninstallMcpProxy(input: UninstallMcpInput, context: McpContext, output: UninstallMcpOutput): Promise<boolean> {
    return this.mcpAccess.uninstallMcp(input, context, output);
  }

  async updateMcpProxy(input: UpdateMcpInput, context: McpContext, output: UpdateMcpOutput): Promise<boolean> {
    return this.mcpAccess.updateMcp(input, context, output);
  }

  async getMcpProxy(input: GetMcpInput, context: McpContext, output: GetMcpOutput): Promise<boolean> {
    return this.mcpAccess.getMcp(input, context, output);
  }

  async soMcpProxy(input: SoMcpInput, context: McpContext, output: SoMcpOutput): Promise<boolean> {
    return this.mcpAccess.soMcp(input, context, output);
  }

  // =========================================================================
  // Prompt Proxy methods
  // =========================================================================

  async addPromptProxy(input: AddPromptInput, context: PromptContext, output: AddPromptOutput): Promise<boolean> {
    return this.promptsAccess.addPrompt(input, context, output);
  }

  async updatePromptProxy(input: UpdatePromptInput, context: PromptContext, output: UpdatePromptOutput): Promise<boolean> {
    return this.promptsAccess.updatePrompt(input, context, output);
  }

  async delPromptProxy(input: DelPromptInput, context: PromptContext, output: DelPromptOutput): Promise<boolean> {
    return this.promptsAccess.delPrompt(input, context, output);
  }

  async soPromptProxy(input: SoPromptInput, context: PromptContext, output: SoPromptOutput): Promise<boolean> {
    return this.promptsAccess.soPrompt(input, context, output);
  }

  async getPromptProxy(input: GetPromptInput, context: PromptContext, output: GetPromptOutput): Promise<boolean> {
    return this.promptsAccess.getPrompt(input, context, output);
  }
}
