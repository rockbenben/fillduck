// 服务端那半的防线：失败原因必须先经 explainError 翻成人话，不能把原始异常直接给用户。
// 填充脚本那半由 test/logmap.test.mjs 守着，各守各的。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanRawErrorReasons } from './logscan.mjs';

test('服务端不再直接用原始异常（都走 explainError）', () => {
  assert.deepEqual(
    scanRawErrorReasons(['gui/server.mjs']),
    [],
    '这些地方还把原始异常当失败原因给用户看',
  );
});
