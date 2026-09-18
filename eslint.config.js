// ESLint 扁平配置。
// 只查「会出错的地方」，不管排版——排版交给 Prettier（见 .prettierrc.json），
// 两套工具职责不重叠，就不会互相打架。
// 覆盖两侧：Node 侧（src / playwright / gui/server.mjs / test）与前端（gui/web/src 的 TS/TSX）。
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    // 依赖、构建产物、用户数据（含后台链接与文案）都不检查
    ignores: ['**/node_modules/**', 'gui/web/dist/**', 'projects/**', '.auth-profile/**', 'docs/**'],
  },

  {
    // Node 侧：共享纯逻辑、Playwright 填充器、本地服务端与单测
    files: ['**/*.{js,mjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  {
    // 前端：React 19 + TypeScript
    files: ['gui/web/src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
);
