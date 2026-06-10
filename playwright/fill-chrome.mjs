// Chrome 填充：自动识别后台界面语言(中/英) -> 下拉选语言 -> 在唯一 textarea 里 fill() 直接填入 -> 下一个。
// 全部语言填完后点一次顶部“保存草稿”（Chrome 不自动保存，不点则描述不落库）。其它语言界面会强制成英文重载兜底。
import { SELECTORS } from '../src/selectors.mjs';
import { buildFillQueue, forceDashboardLang } from '../src/core.mjs';

// 全选快捷键：macOS 是 Cmd+A（Control+A 在 mac 的输入框里是移动光标，清不掉旧文案）
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

// 轮询找到“语言”下拉，返回命中的界面语言与其 aria-label。
// maxMs 给足首屏渲染时间（登录跳转后可能较慢）。
async function detectChromeLang(page, labels, maxMs) {
  for (let i = 0; i < Math.ceil(maxMs / 500); i++) {
    for (const [lang, label] of Object.entries(labels)) {
      const n = await page.locator(`ul[role="listbox"][aria-label="${label}"]`).first().count().catch(() => 0);
      if (n) return { lang, label };
    }
    await page.waitForTimeout(500);
  }
  return null;
}

export async function fillChrome(page, data, log, shouldStop) {
  const cfg = SELECTORS.chrome;
  const labels = cfg.languageListboxAriaLabel; // { zh, en }

  // 识别界面语言；既非中文也非英文则强制英文重载再试。
  // 首次给 30s（登录跳转后首屏渲染可能较慢）；重载后已是热页面，15s 足够。
  let det = await detectChromeLang(page, labels, 30000);
  if (!det) {
    log('Chrome 界面非中/英，强制英文重载…');
    await page.goto(forceDashboardLang(page.url(), 'en'), { waitUntil: 'load' }).catch(() => {});
    det = await detectChromeLang(page, labels, 15000);
  }
  if (!det) {
    throw new Error('没等到 Chrome 的语言下拉。请检查：① 链接是 …/edit 结尾的商店列表编辑页；② 已登录 Google；③ 网络正常。');
  }
  log(`Chrome 界面语言：${det.lang === 'en' ? '英文' : '中文'}`);
  const listboxLabel = det.label;
  const listSel = `ul[role="listbox"][aria-label="${listboxLabel}"]`;

  // 后台实际语言码（按选项 data-value）
  const dashboardLocales = await page
    .locator(`${listSel} li[role="option"][data-value]`)
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-value')));

  const { queue, missing, extra } = buildFillQueue(data, dashboardLocales);
  if (extra.length) log(`Chrome 忽略(无此语言)：${extra.join(', ')}`);
  if (missing.length) log(`Chrome 缺文案，跳过：${missing.join(', ')}`);

  let filled = 0;   // 实际填到的语言数（停止时用于保存与汇报）
  let stopped = false;
  for (let i = 0; i < queue.length; i++) {
    // 停止时不能直接 return：Chrome 不自动保存，必须落到下面的“保存草稿”块，否则已填的全丢。
    if (shouldStop && shouldStop()) { log('⏹ 已停止（Chrome），正在保存已填的部分…'); stopped = true; break; }
    const { locale, text } = queue[i];
    log(`Chrome ${i + 1}/${queue.length}：${locale}`);
    // 打开语言下拉（文字含“语言/Language”的那个 combobox），点对应选项
    await page.locator('[role="combobox"]', { hasText: listboxLabel }).first().click();
    await page.locator(`li[role="option"][data-value="${locale}"]`).click();
    await page.waitForTimeout(700); // 等描述框切到该语言、加载完该语言已有内容
    const ta = page.locator(cfg.descriptionField);
    await ta.waitFor({ state: 'visible', timeout: 10000 });
    // Chrome 不挑合成输入，直接 fill() 整段填入（瞬时）；若值没留住再回退逐字真实输入
    let ok = false;
    for (let a = 0; a < 3 && !ok; a++) {
      if (a === 0) {
        await ta.fill(text);
      } else {
        await ta.click();
        await page.keyboard.press(SELECT_ALL);
        await page.keyboard.press('Delete');
        await ta.pressSequentially(text, { delay: 0 });
      }
      await ta.evaluate((e) => e.blur());
      await page.waitForTimeout(400);
      ok = (((await ta.inputValue().catch(() => '')) || '').trim() === text.trim());
    }
    if (!ok) log(`⚠️ Chrome ${locale}：填入未稳定生效，请检查该语言`);
    filled++;
    await page.waitForTimeout(300);
  }

  // 全部填完后点“保存草稿”落库（Chrome 不自动保存）。只存草稿，绝不点“提请审核”。
  const saveText = cfg.saveButtonText[det.lang];
  let save = page.getByRole('button', { name: saveText, exact: true });
  if (!(await save.count().catch(() => 0))) {
    // 界面语言判断有偏差时，用另一套文案兜底，避免静默漏存。
    const other = det.lang === 'en' ? cfg.saveButtonText.zh : cfg.saveButtonText.en;
    save = page.getByRole('button', { name: other, exact: true });
  }
  if (await save.count().catch(() => 0)) {
    await save.first().click().catch((e) => log(`⚠️ Chrome 点“保存草稿”失败：${e.message}`));
    // 等保存生效：按钮变灰（无未保存改动）即认为已存；最多 ~10s 兜底等待。
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      if (await save.first().isDisabled().catch(() => false)) break;
    }
    log(stopped
      ? `⏹ Chrome 已停止：已填的 ${filled} 种已点击“保存草稿”。`
      : `Chrome 完成：已填 ${filled} 种并点击“保存草稿”。请人工检查后在后台提请审核。`);
  } else {
    log(`⚠️ Chrome 已填 ${filled} 种，但没找到“保存草稿”按钮，请手动点击保存，否则草稿不会保存。`);
  }
}
