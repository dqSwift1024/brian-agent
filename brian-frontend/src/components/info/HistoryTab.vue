<script setup lang="ts">
/**
 * 信息页「会话历史」页签视图：会话卡片时间线 / 日期导航 / 热力图 / 删除与标签弹窗。
 * 业务逻辑来自 useHistoryTab（经 InfoView 注入）。
 */
import { inject } from 'vue'
import {
  Search, Trash2, CheckSquare, Square, Tag, X,
} from '@lucide/vue'
import { INFO_TABS_KEY } from '@/composables/useInfoTabs'
import { formatTime, formatTokens } from '@/utils/format'

const {
  historySearch, historyStartTime, historyEndTime,
  loadingHistory, selectedSessions,
  viewingTagsSession, openViewTags,
  filteredHistory, historyTimeline, activeHistoryDate, scrollToHistoryDate,
  historyHeatmapYear, historyHeatmapMonth, historyHeatmapCells,
  historyHeatmapColor, isHistoryHeatmapCellActive, clickHistoryHeatmapDay,
  allHistorySelected, toggleHistorySelectAll, toggleHistorySelect,
  deleteConfirm, requestDeleteSession, requestBatchDelete, confirmDelete,
  openSession,
} = inject(INFO_TABS_KEY)!.history
</script>

<template>
  <div class="px-6 pb-8 space-y-4">
    <div v-if="loadingHistory" class="text-center py-8 text-apple-gray-400">加载中...</div>
    <div v-else-if="historyTimeline.length === 0" class="text-center py-8 text-apple-gray-400">暂无历史会话</div>
    <div v-else class="flex gap-6">
      <div class="w-40 flex-shrink-0">
        <div class="sticky top-[160px] space-y-1 max-h-[calc(100vh-10rem)] overflow-y-auto pr-1">
          <button
            v-for="group in historyTimeline"
            :key="group.dateKey"
            :id="`history-nav-${group.dateKey}`"
            class="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
            :class="activeHistoryDate === group.dateKey ? 'bg-brian-blue/10 text-brian-blue' : 'text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800'"
            @click="scrollToHistoryDate(group.dateKey)"
          >
            <span class="w-2 h-2 rounded-full flex-shrink-0" :class="activeHistoryDate === group.dateKey ? 'bg-brian-blue' : 'bg-apple-gray-300'" />
            <span>{{ group.label }}</span>
            <span class="ml-auto text-apple-gray-300">{{ group.items.length }}</span>
          </button>
        </div>
      </div>
      <div class="flex-1 min-w-0 space-y-4">
        <div class="sticky top-[160px] z-20 flex items-center gap-3 flex-wrap bg-white dark:bg-apple-dark-bg py-2 -mx-1 px-1 border-b border-apple-gray-200/60 dark:border-apple-gray-700/60">
          <div class="relative flex-1 max-w-md">
            <Search :size="18" class="absolute left-3 top-1/2 -translate-y-1/2 text-apple-gray-400" />
            <input v-model="historySearch" placeholder="搜索会话内容或标题..." class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
          </div>
          <div class="flex items-center gap-2 text-xs text-apple-gray-500">
            <input v-model="historyStartTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
            <span>至</span>
            <input v-model="historyEndTime" type="datetime-local" class="px-2 py-2 rounded-lg bg-white dark:bg-apple-gray-800 border border-apple-gray-200 dark:border-apple-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-brian-blue" />
          </div>
          <button
            v-if="filteredHistory.length > 0"
            class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-brian-blue hover:bg-brian-blue/10 rounded-lg"
            @click="toggleHistorySelectAll"
          >
            <component :is="allHistorySelected ? CheckSquare : Square" :size="14" /> {{ allHistorySelected ? '取消全选' : '全选' }}
          </button>
          <button
            class="flex items-center gap-1 px-3 py-2 text-xs font-medium text-error-red hover:bg-error-red/10 rounded-lg"
            :class="selectedSessions.size > 0 ? '' : 'opacity-40 cursor-not-allowed'"
            :disabled="selectedSessions.size === 0"
            @click="requestBatchDelete()"
          >
            <Trash2 :size="14" /> 删除所选{{ selectedSessions.size > 0 ? `(${selectedSessions.size})` : '' }}
          </button>
        </div>
        <div class="space-y-3">
          <template v-for="group in historyTimeline" :key="group.dateKey">
          <div :id="`history-group-${group.dateKey}`" class="flex items-center gap-2 pt-1 scroll-mt-[210px]">
            <span class="text-sm font-semibold">{{ group.label }}</span>
            <span class="text-xs text-apple-gray-400">({{ group.items.length }})</span>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            <div
              v-for="item in group.items"
              :key="item.sessionId"
              class="block-card rounded-xl p-3 cursor-pointer flex flex-col gap-1.5 h-44"
              :class="selectedSessions.has(item.sessionId) ? 'border-brian-blue/40 bg-brian-blue/5' : 'hover:border-brian-blue/30'"
              @click="openSession(item.sessionId)"
            >
              <div class="flex items-start justify-between gap-1">
                <p class="text-sm font-semibold truncate min-w-0 flex-1">{{ item.sessionTitle || '新会话' }}</p>
                <div class="flex items-center gap-0.5 flex-shrink-0">
                  <button class="text-apple-gray-300 hover:text-brian-blue" title="选择" @click.stop="toggleHistorySelect(item.sessionId)">
                    <component :is="selectedSessions.has(item.sessionId) ? CheckSquare : Square" :size="14" />
                  </button>
                  <button class="text-apple-gray-400 hover:text-error-red" title="删除" @click.stop="requestDeleteSession(item.sessionId)">
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
              <span class="text-xs text-apple-gray-400">{{ formatTime(item.lastTime) }}</span>
              <div class="grid grid-cols-3 gap-1.5 text-[11px]">
                <div class="rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 px-1.5 py-1" title="输入 / 输出 Token">
                  <p class="text-apple-gray-400">Tokens</p>
                  <p class="font-medium text-apple-gray-700 dark:text-apple-gray-200 truncate">{{ formatTokens(item.inputTokens) }} / {{ formatTokens(item.outputTokens) }}</p>
                </div>
                <div class="rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 px-1.5 py-1" title="问答次数">
                  <p class="text-apple-gray-400">问答</p>
                  <p class="font-medium text-apple-gray-700 dark:text-apple-gray-200">{{ item.qaCount ?? 0 }}</p>
                </div>
                <div class="rounded-lg bg-apple-gray-50 dark:bg-apple-gray-800 px-1.5 py-1" title="问题 / 回答字符数">
                  <p class="text-apple-gray-400">字数</p>
                  <p class="font-medium text-apple-gray-700 dark:text-apple-gray-200 truncate">{{ formatTokens(item.questionChars) }} / {{ formatTokens(item.answerChars) }}</p>
                </div>
              </div>
              <div class="flex flex-wrap gap-1 overflow-hidden flex-1 min-h-0 items-end">
                <button
                  class="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-brian-blue bg-brian-blue/5 hover:bg-brian-blue/10 transition-colors"
                  @click.stop="openViewTags(item)"
                >
                  <Tag :size="12" /> 查看标签
                </button>
              </div>
            </div>
          </div>
        </template>
        </div>
      </div>
    </div>

    <div v-if="historyTimeline.length > 0" class="fixed bottom-6 left-6 z-20 w-40 bg-white/80 dark:bg-apple-gray-900/80 backdrop-blur-sm rounded-xl p-2 shadow-sm">
      <div class="grid grid-cols-7 gap-0.5">
        <div
          v-for="(cell, i) in historyHeatmapCells"
          :key="i"
          :title="cell.day ? `${cell.day}日: ${cell.count} 个会话` : ''"
          class="aspect-square rounded-[3px]"
          :class="[
            cell.day ? historyHeatmapColor(cell.count) : 'bg-transparent',
            cell.day ? 'cursor-pointer hover:ring-2 hover:ring-brian-blue/60' : '',
            cell.day && isHistoryHeatmapCellActive(cell.day) ? 'ring-2 ring-brian-blue' : '',
          ]"
          @click="clickHistoryHeatmapDay(cell.day)"
        />
      </div>
      <div class="flex items-center justify-center mt-2">
        <span class="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">{{ historyHeatmapYear }}/{{ String(historyHeatmapMonth).padStart(2, '0') }}</span>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <div v-if="deleteConfirm" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="deleteConfirm = null">
      <div class="block-card w-full max-w-sm mx-4 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">确认删除</h3>
          <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="deleteConfirm = null"><X :size="18" /></button>
        </div>
        <p class="text-sm text-apple-gray-600 dark:text-apple-gray-300">
          {{ deleteConfirm.type === 'batch' ? `确定删除选中的 ${selectedSessions.size} 个会话及其全部消息吗？` : '确定删除该会话及其全部消息吗？' }}
        </p>
        <p class="text-xs text-apple-gray-400 mt-1">此操作将同时清理关联的记忆、标签与向量数据，且不可恢复。</p>
        <div class="flex justify-end gap-2 mt-6">
          <button class="btn-secondary" @click="deleteConfirm = null">取消</button>
          <button class="px-3 py-2 text-xs font-medium bg-error-red text-white rounded-lg hover:bg-error-red/90 transition-colors" @click="confirmDelete">确认删除</button>
        </div>
      </div>
    </div>

    <!-- 查看标签弹窗 -->
    <div v-if="viewingTagsSession" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="viewingTagsSession = null">
      <div class="block-card w-full max-w-md mx-4 p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">会话标签</h3>
          <button class="p-1 rounded-lg text-apple-gray-400 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-700" @click="viewingTagsSession = null"><X :size="18" /></button>
        </div>
        <p class="text-sm text-apple-gray-500 mb-3 truncate">{{ viewingTagsSession.sessionTitle || '新会话' }}</p>
        <div v-if="!viewingTagsSession.tags || viewingTagsSession.tags.length === 0" class="text-sm text-apple-gray-400 py-4 text-center">无标签</div>
        <div v-else class="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
          <span v-for="tag in viewingTagsSession.tags" :key="tag" class="px-2.5 py-1 rounded-full text-sm bg-brian-blue/10 text-brian-blue">#{{ tag }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
