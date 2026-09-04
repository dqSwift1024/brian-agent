<script setup lang="ts">
/**
 * 信息页共用「月度热力图」卡片（历史/记忆页签左下角）。
 *
 * 两页签共用本组件以保证样式一致：按日计数格子 + 月份切换；
 * 颜色按当月最大计数分档（GitHub 贡献图风格，与 MonitorPanel tokenCalendar 同 palette）。
 */
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

const props = defineProps<{
  /** 月历格子（含占位 null），由页签 composable 按月生成 */
  cells: { day: number | null; count: number }[]
  year: number
  month: number
  /** 计数单位，用于悬浮提示（如「个会话」「条记忆」） */
  unit: string
  /** 当前高亮的日号；不在显示月份内时传 null */
  activeDay?: number | null
  /** 是否允许切换到下一月（显示当前月时应禁用） */
  canGoNext?: boolean
}>()

const emit = defineEmits<{
  select: [day: number | null]
  prev: []
  next: []
}>()

const maxCount = computed(() => Math.max(0, ...props.cells.map(c => c.count)))

function cellColor(count: number): string {
  if (count <= 0) return 'bg-apple-gray-100 dark:bg-apple-gray-800'
  const r = count / (maxCount.value || 1)
  if (r < 0.25) return 'bg-brian-blue/20'
  if (r < 0.5) return 'bg-brian-blue/40'
  if (r < 0.75) return 'bg-brian-blue/70'
  return 'bg-brian-blue'
}
</script>

<template>
  <div class="fixed bottom-6 left-6 z-20 w-32 bg-white/80 dark:bg-apple-gray-900/80 backdrop-blur-sm rounded-xl p-1.5 shadow-sm">
    <div class="grid grid-cols-7 gap-1">
      <div
        v-for="(cell, i) in cells"
        :key="i"
        :title="cell.day ? `${cell.day}日: ${cell.count} ${unit}` : ''"
        class="aspect-square rounded-[3px]"
        :class="[
          cell.day ? cellColor(cell.count) : 'bg-transparent',
          cell.day ? 'cursor-pointer hover:ring-2 hover:ring-brian-blue/60' : '',
          cell.day && activeDay === cell.day ? 'ring-2 ring-brian-blue' : '',
        ]"
        @click="emit('select', cell.day)"
      />
    </div>
    <div class="flex items-center justify-between mt-2">
      <button
        class="p-0.5 rounded text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10 transition-colors"
        @click="emit('prev')"
      >
        <ChevronLeft :size="14" />
      </button>
      <span class="text-xs font-medium text-apple-gray-600 dark:text-apple-gray-300">{{ year }}/{{ String(month).padStart(2, '0') }}</span>
      <button
        class="p-0.5 rounded transition-colors"
        :class="canGoNext ? 'text-apple-gray-400 hover:text-brian-blue hover:bg-brian-blue/10' : 'text-apple-gray-300 cursor-not-allowed'"
        :disabled="!canGoNext"
        @click="emit('next')"
      >
        <ChevronRight :size="14" />
      </button>
    </div>
  </div>
</template>
