// Edge 填充：自动识别后台界面语言(中/英) —— 两阶段：先把所有语言【填→存】过一遍，再统一【重开读回核对】，
// 不过的进下一轮（最多 3 轮）。其它语言界面会强制成英文重载兜底。
// Edge 后台在自动化下很 flaky（保存键启用时机不稳、提交异步、提示是乐观提示），所以不靠信号判断，
// 一律以重开读回为准。但落库是异步的：存完立刻读回常常还是旧值，会误判“没存住”；
// 把核对推迟到本轮全部保存之后，前面语言的落库时间被后面语言的填写自然覆盖，
// 既不用原地干等，也避免误报后白白重填重存。
import { SELECTORS } from '../src/selectors.mjs';
import { buildFillQueue, forceDashboardLang, canonLocale, matchLocaleButtons } from '../src/core.mjs';

// 全选快捷键：macOS 是 Cmd+A（Control+A 在 mac 的输入框里是移动光标，清不掉旧文案）
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

// 轮询识别后台界面语言：哪套“编辑详细信息”按钮名能命中即是哪种语言。
// maxMs 给足首屏渲染时间（登录跳转后列表渲染可能较慢）。
export async function detectEdgeLang(page, roleNames, maxMs) {
  for (let i = 0; i < Math.ceil(maxMs / 500); i++) {
    for (const [lang, name] of Object.entries(roleNames)) {
      const n = await page.getByRole('button', { name }).first().count().catch(() => 0);
      if (n) return lang;
    }
    await page.waitForTimeout(500);
  }
  return null;
}

// 读出页面上所有“编辑 X 详细信息”按钮的 { ariaLabel, name }（name = 语言显示名）
export async function edgeEditButtons(page, ui) {
  const raw = await page.getByRole('button', { name: ui.editRole }).evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label') || ''));
  return raw.map((a) => {
    const m = a.match(ui.editRegex);
    return { ariaLabel: a, name: m ? m[1].trim() : '' };
  }).filter((b) => b.name);
}

// 打开某语言的编辑弹层，返回描述 textarea
async function openModal(page, cfg, editAria) {
  await page.getByRole('button', { name: editAria, exact: true }).click();
  const ta = page.locator(`${cfg.descriptionField}:visible`).first();
  await ta.waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  return ta;
}

// 关弹层回语言列表
async function backToList(page, cfg, ui) {
  const close = page.getByRole('button', { name: ui.close, exact: true });
  if (await close.count()) await close.first().click().catch(() => {});
  await page.getByRole('button', { name: ui.editRole }).first().waitFor({ timeout: 30000 });
}

// 异常后的兜底恢复：弹层可能残留在打开态，挡住下一个语言的「编辑」按钮——
// 不恢复的话，一次偶发超时会让后续每个语言都点不到按钮、30s×多轮全部假失败。
// 按 Esc 关弹层并短等列表回来；失败不另报错（下一次 openModal 的超时会自然暴露）。
export async function recoverToList(page, ui) {
  try {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: ui.editRole }).first().waitFor({ timeout: 5000 });
  } catch { /* 留给下一步的超时去暴露 */ }
}

// 重开弹层读回当前描述，读完回列表。落库是异步的：存完立刻读回常常还是【旧值】——
// 更新场景下旧值同样非空，按“非空”停轮询会立刻拿到旧文案、误判“读回不符”。
// 所以轮询到值等于期望（expected）才停；超时返回最后读到的值，由调用方比对定夺。
async function readBack(page, cfg, ui, editAria, expected) {
  const ta = await openModal(page, cfg, editAria);
  const want = (expected || '').trim();
  let v = '';
  for (let i = 0; i < 24; i++) { // 最多 ~12s，命中即停
    v = ((await ta.inputValue().catch(() => '')) || '');
    if (want ? v.trim() === want : v.trim().length > 0) break;
    await page.waitForTimeout(500);
  }
  await backToList(page, cfg, ui);
  return v.trim();
}

// 重开读回并与目标比对，返回 { ok, got }：ok=是否真存住，got=实际读回值（读回抛错时为 null）。
// 核对与重载兜底两处共用同一逻辑，避免 trim 规则 / 异常恢复 / 比对方式在两处各写一份日后分叉。
// 读回抛错 → ok:false（不要退化成 got='' 再比对：否则核对一个目标本就为空的字段时，读回异常的空串
// 会和空目标比成相等、把没存住的字段谎报为已存）。got 交给调用方在不符时打印差异诊断。
async function verifyStored(page, cfg, ui, editAria, text) {
  let got;
  try { got = await readBack(page, cfg, ui, editAria, text); }
  catch { await recoverToList(page, ui); return { ok: false, got: null }; }
  return { ok: got === text.trim(), got };
}

// 读回不符时的精确诊断：把“读回不符”变成能定位病因的信息（Edge 后台无法直接观测，只能靠这个）。
// 报告目标/读回字数、首个不同字符的位置与两侧片段，并判别常见形态：读到空 / 前缀截断 / 空白规范化 / 旧值残留。
function describeMismatch(want, got) {
  const w = (want || '').trim();
  const g = (got == null ? '' : String(got)).trim();
  if (got == null) return '读回失败（打不开弹层或读不到值）';
  if (!g) return '读回=空（后台里这条是空的：多半没存进去，或读到了错误的字段）';
  if (g === w) return '实际一致（比对口径问题）';
  let i = 0;
  while (i < w.length && i < g.length && w[i] === g[i]) i++;
  const around = (s) => JSON.stringify(s.slice(Math.max(0, i - 8), i + 12));
  let shape = '';
  if (g === w.slice(0, g.length)) shape = ' → 读回是目标的前缀，疑似被后台截断';
  else if (w === g.slice(0, w.length)) shape = ' → 读回比目标更长，末尾多了内容';
  else if (w.replace(/\s+/g, '') === g.replace(/\s+/g, '')) shape = ' → 去掉空白/换行后一致，疑似被后台规范化';
  return `目标 ${w.length} 字 / 读回 ${g.length} 字，首个不同在第 ${i} 字：目标[…]=${around(w)} 读回[…]=${around(g)}${shape}`;
}

// 填描述并反复确认值留住且保存键可点。
// 第 1 次走快速路径 keyboard.insertText：单次 CDP 调用产生【可信】input 事件（等价 IME/粘贴提交，
// 不是 fill() 那种合成事件，Edge 认），耗时与文本长度无关；末字符仍用真实击键补一次 keydown/keyup。
// 若没生效，后续尝试回退【真实键盘逐字输入】（等价手动打字，慢但最稳）。
// 返回 { ok, reason }：reason 区分“值没留住”与“保存键未启用”，日志可定位是输入问题还是表单校验问题。
async function fillUntilSavable(page, ta, save, text) {
  let reason = '';
  for (let a = 0; a < 3; a++) {
    await ta.click();                       // 聚焦
    await page.keyboard.press(SELECT_ALL);   // 全选
    await page.keyboard.press('Delete');     // 清空
    if (a === 0) {
      await page.keyboard.insertText(text.slice(0, -1)); // 快速路径：一次性插入
      await ta.pressSequentially(text.slice(-1), { delay: 0 });
    } else {
      await ta.pressSequentially(text, { delay: 0 }); // 逐字真实输入
    }
    await ta.evaluate((e) => e.blur());
    // 保存键的启用常滞后于 blur（Angular 校验异步）：短首查 + 密集轮询最多 ~2.6s。
    // 过早放弃会触发整段清空重打（长文案很贵）；但常见情况毫秒级就绪，别按 500ms 粗粒度白等。
    let stuck = false;
    for (let t = 0; t < 11; t++) {
      await page.waitForTimeout(t === 0 ? 150 : 250);
      stuck = ((await ta.inputValue().catch(() => '')) || '').trim() === text.trim();
      const enabled = !(await save.isDisabled().catch(() => true));
      if (stuck && enabled) return { ok: true };
      if (!stuck) break; // 值都没留住，再等保存键也没意义，直接重打
    }
    reason = stuck ? '保存键未启用' : '值未留住';
  }
  return { ok: false, reason };
}

// 填 + 存，不在这里核对。返回 'submitted' | 'unchanged' | 'no-save-button'
async function fillAndSaveOne(page, cfg, ui, editAria, text) {
  const ta = await openModal(page, cfg, editAria);
  const cur = ((await ta.inputValue().catch(() => '')) || '').trim();
  if (cur === text.trim()) { await backToList(page, cfg, ui); return 'unchanged'; }

  const save = page.getByRole('button', { name: ui.save, exact: true });
  const savable = await fillUntilSavable(page, ta, save, text);
  if (!savable.ok) { await backToList(page, cfg, ui); return savable.reason || 'no-save-button'; }

  // 点保存前，强制把 textarea 当前（正确的）值同步进 Angular 表单模型，再点保存。
  // 病因（读回诊断实锤）：insertText 后立刻点保存会提交【旧值】——界面已是新文案、存进后台的却是上一版，
  // 表现为读回到一段完全不同的旧文案（tr/ru 反复中招）。原先只靠盲等赌模型同步完，长文案偶尔等不够。
  // 修法：主动派发 input/change 事件。Angular 的 DefaultValueAccessor 监听 input 时直接读 element.value
  //（不校验 isTrusted），于是模型被强制刷成 textarea 里的完整新值，从根上消除“提交旧值”的竞态。
  // 派发后仍留一段随长度温和放大的等待（上限 2s）给变更检测跑完，再点保存。
  await ta.evaluate((el) => {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(Math.min(2000, 800 + Math.ceil(text.length / 4)));
  await save.click();
  // 等提交信号（保存键变灰 / 弹层消失），最多 ~15s，然后再给服务端落库留点时间
  const descVisible = `${cfg.descriptionField}:visible`;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    if (!(await page.locator(descVisible).count()) || (await save.isDisabled().catch(() => false))) break;
  }
  await page.waitForTimeout(1500);
  await backToList(page, cfg, ui);
  return 'submitted';
}

// 两个 Edge 填充器（描述 / 搜索词）共用的准备阶段：识别界面语言（非中英强制英文重载）→
// 构建 ui 与 locale 显示名表 → 匹配语言行编辑按钮 → 建填充队列。返回 { ui, map, codeToAria, queue }。
// label 作日志前缀（'Edge 描述' / 'Edge 搜索词'）；warnUnknown 仅描述阶段提示后台未收录的语言。
export async function prepareEdge(page, data, log, { label, warnUnknown }) {
  const cfg = SELECTORS.edge;
  // 首次给 60s（登录跳转后列表渲染可能很慢）；重载后已是热页面，20s 足够。
  let lang = await detectEdgeLang(page, cfg.editButtonRoleName, 60000);
  if (!lang) {
    log('Edge 界面非中/英，强制英文重载…');
    await page.goto(forceDashboardLang(page.url(), 'en'), { waitUntil: 'load' }).catch(() => {});
    lang = await detectEdgeLang(page, cfg.editButtonRoleName, 20000);
  }
  if (!lang) {
    throw new Error(`没等到语言列表（${label}）。请检查：① 链接是 …/listings 结尾的页面；② 已登录 Microsoft；③ 网络正常。`);
  }
  log(`${label}：界面语言 ${lang === 'en' ? '英文' : '中文'}`);
  const ui = {
    editRole: cfg.editButtonRoleName[lang],
    editRegex: cfg.editButtonRegex[lang],
    save: cfg.saveButtonText[lang],
    close: cfg.closeButtonText[lang],
  };
  // locale 码 -> 当前界面语言下的显示名
  const map = {};
  for (const [code, obj] of Object.entries(cfg.localeToRowName)) map[code] = obj[lang];

  const buttons = await edgeEditButtons(page, ui);
  // 先精确再子串、且有文案的 locale 优先占位（细节见 core.matchLocaleButtons）。
  const dataCanon = new Set(Object.keys(data).map(canonLocale));
  const codeToAria = matchLocaleButtons(map, buttons, dataCanon);
  if (warnUnknown) {
    const usedAria = new Set(Object.values(codeToAria));
    const unknown = [...new Set(buttons.filter((b) => !usedAria.has(b.ariaLabel)).map((b) => b.name))];
    if (unknown.length) log(`⚠️ Edge 上这些语言尚未收录、已跳过：${unknown.join('、')}（发我一句即可加上）`);
  }

  const present = Object.keys(codeToAria);
  const { queue, missing, extra, duplicates } = buildFillQueue(data, present);
  if (extra.length) log(`${label}忽略(无此语言)：${extra.join(', ')}`);
  if (missing.length) log(`${label}缺文案，跳过：${missing.join(', ')}`);
  if (duplicates.length) log(`⚠️ ${label}里这些键与前面的键指向同一语言、已忽略：${duplicates.join(', ')}`);
  return { ui, map, codeToAria, queue };
}

export async function fillEdge(page, data, log, shouldStop) {
  const cfg = SELECTORS.edge;
  const { ui, map, codeToAria, queue } = await prepareEdge(page, data, log, { label: 'Edge 描述', warnUnknown: true });

  let pending = [];
  for (const q of queue) {
    if (q.text.trim().length < 250) { log(`Edge 跳过 ${q.locale}：不足 250 字`); continue; }
    pending.push(q);
  }

  const failed = []; // { locale, reason, item }：带 item.text，供收尾整页重载后再核对
  const attempted = pending.length; // 过完 250 字门槛真正要填的数量：为 0 时结尾不能宣称“全部已保存”
  if (pending.length) log(`Edge：先逐个保存全部 ${pending.length} 种，保存完统一核对，没过的自动重试`);
  for (let pass = 1; pass <= 3 && pending.length; pass++) {
    if (pass > 1) log(`Edge 第 ${pass} 轮（上一轮 ${pending.length} 种未核对通过）`);

    // —— 保存阶段：挨个填+存，先不核对 ——
    const toVerify = [];
    const nextPending = [];
    for (let i = 0; i < pending.length; i++) {
      if (shouldStop && shouldStop()) { log('⏹ 已停止（Edge）'); return; }
      const { locale, text } = pending[i];
      const label = `${locale}（${map[locale]}）`;
      log(`Edge 保存 ${i + 1}/${pending.length}：${label}`);
      let r;
      try { r = await fillAndSaveOne(page, cfg, ui, codeToAria[locale], text); }
      catch (e) { r = 'error: ' + e.message.split('\n')[0]; await recoverToList(page, ui); }
      if (r === 'unchanged') log(`  ${locale} 内容已是最新，无需保存`);
      else if (r === 'submitted') toVerify.push(pending[i]);
      else if (pass < 3) { nextPending.push(pending[i]); log(`  ⚠️ ${label} 没保存成（${r}），下一轮再试`); }
      else { failed.push({ locale, reason: r, item: pending[i] }); log(`  ⚠️ ${locale} 未能保存：${r}`); }
    }

    // —— 核对阶段：重开读回，等于目标才算真存住 ——
    if (toVerify.length) {
      log(`Edge 核对 ${toVerify.length} 种…`);
      await page.waitForTimeout(1500); // 给最后保存的那种留点落库时间
      for (const item of toVerify) {
        if (shouldStop && shouldStop()) { log('⏹ 已停止（Edge）'); return; }
        const v = await verifyStored(page, cfg, ui, codeToAria[item.locale], item.text);
        if (v.ok) log(`  ✅ ${item.locale} 核对通过`);
        else if (pass < 3) { nextPending.push(item); log(`  ${item.locale} 读回与目标不符，下一轮重试`); }
        else { failed.push({ locale: item.locale, reason: '读回不符', item }); log(`  ⚠️ ${item.locale} 读回不符：${describeMismatch(item.text, v.got)}`); }
      }
    }
    pending = nextPending;
  }

  // —— 收尾：整页重载后再核对一次“读回不符”的语言 ——
  // Edge 落库是异步且偏慢的（后台有明显延迟）：3 轮内的重开读回，读到的可能仍是页面内旧模型/尚未
  // 落库的值，于是明明已存住却被判“读回不符”——上面日志里大量“下一轮重试”多半就是这种假失败。
  // 整页重载会丢弃前端旧模型、向服务端重新拉取真实值，再耐心读回一次；仍不符才算真的没存上。
  // 这一步只读不写、不重打文案，代价小，却能把绝大多数“落库延迟”造成的假失败救回来。
  const readFails = failed.filter((f) => f.reason === '读回不符');
  if (readFails.length && !(shouldStop && shouldStop())) {
    log(`Edge 收尾：整页重载后再确认 ${readFails.length} 种（排除落库延迟造成的假失败）…`);
    try {
      await page.reload({ waitUntil: 'load' });
      // 必须等【原界面语言的】编辑按钮真的回来，再用之前建好的 ui / codeToAria 去读回：
      // 重载可能弹回重新登录、或渲染很慢、甚至换了界面语言——那样按钮永远等不到，此时若照旧读回，
      // 每次 openModal 都点空、全部超时，会把明明已存住的语言错报成“重载后仍不符”，反而坑用户。
      // 等不到就【维持上一轮判定、不改判】，只如实说明收尾没跑成。
      const backOk = await page.getByRole('button', { name: ui.editRole }).first()
        .waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
      if (!backOk) {
        // 重载后回不到列表（多半要重新登录/界面语言变了）：这些语言可能已存住、只是这轮没读到，
        // 改判为“未核对”而非“没存上”，提示登录后自查，避免用户盲目重填、反而覆盖好数据。
        for (const f of readFails) f.reason = '未核对(重载后需重新登录)';
        log(`Edge 收尾：重载后未回到语言列表（多半要重新登录，或界面语言变了），这 ${readFails.length} 种未能核对——它们可能已存住，请登录后自查，勿盲目重填。`);
      } else {
        await page.waitForTimeout(2000);
        for (const f of readFails) {
          if (shouldStop && shouldStop()) break;
          const v = await verifyStored(page, cfg, ui, codeToAria[f.locale], f.item.text);
          if (v.ok) { f.recovered = true; log(`  ✅ ${f.locale} 重载后核对通过（此前为落库延迟，实际已存住）`); }
          else log(`  ⚠️ ${f.locale} 重载后仍不符：${describeMismatch(f.item.text, v.got)}`);
        }
      }
    } catch (e) {
      log(`Edge 收尾核对未能完成（${e.message.split('\n')[0]}），按上一轮结果汇报`);
    }
  }

  const stillFailed = failed.filter((f) => !f.recovered);
  if (stillFailed.length) log(`Edge 完成。⚠️ 以下语言未通过核对，请在浏览器里人工确认：${stillFailed.map((f) => `${f.locale}(${f.reason})`).join(', ')}`);
  else if (!attempted) log('⚠️ Edge：没有符合条件的描述可填（原因见上方跳过提示），后台未做任何修改。');
  else log('Edge 完成：全部已保存并核对通过。');
}
