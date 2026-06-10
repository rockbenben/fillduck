import { theme } from 'antd';

// 深色“任务控制台”主题：暖琥珀主色（不用企业蓝/紫），近黑暖底，圆角克制。
export const themeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#f2b138',
    colorInfo: '#f2b138',
    colorSuccess: '#46d17e',
    colorError: '#ff6b6b',
    colorBgBase: '#0b0c10',
    colorTextBase: '#e9ebf0',
    borderRadius: 12,
    fontSize: 14,
    wireframe: false,
    fontFamily: "'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif",
    colorBorder: '#272b34',
    colorBorderSecondary: '#1c2027',
  },
  components: {
    Card: { colorBgContainer: 'rgba(20, 22, 28, 0.66)', paddingLG: 24 },
    Button: { fontWeight: 600, controlHeight: 40, primaryShadow: '0 6px 20px -8px rgba(242,177,56,0.6)' },
    Input: { colorBgContainer: 'rgba(8, 9, 12, 0.7)', activeBorderColor: '#f2b138', paddingBlock: 9 },
    Segmented: { trackBg: 'rgba(8, 9, 12, 0.7)', itemSelectedBg: '#f2b138', itemSelectedColor: '#1a1205' },
    Tag: { defaultBg: 'rgba(242,177,56,0.12)' },
  },
};
