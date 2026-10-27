// 日志文案表的覆盖率闸：源码里每一条【带中文的字面量日志】都必须被 src/logmap.mjs 覆盖，
// 表里也不许留命中不了任何日志的死条目。加了日志忘了登记 —— 这里红。
// 语料由 test/logscan.mjs 从源码还原（src/runread.mjs 的认读正则也吃这份语料）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LOG_PATTERNS, LOG_TERMS, translateLog, logLevelOf } from '../src/logmap.mjs';
import { CJKISH, ROOT, samples, sourceText, unparsed, scanRawErrorReasons } from './logscan.mjs';

test('解析器没有把带中文的实参整个吞掉', () => {
  assert.deepEqual(unparsed, [], '这些 log() 实参里有中文，但一条候选形态都没解析出来：先修解析器，否则漏登记不会红');
});

test('带中文的字面量日志全部登记在案（漏一条就红）', () => {
  const missing = samples.filter((x) => logLevelOf(x.sample) === null);
  assert.deepEqual(
    [...new Set(missing.map((x) => `${x.rel} ← ${x.arg}\n     未覆盖变体 ${JSON.stringify(x.sample)}`))].sort(),
    [],
    '这些日志没被 src/logmap.mjs 覆盖：加一条 P(...) 再提交',
  );
  assert.ok(samples.length > 60, `扫到的日志条数太少（${samples.length}），八成是解析器坏了而不是代码变干净了`);
});

test('表里没有命中不了任何日志的死条目', () => {
  const dead = LOG_PATTERNS.filter((p) => !samples.some((x) => p.re.test(x.sample)));
  assert.deepEqual(dead.map((p) => String(p.re)), [], '这些条目在源码里找不到对应日志（日志改了词面或表写错）');
});

test('英文输出不再含中文或全角标点（参数位是占位值）', () => {
  const bad = [];
  for (const p of LOG_PATTERNS) {
    const hit = samples.find((x) => p.re.test(x.sample));
    if (!hit) continue;
    const en = translateLog(hit.sample);
    if (CJKISH.test(en)) bad.push(`${String(p.re)} → ${JSON.stringify(en)}`);
  }
  assert.deepEqual(bad, [], 'en() 里还留着中文或全角标点');
});

// 目标名 / 失败原因是作为参数嵌进整行的，占位样本照不到——按真实参数再核一遍。
test('参数里嵌进来的中文短词也会被替掉', () => {
  const lines = [
    '❌ Edge 搜索词 出错：Timeout 30000ms exceeded（继续跑其余目标）',
    '⚠️ 完成，但这些目标出错需重跑：Chrome 描述、Edge 搜索词（浏览器保留现场）',
    '  ⚠️ de 没保存成（填进去的内容没留住），下一轮再试',
    'Edge 完成。⚠️ 以下语言未通过核对，请在浏览器里人工确认：tr(存回来的内容和要填的不一样), ru(未核对(重载后需重新登录))',
  ];
  const bad = lines.filter((l) => CJKISH.test(translateLog(l)));
  assert.deepEqual(bad, [], '这些行的英文输出里还留着中文短词');
  assert.equal(
    translateLog('❌ Edge 搜索词 出错：Timeout（继续跑其余目标）'),
    '❌ Edge search terms failed: Timeout (other targets continue)',
  );
});

// 英文行里不该留全角括号（中文标点）：语言名标签这种「ja（日语）」曾原样露在英文界面上。
// 语言名本身跟着【后台】的界面语言走（后台是中文就显示「日语」——那是用户眼前那一行的字样，
// 不能换成英文，否则就对不上正在看的后台了）；这里只管标点。
test('英文输出里不留全角括号', () => {
  const lines = [
    'Edge 搜索词 1/3：ja（Japanese） — 2 个',
    'Edge 搜索词 1/3：ja（日语） — 2 个',
    'Edge 保存 1/25：pt-BR（葡萄牙语(巴西)）',
    '❌ Edge 描述 出错：没等到语言列表（Edge 描述）。请检查：① 链接是 …/listings 结尾的页面；② 已登录 Microsoft；③ 网络正常。（继续跑其余目标）',
  ];
  const bad = lines.filter((l) => /[（）]/.test(translateLog(l)));
  assert.deepEqual(bad, [], '英文输出里还留着全角括号');
  assert.match(translateLog(lines[0]), /ja\(Japanese\)/);
  // 后台是中文界面时，语言名保留后台的说法，但括号已是半角
  assert.match(translateLog(lines[1]), /ja\(日语\)/);
});

test('级别从表里拿，不靠中文词面', () => {
  assert.equal(logLevelOf('❌ 出错：boom（浏览器保留现场，修好后重跑）'), 'err');
  assert.equal(logLevelOf('✅ 完成。请在浏览器里人工检查后提交。'), 'ok');
  assert.equal(logLevelOf('Edge 跳过 pl：不足 250 字'), 'warn');
  assert.equal(logLevelOf('一条没登记的话'), null);
});

// 英文界面里若只把 "failed:" 翻过来、后面整段原因仍是中文，用户等于没拿到任何可执行的信息。
test('失败原因整句也翻成英文', () => {
  const lines = [
    '❌ Chrome 描述 出错：没等到 Chrome 的语言下拉。请检查：① 链接是 …/edit 结尾的商店列表编辑页；② 已登录 Google；③ 网络正常。（继续跑其余目标）',
    '❌ Edge 描述 出错：没等到语言列表（Edge 描述）。请检查：① 链接是 …/listings 结尾的页面；② 已登录 Microsoft；③ 网络正常。（继续跑其余目标）',
    '❌ Firefox 出错：没等到 AMO 的「描述附加组件」区块。请检查：① 链接是 …/developers/addon/<名>/edit；② 已登录 Mozilla 账号；③ 网络正常。（继续跑其余目标）',
    '❌ Chrome 描述 出错：“保存草稿”未能点击，已填内容尚未保存，请人工保存或重跑（继续跑其余目标）',
  ];
  const bad = lines.filter((l) => CJKISH.test(translateLog(l)));
  assert.deepEqual(bad, [], '这些失败原因在英文界面里还是中文');
  assert.match(translateLog(lines[0]), /signed in to Google/);
  assert.match(translateLog(lines[1]), /signed in to Microsoft/);
  assert.match(translateLog(lines[2]), /signed in to Mozilla/);
  assert.match(translateLog(lines[3]), /Save draft/);
});

// 自动化框架的原始异常也要翻：用户看到的应该是一句人话 + 一行技术细节，
// 而不是 locator.click: Timeout 30000ms exceeded. 这种内部串。
test('原始异常也翻成英文（人话在前，技术细节在后）', () => {
  const zh = '❌ Firefox 出错：页面上没找到要操作的那个元素（后台可能改版了，或这一步没加载出来）。技术细节：locator.waitFor: Timeout 30000ms exceeded.（继续跑其余目标）';
  const en = translateLog(zh);
  assert.equal(CJKISH.test(en), false, `英文输出里还有中文：${en}`);
  assert.match(en, /not found on the page/);
  assert.match(en, /Technical detail: locator\.waitFor: Timeout 30000ms exceeded\./);
});

// 失败原因也塞进「中断原因」「没存成原因」的括号里 —— 那些行走的是另一条模式，
// 译文也得跟着翻，否则英文界面里这两行还是中文。
// （行首的「ja（日语）」是服务端自己的语言名标签，括号是全角、名字是中文：
//   那是改动之前就有的既成事实，不在本次范围内。）
test('括号里的失败原因也要翻（中断/没存成那两行）', () => {
  const reason = '页面上没找到要操作的那个元素（后台可能改版了，或这一步没加载出来）。技术细节：locator.waitFor: Timeout 30000ms exceeded.';
  const en1 = translateLog(`⚠️ Chrome 在第 3 种语言时中断（${reason}），先把已填的 2 种保存成草稿…`);
  assert.equal(CJKISH.test(en1), false, `中断那行还有中文：${en1}`);
  assert.match(en1, /interrupted at locale 3/);

  const en2 = translateLog(`  ⚠️ ja（日语） 没存成（${reason}），下一轮再试`);
  assert.match(en2, /did not save/);
  assert.match(en2, /not found on the page/);
  assert.match(en2, /Technical detail: locator\.waitFor: Timeout 30000ms exceeded\./);
  assert.equal(/页面上没找到/.test(en2), false, '原因那半句还是中文');
});

// 失败原因一律走 explainError：原始异常（内部选择器、超时毫秒数，甚至整段用户文案）
// 直接进日志，用户既看不懂也会被撑爆。这里扫填充脚本源码，堵住「又漏改一处」。
// （服务端那一半由 test/errmsg.test.mjs 守着，各守各的。）
test('失败原因不再直接用原始异常（都走 explainError）', () => {
  const files = [
    'playwright/run.mjs',
    'playwright/fill-chrome.mjs',
    'playwright/fill-edge.mjs',
    'playwright/fill-edge-terms.mjs',
    'playwright/fill-firefox.mjs',
  ];
  assert.deepEqual(scanRawErrorReasons(files), [], '这些地方还把原始异常当失败原因给用户看');
});

// 目标名与失败原因是作为参数嵌进整行的，占位值测不出它们带中文——按源码扫一遍短词表。
test('中文短词表与源码对齐：目标名都登记、表里不留死词', () => {  const serverSrc = readFileSync(path.join(ROOT, 'gui/server.mjs'), 'utf8');
  const names = [...serverSrc.matchAll(/runTarget\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 3, `只扫到 ${names.length} 个 runTarget 目标名，八成是写法变了`);
  const known = new Set(LOG_TERMS.map(([zh]) => zh));
  const missing = [...new Set(names.filter((n) => CJKISH.test(n) && !known.has(n)))];
  assert.deepEqual(missing, [], '英文界面下这些目标名会露出中文：加进 src/logmap.mjs 的 LOG_TERMS');
  const dead = LOG_TERMS.filter(([zh]) => !sourceText.includes(zh)).map(([zh]) => zh);
  assert.deepEqual(dead, [], '源码里已经找不到这些中文短词：日志改了词面，表要跟着改');
});
