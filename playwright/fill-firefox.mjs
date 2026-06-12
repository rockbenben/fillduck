// Firefox AMO 填充。与 Chrome/Edge 不同：AMO 编辑表单里【所有语言的字段同时存在】
//（description_<locale>，非当前语言 display:none），无需逐语言切换，一次提交保存全部。
// locale 码为小写连字符（en-us / zh-cn / pt-br），无裸 en。规则 2026-06-12 真机验证。
import { SELECTORS } from '../src/selectors.mjs';
import { canonLocale } from '../src/core.mjs';

// 用户文案键 → AMO locale 队列。归一化（小写、_→-）后与 AMO 支持集精确匹配；
// 唯一特例：裸 en → en-us（用户文案最常见写法）。同义键先到先得，
// 后到的进 duplicates 供日志提示——静默丢弃会让「en 和 en-US 并存」时用哪份全凭键序、用户无感。
export function mapAmoLocales(data, amoLocales) {
  const amoSet = new Set(amoLocales.map((l) => String(l).toLowerCase()));
  const queue = [];
  const unsupported = [];
  const duplicates = [];
  const taken = new Set();
  for (const [key, text] of Object.entries(data)) {
    let c = canonLocale(key);
    if (c === 'en' && !amoSet.has('en') && amoSet.has('en-us')) c = 'en-us';
    if (!amoSet.has(c)) { unsupported.push(key); continue; }
    if (taken.has(c)) { duplicates.push(key); continue; }
    taken.add(c);
    queue.push({ locale: c, text });
  }
  return { queue, unsupported, duplicates };
}

// 打开「描述附加组件」编辑表单；已在编辑态则直接复用。
// 注意：展示态页面也有一个 action 含 edit_describe 的空表单壳（2026-06-12 真机确认），
// 不能以表单存在判断编辑态，要看里面有没有 description_<locale> 字段。
async function openDescribeForm(page, cfg) {
  const fields = page.locator(`${cfg.describeForm} textarea[name^="description_"]`);
  if (!(await fields.count())) {
    await page.locator(cfg.describeEditButton).click();
    // 必须等 attached 而非默认的 visible：多语言字段除当前语言外全是 display:none，
    // first() 多半是隐藏的 description_de，等 visible 会 30s 超时（2026-06-12 真实运行踩坑）。
    await fields.first().waitFor({ state: 'attached', timeout: 30000 });
    await page.waitForTimeout(500); // 表单 JS（l10n 菜单）初始化
  }
  return page.locator(cfg.describeForm);
}

// 创建某 locale 的描述字段。【必须在无脏状态（任何 setValue 之前）调用】——
// AMO 是逐-locale 编辑 + 全局脏检测：一旦改过字段，点 change-locale 切语言会弹
// 「未保存更改，是否保存」覆盖层（modal-overlay），它拦截后续所有点击且 Esc 关不掉，
// 导致级联超时（2026-06-12 真机实测）。而无脏时点 change-locale 直接开 locale 列表，
// 且连续创建多个空字段不会进入脏状态（已实测），故所有缺失字段集中在填值前创建。
async function createLocaleField(page, cfg, locale) {
  if (await page.locator(cfg.descriptionByLocale(locale)).count()) return true; // 已存在
  await page.locator(cfg.changeLocale).click();
  await page.locator(cfg.localePopup).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  const link = page.locator(cfg.localeLink(locale)).first();
  // 失败路径必须收起已打开的 locale 列表（此阶段无脏，弹的是 locale popup 而非 modal，Esc 有效）：
  // 残留弹窗会挡住下一个语言的 change-locale 点击，把单个失败级联成整批创建失败。
  if (!(await link.count())) { await page.keyboard.press('Escape').catch(() => {}); return false; }
  await link.click();
  const ok = await page.locator(cfg.descriptionByLocale(locale)).first()
    .waitFor({ state: 'attached', timeout: 5000 }).then(() => true, () => false);
  if (!ok) await page.keyboard.press('Escape').catch(() => {}); // 创建超时也确保弹窗收起
  return ok;
}

// 程序化赋值 + 触发 input/change：字段多数 display:none，无法真实键入；AMO 表单不依赖可信事件。
async function setDescription(page, cfg, locale, text) {
  await page.locator(cfg.descriptionByLocale(locale)).first().evaluate((el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, text);
}

const normNl = (s) => String(s || '').replace(/\r\n/g, '\n').trim();

export async function fillFirefox(page, data, log, shouldStop) {
  const cfg = SELECTORS.firefox;
  try { await page.locator(cfg.describeSection).waitFor({ timeout: 30000 }); }
  catch {
    throw new Error('没等到 AMO 的「描述附加组件」区块。请检查：① 链接是 …/developers/addon/<名>/edit；② 已登录 Mozilla 账号；③ 网络正常。');
  }

  let form = await openDescribeForm(page, cfg);

  // AMO 支持的语言集 = l10n 弹窗里全部链接（默认/现有/新语言并集）
  const supported = await page.locator(cfg.allLocaleLinks).evaluateAll(
    (els) => els.map((e) => (e.getAttribute('href') || '').slice(1)).filter(Boolean));
  const { queue, unsupported, duplicates } = mapAmoLocales(data, supported);
  if (unsupported.length) log(`Firefox 忽略(AMO 不支持)：${unsupported.join(', ')}`);
  if (duplicates.length) log(`Firefox 忽略(与前面的键指向同一语言)：${duplicates.join(', ')}`);

  let pending = [];
  for (const q of queue) {
    if (q.text.length > cfg.descriptionMax) { log(`Firefox 跳过 ${q.locale}：超过 ${cfg.descriptionMax} 字符上限`); continue; }
    pending.push(q);
  }
  if (!pending.length) { log('Firefox：没有可填的语言。'); return; }

  log(`Firefox：共 ${pending.length} 种语言，先建好缺失语言字段再统一填入、一次保存`);
  const failed = [];
  for (let pass = 1; pass <= 3 && pending.length; pass++) {
    if (shouldStop && shouldStop()) { log('⏹ 已停止（Firefox）'); return; }
    if (pass > 1) {
      log(`Firefox 第 ${pass} 轮（上一轮 ${pending.length} 种未核对通过）`);
      // 重载丢弃上一轮可能残留的脏状态，回到干净表单——否则预创建阶段点 change-locale 会撞未保存确认。
      await page.reload({ waitUntil: 'load' }).catch(() => {});
      await page.locator(cfg.describeSection).waitFor({ timeout: 30000 });
    }
    form = await openDescribeForm(page, cfg);

    // —— 阶段A：先把所有缺失语言的字段建好（此刻还没 setValue，无脏，change-locale 不弹确认）——
    // 创建失败【不】立即记永久失败：一次瞬时 attach 超时本可在下一轮 reload 后成功，
    // 故收进 createFailed，pass<3 时并入下一轮重试，只有最后一轮才计入 failed。
    const usable = [];
    const createFailed = [];
    let stopRequested = false;
    for (const q of pending) {
      if (shouldStop && shouldStop()) { stopRequested = true; break; }
      if (!(await createLocaleField(page, cfg, q.locale))) {
        createFailed.push(q);
        log(`  ⚠️ ${q.locale} 字段创建未成，稍后重试`);
        continue;
      }
      usable.push(q);
    }

    // —— 阶段B：统一填值（字段都已存在，直接按 name 赋值，不再碰 change-locale）——
    const filled = [];
    for (const q of usable) {
      await setDescription(page, cfg, q.locale, q.text);
      filled.push(q);
    }
    if (filled.length) log(`  已填入 ${filled.length} 种：${filled.map((q) => q.locale).join(', ')}`);

    // 本轮没有任何可提交的（全部创建失败）：还有重试轮就 reload 重来，否则记失败收尾。
    if (!filled.length) {
      if (stopRequested) { log('⏹ 已停止（Firefox），未填入任何内容。'); return; }
      if (pass < 3) { pending = createFailed; continue; }
      failed.push(...createFailed.map((q) => `${q.locale}(无法创建字段)`));
      break;
    }
    if (stopRequested) log(`⏹ 收到停止（Firefox）：先把已填的 ${filled.length} 种保存再停…`);

    // —— 提交：点「保存更改」，等编辑态结束（字段消失=回展示态）或报错（停留编辑态 + .errorlist）——
    await form.locator('button[type="submit"]').first().click();
    let saved = false;
    const fieldsSel = `${cfg.describeForm} textarea[name^="description_"]`;
    for (let i = 0; i < 120; i++) { // 先查后睡：保存通常秒级完成，不白付首个轮询间隔
      if (!(await page.locator(fieldsSel).count())) { saved = true; break; }
      const errs = await page.locator(cfg.errorList).allTextContents().catch(() => []);
      if (errs.length) { log(`  ⚠️ AMO 校验报错：${[...new Set(errs)].join(' | ')}`); break; }
      await page.waitForTimeout(250);
    }
    if (stopRequested) {
      log(saved
        ? `⏹ 已停止（Firefox）：已填的 ${filled.length} 种已保存（未读回核对，请人工检查）。`
        : '⚠️ 已停止（Firefox），但保存未确认——请在浏览器里人工检查并手动保存。');
      return;
    }
    if (!saved) {
      // 提交没成：已填的与本轮创建失败的都进下一轮；最后一轮才记失败。
      if (pass < 3) { pending = [...filled, ...createFailed]; log('  保存未确认，下一轮重试'); continue; }
      failed.push(...filled.map((q) => `${q.locale}(提交未完成)`), ...createFailed.map((q) => `${q.locale}(无法创建字段)`));
      break;
    }

    // —— 读回核对：重开表单逐语言比对（换行按 \r\n→\n 归一）——
    await page.waitForTimeout(1000);
    form = await openDescribeForm(page, cfg);
    const next = [];
    for (const q of filled) {
      const loc = page.locator(cfg.descriptionByLocale(q.locale)).first();
      const got = (await loc.count()) ? await loc.inputValue().catch(() => '') : '';
      if (normNl(got) === normNl(q.text)) log(`  ✅ ${q.locale} 核对通过`);
      else if (pass < 3) { next.push(q); log(`  ${q.locale} 读回与目标不符，下一轮重试`); }
      else failed.push(`${q.locale}(读回不符)`);
    }
    // 创建失败的与读回不符的一起带进下一轮重试；末轮记失败。
    if (pass < 3) next.push(...createFailed);
    else failed.push(...createFailed.map((q) => `${q.locale}(无法创建字段)`));
    pending = next;
  }

  if (failed.length) log(`Firefox 完成。⚠️ 这些没存上，需人工处理：${failed.join(', ')}`);
  else log('Firefox 完成：全部已保存并核对通过。');
}
