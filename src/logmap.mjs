// 运行日志的双语显示层。
//
// 为什么要这张表：日志以前是服务端硬编码中文，界面切到英文后整屏日志仍是中文；
// 而且前端的 出错/完成/注意 分色以前靠中文关键词正则判断（classify），换语言就全瞎。
//
// 做法：服务端照旧发中文（黑窗口里读的也是它），前端按界面语言渲染 —— 命中这张表的
// 行用英文重写，级别由表给出，不再依赖词面匹配。没命中的行原样显示、按老规则分色。
//
// 漂移防线：test/logmap.test.mjs 会扫 gui/server.mjs 与 playwright/*.mjs 里的每一条
// log('…') 字面量，要求全部被这张表覆盖、且表里没有用不上的条目。加了日志忘了登记，测试就红。
//
// 约定：re 必须锚定整行（^…$），捕获组按顺序传给 en；en 的返回值不该再含中文，
// 参数位带进来的中文短词由下面的 LOG_TERMS 兜底替换。

const P = (re, level, en) => ({ re, level, en });

// 短词表：执行目标名（gui/server.mjs 的 runTarget）与各阶段的失败原因（playwright 里当作参数嵌进整行）。
// 整行按英文重写完，再把这些嵌进来的中文词替掉，英文界面才不会卡在「Edge 搜索词」这类词上。
// 深度诊断串不在这里：fill-edge.mjs 的 describeMismatch 是发给维护者逐字看的，保留中文。
export const LOG_TERMS = [
  ['Chrome 描述', 'Chrome descriptions'],
  ['Edge 描述', 'Edge descriptions'],
  ['Edge 搜索词', 'Edge search terms'],
  ['填进去的内容没留住', 'the text did not stay in the box'],
  ['保存按钮一直没变可点', 'the Save button never became clickable'],
  ['保存按钮点不了', 'the Save button was not clickable'],
  ['旧词没清干净', 'the old terms were not fully cleared'],
  ['存回来的内容和要填的不一样', 'the saved text differs from what was sent'],
  ['存回来的内容不对', 'saved text differs'],
  ['存回来的词不对', 'saved terms differ'],
  ['存回来的词和要填的不一样', 'the saved terms differ from what was sent'],
  ['这一栏没建出来', 'that language box was not created'],
  ['没保存成功', 'not saved'],
  ['未核对(重载后需重新登录)', 'not verified (needs re-login after reload)'],
];
// 长词优先，免得短词先把长词切碎
const TERMS = [...LOG_TERMS].sort((a, b) => b[0].length - a[0].length);
const TERM_RE = new RegExp(TERMS.map(([zh]) => zh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
const TERM_EN = new Map(TERMS);
export function translateTerms(s) {
  // 「、」是服务端拼目标列表用的中文顿号，英文行里留着它也算漏网的中文
  return s.replace(TERM_RE, (zh) => TERM_EN.get(zh)).replace(/、/g, ', ');
}

export const LOG_PATTERNS = [
  // —— 启动与登录 ——
  P(/^启动浏览器…$/, '', () => 'Opening the browser…'),
  P(/^使用本机浏览器：(.+)$/, '', (m) => `Using local browser: ${m[1]}`),
  P(/^使用 Playwright 自带 Chromium$/, '', () => 'Using the Chromium bundled with Playwright'),
  P(/^正在填充中，请等当前任务结束再登录。$/, 'warn', () => 'A fill is already running — wait for it, then log in.'),
  P(/^请先填后台链接（至少一个）再点登录。$/, 'warn', () => 'Add at least one dashboard link before clicking Log in.'),
  P(/^请在弹出的浏览器里登录 (.+?)（按你填的后台），登录后回来点“填充”。$/, '', (m) => `Log in to ${m[1]} in the browser window that opened, then come back and press Start.`),
  P(/^([^ ]+) 打开失败：(.+)$/, 'err', (m) => `${m[1]} failed to open: ${m[2]}`),
  P(/^❌ 登录启动失败：(.+)$/, 'err', (m) => `❌ Could not start login: ${m[1]}`),

  P(/^⏹ 收到停止请求，完成当前这一项后停下…$/, 'warn', () => '⏹ Stop requested — finishing the current item, then stopping…'),
  P(/^⚠️ 没有可填的内容：描述与搜索词都为空或有误。$/, 'warn', () => '⚠️ Nothing to fill: both the descriptions and the search terms are empty or invalid.'),
  P(/^❌ (.+?) 出错：(.+?)（继续跑其余目标）$/, 'err', (m) => `❌ ${m[1]} failed: ${m[2]} (other targets continue)`),
  // —— 一轮任务的开始与收尾 ——
  P(/^收到填充请求：(.+)$/, '', (m) => `Run requested: ${m[1]}`),
  P(/^项目：(.+)$/, '', (m) => `Project: ${m[1]}`),
  P(/^描述 JSON 有问题：(.+)$/, 'err', (m) => `Description JSON has a problem: ${m[1]}`),
  P(/^搜索词 JSON 有问题：(.+)$/, 'err', (m) => `Search-terms JSON has a problem: ${m[1]}`),
  P(/^按所选语言过滤：生效 (\d+) 种语言(?:，已排除未勾选的 (\d+) 项)?$/, '', (m) => `Locale filter: ${m[1]} in scope${m[2] ? `, ${m[2]} excluded` : ''}`),
  P(/^⏹ 已停止（已填的部分保留）。$/, 'warn', () => '⏹ Stopped (what was already filled is kept).'),
  P(/^⚠️ 没有可填充的目标：请确认所选后台的链接已填、且对应的描述 \/ 搜索词不为空且格式正确。$/, 'warn', () => '⚠️ Nothing to fill: check that a link is set and the matching description / search terms are present and valid.'),
  P(/^❌ 全部目标都出错，本次没有填充任何内容：(.+?)（浏览器保留现场）$/, 'err', (m) => `❌ Every target failed, nothing was filled: ${m[1]} (browser left open)`),
  P(/^⚠️ 完成，但这些目标出错需重跑：(.+?)（浏览器保留现场）$/, 'warn', (m) => `⚠️ Done, but these need a retry: ${m[1]} (browser left open)`),
  P(/^✅ 完成。请在浏览器里人工检查后提交。$/, 'ok', () => '✅ Done. Check it in the browser, then submit.'),
  P(/^❌ 出错：(.+?)（浏览器保留现场，修好后重跑）$/, 'err', (m) => `❌ Error: ${m[1]} (browser left open — fix and rerun)`),

  // —— 项目与保存 ——
  P(/^忽略一次过期保存（来自项目「(.+?)」，当前是「(.+?)」）。$/, 'warn', (m) => `Ignored a stale save (from project "${m[1]}", current is "${m[2]}").`),
  P(/^已保存链接、描述与搜索词。$/, 'ok', () => 'Links, descriptions and search terms saved.'),
  P(/^已切换到项目「(.+?)」。$/, '', (m) => `Switched to project "${m[1]}".`),
  P(/^项目「(.+?)」已改名为「(.+?)」。$/, '', (m) => `Project "${m[1]}" renamed to "${m[2]}".`),
  P(/^已新建项目「(.+?)」并切换。$/, '', (m) => `Created project "${m[1]}" and switched to it.`),
  P(/^已删除项目「(.+?)」。$/, '', (m) => `Deleted project "${m[1]}".`),
  P(/^当前没有正在跑的任务。$/, 'warn', () => 'Nothing is running right now.'),
  P(/^已有任务在跑，请稍候。$/, 'warn', () => 'A task is already running — hold on.'),
  P(/^⚠️ 没有选中任何执行目标。$/, 'warn', () => '⚠️ No execution target selected.'),

  // —— 跳过类（各商店共用形状）——
  P(/^没填 (Chrome|Edge|Firefox) 链接，跳过。$/, 'warn', (m) => `No ${m[1]} link — skipped.`),
  P(/^(Chrome|Firefox) 无描述可填，跳过。$/, 'warn', (m) => `${m[1]}: no description to fill — skipped.`),
  P(/^Edge 描述：无文案可填，(?:已)?跳过。$/, 'warn', () => 'Edge descriptions: nothing to fill — skipped.'),
  P(/^Edge 搜索词：无数据可填，(?:已)?跳过。$/, 'warn', () => 'Edge search terms: no data to fill — skipped.'),
  P(/^打开 (Chrome|Edge|Firefox) 后台…$/, '', (m) => `Opening the ${m[1]} dashboard…`),
  P(/^重开 Edge 后台（清理上一步残留）…$/, '', () => 'Reopening the Edge dashboard (clearing leftovers)…'),

  // —— Chrome 填充 ——
  P(/^Chrome 界面非中\/英，强制英文重载…$/, 'warn', () => 'Chrome UI is neither Chinese nor English — reloading in English…'),
  P(/^Chrome 界面语言：(.+)$/, '', (m) => `Chrome UI language: ${m[1] === '中文' ? 'Chinese' : 'English'}`),
  P(/^Chrome 忽略\(无此语言\)：(.+)$/, 'warn', (m) => `Chrome ignored (not offered there): ${m[1]}`),
  P(/^Chrome 缺文案，跳过：(.+)$/, 'warn', (m) => `Chrome missing copy, skipped: ${m[1]}`),
  P(/^⚠️ Chrome 已填 (\d+) 种但“保存草稿”没点上——请去浏览器里手动点击保存，否则关掉浏览器就没了！$/, 'warn', (m) => `⚠️ Chrome: ${m[1]} filled but the draft was NOT saved — save it by hand in the browser, or closing the window throws it away!`),
  P(/^⚠️ Chrome 已填 (\d+) 种，但没找到“保存草稿”按钮，请手动点击保存，否则草稿不会保存。$/, 'warn', (m) => `⚠️ Chrome: ${m[1]} filled, but no "Save draft" button was found — save it manually or the draft is lost.`),
  P(/^⚠️ Chrome 这些语言填进去了但没稳住，请逐个检查：(.+)$/, 'warn', (m) => `⚠️ Chrome: the text did not stick for these — check one by one: ${m[1]}`),
  P(/^⚠️ Chrome (.+?)：填进去了但没稳住，请去浏览器核对这一条$/, 'warn', (m) => `⚠️ Chrome ${m[1]}: the text did not stick — check this language in the browser`),
  P(/^⚠️ Chrome 在第 (\d+) 种语言时中断（(.+?)），先把已填的 (\d+) 种保存成草稿…$/, 'warn', (m) => `⚠️ Chrome interrupted at locale ${m[1]} (${m[2]}) — saving the ${m[3]} already filled as a draft…`),
  P(/^⚠️ Chrome 已中断：中断前已填的 (\d+) 种已点击“保存草稿”。$/, 'warn', (m) => `⚠️ Chrome was interrupted: clicked "Save draft" for the ${m[1]} filled before it.`),
  P(/^⏹ Chrome 已停止：已填的 (\d+) 种已点击“保存草稿”。$/, 'warn', (m) => `⏹ Stopped (Chrome): clicked "Save draft" for the ${m[1]} already filled.`),
  P(/^Chrome 完成：已填 (\d+) 种并点击“保存草稿”。请人工检查后在后台提请审核。$/, 'ok', (m) => `Chrome done: ${m[1]} languages filled and "Save draft" clicked. Check it over in the dashboard before requesting review.`),
  P(/^⏹ 已停止（Chrome），正在保存已填的部分…$/, 'warn', () => '⏹ Stopped (Chrome), saving what was filled…'),
  P(/^⚠️ Chrome 点“保存草稿”失败：(.+)$/, 'warn', (m) => `⚠️ Chrome: clicking "Save draft" failed: ${m[1]}`),

  // —— 通用形状（Chrome / Edge 共用：重复键、逐条进度）——
  P(/^⚠️ 文案里这些键与前面的键指向同一语言、已忽略：(.+)$/, 'warn', (m) => `⚠️ These keys point at a language already covered and were ignored: ${m[1]}`),
  P(/^⚠️ (.*?)里这些键与前面的键指向同一语言、已忽略：(.+)$/, 'warn', (m) => `⚠️ ${m[1]}: these keys point at a language already covered and were ignored: ${m[2]}`),
  P(/^Chrome (\d+)\/(\d+)：(.+)$/, '', (m) => `Chrome ${m[1]}/${m[2]}: ${m[3]}`),

  // —— Edge 描述 ——
  P(/^Edge 界面非中\/英，强制英文重载…$/, 'warn', () => 'Edge UI is neither Chinese nor English — reloading in English…'),
  P(/^(.+?)：界面语言 (.+)$/, '', (m) => `${m[1]}: UI language ${m[2] === '中文' ? 'Chinese' : 'English'}`),
  P(/^⚠️ Edge 上这些语言尚未收录、已跳过：(.+?)（发我一句即可加上）$/, 'warn', (m) => `⚠️ Edge does not list these languages yet, skipped: ${m[1]} (tell me and I will add them)`),
  P(/^(.*?)忽略\(无此语言\)：(.+)$/, 'warn', (m) => `${m[1]}ignored (not offered there): ${m[2]}`),
  P(/^(.*?)缺文案，跳过：(.+)$/, 'warn', (m) => `${m[1]}missing copy, skipped: ${m[2]}`),
  P(/^Edge：先逐个保存全部 (\d+) 种，保存完统一核对，没过的自动重试$/, '', (m) => `Edge: saving all ${m[1]} one by one, then verifying; failures retry automatically`),
  P(/^Edge 第 (\d+) 轮（上一轮 (\d+) 种未核对通过）$/, '', (m) => `Edge pass ${m[1]} (${m[2]} did not verify last pass)`),
  P(/^Edge 保存 (\d+)\/(\d+)：(.+)$/, '', (m) => `Edge save ${m[1]}/${m[2]}: ${m[3]}`),
  P(/^ {2}(.+?) 内容已是最新，无需保存$/, '', (m) => `  ${m[1]} already up to date, nothing to save`),
  P(/^ {2}⚠️ (.+?) 没保存成（(.+?)），下一轮再试$/, 'warn', (m) => `  ⚠️ ${m[1]} did not save (${m[2]}) — retrying next pass`),
  P(/^ {2}⚠️ (.+?) 没存成（(.+?)），下一轮再试$/, 'warn', (m) => `  ⚠️ ${m[1]} did not save (${m[2]}) — retrying next pass`),
  P(/^ {2}⚠️ (.+?) 未能保存：(.+)$/, 'warn', (m) => `  ⚠️ ${m[1]} could not be saved: ${m[2]}`),
  P(/^ {2}(.+?) 没保存成（(.+?)），下一轮再试$/, 'warn', (m) => `  ${m[1]} did not save (${m[2]}) — retrying next pass`),
  P(/^Edge 核对 (\d+) 种…$/, '', (m) => `Edge: verifying ${m[1]}…`),
  P(/^ {2}✅ (.+?) 核对通过$/, 'ok', (m) => `  ✅ ${m[1]} verified`),
  P(/^ {2}(.+?) 存回来的内容和要填的不一样，下一轮重试$/, 'warn', (m) => `  ${m[1]} holds different text than what was sent — retrying next pass`),
  P(/^ {2}⚠️ (.+?) 存回来的内容和要填的不一样：(.+)$/, 'warn', (m) => `  ⚠️ ${m[1]} holds different text than what was sent: ${m[2]}`),
  P(/^ {2}⚠️ (.+?) 重载后还是和要填的不一样：(.+)$/, 'warn', (m) => `  ⚠️ ${m[1]} still differs after reload: ${m[2]}`),
  P(/^Edge 跳过 (.+?)：不足 250 字$/, 'warn', (m) => `Edge skipped ${m[1]}: under 250 characters`),
  P(/^Edge 收尾：整页重载后再确认 (\d+) 种（排除后台保存慢一步造成的假失败）…$/, '', (m) => `Edge final pass: reloading and re-checking ${m[1]} (rules out false failures from a slow save)…`),
  P(/^Edge 收尾：重载后未回到语言列表（多半要重新登录，或界面语言变了），这 (\d+) 种未能核对——它们可能已存住，请登录后自查，勿盲目重填。$/, 'warn', (m) => `Edge final pass: the language list did not come back after reload (likely a re-login or a UI language change), so ${m[1]} were not verified — they may already be saved. Log in and check before refilling.`),
  P(/^ {2}✅ (.+?) 重载后核对通过（此前只是后台保存慢了一步，其实已经存上了）$/, 'ok', (m) => `  ✅ ${m[1]} verified after reload (the earlier failure was just a slow save; it was stored)`),
  P(/^Edge 收尾核对未能完成（(.+?)），按上一轮结果汇报$/, 'warn', (m) => `Edge final verification did not finish (${m[1]}) — reporting the previous pass`),
  P(/^Edge 完成。⚠️ 以下语言未通过核对，请在浏览器里人工确认：(.+)$/, 'warn', (m) => `Edge done. ⚠️ These did not verify — check them in the browser: ${m[1]}`),
  P(/^⚠️ Edge：没有符合条件的描述可填（原因见上方跳过提示），后台未做任何修改。$/, 'warn', () => '⚠️ Edge: no description qualified to fill (see the skip notes above); the dashboard was not changed.'),
  P(/^Edge 完成：全部已保存并核对通过。$/, 'ok', () => 'Edge done: everything saved and verified.'),
  P(/^⏹ 已停止（Edge）$/, 'warn', () => '⏹ Stopped (Edge)'),

  // —— Edge 搜索词 ——
  P(/^Edge 搜索词为空、跳过：(.+)$/, 'warn', (m) => `Edge search terms empty, skipped: ${m[1]}`),
  P(/^Edge 搜索词：逐个填\+存全部 (\d+) 种，存完统一核对$/, '', (m) => `Edge search terms: filling and saving all ${m[1]}, then verifying`),
  P(/^Edge 搜索词第 (\d+) 轮（上一轮 (\d+) 种未通过）$/, '', (m) => `Edge search terms pass ${m[1]} (${m[2]} failed last pass)`),
  P(/^Edge 搜索词 (\d+)\/(\d+)：(.+?) — (\d+) 个$/, '', (m) => `Edge search terms ${m[1]}/${m[2]}: ${m[3]} — ${m[4]} terms`),
  P(/^ {2}(.+?) 搜索词已是最新$/, '', (m) => `  ${m[1]} search terms already up to date`),
  P(/^Edge 搜索词核对 (\d+) 种…$/, '', (m) => `Edge search terms: verifying ${m[1]}…`),
  P(/^ {2}✅ (.+?) 搜索词核对通过$/, 'ok', (m) => `  ✅ ${m[1]} search terms verified`),
  P(/^ {2}(.+?) 存回来的词和要填的不一样（实际读到 (\d+) 个），下一轮重试$/, 'warn', (m) => `  ${m[1]} holds ${m[2]} terms instead of what was sent — retrying next pass`),
  P(/^Edge 搜索词完成。⚠️ 这些没存上，需人工处理：(.+)$/, 'warn', (m) => `Edge search terms done. ⚠️ These were not saved, handle by hand: ${m[1]}`),
  P(/^⚠️ Edge 搜索词：没有可填的语言（原因见上方跳过提示），后台未做任何修改。$/, 'warn', () => '⚠️ Edge search terms: no language qualified (see the skip notes above); the dashboard was not changed.'),
  P(/^Edge 搜索词完成：全部已保存并核对通过。$/, 'ok', () => 'Edge search terms done: everything saved and verified.'),
  P(/^⏹ 已停止（Edge 搜索词）$/, 'warn', () => '⏹ Stopped (Edge search terms)'),

  // —— Firefox ——
  P(/^Firefox 忽略\(AMO 不支持\)：(.+)$/, 'warn', (m) => `Firefox ignored (AMO has no such language): ${m[1]}`),
  P(/^Firefox 忽略\(与前面的键指向同一语言\)：(.+)$/, 'warn', (m) => `Firefox ignored (same language as an earlier key): ${m[1]}`),
  P(/^Firefox 跳过 (.+?)：超过 (\d+) 字符上限$/, 'warn', (m) => `Firefox skipped ${m[1]}: over the ${m[2]}-character limit`),
  P(/^Firefox：共 (\d+) 种语言，先建好缺失语言字段再统一填入、一次保存$/, '', (m) => `Firefox: ${m[1]} languages — creating missing fields first, then filling and saving once`),
  P(/^Firefox：没有可填的语言。$/, 'warn', () => 'Firefox: no language to fill.'),
  P(/^Firefox 第 (\d+) 轮（上一轮 (\d+) 种未核对通过）$/, '', (m) => `Firefox pass ${m[1]} (${m[2]} did not verify last pass)`),
  P(/^ {2}⚠️ (.+?) 这一栏没建出来，稍后重试$/, 'warn', (m) => `  ⚠️ ${m[1]}: that language's box could not be created — retrying shortly`),
  P(/^ {2}已填入 (\d+) 种：(.+)$/, '', (m) => `  Filled ${m[1]}: ${m[2]}`),
  P(/^⏹ 已停止（Firefox），未填入任何内容。$/, 'warn', () => '⏹ Stopped (Firefox), nothing was filled.'),
  P(/^⏹ 收到停止（Firefox）：先把已填的 (\d+) 种保存再停…$/, 'warn', (m) => `⏹ Stop requested (Firefox): saving the ${m[1]} already filled first…`),
  P(/^ {2}⚠️ AMO 校验报错：(.+)$/, 'warn', (m) => `  ⚠️ AMO rejected the form: ${m[1]}`),
  P(/^ {2}保存未确认，下一轮重试$/, 'warn', () => '  Save not confirmed — retrying next pass'),
  P(/^Firefox 完成。⚠️ 这些没存上，需人工处理：(.+)$/, 'warn', (m) => `Firefox done. ⚠️ These were not saved, handle by hand: ${m[1]}`),
  P(/^Firefox 完成：全部已保存并核对通过。$/, 'ok', () => 'Firefox done: everything saved and verified.'),
  P(/^⏹ 已停止（Firefox）$/, 'warn', () => '⏹ Stopped (Firefox)'),
  P(/^⏹ 已停止（Firefox）：已填的 (\d+) 种已保存（没有再读一遍核对，请人工检查）。$/, 'warn', (m) => `⏹ Stopped (Firefox): the ${m[1]} filled were saved (not double-checked — please review by hand).`),
  P(/^⚠️ 已停止（Firefox），但保存未确认——请在浏览器里人工检查并手动保存。$/, 'warn', () => '⚠️ Stopped (Firefox) but the save was not confirmed — check and save by hand in the browser.'),
];

// 命中则返回英文（嵌在参数里的中文短词一并替掉），否则原样返回（中文在英文界面下也比空白强）。
export function translateLog(msg) {
  for (const p of LOG_PATTERNS) {
    const m = p.re.exec(msg);
    if (m) return translateTerms(p.en(m));
  }
  return msg;
}

// 命中则返回该行语义级别（'' / 'ok' / 'warn' / 'err'），没命中返回 null 交给词面兜底。
export function logLevelOf(msg) {
  for (const p of LOG_PATTERNS) if (p.re.test(msg)) return p.level;
  return null;
}

// 有没有被这张表覆盖（测试用它算覆盖率）。
export function isMapped(msg) {
  return logLevelOf(msg) !== null;
}
