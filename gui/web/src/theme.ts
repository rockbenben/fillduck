import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

// —— 「分发矩阵 / Dispatch Grid」座舱主题 ——
// 墨蓝仪表底（非纯黑），仪表青为主色/强调，青·琥珀·珊瑚三色分别承载 好/进行中/失败 语义，
// 与主色分离（强调 ≠ 语义）。antd 组件仅作底座；视觉层通过 token + CSS variables（styles.css）深度定制。
// 调色板与 styles.css 的 --fd-* 变量保持一致，改色只需两处同步。
export const themeConfig: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  cssVar: { key: 'fd' },
  hashed: false,
  token: {
    colorPrimary: '#37C6D6', // 仪表青（强调）
    colorInfo: '#37C6D6',
    colorSuccess: '#48D0A0', // 已核对
    colorWarning: '#F0A63C', // 写入中 / 信号琥珀
    colorError: '#F27059', // 读回不符
    colorBgBase: '#0E1622',
    colorTextBase: '#E7EEF6',
    colorBorder: '#22344B',
    colorBorderSecondary: '#182739',
    colorTextSecondary: '#9DB2C9',
    colorTextTertiary: '#7E96B0',
    borderRadius: 10,
    fontSize: 14,
    wireframe: false,
    fontFamily:
      "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  },
  components: {
    Card: {
      colorBgContainer: 'rgba(19, 31, 48, 0.72)',
      colorBorderSecondary: '#1E3149',
      paddingLG: 22,
      borderRadiusLG: 14,
    },
    Button: {
      fontWeight: 600,
      controlHeight: 38,
      primaryShadow: '0 0 22px -6px rgba(55, 198, 214, 0.55)',
      defaultBg: 'rgba(11, 20, 32, 0.6)',
      defaultBorderColor: '#263A54',
    },
    Input: {
      colorBgContainer: 'rgba(9, 16, 26, 0.82)',
      activeBorderColor: '#37C6D6',
      hoverBorderColor: '#2E5570',
      activeShadow: '0 0 0 3px rgba(55, 198, 214, 0.14)',
      paddingBlock: 9,
    },
    Select: {
      colorBgContainer: 'rgba(9, 16, 26, 0.82)',
      colorBgElevated: '#122033',
      optionSelectedBg: 'rgba(55, 198, 214, 0.14)',
      controlHeight: 38,
    },
    Segmented: {
      trackBg: 'rgba(9, 16, 26, 0.82)',
      itemSelectedBg: '#37C6D6',
      itemSelectedColor: '#052027',
      itemHoverColor: '#E7EEF6',
    },
    Checkbox: { colorPrimary: '#37C6D6', borderRadiusSM: 4 },
    Tag: { defaultBg: 'rgba(55, 198, 214, 0.12)', defaultColor: '#8FE3EC' },
    Modal: { contentBg: '#0F1B2B', headerBg: '#0F1B2B', titleColor: '#E7EEF6' },
    Tooltip: { colorBgSpotlight: '#1B2C42' },
    Divider: { colorSplit: '#1E3149' },
  },
};
