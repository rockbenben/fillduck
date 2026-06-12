import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInput, parseTerms, buildFillQueue, forceDashboardLang, matchLocaleButtons } from '../src/core.mjs';

test('parseInput: 合法对象', () => {
  const r = parseInput('{"en":"hello","ja":"こんにちは"}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { en: 'hello', ja: 'こんにちは' });
});

test('parseInput: 非法 JSON', () => {
  const r = parseInput('{not json');
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON 解析失败/);
});

test('parseInput: 顶层是数组要报错', () => {
  const r = parseInput('["a","b"]');
  assert.equal(r.ok, false);
  assert.match(r.error, /顶层必须是一个对象/);
});

test('parseInput: 空对象要报错', () => {
  const r = parseInput('{}');
  assert.equal(r.ok, false);
  assert.match(r.error, /至少要有一个语言/);
});

test('parseInput: 文案非字符串要报错', () => {
  const r = parseInput('{"en":123}');
  assert.equal(r.ok, false);
  assert.match(r.error, /必须是字符串/);
});

test('parseInput: 文案空白要报错', () => {
  const r = parseInput('{"en":"   "}');
  assert.equal(r.ok, false);
  assert.match(r.error, /为空/);
});

test('buildFillQueue: 按后台顺序产出队列', () => {
  const data = { en: 'E', ja: 'J', zh_CN: 'Z' };
  const r = buildFillQueue(data, ['ja', 'en', 'zh_CN']);
  assert.deepEqual(r.queue, [
    { locale: 'ja', text: 'J' },
    { locale: 'en', text: 'E' },
    { locale: 'zh_CN', text: 'Z' },
  ]);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extra, []);
});

test('buildFillQueue: 归一化后相同的重复键进 duplicates，不静默丢', () => {
  const r = buildFillQueue({ zh_CN: '甲', 'zh-CN': '乙' }, ['zh-CN']);
  assert.deepEqual(r.queue, [{ locale: 'zh-CN', text: '甲' }]);
  assert.deepEqual(r.duplicates, ['zh-CN']);
});

test('buildFillQueue: 后台有但文案缺 -> missing', () => {
  const r = buildFillQueue({ en: 'E' }, ['en', 'fr']);
  assert.deepEqual(r.queue, [{ locale: 'en', text: 'E' }]);
  assert.deepEqual(r.missing, ['fr']);
});

test('buildFillQueue: 文案有但后台无 -> extra', () => {
  const r = buildFillQueue({ en: 'E', xx: 'X' }, ['en']);
  assert.deepEqual(r.extra, ['xx']);
  assert.deepEqual(r.queue, [{ locale: 'en', text: 'E' }]);
  assert.deepEqual(r.missing, []);
});

test('buildFillQueue: 下划线键匹配连字符后台码', () => {
  const r = buildFillQueue({ zh_CN: 'Z', pt_BR: 'P' }, ['zh-CN', 'pt-BR']);
  assert.deepEqual(r.queue, [
    { locale: 'zh-CN', text: 'Z' },
    { locale: 'pt-BR', text: 'P' },
  ]);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.extra, []);
});

test('buildFillQueue: 归一化匹配忽略大小写', () => {
  const r = buildFillQueue({ 'ZH-cn': 'Z' }, ['zh-CN']);
  assert.deepEqual(r.queue, [{ locale: 'zh-CN', text: 'Z' }]);
  assert.deepEqual(r.extra, []);
});

test('forceDashboardLang(en): Edge 中文链接改成英文', () => {
  assert.equal(
    forceDashboardLang('https://partner.microsoft.com/zh-cn/dashboard/microsoftedge/abc/listings', 'en'),
    'https://partner.microsoft.com/en-us/dashboard/microsoftedge/abc/listings',
  );
});

test('forceDashboardLang(zh): Edge 英文链接改成中文', () => {
  assert.equal(
    forceDashboardLang('https://partner.microsoft.com/en-us/dashboard/microsoftedge/abc/listings', 'zh'),
    'https://partner.microsoft.com/zh-cn/dashboard/microsoftedge/abc/listings',
  );
});

test('forceDashboardLang: Edge 无 locale 段时插入', () => {
  assert.equal(
    forceDashboardLang('https://partner.microsoft.com/dashboard/microsoftedge/abc/listings', 'en'),
    'https://partner.microsoft.com/en-us/dashboard/microsoftedge/abc/listings',
  );
});

test('forceDashboardLang(en): Chrome 链接 hl=en', () => {
  const r = forceDashboardLang('https://chrome.google.com/webstore/devconsole/123/456/edit', 'en');
  assert.equal(new URL(r).searchParams.get('hl'), 'en');
  assert.match(r, /devconsole\/123\/456\/edit/);
});

test('forceDashboardLang(zh): Chrome 已带 hl=en 时覆盖为 zh-CN', () => {
  const r = forceDashboardLang('https://chrome.google.com/webstore/devconsole/123/456/edit?hl=en', 'zh');
  assert.equal(new URL(r).searchParams.get('hl'), 'zh-CN');
});

test('forceDashboardLang: 其他链接与空值不动', () => {
  assert.equal(forceDashboardLang('https://example.com/x', 'en'), 'https://example.com/x');
  assert.equal(forceDashboardLang('', 'en'), '');
  assert.equal(forceDashboardLang(undefined, 'en'), undefined);
});

test('matchLocaleButtons: 精确优先，Malay 不串到 Malayalam', () => {
  const map = { ml: 'Malayalam', mr: 'Marathi', ms: 'Malay' };
  const buttons = [
    { ariaLabel: 'aria:Malay', name: 'Malay' },          // DOM 顺序 Malay 在前
    { ariaLabel: 'aria:Malayalam', name: 'Malayalam' },
  ];
  const r = matchLocaleButtons(map, buttons, new Set(['ml', 'ms']));
  assert.equal(r.ml, 'aria:Malayalam');
  assert.equal(r.ms, 'aria:Malay');
});

test('matchLocaleButtons: en 不抢 English (United Kingdom) 行', () => {
  const map = { en: 'English', 'en-GB': 'English (United Kingdom)' };
  const buttons = [
    { ariaLabel: 'aria:en-GB', name: 'English (United Kingdom)' }, // UK 行在前
    { ariaLabel: 'aria:en', name: 'English' },
  ];
  const r = matchLocaleButtons(map, buttons, new Set(['en', 'en-GB']));
  assert.equal(r.en, 'aria:en');
  assert.equal(r['en-GB'], 'aria:en-GB');
});

test('matchLocaleButtons: 同义名(nb/no)时有文案的优先占位', () => {
  const map = { nb: 'Norwegian', no: 'Norwegian' }; // 配置里 nb 在前
  const buttons = [{ ariaLabel: 'aria:no', name: 'Norwegian' }];
  // 用户只给了 no：no 应拿到唯一的 Norwegian 行，不被无文案的 nb 抢走
  const r = matchLocaleButtons(map, buttons, new Set(['no']));
  assert.equal(r.no, 'aria:no');
  assert.equal(r.nb, undefined);
});

test('matchLocaleButtons: 子串兜底仍可容忍措辞差异', () => {
  const map = { pt: '葡萄牙语' };
  const buttons = [{ ariaLabel: 'aria:pt', name: '葡萄牙语(巴西)' }];
  const r = matchLocaleButtons(map, buttons, new Set(['pt']));
  assert.equal(r.pt, 'aria:pt');
});

test('parseTerms: 合法 → 清洗后数据 + 空 report', () => {
  const r = parseTerms('{"en":["pdf","merge pdf"],"zh_CN":["PDF"]}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { en: ['pdf', 'merge pdf'], zh_CN: ['PDF'] });
  assert.deepEqual(r.report, {});
});

test('parseTerms: 顶层数组/空对象/非数组值都报错', () => {
  assert.equal(parseTerms('["a"]').ok, false);
  assert.equal(parseTerms('{}').ok, false);
  const r = parseTerms('{"en":"pdf"}');
  assert.equal(r.ok, false);
  assert.match(r.error, /必须是数组/);
});

test('parseTerms: 去空白/丢空串/同语言去重(忽略大小写)', () => {
  const r = parseTerms('{"en":["  pdf  ","",""," ","PDF","split"]}');
  assert.deepEqual(r.data.en, ['pdf', 'split']);
  assert.equal(r.report.en.some((d) => d.reason === '重复'), true);
});

test('parseTerms: 超过 30 字符的词被丢弃并记 report', () => {
  const long = 'x'.repeat(31);
  const r = parseTerms(JSON.stringify({ en: ['ok', long] }));
  assert.deepEqual(r.data.en, ['ok']);
  assert.deepEqual(r.report.en, [{ term: long, reason: '超过30字符' }]);
});

test('parseTerms: 超过 7 个只留前 7，余者记 report', () => {
  const arr = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const r = parseTerms(JSON.stringify({ en: arr }));
  assert.deepEqual(r.data.en, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.equal(r.report.en.length, 2);
  assert.equal(r.report.en.every((d) => d.reason === '超过7个'), true);
});

test('parseTerms: 独立词语 >21 从尾部丢词直到 ≤21', () => {
  // 7 词，每词 4 个互不相同的单词 → 28 个独立词；丢到 ≤21 需去掉 2 个词（剩 5 词=20）。
  const arr = [];
  for (let i = 1; i <= 7; i++) arr.push(`a${i} b${i} c${i} d${i}`);
  const r = parseTerms(JSON.stringify({ en: arr }));
  assert.equal(r.data.en.length, 5);
  assert.equal(r.report.en.filter((d) => d.reason === '独立词语超过21').length, 2);
});

test('parseTerms: 独立词语去重(忽略大小写)不误伤', () => {
  // 同一个单词 pdf 在多词里重复出现只算一个独立词，不触发 21 上限。
  const r = parseTerms('{"en":["pdf a","PDF b","pdf c"]}');
  assert.deepEqual(r.data.en, ['pdf a', 'PDF b', 'pdf c']);
  assert.deepEqual(r.report, {});
});

test('parseTerms: 数组元素非字符串被丢弃', () => {
  const r = parseTerms('{"en":["ok",123,null,"good"]}');
  assert.deepEqual(r.data.en, ['ok', 'good']);
  assert.equal(r.report.en.filter((d) => d.reason === '非字符串').length, 2);
});

test('parseTerms: 空数组合法（按无内容处理）', () => {
  const r = parseTerms('{"en":[]}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.en, []);
});

test('parseTerms: 容忍 UTF-8 BOM', () => {
  const r = parseTerms('﻿{"en":["pdf"]}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.en, ['pdf']);
});
