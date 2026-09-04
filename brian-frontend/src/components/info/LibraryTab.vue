<script setup lang="ts">
/**
 * 信息页「学习资料库」页签视图：资料库卡片 / 目录浏览 / 文档阅读（划线咨询）/ 新增与询问弹窗。
 * 业务逻辑来自 useLibraryTab（经 InfoView 注入）。
 */
import { inject } from 'vue'
import {
  Plus, Folder, Trash2, ArrowLeft, ChevronRight, Search,
  FileText, Sparkles, Loader2, X,
} from '@lucide/vue'
import LibraryTreeItem from '@/components/LibraryTreeItem.vue'
import { INFO_TABS_KEY } from '@/composables/useInfoTabs'
import { formatFileSize } from '@/utils/format'
import { renderMarkdown } from '@/utils/markdown'

const {
  activeAnnotationId,
  annotationLines,
  annotations,
  articleSections,
  askDialog,
  asking,
  checkLibPath,
  checkingPath,
  closeFileModal,
  contentAreaRef,
  contextMenu,
  currentDirectory,
  enterDirectory,
  fileHasMore,
  fileKeyword,
  fileLoading,
  fileLoadingMore,
  goUpDirectory,
  handleAddLibrary,
  handleCardClick,
  handleDeleteLibrary,
  handleFileContextMenu,
  handleToggleLibrary,
  libraries,
  libraryBreadcrumb,
  libraryDetail,
  libraryFileSentinel,
  libraryFiles,
  libraryTree,
  loadingLibs,
  newLib,
  openAskDialog,
  openFile,
  openLibraryDetail,
  pathCheckResult,
  scrollToSection,
  selectedFile,
  selectedFileLoading,
  showAddLib,
  submitAsk,
} = inject(INFO_TABS_KEY)!.library

</script>

<template>
  <div class="px-6 pb-8 space-y-4">
    <div v-if="!libraryDetail">
      <h3 class="text-lg font-semibold mb-4">资料库</h3>
      <div v-if="loadingLibs" class="text-center py-8 text-apple-gray-400">加载中...</div>
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <button class="flex flex-col items-center justify-center border-2 border-dashed border-apple-gray-300 dark:border-apple-gray-600 rounded-lg text-apple-gray-400 hover:border-brian-blue hover:text-brian-blue transition-colors aspect-[3/2]" @click="showAddLib = true">
          <Plus :size="24" class="mb-1.5" />
          <span class="text-xs font-medium">添加资料库</span>
        </button>
        <div
          v-for="lib in libraries"
          :key="lib.id"
          class="relative p-4 rounded-lg border border-apple-gray-100 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800/50 hover:border-brian-blue/40 hover:shadow-sm transition-all aspect-[3/2] flex flex-col cursor-pointer"
          @click="openLibraryDetail(lib)"
        >
          <div class="flex items-center gap-2 mb-2">
            <div class="p-1.5 bg-brian-blue/10 rounded-lg flex-shrink-0">
              <Folder :size="16" class="text-brian-blue" />
            </div>
            <h4 class="text-sm font-semibold truncate flex-1 min-w-0">{{ lib.name }}</h4>
            <button class="p-1 rounded-lg text-apple-gray-300 hover:text-error-red hover:bg-error-red/10 flex-shrink-0" @click.stop="handleDeleteLibrary(lib.id)">
              <Trash2 :size="13" />
            </button>
          </div>
          <p class="text-[11px] text-apple-gray-400 truncate font-mono">{{ lib.path }}</p>
          <p class="text-xs text-apple-gray-500 line-clamp-2 mt-1.5 flex-1 min-h-0">{{ lib.description || '暂无描述' }}</p>
          <div class="flex items-center justify-between mt-auto pt-2 border-t border-apple-gray-100 dark:border-apple-gray-700">
            <span class="text-[11px] text-apple-gray-400">{{ lib.learnedFiles || 0 }}/{{ lib.totalFiles || 0 }} 文件</span>
            <button class="flex items-center gap-1.5" @click.stop="handleToggleLibrary(lib)">
              <span class="relative w-8 h-4 rounded-full transition-colors" :class="lib.enableSelfLearning ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'">
                <span class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform" :class="lib.enableSelfLearning ? 'translate-x-4' : ''" />
              </span>
              <span class="text-[11px]" :class="lib.enableSelfLearning ? 'text-brian-blue' : 'text-apple-gray-400'">{{ lib.enableSelfLearning ? '启用' : '禁用' }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Add library modal -->
      <div v-if="showAddLib" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showAddLib = false">
        <div class="block-card w-full max-w-md mx-4 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">添加资料库</h3>
            <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="showAddLib = false"><X :size="18" /></button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="text-xs font-medium text-apple-gray-500 mb-1 block">资料库名称</label>
              <input v-model="newLib.name" placeholder="输入名称..." class="w-full px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            </div>
            <div>
              <label class="text-xs font-medium text-apple-gray-500 mb-1 block">摘要</label>
              <input v-model="newLib.description" placeholder="输入摘要..." class="w-full px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            </div>
            <div>
              <label class="text-xs font-medium text-apple-gray-500 mb-1 block">路径</label>
              <div class="flex gap-2">
                <input v-model="newLib.path" placeholder="/path/to/library" class="flex-1 px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
                <button class="px-3 py-2 text-xs font-medium btn-secondary whitespace-nowrap" :disabled="checkingPath || !newLib.path" @click="checkLibPath">{{ checkingPath ? '检查中...' : '检查路径' }}</button>
              </div>
              <div v-if="pathCheckResult" class="mt-2 flex items-center gap-3 text-xs">
                <span :class="pathCheckResult.exists ? 'text-success-green' : 'text-error-red'">{{ pathCheckResult.exists ? '✓ 路径存在' : '✗ 路径不存在' }}</span>
              </div>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button class="btn-secondary" @click="showAddLib = false">取消</button>
            <button class="btn-primary" :disabled="!newLib.name || !newLib.path" @click="handleAddLibrary">提交</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Library detail -->
    <div v-else>
      <!-- 文档展示区 -->
      <div v-if="selectedFile || selectedFileLoading">
        <div class="flex items-center gap-2 mb-4">
          <button class="flex items-center gap-1 text-sm text-apple-gray-500 hover:text-brian-blue" @click="closeFileModal">
            <ArrowLeft :size="16" /> {{ libraryDetail.name }}
          </button>
          <ChevronRight :size="14" class="text-apple-gray-400" />
          <span class="text-sm font-medium flex items-center gap-1.5"><FileText :size="14" class="text-brian-blue" /> {{ selectedFile?.name || '加载中...' }}</span>
        </div>

        <div ref="contentAreaRef" class="relative flex gap-6" :style="{ minHeight: '70vh' }">
          <svg class="absolute inset-0 w-full h-full pointer-events-none" style="z-index: 0; overflow: visible;">
            <path
              v-for="line in annotationLines"
              :key="line.id"
              :d="`M ${line.x1} ${line.y1} L ${(line.x1 + line.x2) / 2} ${line.y1} L ${(line.x1 + line.x2) / 2} ${line.y2} L ${line.x2} ${line.y2}`"
              :stroke="activeAnnotationId === line.id ? '#ff9500' : '#0071e3'"
              :stroke-width="activeAnnotationId === line.id ? 2 : 1.5"
              fill="none" stroke-dasharray="4,3"
            />
          </svg>

          <div class="w-64 flex-shrink-0 relative z-10">
            <div class="text-xs font-semibold text-apple-gray-500 mb-2">章节</div>
            <div class="space-y-1">
              <button
                v-for="sec in articleSections"
                :key="sec.id"
                class="w-full text-left text-xs text-apple-gray-600 dark:text-apple-gray-400 hover:text-brian-blue transition-colors truncate"
                :style="{ paddingLeft: `${(sec.level - 1) * 12}px` }"
                @click="scrollToSection(sec)"
              >
                {{ sec.title }}
              </button>
              <div v-if="articleSections.length === 0" class="text-xs text-apple-gray-400">暂无章节</div>
            </div>
          </div>

          <div class="flex-1 min-w-0 relative z-10">
            <div v-if="selectedFileLoading" class="text-center py-12 text-apple-gray-400">加载中...</div>
            <div v-else class="markdown-body select-text" @contextmenu.prevent="handleFileContextMenu" v-html="renderMarkdown(selectedFile!.content)"></div>
          </div>

          <div class="w-64 flex-shrink-0 relative z-10 space-y-3">
            <div
              v-for="ann in annotations"
              :key="ann.id"
              :data-card-id="ann.id"
              class="p-3 rounded-lg border cursor-pointer transition-all"
              :class="activeAnnotationId === ann.id ? 'border-warning-orange/50 bg-warning-orange/10' : 'border-brian-blue/20 bg-brian-blue/5'"
              @click="handleCardClick(ann.id)"
            >
              <div class="text-xs font-medium mb-1" :class="activeAnnotationId === ann.id ? 'text-warning-orange' : 'text-brian-blue'">咨询</div>
              <p class="text-xs text-apple-gray-500 mb-1 line-clamp-2">{{ ann.question }}</p>
              <p class="text-sm whitespace-pre-wrap text-apple-gray-700 dark:text-apple-gray-300">{{ ann.result }}</p>
            </div>
            <div v-if="annotations.length === 0" class="text-xs text-apple-gray-400">选中内容后右键可咨询</div>
          </div>
        </div>
      </div>

      <!-- 目录浏览 -->
      <template v-else>
        <div class="flex items-center gap-2 mb-4">
          <button class="flex items-center gap-1 text-sm text-apple-gray-500 hover:text-brian-blue" @click="libraryDetail = null">
            <ArrowLeft :size="16" /> 资料库
          </button>
          <ChevronRight :size="14" class="text-apple-gray-400" />
          <span class="text-sm font-medium">{{ libraryDetail.name }}</span>
          <button class="ml-auto flex items-center gap-1.5" @click="handleToggleLibrary(libraryDetail)">
            <span class="relative w-8 h-4 rounded-full transition-colors" :class="libraryDetail.enableSelfLearning ? 'bg-brian-blue' : 'bg-apple-gray-300 dark:bg-apple-gray-600'">
              <span class="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform" :class="libraryDetail.enableSelfLearning ? 'translate-x-4' : ''" />
            </span>
            <span class="text-xs" :class="libraryDetail.enableSelfLearning ? 'text-brian-blue' : 'text-apple-gray-400'">{{ libraryDetail.enableSelfLearning ? '启用' : '禁用' }}</span>
          </button>
        </div>

        <div class="flex items-center gap-3 mb-4 flex-wrap">
          <div class="flex items-center gap-1 text-sm flex-wrap">
            <template v-for="(crumb, i) in libraryBreadcrumb" :key="crumb.path">
              <ChevronRight v-if="i > 0" :size="14" class="text-apple-gray-300 flex-shrink-0" />
              <button class="hover:text-brian-blue transition-colors" :class="i === libraryBreadcrumb.length - 1 ? 'text-apple-gray-900 dark:text-apple-gray-50 font-medium' : 'text-apple-gray-500'" @click="enterDirectory(crumb.path)">{{ crumb.label }}</button>
            </template>
          </div>
          <button v-if="currentDirectory" class="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-apple-gray-100 dark:bg-apple-gray-800 text-apple-gray-500 hover:text-brian-blue transition-colors" @click="goUpDirectory">
            <ArrowLeft :size="12" /> 上级
          </button>
          <div class="relative flex-1 max-w-xs ml-auto">
            <Search :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
            <input v-model="fileKeyword" placeholder="搜索文件..." class="w-full pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
          </div>
        </div>

        <div class="flex gap-4">
          <div class="w-56 flex-shrink-0 block-card rounded-xl p-3 max-h-[70vh] overflow-y-auto">
            <div class="text-xs font-semibold text-apple-gray-500 mb-2 px-2">目录</div>
            <LibraryTreeItem
              v-for="node in libraryTree"
              :key="node.file_id"
              :node="node"
              :depth="0"
              @enter="(p: string) => enterDirectory(p)"
            />
            <div v-if="libraryTree.length === 0" class="text-xs text-apple-gray-400 px-2 py-2">暂无目录</div>
          </div>

          <div class="flex-1 min-w-0">
            <div v-if="fileLoading" class="text-center py-12 text-apple-gray-400">加载中...</div>
            <div v-else-if="libraryFiles.length === 0" class="text-center py-12 text-apple-gray-400 text-sm">该目录下暂无文件</div>
            <div v-else class="space-y-1.5">
              <div
                v-for="file in libraryFiles"
                :key="file.id"
                class="flex items-center gap-3 p-3 rounded-lg border border-apple-gray-100 dark:border-apple-gray-700 bg-white dark:bg-apple-gray-800/50 hover:border-brian-blue/40 transition-all cursor-pointer"
                @click="openFile(file)"
              >
                <Folder v-if="file.isDirectory" :size="18" class="text-brian-blue flex-shrink-0" />
                <FileText v-else :size="18" class="text-apple-gray-400 flex-shrink-0" />
                <span class="text-sm truncate flex-1 min-w-0">{{ file.name }}</span>
                <span v-if="!file.isDirectory" class="text-[11px] text-apple-gray-400 flex-shrink-0">{{ formatFileSize(file.size) }}</span>
                <ChevronRight v-if="file.isDirectory" :size="14" class="text-apple-gray-300 flex-shrink-0" />
              </div>
              <div ref="libraryFileSentinel" v-if="fileHasMore || fileLoadingMore" class="text-center py-3 text-xs text-apple-gray-400">
                {{ fileLoadingMore ? '加载中...' : '继续滚动加载更多' }}
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 询问弹窗 -->
      <Teleport to="body">
        <div v-if="askDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" @click.self="askDialog = null">
          <div class="w-full max-w-lg rounded-2xl bg-white dark:bg-apple-gray-800 shadow-xl p-6">
            <h3 class="text-lg font-semibold mb-2 flex items-center gap-1.5"><Sparkles :size="16" class="text-brian-blue" /> 询问大模型</h3>
            <p class="text-xs text-apple-gray-400 mb-4">选中内容：<span class="text-apple-gray-600 dark:text-apple-gray-300">{{ askDialog.selectionText.slice(0, 80) }}{{ askDialog.selectionText.length > 80 ? '…' : '' }}</span></p>
            <textarea v-model="askDialog.question" rows="3" class="w-full px-3 py-2 rounded-lg bg-apple-gray-100 dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" placeholder="输入你想咨询的问题，例如：这段内容是什么意思？"></textarea>
            <div class="flex justify-end gap-2 mt-4">
              <button class="btn-secondary" @click="askDialog = null">取消</button>
              <button class="btn-primary flex items-center gap-1.5" :disabled="asking" @click="submitAsk">
                <Loader2 v-if="asking" :size="14" class="animate-spin" /> 咨询
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- 文档选中右键菜单 -->
      <Teleport to="body">
        <div v-if="contextMenu" class="fixed z-[60] bg-white dark:bg-apple-gray-800 rounded-lg shadow-lg border border-apple-gray-200 dark:border-apple-gray-700 py-1 min-w-[160px]" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }" @click.stop>
          <button class="w-full text-left px-3 py-2 text-sm text-apple-gray-700 dark:text-apple-gray-200 hover:bg-brian-blue/10 flex items-center gap-2" @click="openAskDialog">
            <Sparkles :size="14" class="text-brian-blue" /> 询问大模型
          </button>
        </div>
      </Teleport>
    </div>
  </div>
</template>
