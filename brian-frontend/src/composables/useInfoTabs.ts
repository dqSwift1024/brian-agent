/**
 * @fileoverview 信息页各页签组合式函数的统一出口与跨组件注入 Key。
 *
 * 页签业务逻辑集中在各 useXxxTab 组合式函数，由 InfoView 装配一次；
 * 页签模板子组件（components/info/）经 provide/inject 获取页签 API，
 * 避免逐层 props 传参。
 */
import type { InjectionKey, Ref } from 'vue'
import type { InfoTabKey } from '../api/types'
import type { useHistoryTab } from './useHistoryTab'
import type { useMemoryTab } from './useMemoryTab'
import type { useLibraryTab } from './useLibraryTab'
import type { useProfileTab } from './useProfileTab'
import type { useTagGraphTab } from './useTagGraphTab'

export { useHistoryTab } from './useHistoryTab'
export { useMemoryTab } from './useMemoryTab'
export { useLibraryTab } from './useLibraryTab'
export { useProfileTab } from './useProfileTab'
export { useTagGraphTab } from './useTagGraphTab'

export type HistoryTabApi = ReturnType<typeof useHistoryTab>
export type MemoryTabApi = ReturnType<typeof useMemoryTab>
export type LibraryTabApi = ReturnType<typeof useLibraryTab>
export type ProfileTabApi = ReturnType<typeof useProfileTab>
export type TagGraphTabApi = ReturnType<typeof useTagGraphTab>

/** InfoView 装配后向页签子组件提供的全部能力 */
export interface InfoTabsApi {
  activeTab: Ref<InfoTabKey>
  history: HistoryTabApi
  memory: MemoryTabApi
  library: LibraryTabApi
  profile: ProfileTabApi
  graph: TagGraphTabApi
}

export const INFO_TABS_KEY: InjectionKey<InfoTabsApi> = Symbol('info-tabs')
