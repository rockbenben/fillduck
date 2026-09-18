// 跨平台启动持久化浏览器：优先用本机 Chrome，再 Edge，最后退回 Playwright 自带 Chromium。
// Windows 必有 Edge，所以基本一定能起；Mac/Linux 自适应已装的浏览器。
import { chromium } from 'playwright';

export async function launchPersistent(profileDir, log = () => {}) {
  // 去掉自动化指纹，避免 Google 登录拦“此浏览器可能不安全”。
  const base = {
    headless: false,
    viewport: null,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check',
      '--no-first-run',
    ],
  };
  const errs = [];
  for (const channel of ['chrome', 'msedge']) {
    try {
      const ctx = await chromium.launchPersistentContext(profileDir, { ...base, channel });
      log(`使用本机浏览器：${channel === 'chrome' ? 'Chrome' : 'Edge'}`);
      return ctx;
    } catch (e) { errs.push(e); }
  }
  // 退回 Playwright 自带 Chromium（需先：npx playwright install chromium）
  try {
    const ctx = await chromium.launchPersistentContext(profileDir, base);
    log('使用 Playwright 自带 Chromium');
    return ctx;
  } catch (e) { errs.push(e); }

  // 区分“profile 被占用”和“真的没浏览器”——之前一律报“找不到浏览器”是误导的。
  // 必须扫【全部】尝试的错误：只留最后一次的话，profile 被占用时若兜底的 Chromium 恰好也没装，
  // 报出来的是“chromium 缺失”，真正的病因（profile 被占用）反被覆盖，用户会去装浏览器白忙一场。
  const all = errs.map((e) => (e && e.message) || '').join('\n');
  if (/ProcessSingleton|SingletonLock|already in use|being used|user data dir/i.test(all)) {
    throw new Error('浏览器 profile 被占用：上次的浏览器没关干净。请关掉本工具开的所有浏览器窗口（或结束残留的 node/chrome/msedge 进程）后重试。');
  }
  const last = errs[errs.length - 1];
  throw new Error('启动浏览器失败：' + (((last && last.message) || '').split('\n')[0]) + '（确认已装 Chrome/Edge，或运行：npx playwright install chromium）');
}
