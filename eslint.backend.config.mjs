// Brian-Agent 后端 ESLint flat config：覆盖 brian-backend 5 层源码 + dev-server.ts
// 运行：npm run lint:backend（内部设置 ESLINT_USE_FLAT_CONFIG=true）
import eslintPluginTs from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/test/**',
      '**/tests/**',
      '**/prebuilt/**',
      '**/*.d.ts',
      'brian-backend/Base/components/**',
    ],
  },
  {
    files: ['brian-backend/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': eslintPluginTs },
    rules: {
      ...eslintPluginTs.configs.recommended.rules,
      // 分层渐进：重构过的模块要求 any 清零；存量 any 由各模块重构时消化
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'error',
      'no-console': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
];
