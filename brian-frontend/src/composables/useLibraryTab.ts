/**
 * @fileoverview 信息页「学习资料库」页签的业务逻辑组合式函数。
 *
 * 从 InfoView.vue 分离：资料库增删与路径校验 / 文件树与目录导航 /
 * 文件阅读（分页 sentinel）/ 划词咨询（annotations）/ 右键菜单。
 */

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { LibraryFileEntry, LibraryPath, LibraryTreeNode } from '../api/types'
import { libraryApi } from '../api'

/**
 * 学习资料库页签状态与操作。
 */
export function useLibraryTab(onMemoryRefresh: () => void) {
const loadingLibs = ref(false)
const showAddLib = ref(false)
const newLib = ref({ name: '', description: '', path: '' })
const pathCheckResult = ref<{ exists: boolean; isReadable: boolean; isWritable: boolean } | null>(null)
const checkingPath = ref(false)
const libraryDetail = ref<LibraryPath | null>(null)

const libraries = ref<LibraryPath[]>([])
async function loadLibraries() {
  loadingLibs.value = true
  try { libraries.value = await libraryApi.paths() }
  catch { /* ignore */ }
  finally { loadingLibs.value = false }
}

async function checkLibPath() {
  if (!newLib.value.path) return
  checkingPath.value = true
  try { pathCheckResult.value = await libraryApi.checkPath(newLib.value.path) }
  catch { pathCheckResult.value = { exists: false, isReadable: false, isWritable: false } }
  finally { checkingPath.value = false }
}

async function handleAddLibrary() {
  if (!newLib.value.name || !newLib.value.path) return
  try {
    await libraryApi.addPath({ ...newLib.value, category: 'general' })
    showAddLib.value = false
    newLib.value = { name: '', description: '', path: '' }
    pathCheckResult.value = null
    await loadLibraries()
  } catch { /* ignore */ }
}

async function handleDeleteLibrary(id: string) {
  await libraryApi.deletePath(id)
  libraries.value = libraries.value.filter(l => l.id !== id)
}

async function handleToggleLibrary(lib: LibraryPath) {
  try {
    const result = await libraryApi.setEnabled(lib.id, !lib.enableSelfLearning)
    lib.enableSelfLearning = result.enabled
    await loadLibraries()
  } catch { /* ignore */ }
}

// Library detail
const libraryFiles = ref<LibraryFileEntry[]>([])
const libraryTree = ref<LibraryTreeNode[]>([])
const currentDirectory = ref('')
const fileKeyword = ref('')
const fileHasMore = ref(false)
const fileNextCursor = ref<string | null>(null)
const fileLoading = ref(false)
const fileLoadingMore = ref(false)
const selectedFile = ref<{ fileId: string; name: string; content: string } | null>(null)
const selectedFileLoading = ref(false)

const libraryBreadcrumb = computed(() => {
  const parts = currentDirectory.value ? currentDirectory.value.split('/').filter(Boolean) : []
  const items = [{ label: '根目录', path: '' }]
  for (let i = 0; i < parts.length; i++) {
    items.push({ label: parts[i], path: parts.slice(0, i + 1).join('/') })
  }
  return items
})

function openLibraryDetail(lib: LibraryPath) {
  libraryDetail.value = lib
  currentDirectory.value = ''
  fileKeyword.value = ''
  selectedFile.value = null
  annotations.value = []
  annotationLines.value = []
  Promise.all([loadLibraryFiles(true), loadLibraryTree()])
}

async function loadLibraryFiles(reset = true) {
  if (!libraryDetail.value) return
  if (reset) fileLoading.value = true
  else fileLoadingMore.value = true
  try {
    const data = await libraryApi.files(libraryDetail.value.id, {
      directory: currentDirectory.value,
      keyword: fileKeyword.value.trim() || undefined,
      cursor: reset ? undefined : fileNextCursor.value || undefined,
      limit: 50,
    })
    if (reset) libraryFiles.value = data.files
    else libraryFiles.value = [...libraryFiles.value, ...data.files]
    fileHasMore.value = data.has_more
    fileNextCursor.value = data.next_cursor
  } catch { /* ignore */ }
  finally {
    if (reset) fileLoading.value = false
    else fileLoadingMore.value = false
  }
}

async function loadMoreLibraryFiles() {
  if (!fileHasMore.value || fileLoadingMore.value || fileLoading.value) return
  await loadLibraryFiles(false)
}

async function loadLibraryTree() {
  if (!libraryDetail.value) return
  try { libraryTree.value = await libraryApi.tree(libraryDetail.value.id) }
  catch { libraryTree.value = [] }
}

function enterDirectory(dirPath: string) {
  currentDirectory.value = dirPath
  selectedFile.value = null
  loadLibraryFiles(true)
}

function goUpDirectory() {
  if (!currentDirectory.value) return
  const idx = currentDirectory.value.lastIndexOf('/')
  currentDirectory.value = idx > 0 ? currentDirectory.value.slice(0, idx) : ''
  selectedFile.value = null
  loadLibraryFiles(true)
}

async function openFile(file: LibraryFileEntry) {
  if (file.isDirectory) { enterDirectory(file.relativePath); return }
  selectedFileLoading.value = true
  annotations.value = []
  annotationLines.value = []

  const [contentResult, annotationsResult] = await Promise.allSettled([
    libraryApi.fileContent(file.id),
    libraryApi.fileAnnotations(file.id),
  ])

  if (contentResult.status === 'fulfilled') {
    selectedFile.value = { fileId: file.id, name: contentResult.value.fileName, content: contentResult.value.content }
  } else {
    selectedFile.value = { fileId: file.id, name: file.name, content: '文件内容读取失败' }
  }
  selectedFileLoading.value = false

  await nextTick()

  if (annotationsResult.status === 'fulfilled') {
    const list = annotationsResult.value
    for (const a of list) {
      annotations.value.push({
        id: a.id,
        question: a.question,
        result: a.result,
        selectionText: a.selection_text,
      })
    }
    await nextTick()
    for (const a of list) {
      restoreMark(a.selection_text, a.id)
    }
    recomputeLines()
  }
}

function restoreMark(text: string, id: string) {
  const container = contentAreaRef.value
  if (!container || !text) return
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const nodeText = node.textContent || ''
    const idx = nodeText.indexOf(text)
    if (idx >= 0) {
      try {
        const range = document.createRange()
        range.setStart(node, idx)
        range.setEnd(node, idx + text.length)
        const mark = document.createElement('mark')
        mark.setAttribute('data-anchor-id', id)
        mark.className = 'doc-annotation-mark'
        range.surroundContents(mark)
      } catch { /* ignore */ }
      return
    }
  }
}

// ========== 文档展示区：注释（咨询） ==========
interface DocAnnotation {
  id: string
  question: string
  result: string
  selectionText: string
}
const annotations = ref<DocAnnotation[]>([])
const activeAnnotationId = ref<string | null>(null)
const askDialog = ref<{ selectionText: string; contextBefore: string; contextAfter: string; question: string } | null>(null)
const asking = ref(false)
const contextMenu = ref<{ x: number; y: number } | null>(null)
const contentAreaRef = ref<HTMLElement | null>(null)

interface AnnotationLine { id: string; x1: number; y1: number; x2: number; y2: number }
const annotationLines = ref<AnnotationLine[]>([])

interface ArticleSection { id: string; level: number; title: string }
const articleSections = computed<ArticleSection[]>(() => {
  const content = selectedFile.value?.content || ''
  const sections: ArticleSection[] = []
  for (const line of content.split('\n')) {
    const m = line.match(/^(#{1,4})\s+(.+)$/)
    if (m) {
      sections.push({ id: `sec-${sections.length}`, level: m[1].length, title: m[2].trim() })
    }
  }
  return sections
})

let pendingSelection: { startContainer: Node; startOffset: number; endContainer: Node; endOffset: number } | null = null
let pendingAskContext: { text: string; contextBefore: string; contextAfter: string; selectionStart: number; selectionEnd: number } | null = null

function handleFileContextMenu(event: MouseEvent) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const text = selection.toString().trim()
  if (!text) return
  const range = selection.getRangeAt(0)
  pendingSelection = {
    startContainer: range.startContainer,
    startOffset: range.startOffset,
    endContainer: range.endContainer,
    endOffset: range.endOffset,
  }
  const content = selectedFile.value?.content || ''
  const idx = content.indexOf(text)
  const contextBefore = idx > 0 ? content.slice(Math.max(0, idx - 500), idx) : ''
  const contextAfter = idx >= 0 ? content.slice(idx + text.length, idx + text.length + 500) : ''
  pendingAskContext = {
    text,
    contextBefore,
    contextAfter,
    selectionStart: idx >= 0 ? idx : 0,
    selectionEnd: idx >= 0 ? idx + text.length : text.length,
  }
  contextMenu.value = { x: event.clientX, y: event.clientY }
}

function closeContextMenu() {
  contextMenu.value = null
}

function openAskDialog() {
  if (!contextMenu.value || !pendingAskContext) return
  askDialog.value = {
    selectionText: pendingAskContext.text,
    contextBefore: pendingAskContext.contextBefore,
    contextAfter: pendingAskContext.contextAfter,
    question: '',
  }
  contextMenu.value = null
}

async function submitAsk() {
  if (!askDialog.value) return
  const dlg = askDialog.value
  asking.value = true
  try {
    const data = await libraryApi.queryDocument({
      selection: dlg.selectionText,
      context_before: dlg.contextBefore,
      context_after: dlg.contextAfter,
      question: dlg.question.trim() || '请解释这段内容',
    })
    const id = `ann-${Date.now()}`
    const question = dlg.question.trim() || '请解释这段内容'
    annotations.value.push({
      id,
      question,
      result: data.result,
      selectionText: dlg.selectionText,
    })
    activeAnnotationId.value = id
    markSelection(id)
    askDialog.value = null
    await nextTick()
    recomputeLines()
    // 持久化咨询卡片与关联关系
    if (selectedFile.value && pendingAskContext) {
      try {
        await libraryApi.saveAnnotation({
          library_id: libraryDetail.value?.id,
          file_id: selectedFile.value.fileId,
          selection_text: dlg.selectionText,
          selection_start: pendingAskContext.selectionStart,
          selection_end: pendingAskContext.selectionEnd,
          question,
          result: data.result,
          llm_id: data.llm_id,
        })
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  finally { asking.value = false }
}

function handleCardClick(id: string) {
  activeAnnotationId.value = activeAnnotationId.value === id ? null : id
}

function scrollToSection(section: ArticleSection) {
  const container = contentAreaRef.value
  if (!container) return
  const headings = container.querySelectorAll('h1, h2, h3, h4')
  for (const h of headings) {
    if ((h.textContent || '').trim() === section.title) {
      h.scrollIntoView({ behavior: 'smooth', block: 'start' })
      break
    }
  }
}

function markSelection(id: string) {
  if (!pendingSelection) return
  try {
    const range = document.createRange()
    range.setStart(pendingSelection.startContainer, pendingSelection.startOffset)
    range.setEnd(pendingSelection.endContainer, pendingSelection.endOffset)
    const mark = document.createElement('mark')
    mark.setAttribute('data-anchor-id', id)
    mark.className = 'doc-annotation-mark'
    range.surroundContents(mark)
  } catch { /* 跨节点选中无法包裹，跳过下划线 */ }
}

function recomputeLines() {
  const container = contentAreaRef.value
  if (!container) { annotationLines.value = []; return }
  const cRect = container.getBoundingClientRect()
  const lines: AnnotationLine[] = []
  for (const ann of annotations.value) {
    const anchor = container.querySelector(`[data-anchor-id="${ann.id}"]`) as HTMLElement | null
    const card = container.querySelector(`[data-card-id="${ann.id}"]`) as HTMLElement | null
    if (!anchor || !card) continue
    const aRect = anchor.getBoundingClientRect()
    const kRect = card.getBoundingClientRect()
    const ax = aRect.left - cRect.left + aRect.width / 2
    const ay = aRect.top - cRect.top + aRect.height / 2
    const kx = kRect.left - cRect.left
    const ky = kRect.top - cRect.top + kRect.height / 2
    lines.push({ id: ann.id, x1: kx, y1: ky, x2: ax, y2: ay })
  }
  annotationLines.value = lines
}

function closeFileModal() {
  selectedFile.value = null
  annotations.value = []
  annotationLines.value = []
  activeAnnotationId.value = null
  askDialog.value = null
  contextMenu.value = null
  pendingSelection = null
  pendingAskContext = null
}

const libraryFileSentinel = ref<HTMLElement | null>(null)
let libraryFileObserver: IntersectionObserver | null = null
watch(libraryFileSentinel, (el) => {
  libraryFileObserver?.disconnect()
  libraryFileObserver = null
  if (el) {
    libraryFileObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) loadMoreLibraryFiles()
    }, { rootMargin: '200px' })
    libraryFileObserver.observe(el)
  }
})

let fileSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(fileKeyword, () => {
  if (fileSearchTimer) clearTimeout(fileSearchTimer)
  fileSearchTimer = setTimeout(() => { loadLibraryFiles(true) }, 300)
})

  return {
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
  }

  onBeforeUnmount(() => {
    libraryFileObserver?.disconnect()
    libraryFileObserver = null
  })
}
