// Playwright 入口：用真实浏览器(真键盘输入)在 Chrome / Edge 后台填多语言描述。
// 登录态存在 .auth-profile（持久化 profile），首次手动登录一次后复用。
//
// 用法：
//   node playwright/run.mjs --login            首次登录：打开各后台让你手动登录，登录完 Ctrl+C
//   node playwright/run.mjs --store chrome      填 Chrome
//   node playwright/run.mjs --store edge        填 Edge
//   node playwright/run.mjs --store firefox     填 Firefox (AMO)
//   node playwright/run.mjs --store all         全部
//   加 --project <项目名> 指定项目（缺省用控制台当前选中的项目）
//
// 配置与文案在 projects/<项目名>/ 下（config.json / descriptions.json / search-terms.json）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseInput, parseTerms } from '../src/core.mjs';
import { migrateIfNeeded, getActive, listProjects, projectPaths, readJsonSafe, readTextSafe } from '../src/projects.mjs';
import { launchPersistent } from './browser.mjs';
import { fillChrome } from './fill-chrome.mjs';
import { fillEdge } from './fill-edge.mjs';
import { fillEdgeSearchTerms } from './fill-edge-terms.mjs';
import { fillFirefox } from './fill-firefox.mjs';

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

async function main() {
  // 多项目：默认用控制台当前选中的项目，--project 可指定。老布局首次运行时自动迁入 projects/default/。
  await migrateIfNeeded(ROOT);
  const projFlag = flag('project');
  // --project 后面没跟项目名时 flag() 返回 true；静默回退到当前项目会把别的项目文案填进商店，必须显式报错。
  if (projFlag === true) {
    log('--project 需要带项目名，例如：--project 我的扩展');
    process.exit(1);
  }
  const projName = typeof projFlag === 'string' ? projFlag : await getActive(ROOT);
  const projList = await listProjects(ROOT);
  if (!projList.includes(projName)) {
    log(`项目不存在：${projName}（现有：${projList.join('、') || '无'}）`);
    process.exit(1);
  }
  const paths = projectPaths(ROOT, projName);
  log(`项目：${projName}`);
  // 直接用用户链接（账号原本的界面语言）；填充时自动识别中/英界面，非中英才强制英文重载。
  const cfg = (await readJsonSafe(paths.config)) || {};
  const ctx = await launchPersistent(PROFILE_DIR, log);
  const page = ctx.pages()[0] || (await ctx.newPage());

  if (flag('login')) {
    // 一个链接都没配时会开着空白浏览器干挂，用户不知道下一步干嘛——直接提示并退出。
    if (!cfg.chromeEditUrl && !cfg.edgeListingsUrl && !cfg.firefoxEditUrl) {
      log(`项目「${projName}」还没配置任何后台链接。请先在控制台（npm start）里填好链接，再来登录。`);
      await ctx.close();
      process.exit(1);
    }
    log('打开各后台，请在浏览器里分别登录 Google(Chrome) / Microsoft(Edge) / Mozilla(Firefox)。');
    log('登录态会存进 .auth-profile，下次免登录。登录完成后按 Ctrl+C 结束。');
    // 并行加载：串行 goto 时后面的登录页要等前面的重型后台 load 完才开始
    const opens = [];
    if (cfg.chromeEditUrl) opens.push(page.goto(cfg.chromeEditUrl).catch(() => {}));
    if (cfg.edgeListingsUrl) opens.push(ctx.newPage().then((p) => p.goto(cfg.edgeListingsUrl)).catch(() => {}));
    if (cfg.firefoxEditUrl) opens.push(ctx.newPage().then((p) => p.goto(cfg.firefoxEditUrl)).catch(() => {}));
    await Promise.all(opens);
    await new Promise(() => {}); // 挂住，等用户 Ctrl+C
    return;
  }

  const store = flag('store');
  if (!store) { log('请加 --store chrome|edge|firefox|all（或 --login 先登录）'); await ctx.close(); return; }
  // 拼错的 store 值（--store crome）或没带值（--store）若不拦，下面三个分支都不命中，
  // 最后照样打“全部完成”——什么都没填却报成功。
  if (!['chrome', 'edge', 'firefox', 'all'].includes(store)) {
    log(`不认识的 --store 值：${store}（可用：chrome | edge | firefox | all）`);
    await ctx.close();
    process.exit(1);
  }

  const descRaw = await readTextSafe(paths.descriptions);
  const termsRaw = await readTextSafe(paths.terms);

  const descParsed = descRaw.trim() ? parseInput(descRaw) : { ok: true, data: {} };
  const termsParsed = termsRaw.trim() ? parseTerms(termsRaw) : { ok: true, data: {} };
  if (descRaw.trim() && !descParsed.ok) { log('描述 JSON 有问题：' + descParsed.error); await ctx.close(); process.exit(1); }
  if (termsRaw.trim() && !termsParsed.ok) { log('搜索词 JSON 有问题：' + termsParsed.error); await ctx.close(); process.exit(1); }
  const descData = descParsed.data;
  const termsData = termsParsed.data;
  const hasDesc = Object.keys(descData).length > 0;
  const hasTerms = Object.keys(termsData).length > 0;
  if (!hasDesc && !hasTerms) { log('没有可填的内容：descriptions.json 与 search-terms.json 都为空。'); await ctx.close(); process.exit(1); }

  // --store all 时按目标隔离错误：Chrome 出错不应让 Edge/Firefox 直接不跑；
  // 单选目标时保持原样抛错（缺链接就是配置错误，应当显式失败）。
  const failures = [];
  const runTarget = async (name, fn) => {
    try { await fn(); }
    catch (e) {
      if (store !== 'all') throw e;
      failures.push(name);
      log(`❌ ${name} 出错：${e.message}（继续跑其余目标）`);
    }
  };
  // 缺链接的处理分两种：单选该目标 = 配置错误，显式抛错；--store all = 没配就跳过
  //（迁移会给所有老项目写入空 firefoxEditUrl，按错误处理会让只配了 Chrome+Edge 的用户每次 all 都收到失败报告）。
  const urlOrSkip = (val, key, label) => {
    if (val) return true;
    if (store === 'all') { log(`没填 ${label} 链接，跳过。`); return false; }
    throw new Error(`config.json 缺 ${key}`);
  };
  try {
    if (store === 'chrome' || store === 'all') {
      await runTarget('Chrome', async () => {
        if (!urlOrSkip(cfg.chromeEditUrl, 'chromeEditUrl', 'Chrome')) return;
        if (!hasDesc) log('Chrome 无描述可填，跳过（搜索词仅 Edge）。');
        else { log('打开 Chrome 后台…'); await page.goto(cfg.chromeEditUrl, { waitUntil: 'load' }); await fillChrome(page, descData, log); }
      });
    }
    if (store === 'edge' || store === 'all') {
      await runTarget('Edge', async () => {
        if (!urlOrSkip(cfg.edgeListingsUrl, 'edgeListingsUrl', 'Edge')) return;
        log('打开 Edge 后台…');
        await page.goto(cfg.edgeListingsUrl, { waitUntil: 'load' });
        if (hasDesc) await fillEdge(page, descData, log);
        if (hasTerms) await fillEdgeSearchTerms(page, termsData, log);
      });
    }
    if (store === 'firefox' || store === 'all') {
      await runTarget('Firefox', async () => {
        if (!urlOrSkip(cfg.firefoxEditUrl, 'firefoxEditUrl', 'Firefox')) return;
        if (!hasDesc) log('Firefox 无描述可填，跳过（搜索词仅 Edge）。');
        else { log('打开 Firefox 后台…'); await page.goto(cfg.firefoxEditUrl, { waitUntil: 'load' }); await fillFirefox(page, descData, log); }
      });
    }
    if (failures.length) log(`完成，但这些目标出错需重跑：${failures.join('、')}。浏览器保持打开，请检查现场。`);
    else log('全部完成。浏览器保持打开，请人工检查后提交。检查完手动关闭或按 Ctrl+C。');
  } catch (e) {
    log('出错：' + e.message);
    log('浏览器保持打开，方便你看现场。修好后重跑。');
  }
  await new Promise(() => {}); // 不自动关，留给用户检查
}

main();
