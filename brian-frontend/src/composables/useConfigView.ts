/**
 * @fileoverview 配置页业务逻辑组合式函数。
 *
 * 从 ConfigView.vue 分离：配置树加载、四层下钻导航、展示模型组装、
 * 实体 CRUD（列表拉取/更新/启停/删除均按实体域表驱动分发）、编辑弹窗
 * 表单装配与提交、Toast。
 * 纯展示映射与字段构建见 utils/configDisplay。
 */
import { computed, onMounted, ref, type Ref } from 'vue'
import { configApi, agentApi, skillApi, mcpApi } from '@/api'
import type { ConfigTreeLayer } from '@/api/types'
import {
  AGENT_ENTITY_MODULE, ENTITY_MODULES, LAYER_NAMES, LAYER_DESCS, MODULE_NAMES,
  buildConfigFields, buildEntityFields, formatValueSummary, layerIcon, moduleIcon, categoryName,
  type ConfigField, type DisplayCategory, type DisplayItem, type DisplayLayer, type DisplayModule,
  type ModuleKey, type RawItem,
} from '@/utils/configDisplay'

export function useConfigView() {
  // ===== 配置树 =====
  const treeLoading = ref(false)
  const treeError = ref('')
  const configTree = ref<ConfigTreeLayer[]>([])

  // ===== 四层下钻导航状态 =====
  const currentLevel = ref<1 | 2 | 3 | 4>(1)
  const selectedLayerKey = ref('')
  const selectedModuleKey = ref('')
  const selectedCategory = ref<DisplayCategory | null>(null)

  // ===== Toast =====
  const toastVisible = ref(false); const toastMsg = ref(''); const toastType = ref<'success' | 'error'>('success')
  let toastTimer: ReturnType<typeof setTimeout> | null = null
  function showToast(msg: string, type: 'success' | 'error' = 'error') {
    toastMsg.value = msg; toastType.value = type; toastVisible.value = true
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastVisible.value = false }, 3000)
  }

  // ===== 实体 CRUD 状态（按实体域一表管理） =====
  const loading = ref<Record<string, boolean>>({ model: false, soul: false, work: false, skill: false, mcp: false, agent: false })
  const loaded = ref<Record<string, boolean>>({ model: false, soul: false, work: false, skill: false, mcp: false, agent: false })
  const errorMsg = ref<Record<string, string>>({ model: '', soul: '', work: '', skill: '', mcp: '', agent: '' })
  const models = ref<RawItem[]>([])
  const souls = ref<RawItem[]>([])
  const works = ref<RawItem[]>([])
  const skills = ref<RawItem[]>([])
  const mcps = ref<RawItem[]>([])
  const agents = ref<RawItem[]>([])

  const entityLists: Record<ModuleKey, Ref<RawItem[]>> = {
    model: models, soul: souls, work: works, skill: skills, mcp: mcps, agent: agents,
  }

  /** 各实体域的列表拉取（统一返回原始记录数组） */
  const listFetchers: Record<ModuleKey, () => Promise<unknown[]>> = {
    model: () => configApi.model.list() as unknown as Promise<unknown[]>,
    soul: () => configApi.soul.list() as unknown as Promise<unknown[]>,
    work: () => configApi.work.list() as unknown as Promise<unknown[]>,
    skill: async () => ((await skillApi.list()) as { skills: unknown[] }).skills,
    mcp: async () => ((await mcpApi.installed()) as { installed: unknown[] }).installed,
    agent: async () => ((await agentApi.list()) as { agents: unknown[] }).agents,
  }

  async function loadEntities(m: ModuleKey) {
    loading.value[m] = true
    try {
      entityLists[m].value = (await listFetchers[m]()) as RawItem[]
      loaded.value[m] = true
    } catch (e: unknown) {
      errorMsg.value[m] = (e as Error).message
    } finally {
      loading.value[m] = false
    }
  }

  /** 实体域更新/启停/删除分发表（soul/work 启停走 update，model 无启停） */
  const updaters: Record<ModuleKey, (id: string, data: Record<string, unknown>) => Promise<unknown>> = {
    model: (id, data) => configApi.model.update(id, data),
    soul: (id, data) => configApi.soul.update(id, data),
    work: (id, data) => configApi.work.update(id, data),
    skill: (id, data) => skillApi.update(id, data),
    mcp: (id, data) => configApi.mcp.update(id, data),
    agent: (id, data) => agentApi.update(id, data),
  }
  const togglers: Partial<Record<ModuleKey, (raw: RawItem) => Promise<unknown>>> = {
    soul: (raw) => configApi.soul.update(raw.id, { enabled: !raw.enabled }),
    work: (raw) => configApi.work.update(raw.id, { enabled: !raw.enabled }),
    skill: (raw) => skillApi.toggle(raw.id),
    mcp: (raw) => mcpApi.toggle(raw.id),
    agent: (raw) => agentApi.toggle(raw.id),
  }
  const deleters: Record<ModuleKey, (id: string) => Promise<unknown>> = {
    model: (id) => configApi.model.delete(id),
    soul: (id) => configApi.soul.delete(id),
    work: (id) => configApi.work.delete(id),
    skill: (id) => skillApi.delete(id),
    mcp: (id) => mcpApi.uninstall(id),
    agent: (id) => agentApi.delete(id),
  }

  // ===== 编辑弹窗（配置项与实体共用） =====
  const modalVisible = ref(false); const readOnly = ref(false); const submitting = ref(false)
  const selectedConfig = ref<DisplayItem | null>(null); const formFields = ref<ConfigField[]>([]); const jsonErrors = ref<Record<string, string>>({})
  const isConfigModal = ref(false)

  function closeModal() {
    modalVisible.value = false; selectedConfig.value = null; formFields.value = []; jsonErrors.value = {}; readOnly.value = false; isConfigModal.value = false
  }

  // ===== 导航 =====
  const selectedLayer = computed(() => displayLayers.value.find(l => l.key === selectedLayerKey.value) || null)
  const currentModule = computed(() => selectedLayer.value?.modules.find(m => m.key === selectedModuleKey.value) || null)
  const currentApiModule = computed(() => currentModule.value?.apiModule)

  const breadcrumb = computed(() => {
    const items: { label: string; level: number }[] = [{ label: '整体框架', level: 1 }]
    if (currentLevel.value >= 2 && selectedLayer.value) items.push({ label: selectedLayer.value.name, level: 2 })
    if (currentLevel.value >= 3 && currentModule.value) items.push({ label: currentModule.value.name, level: 3 })
    if (currentLevel.value >= 4 && selectedCategory.value) items.push({ label: selectedCategory.value.name, level: 4 })
    return items
  })

  function goToLevel(level: number) {
    if (level <= 1) { currentLevel.value = 1; selectedLayerKey.value = ''; selectedModuleKey.value = ''; selectedCategory.value = null; closeModal(); return }
    if (level === 2) { currentLevel.value = 2; selectedModuleKey.value = ''; selectedCategory.value = null }
    else if (level === 3) { currentLevel.value = 3; selectedCategory.value = null }
    else if (level === 4) { currentLevel.value = 4 }
    closeModal()
  }

  function selectLayer(layer: DisplayLayer) {
    selectedLayerKey.value = layer.key; selectedModuleKey.value = ''; selectedCategory.value = null; currentLevel.value = 2
  }

  async function selectModule(mod: DisplayModule) {
    selectedModuleKey.value = mod.key; selectedCategory.value = null; currentLevel.value = 3
    if (mod.apiModule && !loaded.value[mod.apiModule]) await loadEntities(mod.apiModule)
  }

  function selectCategory(cat: DisplayCategory) {
    selectedCategory.value = cat; currentLevel.value = 4
    if (cat.isEntityCategory && currentApiModule.value && !loaded.value[currentApiModule.value]) {
      loadEntities(currentApiModule.value)
    }
  }

  // ===== 展示模型组装：配置树 → 分层展示结构 =====
  function itemCountFor(m: ModuleKey): number {
    return entityLists[m].value.length
  }

  function buildEntityItems(m: ModuleKey): DisplayItem[] {
    return entityLists[m].value.map(raw => ({
      key: raw.id, name: String(raw.name || raw.modelName || raw.displayName || ''),
      desc: String(raw.description || raw.providerName || ''),
      valueSummary: raw.enabled !== false ? '启用' : '停用',
      configurable: true, raw, isEntityItem: true,
    }))
  }

  const displayLayers = computed<DisplayLayer[]>(() => {
    const layers: DisplayLayer[] = []

    for (const layer of configTree.value) {
      const modules: DisplayModule[] = []

      for (const mod of layer.modules) {
        const entityInfo = ENTITY_MODULES[mod.module]
        const categories: DisplayCategory[] = []

        for (const cat of mod.categories) {
          const items: DisplayItem[] = cat.items.map(item => ({
            key: item.config_key,
            name: item.config_name,
            desc: item.config_description || '',
            valueSummary: formatValueSummary(item),
            configurable: item.effective_writable,
            configItem: item,
          }))
          categories.push({
            key: cat.category,
            name: categoryName(cat.category),
            desc: `${categoryName(cat.category)}相关配置`,
            configurable: items.some(i => i.configurable),
            itemCount: items.length,
            items,
          })
        }

        if (entityInfo) {
          categories.push({
            key: 'entity', name: entityInfo.label, desc: `管理 ${entityInfo.label} 实体`,
            configurable: true, itemCount: itemCountFor(entityInfo.apiModule),
            items: [], isEntityCategory: true,
          })
        }

        const hasConfigurable = categories.some(c => c.configurable)
        modules.push({
          key: mod.module,
          name: MODULE_NAMES[mod.module] || mod.module,
          desc: MODULE_NAMES[mod.module] ? `${MODULE_NAMES[mod.module]} 配置` : mod.module,
          icon: moduleIcon(mod.module),
          configurable: hasConfigurable,
          apiModule: entityInfo?.apiModule,
          categoryCount: categories.length,
          categories,
        })
      }

      if (layer.layer === 'AGENT' && !modules.some(m => m.key === AGENT_ENTITY_MODULE.moduleKey)) {
        modules.push({
          key: AGENT_ENTITY_MODULE.moduleKey,
          name: 'Meta Agent', desc: 'Agent 实体管理与配置',
          icon: moduleIcon('agent_builder'), configurable: true,
          apiModule: AGENT_ENTITY_MODULE.apiModule,
          categoryCount: 1,
          categories: [{
            key: 'entity', name: AGENT_ENTITY_MODULE.label, desc: '管理 Agent 实体',
            configurable: true, itemCount: itemCountFor('agent'),
            items: [], isEntityCategory: true,
          }],
        })
      }

      layers.push({
        key: layer.layer,
        name: LAYER_NAMES[layer.layer] || layer.layer,
        desc: LAYER_DESCS[layer.layer] || '',
        icon: layerIcon(layer.layer),
        hasConfigurable: modules.some(m => m.configurable),
        modules,
      })
    }

    return layers
  })

  const currentItems = computed<DisplayItem[]>(() => {
    if (selectedCategory.value?.isEntityCategory && currentApiModule.value) {
      return buildEntityItems(currentApiModule.value)
    }
    return selectedCategory.value?.items || []
  })

  // ===== 配置树加载 =====
  async function loadConfigTree() {
    treeLoading.value = true; treeError.value = ''
    try {
      const res = await configApi.configTree()
      configTree.value = (res.config?.layers as ConfigTreeLayer[]) || []
    } catch (e: unknown) {
      treeError.value = (e as Error).message
    } finally {
      treeLoading.value = false
    }
  }

  onMounted(() => { loadConfigTree() })

  async function refreshCurrent() {
    const m = currentApiModule.value
    if (m) await loadEntities(m)
    await loadConfigTree()
  }

  // ===== 弹窗装配与提交 =====
  function openEditModal(item: DisplayItem) {
    selectedConfig.value = item; jsonErrors.value = {}
    if (item.isEntityItem) {
      isConfigModal.value = false
      formFields.value = (currentApiModule.value ? buildEntityFields(item.raw!, currentApiModule.value) : []).map(f => ({ ...f }))
      readOnly.value = !item.configurable
    } else if (item.configItem) {
      isConfigModal.value = true
      formFields.value = buildConfigFields(item.configItem).map(f => ({ ...f }))
      readOnly.value = !item.configItem.effective_writable
    } else {
      readOnly.value = true; formFields.value = []
    }
    modalVisible.value = true
  }

  function buildSubmitData() {
    const data: Record<string, unknown> = {}; jsonErrors.value = {}
    for (const f of formFields.value) {
      if (f.type === 'json') { try { data[f.key] = JSON.parse(String(f.value)) } catch { jsonErrors.value[f.key] = 'JSON 格式错误'; return null } }
      else if (f.type === 'number') data[f.key] = Number(f.value)
      else data[f.key] = f.value
    }
    return data
  }

  async function submitForm() {
    if (!selectedConfig.value) return
    const data = buildSubmitData(); if (!data) { showToast('请修正表单错误'); return }
    submitting.value = true
    try {
      if (isConfigModal.value && selectedConfig.value.configItem) {
        await configApi.configItem.update(selectedConfig.value.configItem.config_key, data.value)
        showToast('配置已保存', 'success')
        closeModal()
        await loadConfigTree()
      } else {
        const m = currentApiModule.value; if (!m) return
        await updaters[m](selectedConfig.value.key, data)
        showToast('配置已保存', 'success'); closeModal(); await loadEntities(m)
      }
    } catch (e) { showToast(e instanceof Error ? e.message : '保存失败') } finally { submitting.value = false }
  }

  async function handleToggle(raw: RawItem) {
    const m = currentApiModule.value; if (!m) return
    const toggler = togglers[m]; if (!toggler) return
    try {
      await toggler(raw)
      showToast('状态已切换', 'success'); await loadEntities(m)
    } catch (e) { showToast(e instanceof Error ? e.message : '操作失败') }
  }

  async function handleDelete(raw: RawItem) {
    const m = currentApiModule.value; if (!m) return
    try {
      await deleters[m](raw.id)
      showToast('已删除', 'success'); await loadEntities(m)
    } catch (e) { showToast(e instanceof Error ? e.message : '删除失败') }
  }

  async function handleSetDefault(raw: RawItem) {
    try { await configApi.model.setDefault(raw.id); showToast('已设为默认', 'success'); await loadEntities('model') }
    catch (e) { showToast(e instanceof Error ? e.message : '设置失败') }
  }

  async function handleTestModel(raw: RawItem) {
    try { const r = await configApi.model.test(raw.id); showToast(r.success ? `连接成功 · ${r.latency}ms` : r.message, r.success ? 'success' : 'error') }
    catch (e) { showToast(e instanceof Error ? e.message : '测试失败') }
  }

  return {
    treeLoading, treeError, loadConfigTree,
    currentLevel, breadcrumb, goToLevel, selectLayer, selectModule, selectCategory, selectedCategory,
    selectedLayer, currentModule, currentApiModule, displayLayers, currentItems,
    loading, errorMsg, refreshCurrent,
    openEditModal, closeModal, submitForm, handleToggle, handleDelete, handleSetDefault, handleTestModel,
    modalVisible, readOnly, submitting, selectedConfig, formFields, jsonErrors,
    toastVisible, toastMsg, toastType,
  }
}
