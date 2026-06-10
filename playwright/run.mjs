// Playwright 入口：用真实浏览器(真键盘输入)在 Chrome / Edge 后台填多语言描述。
// 登录态存在 .auth-profile（持久化 profile），首次手动登录一次后复用。
//
// 用法：
//   node playwright/run.mjs --login          首次登录：打开两个后台让你手动登录，登录完 Ctrl+C
//   node playwright/run.mjs --store chrome    填 Chrome
//   node playwright/run.mjs --store edge      填 Edge
//   node playwright/run.mjs --store all       两个都填
//
// 配置见 config.json（从 config.example.json 复制改）。描述见 descriptions.json，搜索词见 search-terms.json（仅 Edge）。
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInput, parseTerms } from '../src/core.mjs';
import { launchPersistent } from './browser.mjs';
import { fillChrome } from './fill-chrome.mjs';
import { fillEdge } from './fill-edge.mjs';
import { fillEdgeSearchTerms } from './fill-edge-terms.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, '.auth-profile');

function flag(name) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return null;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

function log(m) {
  console.log('[' + new Date().toISOString().slice(11, 19) + '] ' + m);
}

async function loadConfig() {
  // 直接用用户链接（账号原本的界面语言）；填充时自动识别中/英界面，非中英才强制英文重载。
  const raw = await readFile(path.join(ROOT, 'config.json'), 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const cfg = await loadConfig().catch(() => ({}));
  const ctx = await launchPersistent(PROFILE_DIR, log);
  const page = ctx.pages()[0] || (await ctx.newPage());

  if (flag('login')) {
    log('打开两个后台，请在浏览器里分别登录 Google(Chrome后台) 和 Microsoft(Edge后台)。');
    log('登录态会存进 .auth-profile，下次免登录。登录完成后按 Ctrl+C 结束。');
    if (cfg.chromeEditUrl) await page.goto(cfg.chromeEditUrl).catch(() => {});
    if (cfg.edgeListingsUrl) {
      const p2 = await ctx.newPage();
      await p2.goto(cfg.edgeListingsUrl).catch(() => {});
    }
    await new Promise(() => {}); // 挂住，等用户 Ctrl+C
    return;
  }

  const store = flag('store');
  if (!store) { log('请加 --store chrome|edge|all（或 --login 先登录）'); await ctx.close(); return; }

  // 描述：优先 descriptionsPath（默认 descriptions.json），文件【不存在】才兜底老的 copy.json。
  // 按存在与否而非内容判断：空的 descriptions.json 表示用户清空了描述，不能让旧 copy.json“还魂”。
  const readMaybe = async (p) => { try { return await readFile(path.join(ROOT, p), 'utf8'); } catch { return null; } };
  const descPath = cfg.descriptionsPath || cfg.copyPath || 'descriptions.json';
  const descRaw = (await readMaybe(descPath)) ?? (await readMaybe('copy.json')) ?? '';
  const termsRaw = (await readMaybe(cfg.termsPath || 'search-terms.json')) ?? '';

  const descParsed = descRaw.trim() ? parseInput(descRaw) : { ok: true, data: {} };
  const termsParsed = termsRaw.trim() ? parseTerms(termsRaw) : { ok: true, data: {} };
  if (descRaw.trim() && !descParsed.ok) { log('描述 JSON 有问题：' + descParsed.error); await ctx.close(); process.exit(1); }
  if (termsRaw.trim() && !termsParsed.ok) { log('搜索词 JSON 有问题：' + termsParsed.error); await ctx.close(); process.exit(1); }
  const descData = descParsed.data;
  const termsData = termsParsed.data;
  const hasDesc = Object.keys(descData).length > 0;
  const hasTerms = Object.keys(termsData).length > 0;
  if (!hasDesc && !hasTerms) { log('没有可填的内容：descriptions.json 与 search-terms.json 都为空。'); await ctx.close(); process.exit(1); }

  try {
    if (store === 'chrome' || store === 'all') {
      if (!cfg.chromeEditUrl) throw new Error('config.json 缺 chromeEditUrl');
      if (!hasDesc) log('Chrome 无描述可填，跳过（搜索词仅 Edge）。');
      else { log('打开 Chrome 后台…'); await page.goto(cfg.chromeEditUrl, { waitUntil: 'load' }); await fillChrome(page, descData, log); }
    }
    if (store === 'edge' || store === 'all') {
      if (!cfg.edgeListingsUrl) throw new Error('config.json 缺 edgeListingsUrl');
      log('打开 Edge 后台…');
      await page.goto(cfg.edgeListingsUrl, { waitUntil: 'load' });
      if (hasDesc) await fillEdge(page, descData, log);
      if (hasTerms) await fillEdgeSearchTerms(page, termsData, log);
    }
    log('全部完成。浏览器保持打开，请人工检查后提交。检查完手动关闭或按 Ctrl+C。');
  } catch (e) {
    log('出错：' + e.message);
    log('浏览器保持打开，方便你看现场。修好后重跑。');
  }
  await new Promise(() => {}); // 不自动关，留给用户检查
}

main();
