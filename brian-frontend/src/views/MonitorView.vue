<script setup lang="ts">
import NeuralBackground from '@/components/layout/NeuralBackground.vue'
import Header from '@/components/layout/Header.vue'
import PageBreadcrumb from '@/components/layout/PageBreadcrumb.vue'
import MonitorPanel from '@/components/panels/MonitorPanel.vue'
</script>

<template>
  <div class="min-h-screen relative">
    <NeuralBackground />
    <Header />
    <div class="pt-14 relative z-10">
      <div class="h-10 flex items-center px-5 border-b border-apple-gray-200 dark:border-apple-gray-700 bg-white/80 dark:bg-apple-gray-800/80 backdrop-blur-md">
        <PageBreadcrumb :path="['监控']" />
      </div>
    </div>
    <div class="px-6 pt-4 pb-6 min-h-screen relative z-10">
      <MonitorPanel />
    </div>
  </div>
</template>
