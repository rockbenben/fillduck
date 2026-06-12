import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  validateName, migrateIfNeeded, listProjects, getActive, setActive,
  createProject, renameProject, deleteProject, projectPaths,
} from '../src/projects.mjs';

let root;
beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), 'fillduck-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const exists = (p) => stat(p).then(() => true, () => false);

test('validateName: 空名/非法字符/首尾点拒绝，正常名通过', () => {
  assert.equal(validateName('').ok, false);
  assert.equal(validateName('  ').ok, false);
  assert.equal(validateName('a/b').ok, false);
  assert.equal(validateName('a:b').ok, false);
  assert.equal(validateName('.hidden').ok, false);
  assert.deepEqual(validateName(' AI Short '), { ok: true, name: 'AI Short' });
  assert.deepEqual(validateName('我的扩展'), { ok: true, name: '我的扩展' });
});

test('migrateIfNeeded: 旧根文件迁入 projects/default 并改写根 config', async () => {
  await writeFile(path.join(root, 'config.json'), JSON.stringify({ chromeEditUrl: 'C', edgeListingsUrl: 'E' }));
  await writeFile(path.join(root, 'descriptions.json'), '{"en":"hi"}');
  await writeFile(path.join(root, 'search-terms.json'), '{"en":["a"]}');
  assert.equal(await migrateIfNeeded(root), true);
  const p = projectPaths(root, 'default');
  assert.deepEqual(JSON.parse(await readFile(p.config, 'utf8')),
    { chromeEditUrl: 'C', edgeListingsUrl: 'E', firefoxEditUrl: '' });
  assert.equal(await readFile(p.descriptions, 'utf8'), '{"en":"hi"}');
  assert.equal(await readFile(p.terms, 'utf8'), '{"en":["a"]}');
  assert.equal(await exists(path.join(root, 'descriptions.json')), false); // 移动而非复制
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8')), { activeProject: 'default' });
  assert.equal(await migrateIfNeeded(root), false); // 幂等：第二次不再迁移
});

test('migrateIfNeeded: 无 descriptions.json 时兜底老 copy.json', async () => {
  await writeFile(path.join(root, 'copy.json'), '{"en":"old"}');
  await migrateIfNeeded(root);
  assert.equal(await readFile(projectPaths(root, 'default').descriptions, 'utf8'), '{"en":"old"}');
});

test('migrateIfNeeded: 全新用户创建空 default', async () => {
  await migrateIfNeeded(root);
  assert.deepEqual(await listProjects(root), ['default']);
  assert.equal(await getActive(root), 'default');
});

test('create/select/rename/delete 流程', async () => {
  await migrateIfNeeded(root);
  assert.deepEqual(await createProject(root, 'AI Short'), { ok: true, name: 'AI Short' });
  assert.equal((await createProject(root, 'AI Short')).ok, false);          // 重名拒绝
  assert.equal((await createProject(root, 'a|b')).ok, false);               // 非法名拒绝
  assert.deepEqual(await listProjects(root), ['AI Short', 'default']);
  await setActive(root, 'AI Short');
  assert.equal(await getActive(root), 'AI Short');
  assert.deepEqual(await renameProject(root, 'AI Short', 'Short'), { ok: true, name: 'Short' });
  assert.equal(await getActive(root), 'Short');                             // active 跟随改名
  assert.equal((await renameProject(root, '不存在', 'x')).ok, false);
  assert.deepEqual(await deleteProject(root, 'Short'), { ok: true });
  assert.equal(await getActive(root), 'default');                           // 回退到剩余项目
  await deleteProject(root, 'default');
  assert.equal(await getActive(root), 'default');                           // 删光自动重建空 default
  assert.deepEqual(await listProjects(root), ['default']);
});

test('validateName: Windows 保留设备名拒绝', () => {
  for (const n of ['con', 'CON', 'nul', 'com1', 'LPT9', 'aux.txt']) {
    assert.equal(validateName(n).ok, false, n);
  }
  assert.equal(validateName('console').ok, true); // 只拦精确保留名，不误伤前缀相同的正常名
});

test('migrateIfNeeded: 尊重旧 config 的自定义 descriptionsPath/termsPath', async () => {
  await writeFile(path.join(root, 'config.json'), JSON.stringify({
    chromeEditUrl: 'C', descriptionsPath: 'my-copy.json', termsPath: 'my-terms.json',
  }));
  await writeFile(path.join(root, 'my-copy.json'), '{"en":"custom"}');
  await writeFile(path.join(root, 'my-terms.json'), '{"en":["t"]}');
  await migrateIfNeeded(root);
  const p = projectPaths(root, 'default');
  assert.equal(await readFile(p.descriptions, 'utf8'), '{"en":"custom"}');
  assert.equal(await readFile(p.terms, 'utf8'), '{"en":["t"]}');
});

test('migrateIfNeeded: 半迁移状态（上次中断）可续跑完成', async () => {
  await writeFile(path.join(root, 'config.json'), JSON.stringify({ chromeEditUrl: 'C' }));
  await writeFile(path.join(root, 'descriptions.json'), '{"en":"hi"}');
  // 模拟上次崩溃：projects/default 已建、config 已写，但文案没搬、根 config 还是旧格式
  const p = projectPaths(root, 'default');
  await mkdir(p.dir, { recursive: true });
  await writeFile(p.config, JSON.stringify({ chromeEditUrl: 'C', edgeListingsUrl: '', firefoxEditUrl: '' }));
  assert.equal(await migrateIfNeeded(root), true); // 续跑而不是被 projects/ 存在挡住
  assert.equal(await readFile(p.descriptions, 'utf8'), '{"en":"hi"}');
  assert.equal(await exists(path.join(root, 'descriptions.json')), false);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8')), { activeProject: 'default' });
});

test('create/rename: 项目名大小写不同也算重名（Windows/macOS 文件系统不分大小写）', async () => {
  await migrateIfNeeded(root);
  await createProject(root, 'test');
  // Windows 上 mkdir('Test') 会静默合并进已有的 test 目录，随后 setActive('Test') 失效回退，
  // 用户以为在新项目里、实际写进别的项目 —— 必须按不分大小写判重。
  const r = await createProject(root, 'Test');
  assert.equal(r.ok, false);
  const rr = await renameProject(root, 'default', 'TEST');
  assert.equal(rr.ok, false);
  // 但同一项目改自己的大小写是合法改名
  const self = await renameProject(root, 'test', 'TeSt');
  assert.deepEqual(self, { ok: true, name: 'TeSt' });
});

test('getActive: 指向不存在的项目时回退第一个并修复根 config', async () => {
  await migrateIfNeeded(root);
  await createProject(root, 'b');
  await writeFile(path.join(root, 'config.json'), JSON.stringify({ activeProject: '没了' }));
  assert.equal(await getActive(root), 'b'); // 按名排序第一个
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8')), { activeProject: 'b' });
});
