// 日志文案表的覆盖率闸：源码里每一条【带中文的字面量日志】都必须被 src/logmap.mjs 覆盖，
// 表里也不许留命中不了任何日志的死条目。加了日志忘了登记 —— 这里红。
// 语料由 test/logscan.mjs 从源码还原（src/runread.mjs 的认读正则也吃这份语料）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LOG_PATTERNS, LOG_TERMS, translateLog, logLevelOf } from '../src/logmap.mjs';
import { CJKISH, ROOT, samples, sourceText, unparsed } from './logscan.mjs';

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

test('级别从表里拿，不靠中文词面', () => {
  assert.equal(logLevelOf('❌ 出错：boom（浏览器保留现场，修好后重跑）'), 'err');
  assert.equal(logLevelOf('✅ 完成。请在浏览器里人工检查后提交。'), 'ok');
  assert.equal(logLevelOf('Edge 跳过 pl：不足 250 字'), 'warn');
  assert.equal(logLevelOf('一条没登记的话'), null);
});

// 目标名与失败原因是作为参数嵌进整行的，占位值测不出它们带中文——按源码扫一遍短词表。
test('中文短词表与源码对齐：目标名都登记、表里不留死词', () => {
  const serverSrc = readFileSync(path.join(ROOT, 'gui/server.mjs'), 'utf8');
  const names = [...serverSrc.matchAll(/runTarget\('([^']+)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 3, `只扫到 ${names.length} 个 runTarget 目标名，八成是写法变了`);
  const known = new Set(LOG_TERMS.map(([zh]) => zh));
  const missing = [...new Set(names.filter((n) => CJKISH.test(n) && !known.has(n)))];
  assert.deepEqual(missing, [], '英文界面下这些目标名会露出中文：加进 src/logmap.mjs 的 LOG_TERMS');
  const dead = LOG_TERMS.filter(([zh]) => !sourceText.includes(zh)).map(([zh]) => zh);
  assert.deepEqual(dead, [], '源码里已经找不到这些中文短词：日志改了词面，表要跟着改');
});
