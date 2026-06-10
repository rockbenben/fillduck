// Edge 搜索词填充：与描述填充同级、独立一遍。每语言：开弹层 → 清空已有词 → 逐个加新词 → 保存草稿 → 重开读回核对。
// 选择器全部结构化、与界面语言无关（见 selectors.mjs 的 edge.searchTerm）。复用语言探测与按钮匹配。
import { SELECTORS } from '../src/selectors.mjs';
import { buildFillQueue, forceDashboardLang, canonLocale, matchLocaleButtons } from '../src/core.mjs';
import { detectEdgeLang, edgeEditButtons } from './fill-edge.mjs';

// 打开某语言编辑弹层，等“搜索词”区出现。
async function openTermsModal(page, st, editAria) {
  await page.getByRole('button', { name: editAria, exact: true }).click();
  await page.locator(`${st.section}`).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
}

// 关弹层回语言列表
async function backToList(page, ui) {
  const close = page.getByRole('button', { name: ui.close, exact: true });
  if (await close.count().catch(() => 0)) await close.first().click().catch(() => {});
  await page.getByRole('button', { name: ui.editRole }).first().waitFor({ timeout: 30000 });
}

// 读出当前弹层里已有的搜索词（去空白）。
async function readChips(page, st) {
  return page.locator(`${st.chip} ${st.chipText}`).evaluateAll((els) =>
    els.map((e) => (e.textContent || '').trim()).filter(Boolean));
}

// 清空当前弹层所有已有词：逐个点删除，直到没有（有上限防意外死循环）。
async function clearChips(page, st) {
  for (let i = 0; i < 30; i++) {
    const removers = page.locator(`${st.chip} ${st.chipRemove}`);
    const n = await removers.count().catch(() => 0);
    if (!n) return true;
    await removers.first().click().catch(() => {});
    await page.waitForTimeout(250);
  }
  return (await page.locator(st.chip).count().catch(() => 0)) === 0;
}

// 逐个把目标词加进去。每个词：填末尾空输入框 → 等“添加术语”可点 → 点 → 等 chip 数 +1。
async function addTerms(page, st, terms) {
  for (let i = 0; i < terms.length; i++) {
    const before = await page.locator(st.chip).count().catch(() => 0);
    const input = page.locator(st.input).first();
    await input.click();
    await input.fill(terms[i]);
    await page.waitForTimeout(150);
    const add = page.locator(st.addButton).first();
    // 等按钮从 disabled 变可点（输入非空才启用）
    for (let t = 0; t < 12 && (await add.isDisabled().catch(() => true)); t++) await page.waitForTimeout(150);
    if (await add.isDisabled().catch(() => true)) { await input.press('Enter').catch(() => {}); }
    else await add.click().catch(() => {});
    // 等 chip 数增加
    for (let t = 0; t < 20; t++) {
      if ((await page.locator(st.chip).count().catch(() => 0)) > before) break;
      await page.waitForTimeout(150);
    }
  }
}

// 填一个语言并保存（不在这里核对）。返回 'submitted' | 'unchanged' | 'error:...'
async function fillTermsOne(page, st, ui, editAria, terms) {
  await openTermsModal(page, st, editAria);
  const current = (await readChips(page, st)).map((s) => s.trim());
  const target = terms.map((s) => s.trim());
  // 集合相等（顺序无关）则无需改动
  const same = current.length === target.length && new Set(current).size === new Set([...current, ...target]).size;
  if (same) { await backToList(page, ui); return 'unchanged'; }

  if (!(await clearChips(page, st))) { await backToList(page, ui); return 'error: 清空未尽'; }
  await addTerms(page, st, target);

  const save = page.getByRole('button', { name: ui.save, exact: true });
  await page.waitForTimeout(500);
  if (await save.isDisabled().catch(() => true)) { await backToList(page, ui); return 'error: 保存键不可点'; }
  await save.click();
  // 等提交信号（弹层消失 / 保存键变灰），再给落库留点时间
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    if (!(await page.locator(st.section).count().catch(() => 0)) || (await save.isDisabled().catch(() => false))) break;
  }
  await page.waitForTimeout(1500);
  await backToList(page, ui);
  return 'submitted';
}

// 重开读回当前语言的词集合
async function readBackTerms(page, st, ui, editAria) {
  await openTermsModal(page, st, editAria);
  let chips = [];
  for (let i = 0; i < 12; i++) {
    chips = await readChips(page, st);
    if (chips.length) break;
    await page.waitForTimeout(400);
  }
  await backToList(page, ui);
  return chips.map((s) => s.trim());
}

export async function fillEdgeSearchTerms(page, data, log, shouldStop) {
  const cfg = SELECTORS.edge;
  const st = cfg.searchTerm;

  // 识别界面语言（搜索词选择器虽语言无关，但语言探测/保存键/语言名表仍按界面语言）。
  let lang = await detectEdgeLang(page, cfg.editButtonRoleName, 60000);
  if (!lang) {
    log('Edge 界面非中/英，强制英文重载…');
    await page.goto(forceDashboardLang(page.url(), 'en'), { waitUntil: 'load' }).catch(() => {});
    lang = await detectEdgeLang(page, cfg.editButtonRoleName, 20000);
  }
  if (!lang) throw new Error('没等到 Edge 的语言列表（搜索词阶段）。请检查链接/登录/网络。');
  log(`Edge 搜索词：界面语言 ${lang === 'en' ? '英文' : '中文'}`);

  const ui = {
    editRole: cfg.editButtonRoleName[lang],
    editRegex: cfg.editButtonRegex[lang],
    save: cfg.saveButtonText[lang],
    close: cfg.closeButtonText[lang],
  };
  const map = {};
  for (const [code, obj] of Object.entries(cfg.localeToRowName)) map[code] = obj[lang];

  const buttons = await edgeEditButtons(page, ui);
  const dataCanon = new Set(Object.keys(data).map(canonLocale));
  const codeToAria = matchLocaleButtons(map, buttons, dataCanon);

  const present = Object.keys(codeToAria);
  const { queue, missing, extra } = buildFillQueue(data, present);
  if (extra.length) log(`Edge 搜索词忽略(无此语言)：${extra.join(', ')}`);
  if (missing.length) log(`Edge 搜索词缺数据，跳过：${missing.join(', ')}`);

  // 只填“有词”的语言（空数组的跳过，不清空后台——避免误删用户已有词）。
  let pending = queue.filter((q) => Array.isArray(q.text) && q.text.length > 0);
  const skipped = queue.filter((q) => !Array.isArray(q.text) || q.text.length === 0).map((q) => q.locale);
  if (skipped.length) log(`Edge 搜索词为空、跳过：${skipped.join(', ')}`);

  const failed = [];
  if (pending.length) log(`Edge 搜索词：逐个填+存全部 ${pending.length} 种，存完统一核对`);
  for (let pass = 1; pass <= 3 && pending.length; pass++) {
    if (pass > 1) log(`Edge 搜索词第 ${pass} 轮（上一轮 ${pending.length} 种未通过）`);
    const toVerify = [];
    const nextPending = [];
    for (let i = 0; i < pending.length; i++) {
      if (shouldStop && shouldStop()) { log('⏹ 已停止（Edge 搜索词）'); return; }
      const { locale, text } = pending[i];
      const label = `${locale}（${map[locale]}）`;
      log(`Edge 搜索词 ${i + 1}/${pending.length}：${label} — ${text.length} 个`);
      let r;
      try { r = await fillTermsOne(page, st, ui, codeToAria[locale], text); }
      catch (e) { r = 'error: ' + e.message; }
      if (r === 'unchanged') log(`  ${locale} 搜索词已是最新`);
      else if (r === 'submitted') toVerify.push(pending[i]);
      else if (pass < 3) { nextPending.push(pending[i]); log(`  ⚠️ ${label} 没存成（${r}），下一轮再试`); }
      else { failed.push(`${locale}(${r})`); log(`  ⚠️ ${locale} 未能保存：${r}`); }
    }
    if (toVerify.length) {
      log(`Edge 搜索词核对 ${toVerify.length} 种…`);
      await page.waitForTimeout(1500);
      for (const item of toVerify) {
        if (shouldStop && shouldStop()) { log('⏹ 已停止（Edge 搜索词）'); return; }
        let got = [];
        try { got = await readBackTerms(page, st, ui, codeToAria[item.locale]); } catch (e) { got = []; }
        const want = item.text.map((s) => s.trim());
        const ok = got.length === want.length && new Set([...got, ...want]).size === new Set(want).size;
        if (ok) log(`  ✅ ${item.locale} 搜索词核对通过`);
        else if (pass < 3) { nextPending.push(item); log(`  ${item.locale} 读回不符（实得 ${got.length} 个），下一轮重试`); }
        else failed.push(`${item.locale}(读回不符)`);
      }
    }
    pending = nextPending;
  }

  if (failed.length) log(`Edge 搜索词完成。⚠️ 这些没存上，需人工处理：${failed.join(', ')}`);
  else log('Edge 搜索词完成：全部已保存并核对通过。');
}
