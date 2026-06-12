// 执行单元：后台 × 内容 的最小粒度（Edge 的描述与搜索词可分开跑）。
// 前端（gui/web/src/App.jsx）与后端（gui/server.mjs）共用一份，避免两处定义漂移。
export const ALL_UNITS = ['chrome-desc', 'edge-desc', 'edge-terms', 'firefox-desc'];

// 兼容旧的 store 取值（CLI 与旧前端仍可用）。
export const STORE_TO_UNITS = {
  chrome: ['chrome-desc'],
  edge: ['edge-desc', 'edge-terms'],
  'edge-desc': ['edge-desc'],
  'edge-terms': ['edge-terms'],
  firefox: ['firefox-desc'],
  all: ALL_UNITS,
};
