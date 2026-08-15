import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    // isolated-vm（Skill 沙箱）原生模块依赖线程局部存储，
    // 在 worker threads 池下会触发 native 断言崩溃；
    // 改用 forks 子进程池（单 fork 串行）保证原生模块在主线程初始化
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
