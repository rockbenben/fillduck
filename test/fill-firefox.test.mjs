import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapAmoLocales } from '../playwright/fill-firefox.mjs';

const AMO = ['en-us', 'en-gb', 'zh-cn', 'pt-br', 'de', 'ja'];

test('mapAmoLocales: 归一化精确匹配，键写法宽容', () => {
  const { queue, unsupported } = mapAmoLocales({ zh_CN: 'Z', 'pt-BR': 'P', DE: 'D' }, AMO);
  assert.deepEqual(queue, [
    { locale: 'zh-cn', text: 'Z' },
    { locale: 'pt-br', text: 'P' },
    { locale: 'de', text: 'D' },
  ]);
  assert.deepEqual(unsupported, []);
});

test('mapAmoLocales: 裸 en 映射到 en-us', () => {
  const { queue } = mapAmoLocales({ en: 'E' }, AMO);
  assert.deepEqual(queue, [{ locale: 'en-us', text: 'E' }]);
});

test('mapAmoLocales: 不支持的语言进 unsupported，不进 queue', () => {
  const { queue, unsupported } = mapAmoLocales({ ko: 'K', ja: 'J' }, AMO);
  assert.deepEqual(queue, [{ locale: 'ja', text: 'J' }]);
  assert.deepEqual(unsupported, ['ko']);
});

test('mapAmoLocales: 同义键先到先得，后到的进 duplicates 不静默丢', () => {
  const { queue, duplicates } = mapAmoLocales({ 'zh-CN': 'A', zh_cn: 'B' }, AMO);
  assert.deepEqual(queue, [{ locale: 'zh-cn', text: 'A' }]);
  assert.deepEqual(duplicates, ['zh_cn']);
});

test('mapAmoLocales: en 与 en-US 并存时后到的进 duplicates', () => {
  const { queue, duplicates } = mapAmoLocales({ en: 'generic', 'en-US': 'polished' }, AMO);
  assert.deepEqual(queue, [{ locale: 'en-us', text: 'generic' }]);
  assert.deepEqual(duplicates, ['en-US']);
});
