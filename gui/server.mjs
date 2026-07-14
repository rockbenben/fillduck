// 本地网页 GUI：填两个后台链接 + 多语言 JSON，点按钮自动填充。复用 Playwright 填充逻辑。
// 跑：npm start  → 自动打开 http://localhost:4599
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parseInput, parseTerms } from '../src/core.mjs';
import {
  migrateIfNeeded, listProjects, getActive, setActive, activeAndList,
  createProject, renameProject, deleteProject, projectPaths,
  readJsonSafe, readTextSafe,
} from '../src/projects.mjs';
import { launchPersistent } from '../playwright/browser.mjs';
import { fillChrome } from '../playwright/fill-chrome.mjs';
import { fillEdge } from '../playwright/fill-edge.mjs';
import { fillEdgeSearchTerms } from '../playwright/fill-edge-terms.mjs';
import { fillFirefox } from '../playwright/fill-firefox.mjs';
import { ALL_UNITS, STORE_TO_UNITS } from '../src/units.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, '.auth-profile');
const WEB_DIST = path.join(__dirname, 'web', 'dist'); // 构建好的 antd6 前端

await migrateIfNeeded(ROOT); // 老布局（根目录三文件）首次启动时迁入 projects/default/
const PORT = 4599;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json',
};

let ctx = null;          // 常驻浏览器上下文（登录与填充共用）
let ctxInit = null;      // 正在初始化的 promise，避免并发重复启动同一 profile
const loginPages = new Map(); // 'chrome'|'edge'|'firefox' -> 本工具为该后台开过的页（复用，防标签堆积）
let busy = false;
let cancelRequested = false; // 停止标志：填充循环每项开始前检查
const clients = new Set(); // SSE 连接
const logBuffer = [];       // { seq, msg }
const SSE_EPOCH = randomUUID(); // 本次进程启动标识：写进事件 id 前缀，客户端据此识别“服务重启”并清屏重来。
// 用 UUID 而非 Date.now()：两次启动落在同一毫秒会撞出相同 epoch，客户端认不出重启、maxSeq 不复位，
// 新进程从 seq=1 起的日志全被当成“已见过”而丢弃、面板假死。UUID 每次进程必不同，杜绝这种碰撞。
let logSeq = 0;              // 日志单调序号：客户端用 Last-Event-ID 只补拉断线期间漏掉的行，既不清屏也不重复

// SSE 一帧：日志帧带 id（epoch.seq），状态帧不带（状态帧不能推进 Last-Event-ID，否则重连会漏发日志）。
function sseFrame(obj, id) { return (id ? `id: ${id}\n` : '') + `data: ${JSON.stringify(obj)}\n\n`; }
function broadcast(obj, id) {
  const line = sseFrame(obj, id);
  for (const res of clients) { try { res.write(line); } catch (e) { /* 忽略断开 */ } }
}
function log(msg) {
  const seq = ++logSeq;
  logBuffer.push({ seq, msg });
  if (logBuffer.length > 800) logBuffer.shift();
  console.log(msg); // 同时打到黑窗口，方便排查
  // epoch/seq 也放进 JSON：状态帧不带 id（不能推进 Last-Event-ID），客户端靠 JSON 里的 epoch 才能
  // 在“重启后首帧只是空缓冲的状态帧”时也及时清屏；seq 供客户端单调去重（Last-Event-ID 被抹掉时兜底）。
  broadcast({ type: 'log', msg, epoch: SSE_EPOCH, seq }, `${SSE_EPOCH}.${seq}`);
}
function setStatus(status) { broadcast({ type: 'status', status, epoch: SSE_EPOCH }); }

// 当前激活项目的名字与文件路径（active 失效时 getActive 会自动回退修复）。
async function activeProject() {
  const name = await getActive(ROOT);
  return { name, paths: projectPaths(ROOT, name) };
}

// 项目文件互斥锁：/save 的三连写与 /projects 的改名/删除若交错执行，会把文件写进
// 刚被移走的目录（部分写入、ENOENT）。所有“写项目文件/动项目目录”的操作串行化。
let fsChain = Promise.resolve();
function serialized(fn) {
  const run = fsChain.then(fn, fn);
  fsChain = run.then(() => {}, () => {}); // 失败不断链
  return run;
}

async function ensureBrowser() {
  if (ctx) return ctx;
  // 并发调用（如同时点登录与填充）共用同一次启动，避免对同一 profile 启两个实例。
  if (!ctxInit) {
    log('启动浏览器…');
    ctxInit = launchPersistent(PROFILE_DIR, log)
      .then((c) => { ctx = c; c.on('close', () => { ctx = null; ctxInit = null; }); return c; })
      .catch((e) => { ctxInit = null; throw e; });
  }
  return ctxInit;
}
async function getPage() { const c = await ensureBrowser(); return c.pages()[0] || (await c.newPage()); }

async function doLogin() {
  // 填充进行时不能再登录：doLogin 会对共享的 pages()[0] 发起 goto，并新开 Edge 页，
  // 与正在跑的 fillChrome/fillEdge 抢同一个 page，导致运行中的填充被导航打断。
  if (busy) { log('正在填充中，请等当前任务结束再登录。'); return; }
  try {
    const cfg = await serialized(async () => {
      const { paths } = await activeProject();
      return (await readJsonSafe(paths.config)) || {};
    });
    // 没有任何后台链接就别开空白浏览器：登录需要先打开后台页面。
    if (!cfg.chromeEditUrl && !cfg.edgeListingsUrl && !cfg.firefoxEditUrl) {
      log('请先填后台链接（至少一个）再点登录。');
      return;
    }
    const c = await ensureBrowser();
    log('请在弹出的浏览器里登录 Google / Microsoft / Mozilla（按你填的后台），登录后回来点“填充”。');
    // 复用本工具自己开过的登录页：每次点登录都 newPage 会堆积重型后台标签（点 N 次多 2N 个、
    // 永不回收）。复用的判定不能靠 URL 匹配——后台会做规范化重定向（AMO 加语言段、
    // devconsole 插 /u/0/、未登录落在 accounts.google.com），按配置前缀永远配不上；
    // 按整源匹配又会劫持用户手动开的同源页面。改为【显式登记】：本工具为某后台开过的页
    // 记在 loginPages（按目标键），下次直接复用；页面被用户关掉则重开。绝不触碰别的页。
    const pageFor = async (key, fallbackFirst) => {
      const prev = loginPages.get(key);
      if (prev && !prev.isClosed()) return prev;
      const first = c.pages()[0];
      let p;
      if (fallbackFirst && first && first.url() === 'about:blank' && ![...loginPages.values()].includes(first)) {
        p = first; // 启动时的空白首页给【第一个要打开的后台】复用，避免它一直空挂着
      } else {
        p = await c.newPage();
      }
      loginPages.set(key, p);
      return p;
    };
    // 三个后台页并行加载：串行 goto 时 Firefox 页要等前两个重型后台 load 完才开始，多等 10~30s。
    // pageFor 依次 await 完成分配后再并行 goto，分配阶段无竞态。
    // 启动空白页只由第一个真正要开的后台认领（此前写死给 Chrome，只配了 Edge/Firefox 时空白页永远空挂）。
    const opens = [];
    let firstOpen = true;
    const claimBlank = () => { const f = firstOpen; firstOpen = false; return f; };
    if (cfg.chromeEditUrl) opens.push((await pageFor('chrome', claimBlank())).goto(cfg.chromeEditUrl).catch((e) => log('Chrome 打开失败：' + e.message)));
    if (cfg.edgeListingsUrl) opens.push((await pageFor('edge', claimBlank())).goto(cfg.edgeListingsUrl).catch((e) => log('Edge 打开失败：' + e.message)));
    if (cfg.firefoxEditUrl) opens.push((await pageFor('firefox', claimBlank())).goto(cfg.firefoxEditUrl).catch((e) => log('Firefox 打开失败：' + e.message)));
    await Promise.all(opens);
  } catch (e) {
    log('❌ 登录启动失败：' + e.message);
  }
}

async function doRun(input) {
  // input: { units?: string[] } 或旧式 { store }
  const units = Array.isArray(input.units) && input.units.length
    ? input.units.filter((u) => ALL_UNITS.includes(u))
    : (STORE_TO_UNITS[input.store] || []);
  log(`收到填充请求：${units.join(' + ') || '(空)'}`);
  if (!units.length) { log('⚠️ 没有选中任何执行目标。'); return; }
  if (busy) { log('已有任务在跑，请稍候。'); return; }
  busy = true; cancelRequested = false; setStatus('running');
  const want = (u) => units.includes(u);
  const shouldStop = () => cancelRequested;
  try {
    // 起步读取入锁：点「开始填充」常发生在防抖自动保存落盘的同一瞬间（先手动保存、
    // 残留的防抖定时器随后又写一次），锁外读会撞上截断中的文件，拿空/半截文案开跑。
    const { projName, cfg, descRaw, termsRaw } = await serialized(async () => {
      const { name, paths } = await activeProject();
      return {
        projName: name,
        cfg: (await readJsonSafe(paths.config)) || {},
        descRaw: await readTextSafe(paths.descriptions),
        termsRaw: await readTextSafe(paths.terms),
      };
    });
    log(`项目：${projName}`);
    const descParsed = descRaw.trim() ? parseInput(descRaw) : { ok: true, data: {} };
    const termsParsed = termsRaw.trim() ? parseTerms(termsRaw) : { ok: true, data: {} };
    if (descRaw.trim() && !descParsed.ok) log('描述 JSON 有问题：' + descParsed.error);
    if (termsRaw.trim() && !termsParsed.ok) log('搜索词 JSON 有问题：' + termsParsed.error);
    let descData = descParsed.ok ? descParsed.data : {};
    let termsData = termsParsed.ok ? termsParsed.data : {};
    // 语言子集：前端可只让部分语言生效（未传或非数组 = 全部）。描述与搜索词都按同一份白名单过滤，
    // 这样取消勾选的语言既不写描述也不写搜索词。空数组 = 一种都没选，下面的“无内容”守卫会拦住。
    if (Array.isArray(input.locales)) {
      const allow = new Set(input.locales);
      const pick = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => allow.has(k)));
      const beforeD = Object.keys(descData).length;
      const beforeT = Object.keys(termsData).length;
      descData = pick(descData);
      termsData = pick(termsData);
      const dropped = (beforeD - Object.keys(descData).length) + (beforeT - Object.keys(termsData).length);
      // 报“实际命中的语言数”而非“勾选数”：勾选里可能有磁盘上并不存在的语言（前端状态与文件不同步），
      // 用勾选数会与随后可能触发的“无内容”守卫自相矛盾。
      const kept = new Set([...Object.keys(descData), ...Object.keys(termsData)]).size;
      log(`按所选语言过滤：生效 ${kept} 种语言${dropped ? `，已排除未勾选的 ${dropped} 项` : ''}`);
    }
    const hasDesc = Object.keys(descData).length > 0;
    const hasTerms = Object.keys(termsData).length > 0;
    if (!hasDesc && !hasTerms) { log('⚠️ 没有可填的内容：描述与搜索词都为空或有误。'); return; }

    // 浏览器惰性启动：确认至少有一个目标真正要跑时才弹（否则“无目标”也会白白开一个浏览器窗口）。
    let page = null;
    const getP = async () => (page || (page = await getPage()));
    let ran = 0;          // 实际开跑的目标数，用于诚实汇报
    const targetErrors = []; // 出错的目标：单个后台失败不拖累其余目标
    // 每个目标独立 try/catch：选「全部」时 Chrome 抛错不应让 Edge/Firefox 直接不跑。
    const runTarget = async (name, fn) => {
      try { await fn(); ran++; return true; }
      catch (e) { targetErrors.push(name); log(`❌ ${name} 出错：${e.message}（继续跑其余目标）`); return false; }
    };
    if (!cancelRequested && want('chrome-desc')) {
      if (!cfg.chromeEditUrl) log('没填 Chrome 链接，跳过。');
      else if (!hasDesc) log('Chrome 无描述可填，跳过。');
      else await runTarget('Chrome 描述', async () => { const p = await getP(); log('打开 Chrome 后台…'); await p.goto(cfg.chromeEditUrl, { waitUntil: 'load' }); await fillChrome(p, descData, log, shouldStop); });
    }
    if (!cancelRequested && (want('edge-desc') || want('edge-terms'))) {
      const doDesc = want('edge-desc') && hasDesc;
      const doTerms = want('edge-terms') && hasTerms;
      if (!cfg.edgeListingsUrl) log('没填 Edge 链接，跳过。');
      else if (!doDesc && !doTerms) {
        if (want('edge-desc') && !hasDesc) log('Edge 描述：无文案可填，跳过。');
        if (want('edge-terms') && !hasTerms) log('Edge 搜索词：无数据可填，跳过。');
      } else {
        // 描述与搜索词各自独立计入 ran / targetErrors。合成一个目标时，描述已写进草稿、
        // 搜索词才失败会把整个 Edge 记成“全都没填”，从而误报“本次没有填充任何内容”——诱导用户
        // 重跑或不信任已写入的描述草稿。两者共用同一个 Edge 页，只在首次真正要跑时打开一次。
        // 描述与搜索词共用同一 Edge 页。若前一个单元出错，页面上可能残留打开的编辑弹层，挡住下一个
        // 单元探测语言列表（会把本来数据没问题的搜索词也拖成“出错需重跑”）。故出错后给下一个单元
        // 重新导航一次列表页清场，代价只是多一次加载、且仅在真出错时才付。
        let edgeOpened = false;
        let edgeDirty = false;
        const openEdge = async () => {
          const p = await getP();
          if (!edgeOpened || edgeDirty) {
            log(edgeDirty ? '重开 Edge 后台（清理上一步残留）…' : '打开 Edge 后台…');
            await p.goto(cfg.edgeListingsUrl, { waitUntil: 'load' });
            edgeOpened = true; edgeDirty = false;
          }
          return p;
        };
        if (!cancelRequested && doDesc) {
          await runTarget('Edge 描述', async () => { await fillEdge(await openEdge(), descData, log, shouldStop); });
          // 描述阶段结束后一律标记“脏”：fillEdge 收尾可能整页重载、停在弹层、或被弹回登录，
          // 搜索词单元前重新导航一次列表页从干净状态开始（否则描述的收尾重载会把好好的搜索词也拖挂）。
          edgeDirty = true;
        }
        if (!cancelRequested && doTerms) await runTarget('Edge 搜索词', async () => { await fillEdgeSearchTerms(await openEdge(), termsData, log, shouldStop); });
        if (want('edge-desc') && !hasDesc) log('Edge 描述：无文案可填，已跳过。');
        if (want('edge-terms') && !hasTerms) log('Edge 搜索词：无数据可填，已跳过。');
      }
    }
    if (!cancelRequested && want('firefox-desc')) {
      if (!cfg.firefoxEditUrl) log('没填 Firefox 链接，跳过。');
      else if (!hasDesc) log('Firefox 无描述可填，跳过。');
      else await runTarget('Firefox', async () => { const p = await getP(); log('打开 Firefox 后台…'); await p.goto(cfg.firefoxEditUrl, { waitUntil: 'load' }); await fillFirefox(p, descData, log, shouldStop); });
    }
    if (cancelRequested) log('⏹ 已停止（已填的部分保留）。');
    else if (ran === 0 && targetErrors.length === 0) log('⚠️ 没有可填充的目标：请确认所选后台的链接已填、且对应的描述 / 搜索词不为空且格式正确。');
    else if (ran === 0) log(`❌ 全部目标都出错，本次没有填充任何内容：${targetErrors.join('、')}（浏览器保留现场）`);
    else if (targetErrors.length) log(`⚠️ 完成，但这些目标出错需重跑：${targetErrors.join('、')}（浏览器保留现场）`);
    else log('✅ 完成。请在浏览器里人工检查后提交。');
  } catch (e) {
    log('❌ 出错：' + e.message + '（浏览器保留现场，修好后重跑）');
  } finally {
    busy = false; cancelRequested = false; setStatus('idle');
  }
}

function readBody(req) {
  // 按 Buffer 收集再整体转码：逐块 += 在分块边界切开多字节字符（中文项目名/文案）会乱码。
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => { chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}
function sendJson(res, obj) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      const html = await readFile(path.join(WEB_DIST, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
    }
    if (req.method === 'GET' && url.pathname === '/state') {
      // 读也入锁：writeFile 是「先截断再写」，锁外读会撞上半截文件——
      // 撕裂的文案被表单载入后，自动保存还会把半截内容写回磁盘固化成永久损坏。
      const snap = await serialized(async () => {
        // 一次 readdir 同时拿到列表与 active（原先 activeProject→getActive 已 readdir 一遍，
        // 这里又 listProjects 一遍，等于每次 /state 读两遍 projects/ 目录）。
        const { name, list } = await activeAndList(ROOT);
        const paths = projectPaths(ROOT, name);
        const cfg = (await readJsonSafe(paths.config)) || {};
        return {
          projects: list, active: name,
          chromeEditUrl: cfg.chromeEditUrl || '', edgeListingsUrl: cfg.edgeListingsUrl || '',
          firefoxEditUrl: cfg.firefoxEditUrl || '',
          copy: await readTextSafe(paths.descriptions), terms: await readTextSafe(paths.terms),
        };
      });
      sendJson(res, { ...snap, busy });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/save') {
      const body = JSON.parse(await readBody(req));
      const r = await serialized(async () => {
        const { name, paths } = await activeProject();
        // 必须带项目名且与当前一致：① 切换瞬间残留的防抖保存带旧名 → 拒，免得 A 串写进 B；
        // ② 不带名（如 /state 加载失败后表单是空的）→ 也拒，免得空表单清空真实项目。
        if (body.project !== name) {
          log(`忽略一次过期保存（来自项目「${body.project || '(空)'}」，当前是「${name}」）。`);
          return { ok: false, error: 'stale project' };
        }
        await writeFile(paths.config, JSON.stringify({
          chromeEditUrl: body.chromeEditUrl || '', edgeListingsUrl: body.edgeListingsUrl || '',
          firefoxEditUrl: body.firefoxEditUrl || '',
        }, null, 2));
        await writeFile(paths.descriptions, body.copy || '');
        await writeFile(paths.terms, body.terms || '');
        log('已保存链接、描述与搜索词。');
        return { ok: true };
      });
      sendJson(res, r); return;
    }
    if (req.method === 'POST' && url.pathname.startsWith('/projects/')) {
      const body = JSON.parse(await readBody(req));
      const action = url.pathname.slice('/projects/'.length);
      const r = await serialized(async () => {
        // busy 检查放在锁内、readBody 之后：原先在 readBody 前检查，等待请求体期间
        // /run 可能已开跑（doRun 已缓存项目路径），改名/删除会从它脚下抽走目录。
        if (busy) return { ok: false, error: '正在填充中，请先停止再操作项目。' };
        if (action === 'select') {
          const list = await listProjects(ROOT);
          if (!list.includes(body.name)) return { ok: false, error: '项目不存在: ' + body.name };
          await setActive(ROOT, body.name);
          log(`已切换到项目「${body.name}」。`);
          return { ok: true };
        }
        if (action === 'create') {
          const cr = await createProject(ROOT, body.name);
          if (cr.ok) { await setActive(ROOT, cr.name); log(`已新建项目「${cr.name}」并切换。`); }
          return cr;
        }
        if (action === 'rename') {
          const rr = await renameProject(ROOT, body.from, body.to);
          if (rr.ok) log(`项目「${body.from}」已改名为「${rr.name}」。`);
          return rr;
        }
        if (action === 'delete') {
          const dr = await deleteProject(ROOT, body.name);
          if (dr.ok) { await getActive(ROOT); log(`已删除项目「${body.name}」。`); } // getActive 顺手修复 active/重建 default
          return dr;
        }
        return { ok: false, error: '未知操作' };
      });
      sendJson(res, r); return;
    }
    if (req.method === 'POST' && url.pathname === '/login') { doLogin(); sendJson(res, { ok: true }); return; }
    if (req.method === 'POST' && url.pathname === '/stop') {
      if (busy) { cancelRequested = true; log('⏹ 收到停止请求，完成当前这一项后停下…'); }
      else log('当前没有正在跑的任务。');
      sendJson(res, { ok: true }); return;
    }
    if (req.method === 'POST' && url.pathname === '/run') {
      const body = JSON.parse(await readBody(req));
      // 显式传了 units（哪怕空数组）就按 units 走——空数组应是「没选目标」，
      // 不能再用 store:'all' 兜底，否则「什么都不选」会被翻转成「全填四个后台」。
      // 只有完全没带 units 字段的旧式请求才回退 store。locales（可选）= 只让这些语言生效。
      const payload = 'units' in body ? { units: body.units } : { store: body.store || 'all' };
      if (Array.isArray(body.locales)) payload.locales = body.locales;
      doRun(payload); // 异步跑，日志走 SSE
      sendJson(res, { ok: true }); return;
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      // 断线重连时浏览器会带上 Last-Event-ID（epoch.seq）。同一进程内只补发它之后的日志，避免整段重复；
      // epoch 不同说明服务重启过（客户端已看到的旧序号在新进程里无意义）→ 回放整段，客户端会据 epoch 变化清屏。
      // 首次连接（无 Last-Event-ID）fromSeq=0，等同回放全部。拼成一段一次写出，避免逐条 write 的系统调用。
      const [lastEpoch, lastSeqRaw] = String(req.headers['last-event-id'] || '').split('.');
      const fromSeq = lastEpoch === String(SSE_EPOCH) ? (Number(lastSeqRaw) || 0) : 0;
      let replay = 'retry: 2000\n\n';
      for (const m of logBuffer) if (m.seq > fromSeq) replay += sseFrame({ type: 'log', msg: m.msg, epoch: SSE_EPOCH, seq: m.seq }, `${SSE_EPOCH}.${m.seq}`);
      replay += `data: ${JSON.stringify({ type: 'status', status: busy ? 'running' : 'idle', epoch: SSE_EPOCH })}\n\n`;
      res.write(replay);
      clients.add(res);
      res.on('error', () => clients.delete(res)); // 客户端断开时写入会触发 error，捕获避免崩进程
      req.on('close', () => clients.delete(res));
      return;
    }
    // 其余按构建产物里的静态资源处理（/assets/* 等）
    if (req.method === 'GET') {
      const rel = url.pathname.replace(/^\/+/, '');
      const filePath = path.join(WEB_DIST, rel);
      if (filePath.startsWith(WEB_DIST)) {
        try {
          const buf = await readFile(filePath);
          res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
          res.end(buf); return;
        } catch (e) { /* 落到 404 */ }
      }
    }
    res.writeHead(404); res.end('not found');
  } catch (e) {
    res.writeHead(500); res.end('error: ' + e.message);
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`端口 ${PORT} 已被占用 —— 可能已经在运行了。直接打开 http://localhost:${PORT} 即可。`);
    console.log('（如果想重启：关掉之前那个黑窗口，或结束占用的 node 进程，再重跑。）');
    process.exit(0);
  }
  console.error(e); process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => { // 仅本机可访问，不暴露到局域网
  const u = `http://127.0.0.1:${PORT}`; // 与绑定地址一致，避免 localhost 解析到 ::1 连不上
  console.log('GUI 已启动：' + u);
  if (process.env.NO_OPEN) return; // 测试时不自动开浏览器
  // 自动打开默认浏览器
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', u]]
    : process.platform === 'darwin' ? ['open', [u]] : ['xdg-open', [u]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch (e) { /* 手动打开即可 */ }
});
