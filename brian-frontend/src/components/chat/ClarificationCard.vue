<script setup lang="ts">
import { Brain, Loader2 } from '@lucide/vue'
import type { ClarificationRequest } from '@/api/types'

defineProps<{
  request: ClarificationRequest
  /** 提交进行中（禁用按钮并展示加载态） */
  submitting: boolean
}>()

defineEmits<{
  submit: []
  cancel: []
}>()
</script>

<template>
  <!-- 需求补充卡片（对话区内联，样式与需求理解确认卡片一致） -->
  <div class="flex items-start gap-2 justify-end">
    <div class="max-w-[85%] min-w-0">
      <div class="rounded-2xl bg-white dark:bg-apple-gray-900 border border-apple-gray-200 dark:border-apple-gray-700 shadow-sm overflow-hidden">
        <div class="px-4 py-3 border-b border-apple-gray-100 dark:border-apple-gray-800">
          <p class="text-sm font-semibold text-apple-gray-900 dark:text-apple-gray-100">需要补充信息</p>
          <p class="text-xs text-apple-gray-400 mt-0.5">为了继续执行，请补充以下参数</p>
        </div>
        <div class="px-4 py-3 space-y-3">
          <div v-for="(c, index) in request.clarifications" :key="index" class="text-sm">
            <p class="text-apple-gray-700 dark:text-apple-gray-200 mb-1">
              <span v-if="c.domain" class="inline-block mr-1 px-1.5 py-0.5 text-xs rounded bg-brian-blue/10 text-brian-blue">{{ c.domain }}</span>
              {{ c.question }}
            </p>
            <input
              v-model="c.answer"
              type="text"
              class="w-full px-3 py-2 rounded-lg text-sm border border-apple-gray-200 dark:border-apple-gray-700 bg-apple-gray-50 dark:bg-apple-gray-800 text-apple-gray-900 dark:text-apple-gray-100 focus:outline-none focus:ring-1 focus:ring-brian-blue"
              :placeholder="c.question"
            />
          </div>
        </div>
        <div class="px-4 py-3 border-t border-apple-gray-100 dark:border-apple-gray-800 flex items-center justify-end gap-2">
          <button
            class="px-3 py-1.5 rounded-lg text-sm text-apple-gray-500 hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 disabled:opacity-50"
            :disabled="submitting"
            @click="$emit('cancel')"
          >取消</button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm text-white bg-brian-blue hover:bg-brian-blue/90 disabled:opacity-50 flex items-center gap-1"
            :disabled="submitting"
            @click="$emit('submit')"
          >
            <Loader2 v-if="submitting" :size="14" class="animate-spin" />
            提交
          </button>
        </div>
      </div>
    </div>
    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center mt-1">
      <Brain :size="16" />
    </div>
  </div>
</template>
