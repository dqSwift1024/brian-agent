<script setup lang="ts">
import type { LibraryTreeNode } from '@/api/types'
import { Folder, FileText, ChevronRight, ChevronDown } from '@lucide/vue'
import { ref } from 'vue'

defineOptions({ name: 'LibraryTreeItem' })

defineProps<{ node: LibraryTreeNode; depth: number }>()
const emit = defineEmits<{ (e: 'enter', path: string): void }>()

const expanded = ref(true)

function toggle() {
  if (expanded.value) expanded.value = false
  else expanded.value = true
}
</script>

<template>
  <div>
    <div
      class="flex items-center gap-1.5 rounded-lg cursor-pointer hover:bg-apple-gray-100 dark:hover:bg-apple-gray-800 text-sm"
      :style="{ paddingLeft: `${depth * 14 + 8}px`, paddingRight: '8px', paddingTop: '4px', paddingBottom: '4px' }"
      @click="node.is_directory ? (node.children.length ? toggle() : emit('enter', node.relative_path)) : emit('enter', node.relative_path)"
    >
      <template v-if="node.is_directory">
        <ChevronDown v-if="expanded && node.children.length" :size="12" class="text-apple-gray-400 flex-shrink-0" />
        <ChevronRight v-else :size="12" class="text-apple-gray-400 flex-shrink-0" />
        <Folder :size="14" class="text-brian-blue flex-shrink-0" />
      </template>
      <FileText v-else :size="14" class="text-apple-gray-400 flex-shrink-0" />
      <span class="truncate">{{ node.name }}</span>
    </div>
    <template v-if="node.is_directory && expanded && node.children.length">
      <LibraryTreeItem
        v-for="child in node.children"
        :key="child.file_id"
        :node="child"
        :depth="depth + 1"
        @enter="emit('enter', $event)"
      />
    </template>
  </div>
</template>
