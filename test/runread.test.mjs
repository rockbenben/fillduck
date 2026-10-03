// 运行读数的闸：src/runread.mjs 靠日志词面认状态，日志改了说法而这里没跟着改，
// 界面上不会报错、只会静默少一个读数——所以两条都要钉住：
//   ① 每条认读正则都必须真能命中源码里的日志（不许有死模式）；
//   ② 一组行为用例，钉住「跑到哪 / 这一轮结果」的定性。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { RUN_DONE, UNIT_EVENTS, UNIT_KEYS, FAIL_NAME_TO_UNIT, TAIL_REVIEW, TAIL_STORED, readRun, tally } from '../src/runread.mjs';
import { ROOT, samples } from './logscan.mjs';

const real = (re) => samples.some((x) => re.test(x.sample));

test('认读正则没有一条是死模式（日志改了词面就会红）', () => {
  const dead = [];
  for (const key of UNIT_KEYS) {
    for (const ev of UNIT_EVENTS[key]) if (!real(ev.re)) dead.push(`${key} ${String(ev.re)}`);
    if (TAIL_REVIEW[key] && !real(TAIL_REVIEW[key])) dead.push(`tail-review ${String(TAIL_REVIEW[key])}`);
    if (TAIL_STORED[key] && !real(TAIL_STORED[key])) dead.push(`tail-stored ${String(TAIL_STORED[key])}`);
  }
  for (const re of RUN_DONE) if (!real(re)) dead.push(`run-done ${String(re)}`);
  assert.deepEqual(dead, [], '这些模式在源码日志里命中不到：日志改了说法，读数会静默失效');
});

// 收尾行同时是「这一轮结束了」的凭据：漏认一条，读数会永远停在「进行中」。
// 判据取自源码结构而不是抄一遍清单——run 函数尾巴上（if/else 链 + 最外层 catch）的每条日志都必须被 RUN_DONE 认下。
test('服务端每一句收尾语都在 RUN_DONE 里（不会有跑完还显示进行中）', () => {
  const src = readFileSync(path.join(ROOT, 'gui/server.mjs'), 'utf8');
  const from = src.indexOf('if (cancelRequested) log(');
  const to = src.indexOf('} finally {');
  assert.ok(from > 0 && to > from, '找不到 run 函数尾巴的那段 if/else 链：写法变了，这条守卫要跟着改');
  const tail = src.slice(from, to);
  // 展开实参交给 logscan 的解析器做（它会拆拼接与模板，这里不重造一遍）
  const tailLines = samples.filter((x) => x.rel === 'gui/server.mjs' && tail.includes(x.arg));
  assert.ok(tailLines.length >= 5, `尾巴上只扫到 ${tailLines.length} 句收尾语，八成是切片切短了`);
  const missed = [...new Set(tailLines.map((x) => x.sample))].filter((l) => !RUN_DONE.some((re) => re.test(l)));
  assert.deepEqual(missed, [], '这些收尾语没进 RUN_DONE：这一轮会被判成还没结束');
});

test('出错行的目标名与 runTarget 上报的名字一致', () => {
  const src = readFileSync(path.join(ROOT, 'gui/server.mjs'), 'utf8');
  const names = new Set([...src.matchAll(/runTarget\('([^']+)'/g)].map((m) => m[1]));
  const unknown = Object.keys(FAIL_NAME_TO_UNIT).filter((n) => !names.has(n));
  assert.deepEqual(unknown, [], '这些目标名在 gui/server.mjs 里已经不存在：出错那档会认不出来');
  const unmapped = [...names].filter((n) => !Object.keys(FAIL_NAME_TO_UNIT).includes(n));
  assert.deepEqual(unmapped, [], '新目标名没进 FAIL_NAME_TO_UNIT：它出错时界面不会标红');
});

const byKey = (r) => Object.fromEntries(r.units.map((u) => [u.key, u]));

test('空闲时没有读数；开跑后按单元各自报', () => {
  assert.equal(readRun([]).mode, 'idle');
  const r = readRun([
    '收到填充请求：chrome-desc + edge-desc',
    '打开 Chrome 后台…',
    'Chrome 1/24：en',
    'Edge：先逐个保存全部 23 种，保存完统一核对，没过的自动重试',
    'Edge 保存 3/23：English (United States)',
  ]);
  assert.equal(r.mode, 'running');
  const u = byKey(r);
  assert.equal(u['chrome-desc'].state, 'running');
  assert.deepEqual([u['chrome-desc'].i, u['chrome-desc'].n], [1, 24]);
  assert.deepEqual([u['edge-desc'].i, u['edge-desc'].n], [3, 23]);
  assert.equal(u['edge-terms'].state, 'pending');
  assert.equal(u['firefox-desc'].state, 'pending');
});

test('跑完的定性与计数', () => {
  const r = readRun([
    '收到填充请求：chrome-desc + edge-desc + edge-terms + firefox-desc',
    'Chrome 24/24：ru',
    'Chrome 完成：已填 22 种并点击“保存草稿”。请人工检查后在后台提请审核。',
    '⚠️ Chrome 这些语言填进去了但没稳住，请逐个检查：zh_TW, pl',
    'Edge 保存 21/21：English',
    'Edge 完成。⚠️ 以下语言未通过核对，请在浏览器里人工确认：tr(存回来的内容和要填的不一样), ru(没保存成功)',
    'Edge 搜索词：无数据可填，跳过。',
    'Firefox 完成：全部已保存并核对通过。',
    '⚠️ 完成，但这些目标出错需重跑：Edge 描述（浏览器保留现场）',
  ]);
  assert.equal(r.mode, 'result');
  const u = byKey(r);
  assert.equal(u['chrome-desc'].state, 'review');
  assert.equal(u['chrome-desc'].filled, 22); // 存住的数不因「要人看」而丢
  assert.equal(u['chrome-desc'].human, 2);
  assert.equal(u['edge-desc'].state, 'review');
  assert.equal(u['edge-desc'].human, 2);
  assert.equal(u['edge-terms'].state, 'skipped');
  assert.equal(u['firefox-desc'].state, 'stored');
  assert.deepEqual(tally(r.units), { stored: 1, review: 2, skipped: 1, failed: 0, running: 0, pending: 0 });
});

test('出错那一档盖过之前的好读数', () => {
  const r = readRun([
    '收到填充请求：chrome-desc + firefox-desc',
    'Firefox：共 12 种语言，先建好缺失语言字段再统一填入、一次保存',
    '❌ Firefox 出错：TimeoutError（继续跑其余目标）',
  ]);
  assert.equal(byKey(r)['firefox-desc'].state, 'failed');
  assert.equal(byKey(r)['firefox-desc'].n, 12); // 数字留着，方便说「跑到第几就断了」
});

test('上一轮的收尾不算这一轮的结果', () => {
  const r = readRun([
    '收到填充请求：chrome-desc',
    'Chrome 完成：已填 3 种并点击“保存草稿”。请人工检查后在后台提请审核。',
    '✅ 完成。请在浏览器里人工检查后提交。',
    '收到填充请求：chrome-desc',
    '打开 Chrome 后台…',
  ]);
  assert.equal(r.mode, 'running');
  assert.equal(byKey(r)['chrome-desc'].state, 'running');
  assert.equal(byKey(r)['chrome-desc'].filled, 0);
});
