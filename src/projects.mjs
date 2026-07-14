// 多项目配置存储：projects/<项目名>/ 下 config.json + descriptions.json + search-terms.json，
// 根 config.json 只记 { activeProject }。服务端(gui/server.mjs)与 CLI(playwright/run.mjs) 共用。
// 所有函数接收 root（仓库根目录），便于测试用临时目录。
import { readFile, writeFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_NAME = 'default';

const rootConfig = (root) => path.join(root, 'config.json');
const projectsDir = (root) => path.join(root, 'projects');

export function projectPaths(root, name) {
  const dir = path.join(projectsDir(root), name);
  return {
    dir,
    config: path.join(dir, 'config.json'),
    descriptions: path.join(dir, 'descriptions.json'),
    terms: path.join(dir, 'search-terms.json'),
  };
}

// 项目名直接做文件夹名：拒绝 Windows 非法字符、首尾点（trim 后判断）与保留设备名。
export function validateName(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return { ok: false, error: '项目名不能为空' };
  if (/[\\/:*?"<>|]/.test(name)) return { ok: false, error: '项目名不能包含 \\ / : * ? " < > | 字符' };
  if (name.startsWith('.') || name.endsWith('.')) return { ok: false, error: '项目名首尾不能是点' };
  // Windows 保留设备名（含带扩展名形式，如 con.txt）作目录名会 mkdir 失败或产生删不掉的目录
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)) {
    return { ok: false, error: '项目名不能用 Windows 保留名（CON / NUL / COM1 等）' };
  }
  return { ok: true, name };
}

// 共享的安全读取（服务端与 CLI 也用，避免三处各写一份、修复时漏改）。
export async function readJsonSafe(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } }
export async function readTextSafe(p) { try { return await readFile(p, 'utf8'); } catch { return ''; } }
async function exists(p) { try { await stat(p); return true; } catch { return false; } }
// 移动文件：源不存在 → false（正常的“没有这份文件”）；其它错误（文件被锁、跨卷等）必须抛出——
// 当成“不存在”会让兜底文件（如退役的 copy.json）顶替真文件，把旧文案填进商店。
async function moveIf(from, to) {
  try { await rename(from, to); return true; }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

// 老布局 → projects/ 布局。每一步都幂等、迁移完成标记（根 config 的 activeProject）最后才写：
// 中途崩溃（断电/Ctrl+C/文件锁抛错）后下次启动会续跑剩余步骤，而不是把半迁移状态当成“已完成”。
export async function migrateIfNeeded(root) {
  const old = (await readJsonSafe(rootConfig(root))) || {};
  const done = typeof old.activeProject === 'string' && (await exists(projectsDir(root)));
  if (done) return false;
  const p = projectPaths(root, DEFAULT_NAME);
  await mkdir(p.dir, { recursive: true });
  if (!(await exists(p.config))) { // 不覆盖：续跑时项目里可能已有真实链接
    await writeFile(p.config, JSON.stringify({
      chromeEditUrl: old.chromeEditUrl || '',
      edgeListingsUrl: old.edgeListingsUrl || '',
      firefoxEditUrl: old.firefoxEditUrl || '',
    }, null, 2));
  }
  // 旧文案【移动】而非复制，避免双份真相。候选顺序：旧 config 的自定义路径（SETUP 文档承诺过）
  // → 默认 descriptions.json → 更老的 copy.json；搜索词同理。命中第一个就停。
  if (!(await exists(p.descriptions))) {
    for (const f of [...new Set([old.descriptionsPath, old.copyPath, 'descriptions.json', 'copy.json'].filter(Boolean))]) {
      if (await moveIf(path.join(root, f), p.descriptions)) break;
    }
  }
  if (!(await exists(p.terms))) {
    for (const f of [...new Set([old.termsPath, 'search-terms.json'].filter(Boolean))]) {
      if (await moveIf(path.join(root, f), p.terms)) break;
    }
  }
  await setActive(root, DEFAULT_NAME);
  return true;
}

export async function listProjects(root) {
  const entries = await readdir(projectsDir(root), { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

export async function setActive(root, name) {
  await writeFile(rootConfig(root), JSON.stringify({ activeProject: name }, null, 2));
}

// 一次 readdir 同时拿到项目列表与当前 active（active 失效时回退第一个并写回；一个不剩则重建空 default）。
// /state 一次请求既要列表又要 active，走这个避免连读两遍目录。
export async function activeAndList(root) {
  let list = await listProjects(root);
  if (list.length === 0) {
    await mkdir(projectPaths(root, DEFAULT_NAME).dir, { recursive: true });
    list = [DEFAULT_NAME];
  }
  const cfg = (await readJsonSafe(rootConfig(root))) || {};
  let name = typeof cfg.activeProject === 'string' ? cfg.activeProject : '';
  if (!list.includes(name)) { name = list[0]; await setActive(root, name); }
  return { name, list };
}

// 总是返回一个【存在的】项目名：active 失效回退第一个并写回；一个不剩则重建空 default。
export async function getActive(root) {
  return (await activeAndList(root)).name;
}

// 重名判定不分大小写：Windows/macOS 文件系统不分大小写，mkdir('Test') 会静默合并进
// 已有的 test 目录——createProject 报成功但目录没创建，setActive 随之失效回退，
// 用户以为在新项目里、实际写进别的项目（数据覆盖）。
const clashWith = (list, name, exceptFrom) =>
  list.find((n) => n !== exceptFrom && n.toLowerCase() === name.toLowerCase());

export async function createProject(root, rawName) {
  const v = validateName(rawName);
  if (!v.ok) return v;
  const clash = clashWith(await listProjects(root), v.name);
  if (clash) return { ok: false, error: '已有同名项目: ' + clash };
  await mkdir(projectPaths(root, v.name).dir, { recursive: true });
  return { ok: true, name: v.name };
}

export async function renameProject(root, from, to) {
  const v = validateName(to);
  if (!v.ok) return v;
  const list = await listProjects(root);
  if (!list.includes(from)) return { ok: false, error: '项目不存在: ' + from };
  const clash = clashWith(list, v.name, from); // 排除自己：项目改自己的大小写是合法改名
  if (clash) return { ok: false, error: '已有同名项目: ' + clash };
  await rename(projectPaths(root, from).dir, projectPaths(root, v.name).dir);
  const cfg = (await readJsonSafe(rootConfig(root))) || {};
  if (cfg.activeProject === from) await setActive(root, v.name);
  return { ok: true, name: v.name };
}

export async function deleteProject(root, name) {
  if (!(await listProjects(root)).includes(name)) return { ok: false, error: '项目不存在: ' + name };
  await rm(projectPaths(root, name).dir, { recursive: true, force: true });
  return { ok: true }; // active 修复与“删光重建 default”由 getActive 兜底
}
