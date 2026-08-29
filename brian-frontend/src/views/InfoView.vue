<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  Clock, Brain, Database, Network, GitBranch,
  Search, Trash2, Plus, ChevronRight, ChevronLeft, ArrowLeft,
  Folder, X, CheckSquare, Square, FileText,
  UserRound, History, RefreshCw, Sparkles, Loader2,
  Tag, Eye, EyeOff,
} from '@lucide/vue'
import { chatApi, memoryApi, libraryApi, userProfileApi, configApi } from '@/api'
import type { ChatSession, MemoryItem, GraphNode, GraphEdge, LibraryPath, LibraryFileEntry, LibraryTreeNode, UserProfileData, ProfileHistoryItem, ProfileVersionData } from '@/api/types'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import LibraryTreeItem from '@/components/LibraryTreeItem.vue'
import { useI18nStore } from '@/stores/i18n'
import { formatFileSize, formatTokens, formatTime, formatTime as formatProfileTime } from '../utils/format'
import { useHistoryTab, useMemoryTab, useLibraryTab, useProfileTab, useTagGraphTab } from '../composables/useInfoTabs'

function renderMarkdown(content: string): string {
  const html = marked.parse(content) as string
  return DOMPurify.sanitize(html)
}

const router = useRouter()

// Tabs
const i18nStore = useI18nStore()
type InfoTabKey = 'history' | 'memory' | 'library' | 'tagGraph' | 'keywordGraph' | 'profile'
const infoTabKeys: InfoTabKey[] = ['history', 'memory', 'library', 'tagGraph', 'keywordGraph', 'profile']
const storedInfoTab = localStorage.getItem('brian-info-active-tab')
const activeTab = ref<InfoTabKey>(infoTabKeys.includes(storedInfoTab as InfoTabKey) ? (storedInfoTab as InfoTabKey) : 'history')
const tabs = computed(() => [
  { key: 'history' as const, label: i18nStore.t('info.history'), icon: Clock },
  { key: 'memory' as const, label: i18nStore.t('info.memory'), icon: Brain },
  { key: 'library' as const, label: i18nStore.t('info.library'), icon: Database },
  { key: 'tagGraph' as const, label: i18nStore.t('info.tagGraph'), icon: Network },
  { key: 'keywordGraph' as const, label: i18nStore.t('info.keywordGraph'), icon: GitBranch },
  { key: 'profile' as const, label: i18nStore.t('info.profile'), icon: UserRound },
])

const pagePath = computed(() => {
  const active = tabs.value.find(t => t.key === activeTab.value)
  return [i18nStore.t('nav.info'), ...(active ? [active.label] : [])]
})

// History tab
const {
  historySearch, historyStartTime, historyEndTime,
  chatList, loadingHistory, selectedSessions,
  viewingTagsSession, openViewTags, loadHistory,
  filteredHistory, historyTimeline, activeHistoryDate, scrollToHistoryDate,
  historyHeatmapYear, historyHeatmapMonth, historyHeatmapDays, historyHeatmapCells,
  historyHeatmapColor, historyHeatmapDateKey, isHistoryHeatmapCellActive, clickHistoryHeatmapDay,
  allHistorySelected, toggleHistorySelectAll, toggleHistorySelect,
  deleteConfirm, requestDeleteSession, requestBatchDelete, confirmDelete,
  openSession,
} = useHistoryTab()

// Memory tab
const {
  activeMemoryDate,
    allMemoriesSelected,
    buildMemorySearchOpts,
    clickDateNav,
    clickHeatmapDay,
    confirmMemoryDelete,
    dateCountCache,
    dateKeyToRange,
    dateNavTimeline,
    deleteMemoryByIds,
    expandedMemory,
    filteredMemories,
    getDateCount,
    hasMoreMemory,
    heatmapCells,
    heatmapColor,
    heatmapDateKey,
    heatmapDays,
    heatmapMonth,
    heatmapYear,
    isCurrentHeatmapMonth,
    isHeatmapCellActive,
    loadAllDateCounts,
    loadMemory,
    loadMoreMemory,
    loadingMemory,
    loadingMoreMemory,
    memories,
    memoryDateFilter,
    memoryDeleteConfirm,
    memoryEndTime,
    memorySearch,
    memorySentinel,
    memoryStartTime,
    memoryTag,
    memoryTimeline,
    nextHeatmapMonth,
    nextMemoryCursor,
    onMemoryScroll,
    prevHeatmapMonth,
    requestMemoryDelete,
    scrollMemoryNavToActive,
    selectedMemories,
    startDateCountRefresh,
    stopDateCountRefresh,
    todayDateKey,
    toggleMemorySelect,
    toggleSelectAllMemory,
  typeColors, typeLabels,
} = useMemoryTab()
const {
  activeAnnotationId,
  annotationLines,
  annotations,
  articleSections,
  askDialog,
  asking,
  checkLibPath,
  checkingPath,
  closeContextMenu,
  closeFileModal,
  contentAreaRef,
  contextMenu,
  currentDirectory,
  enterDirectory,
  fileHasMore,
  fileKeyword,
  fileLoading,
  fileLoadingMore,
  fileNextCursor,
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
  loadLibraries,
  loadLibraryFiles,
  loadLibraryTree,
  loadMoreLibraryFiles,
  loadingLibs,
  markSelection,
  newLib,
  openAskDialog,
  openFile,
  openLibraryDetail,
  pathCheckResult,
  recomputeLines,
  restoreMark,
  scrollToSection,
  selectedFile,
  selectedFileLoading,
  showAddLib,
  submitAsk,
} = useLibraryTab(loadMemory)

const {
  confirmResetProfile,
  dimensionDisplayValue,
  formatEvidence,
  generatingProfile,
  handleGenerateProfile,
  handleResetProfile,
  loadProfile,
  loadingProfile,
  loadingVersion,
  openVersion,
  profile,
  profileHistory,
  resetProfileConfirm,
  resettingProfile,
  selectedVersion,
  stabilityClass,
  stabilityLabel,
} = useProfileTab()

const {
  clearKeywordGraph,
  clearTagGraph,
  clearingKeywordGraph,
  clearingTagGraph,
  draggingTagId,
  focusKeywordNode,
  focusTagNode,
  forceDirectedLayout,
  graphEdges,
  graphNodes,
  hoveredTagId,
  isKeywordEdgeHighlighted,
  isKeywordNodeDimmed,
  isTagEdgeHighlighted,
  isTagNodeDimmed,
  keywordDraggingId,
  keywordGraphEdges,
  keywordGraphNodes,
  keywordGraphRepulsion,
  keywordGraphShowLabels,
  keywordGraphSpringStrength,
  keywordHoveredId,
  keywordLayoutNodes,
  keywordNeighbors,
  keywordNodePosMap,
  keywordPanStart,
  keywordPanning,
  keywordScale,
  keywordSearch,
  keywordSvgRef,
  keywordSvgToView,
  keywordTx,
  keywordTy,
  loadGraphConfigs,
  loadKeywordGraph,
  loadTabData,
  loadTagGraph,
  loadedTabs,
  loadingGraph,
  loadingKeywordGraph,
  onKeywordGraphMouseDown,
  onKeywordGraphMouseMove,
  onKeywordGraphMouseUp,
  onKeywordGraphWheel,
  onKeywordNodeMouseDown,
  onTagGraphMouseDown,
  onTagGraphMouseMove,
  onTagGraphMouseUp,
  onTagGraphWheel,
  onTagNodeMouseDown,
  panStart,
  panning,
  rerunLayouts,
  resetKeywordGraphView,
  resetTagGraphView,
  saveKeywordGraphConfig,
  saveTagGraphConfig,
  searchMemoryByEnter,
  selectKeywordNode,
  selectTagNode,
  selectedKeyword,
  selectedKeywordMemories,
  selectedTag,
  selectedTagMemories,
  svgToView,
  tagGraphRepulsion,
  tagGraphScale,
  tagGraphShowLabels,
  tagGraphSpringStrength,
  tagGraphTx,
  tagGraphTy,
  tagLayoutNodes,
  tagNeighbors,
  tagNodePosMap,
  tagSearch,
  tagSvgRef,
} = useTagGraphTab({
  activeTab, closeContextMenu, historySearch, historyStartTime, historyEndTime,
  loadHistory, loadMemory, loadAllDateCounts, loadLibraries, loadProfile,
  memoryStartTime, memoryEndTime, onMemoryScroll, startDateCountRefresh, stopDateCountRefresh,
})

</script>