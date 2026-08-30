<script setup lang="ts">
/**
 * @fileoverview 配置页视图：四层下钻（框架层级 → 模块 → 分类 → 配置项）
 * + 实体编辑弹窗 + Toast。
 * 业务逻辑见 composables/useConfigView，纯展示映射见 utils/configDisplay。
 */
import {
  Layers, ChevronRight, ArrowLeft, RefreshCw,
  Loader2, AlertCircle, Star, FlaskConical, Trash2, X, Save,
} from '@lucide/vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import { useConfigView } from '@/composables/useConfigView'

const {
  treeLoading, treeError, loadConfigTree,
  currentLevel, breadcrumb, goToLevel, selectLayer, selectModule, selectCategory, selectedCategory,
  selectedLayer, currentModule, currentApiModule, displayLayers, currentItems,
  loading, errorMsg, refreshCurrent,
  openEditModal, closeModal, submitForm, handleToggle, handleDelete, handleSetDefault, handleTestModel,
  modalVisible, readOnly, submitting, selectedConfig, formFields, jsonErrors,
  toastVisible, toastMsg, toastType,
} = useConfigView()

const inputClass = 'w-full px-3 py-2 text-sm rounded-lg border border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-900 text-apple-gray-900 dark:text-apple-gray-50 focus:outline-none focus:ring-2 focus:ring-brian-blue/30 disabled:opacity-60 disabled:cursor-not-allowed'
</script>

<template>
  <div class="h-screen w-screen overflow-hidden relative">
    <NeuralBackground />
    <Header />
    <div class="pt-16 h-full relative z-10 flex flex-col">
      <div class="flex items-center gap-1.5 px-6 py-3 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" :class="{ 'opacity-40 pointer-events-none': currentLevel === 1 }" :disabled="currentLevel === 1" @click="goToLevel(currentLevel - 1)"><ArrowLeft :size="16" /></button>
        <Layers :size="15" class="text-brian-blue flex-shrink-0" />
        <template v-for="(crumb, idx) in breadcrumb" :key="idx">
          <ChevronRight v-if="idx > 0" :size="13" class="text-apple-gray-400" />
          <button class="text-sm font-medium px-1.5 py-0.5 rounded" :class="idx === breadcrumb.length - 1 ? 'cursor-default' : 'text-apple-gray-400 hover:text-brian-blue'" @click="goToLevel(crumb.level)">{{ crumb.label }}</button>
        </template>
        <button class="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-secondary" @click="refreshCurrent"><RefreshCw :size="13" /> 刷新</button>
      </div>

      <main class="flex-1 overflow-y-auto bg-apple-gray-50 dark:bg-apple-gray-900">
        <!-- Loading -->
        <div v-if="treeLoading" class="flex justify-center py-20"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>

        <!-- Error -->
        <div v-else-if="treeError" class="flex flex-col items-center py-20">
          <AlertCircle :size="28" class="text-error-red mb-3" /><p class="text-sm text-apple-gray-500 mb-3">{{ treeError }}</p><button class="btn-primary" @click="loadConfigTree">重试</button>
        </div>

        <!-- L1: Framework layers -->
        <div v-else-if="currentLevel === 1" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5"><h2 class="text-xl font-semibold">系统整体框架</h2><p class="text-sm text-apple-gray-400 mt-1"><span class="text-success-green">绿色 = 可配置</span> · <span class="text-apple-gray-400">灰色 = 不可配置</span></p></div>
          <div class="space-y-3">
            <div v-for="layer in displayLayers" :key="layer.key" class="group cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-md" :class="layer.hasConfigurable ? 'border-success-green/30 bg-success-green/[0.04] hover:border-success-green/50' : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800'" @click="selectLayer(layer)">
              <div class="flex items-center gap-3 mb-3">
                <div class="p-2 rounded-lg" :class="layer.hasConfigurable ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400'"><component :is="layer.icon" :size="18" /></div>
                <div class="min-w-0"><div class="flex items-center gap-2"><h3 class="font-semibold">{{ layer.name }}</h3><span class="text-[11px] text-apple-gray-400">{{ layer.key }}</span></div><p class="text-xs text-apple-gray-400 truncate">{{ layer.desc }}</p></div>
                <div class="ml-auto flex items-center gap-2 flex-shrink-0">
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full" :class="layer.hasConfigurable ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500'"><span class="w-1.5 h-1.5 rounded-full" :class="layer.hasConfigurable ? 'bg-success-green' : 'bg-apple-gray-400'" />{{ layer.hasConfigurable ? '含可配置模块' : '不可配置' }}</span>
                  <ChevronRight :size="16" class="text-apple-gray-400 group-hover:text-brian-blue" />
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <div v-for="m in layer.modules" :key="m.key" class="px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5" :class="m.configurable ? 'bg-success-green/10 text-success-green border border-success-green/20' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500 dark:text-apple-gray-400'"><component :is="m.icon" :size="12" />{{ m.name }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- L2: Layer modules -->
        <div v-else-if="currentLevel === 2 && selectedLayer" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5 flex items-center gap-2.5"><div class="p-2 rounded-lg bg-brian-blue/10"><component :is="selectedLayer.icon" :size="18" class="text-brian-blue" /></div><div><h2 class="text-lg font-semibold">{{ selectedLayer.name }}</h2><p class="text-xs text-apple-gray-400">{{ selectedLayer.desc }}</p></div></div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="m in selectedLayer.modules" :key="m.key" class="group cursor-pointer rounded-xl border p-5 transition-all hover:shadow-md" :class="m.configurable ? 'border-success-green/40 bg-success-green/[0.04] hover:border-success-green/60' : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800'" @click="selectModule(m)">
              <div class="flex items-start justify-between mb-3"><div class="flex items-center gap-2.5"><div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="m.configurable ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400'"><component :is="m.icon" :size="18" /></div><div><h3 class="font-semibold">{{ m.name }}</h3><p class="text-[11px]" :class="m.configurable ? 'text-success-green' : 'text-apple-gray-400'">{{ m.configurable ? '可配置' : '不可配置' }}</p></div></div><span class="w-2.5 h-2.5 rounded-full mt-1.5" :class="m.configurable ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" /></div>
              <p class="text-xs text-apple-gray-400 mb-3 min-h-[32px]">{{ m.desc }}</p>
              <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700"><span class="text-[11px] text-apple-gray-400">{{ m.categoryCount }} 个配置分类</span><ChevronRight :size="14" class="text-apple-gray-400 group-hover:text-brian-blue" /></div>
            </div>
          </div>
        </div>

        <!-- L3: Categories -->
        <div v-else-if="currentLevel === 3 && currentModule" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5 flex items-center gap-2.5"><div class="p-2 rounded-lg bg-brian-blue/10"><component :is="currentModule.icon" :size="18" class="text-brian-blue" /></div><div><h2 class="text-lg font-semibold">{{ currentModule.name }}</h2><p class="text-xs text-apple-gray-400">{{ currentModule.desc }}</p></div></div>
          <div v-if="currentApiModule && loading[currentApiModule]" class="flex justify-center py-20"><Loader2 :size="24" class="animate-spin text-brian-blue" /></div>
          <div v-else-if="currentApiModule && errorMsg[currentApiModule]" class="flex flex-col items-center py-20">
            <AlertCircle :size="28" class="text-error-red mb-3" /><p class="text-sm text-apple-gray-500 mb-3">{{ errorMsg[currentApiModule] }}</p><button class="btn-primary" @click="refreshCurrent">重试</button>
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="cat in currentModule.categories" :key="cat.key" class="group cursor-pointer rounded-xl border p-5 transition-all hover:shadow-md" :class="cat.configurable ? 'border-success-green/40 bg-success-green/[0.04] hover:border-success-green/60' : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800'" @click="selectCategory(cat)">
              <div class="flex items-start justify-between mb-3"><div><h3 class="font-semibold">{{ cat.name }}</h3><p class="text-[11px]" :class="cat.configurable ? 'text-success-green' : 'text-apple-gray-400'">{{ cat.configurable ? '可配置' : '不可配置' }}</p></div><span class="w-2.5 h-2.5 rounded-full mt-1.5" :class="cat.configurable ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" /></div>
              <p class="text-xs text-apple-gray-400 mb-3 min-h-[32px]">{{ cat.desc }}</p>
              <div class="flex items-center justify-between pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700"><span class="text-[11px] text-apple-gray-400">{{ cat.itemCount }} 个配置项</span><ChevronRight :size="14" class="text-apple-gray-400 group-hover:text-brian-blue" /></div>
            </div>
          </div>
        </div>

        <!-- L4: Config items -->
        <div v-else-if="currentLevel === 4 && currentModule && selectedCategory" class="p-6 max-w-7xl mx-auto">
          <div class="mb-5 flex items-center gap-2.5"><div class="p-2 rounded-lg bg-brian-blue/10"><component :is="currentModule.icon" :size="18" class="text-brian-blue" /></div><div><h2 class="text-lg font-semibold">{{ selectedCategory.name }}</h2><p class="text-xs text-apple-gray-400">{{ selectedCategory.desc }} · {{ currentItems.length }} 个配置项</p></div></div>
          <div v-if="currentItems.length === 0" class="flex flex-col items-center py-20 text-apple-gray-400"><component :is="currentModule.icon" :size="28" class="text-apple-gray-300 mb-2" /><p>暂无配置项</p></div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="item in currentItems" :key="item.key" class="rounded-xl border p-5 transition-all" :class="item.configurable ? 'border-success-green/40 bg-success-green/[0.04] hover:shadow-md' : 'border-apple-gray-200 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800'">
              <div class="cursor-pointer" @click="openEditModal(item)">
                <div class="flex items-start justify-between mb-3"><div class="flex items-center gap-2.5 min-w-0"><div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="item.configurable ? 'bg-success-green/10 text-success-green' : 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-400'"><component :is="currentModule.icon" :size="18" /></div><div class="min-w-0"><h3 class="font-semibold truncate">{{ item.name }}</h3><p class="text-[11px]" :class="item.configurable ? 'text-success-green' : 'text-apple-gray-400'">{{ item.configurable ? '可配置' : '不可配置' }}</p></div></div><span class="w-2.5 h-2.5 rounded-full mt-1.5" :class="item.configurable ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" /></div>
                <p class="text-xs text-apple-gray-400 mb-2 min-h-[32px] line-clamp-2">{{ item.desc }}</p>
                <p class="text-[11px] text-apple-gray-600 dark:text-apple-gray-300 font-mono bg-apple-gray-100 dark:bg-apple-gray-900/60 rounded px-2 py-1 truncate">{{ item.valueSummary }}</p>
              </div>
              <div v-if="item.isEntityItem && currentApiModule" class="flex items-center justify-end gap-1.5 mt-3 pt-3 border-t border-apple-gray-100 dark:border-apple-gray-700">
                <button v-if="currentApiModule === 'model'" class="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-brian-blue/10 text-brian-blue hover:bg-brian-blue/20" @click.stop="handleSetDefault(item.raw!)"><Star :size="11" /> 默认</button>
                <button v-if="currentApiModule === 'model'" class="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-apple-gray-100 dark:bg-apple-gray-700 hover:bg-apple-gray-200" @click.stop="handleTestModel(item.raw!)"><FlaskConical :size="11" /> 测试</button>
                <button v-if="currentApiModule !== 'model' && currentApiModule !== 'mcp' && item.raw && item.raw.enabled !== undefined" class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0" :class="item.raw.enabled ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click.stop="handleToggle(item.raw!)"><span class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform" :class="item.raw.enabled ? 'translate-x-4' : ''" /></button>
                <button class="flex items-center gap-1 px-2 py-1 text-[11px] rounded text-error-red hover:bg-error-red/10" @click.stop="handleDelete(item.raw!)"><Trash2 :size="11" /> 删除</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- L5: Edit modal -->
    <Transition name="modal">
      <div v-if="modalVisible" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" @click="closeModal" />
        <div class="relative w-full max-w-lg max-h-[85vh] flex flex-col block-card rounded-2xl">
          <div class="flex items-start justify-between px-5 py-4 border-b border-apple-gray-200 dark:border-apple-gray-700">
            <div class="min-w-0"><div class="flex items-center gap-2"><h3 class="font-semibold truncate">{{ selectedConfig?.name }}</h3><span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full" :class="readOnly ? 'bg-apple-gray-100 dark:bg-apple-gray-700 text-apple-gray-500' : 'bg-success-green/10 text-success-green'"><span class="w-1.5 h-1.5 rounded-full" :class="readOnly ? 'bg-apple-gray-400' : 'bg-success-green'" />{{ readOnly ? '只读' : '可配置' }}</span></div><p class="text-xs text-apple-gray-400 mt-0.5">{{ selectedConfig?.desc }}</p></div>
            <button class="p-1.5 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="closeModal"><X :size="18" /></button>
          </div>
          <div class="px-5 py-4 overflow-y-auto space-y-4">
            <div v-if="readOnly" class="flex items-start gap-2 text-xs text-warning-orange bg-warning-orange/10 rounded-lg p-3"><AlertCircle :size="14" class="flex-shrink-0 mt-0.5" /><span>该配置项当前不可编辑，以下为只读展示。</span></div>
            <div v-for="field in formFields" :key="field.key">
              <label class="block text-xs font-medium text-apple-gray-500 mb-1.5">{{ field.label }}</label>
              <input v-if="field.type === 'text'" v-model="field.value" type="text" :disabled="readOnly" :class="inputClass" />
              <input v-else-if="field.type === 'number'" v-model.number="field.value" type="number" :disabled="readOnly" :class="inputClass" />
              <button v-else-if="field.type === 'boolean'" :disabled="readOnly" class="relative w-11 h-6 rounded-full transition-colors disabled:opacity-60" :class="field.value ? 'bg-success-green' : 'bg-apple-gray-300 dark:bg-apple-gray-600'" @click="!readOnly && (field.value = !field.value)"><span class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform" :class="field.value ? 'translate-x-5' : ''" /></button>
              <select v-else-if="field.type === 'enum'" :value="String(field.value)" :disabled="readOnly" :class="inputClass" @change="field.value = ($event.target as HTMLSelectElement).value">
                <option v-for="opt in field.options" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
              </select>
              <textarea v-else-if="field.type === 'json'" :value="String(field.value)" :disabled="readOnly" rows="4" :class="`${inputClass} font-mono text-xs`" @input="field.value = ($event.target as HTMLTextAreaElement).value" />
              <p v-if="jsonErrors[field.key]" class="text-xs text-error-red mt-1">{{ jsonErrors[field.key] }}</p>
            </div>
          </div>
          <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-apple-gray-200 dark:border-apple-gray-700">
            <button class="btn-secondary" @click="closeModal">取消</button>
            <button v-if="!readOnly" class="btn-primary flex items-center gap-1.5" :disabled="submitting" @click="submitForm"><Loader2 v-if="submitting" :size="14" class="animate-spin" /><Save v-else :size="14" />{{ submitting ? '保存中...' : '保存' }}</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="toastVisible" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-lg text-sm font-medium shadow-lg" :class="toastType === 'success' ? 'bg-success-green text-white' : 'bg-error-red text-white'">{{ toastMsg }}</div>
    </Transition>
  </div>
</template>

<style scoped>
.modal-enter-active { transition: all 0.2s ease-out; }
.modal-leave-active { transition: all 0.15s ease-in; }
.modal-enter-from { opacity: 0; }
.modal-enter-from > div:not(.absolute) { transform: scale(0.95); }
.modal-leave-to { opacity: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
