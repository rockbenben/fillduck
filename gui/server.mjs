// 本地网页 GUI：填两个后台链接 + 多语言 JSON，点按钮自动填充。复用 Playwright 填充逻辑。
// 跑：npm start  → 自动打开 http://localhost:4599
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseInput, parseTerms } from '../src/core.mjs';
import { launchPersistent } from '../playwright/browser.mjs';
import { fillChrome } from '../playwright/fill-chrome.mjs';
import { fillEdge } from '../playwright/fill-edge.mjs';
import { fillEdgeSearchTerms } from '../playwright/fill-edge-terms.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, '.auth-profile');
const CONFIG = path.join(ROOT, 'config.json');
const DESCRIPTIONS = path.join(ROOT, 'descriptions.json');
const DESCRIPTIONS_OLD = path.join(ROOT, 'copy.json'); // 向后兼容：老用户的文案文件
const TERMS = path.join(ROOT, 'search-terms.json');
const WEB_DIST = path.join(__dirname, 'web', 'dist'); // 构建好的 antd6 前端
const PORT = 4599;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json',
};

let ctx = null;          // 常驻浏览器上下文（登录与填充共用）
let ctxInit = null;      // 正在初始化的 promise，避免并发重复启动同一 profile
let busy = false;
let cancelRequested = false; // 停止标志：填充循环每项开始前检查
const clients = new Set(); // SSE 连接
const logBuffer = [];

function broadcast(obj) {
  const line = `data: ${JSON.stringify(obj)}\n\n`;
  for (const res of clients) { try { res.write(line); } catch (e) { /* 忽略断开 */ } }
}
function log(msg) {
  logBuffer.push(msg);
  if (logBuffer.length > 800) logBuffer.shift();
  console.log(msg); // 同时打到黑窗口，方便排查
  broadcast({ type: 'log', msg });
}
function setStatus(status) { broadcast({ type: 'status', status }); }

async function readJsonSafe(p) { try { return JSON.parse(await readFile(p, 'utf8')); } catch (e) { return null; } }
async function readTextSafe(p) { try { return await readFile(p, 'utf8'); } catch (e) { return ''; } }
// 读描述文案：优先新名 descriptions.json，文件【不存在】才兜底老的 copy.json（不丢老用户现有文案）。
// 必须按“存在与否”而非“内容是否为空”判断：用户在 GUI 清空描述框会写出空的 descriptions.json，
// 此时若按内容回退，旧 copy.json 的文案会“还魂”——刷新后回到框里、填充时被写进商店。
async function readDescriptions() {
  try { return await readFile(DESCRIPTIONS, 'utf8'); } catch (e) { return readTextSafe(DESCRIPTIONS_OLD); }
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
    const cfg = (await readJsonSafe(CONFIG)) || {};
    // 没有任何后台链接就别开空白浏览器：登录需要先打开后台页面。
    if (!cfg.chromeEditUrl && !cfg.edgeListingsUrl) {
      log('请先填后台链接（至少一个）再点登录。');
      return;
    }
    const c = await ensureBrowser();
    const page = c.pages()[0] || (await c.newPage());
    log('请在弹出的浏览器里登录 Google 和 Microsoft，登录后回来点“填充”。');
    if (cfg.chromeEditUrl) await page.goto(cfg.chromeEditUrl).catch((e) => log('Chrome 打开失败：' + e.message));
    if (cfg.edgeListingsUrl) { const p2 = await c.newPage(); await p2.goto(cfg.edgeListingsUrl).catch((e) => log('Edge 打开失败：' + e.message)); }
  } catch (e) {
    log('❌ 登录启动失败：' + e.message);
  }
}

async function doRun(store) {
  log(`收到填充请求：${store}`);
  if (busy) { log('已有任务在跑，请稍候。'); return; }
  busy = true; cancelRequested = false; setStatus('running');
  const shouldStop = () => cancelRequested;
  try {
    const cfg = (await readJsonSafe(CONFIG)) || {};
    // 描述与搜索词各自独立解析：任一为空都允许，只跑有内容的那部分。
    const descRaw = await readDescriptions();
    const termsRaw = await readTextSafe(TERMS);
    const descParsed = descRaw.trim() ? parseInput(descRaw) : { ok: true, data: {} };
    const termsParsed = termsRaw.trim() ? parseTerms(termsRaw) : { ok: true, data: {} };
    if (descRaw.trim() && !descParsed.ok) log('描述 JSON 有问题：' + descParsed.error);
    if (termsRaw.trim() && !termsParsed.ok) log('搜索词 JSON 有问题：' + termsParsed.error);
    const descData = descParsed.ok ? descParsed.data : {};
    const termsData = termsParsed.ok ? termsParsed.data : {};
    const hasDesc = Object.keys(descData).length > 0;
    const hasTerms = Object.keys(termsData).length > 0;
    if (!hasDesc && !hasTerms) { log('⚠️ 没有可填的内容：描述与搜索词都为空或有误。'); return; }

    const page = await getPage();
    let ran = 0; // 实际开跑的目标数，用于诚实汇报
    if (!cancelRequested && (store === 'chrome' || store === 'all')) {
      if (!cfg.chromeEditUrl) log('没填 Chrome 链接，跳过。');
      else if (!hasDesc) log('Chrome 无描述可填，跳过（搜索词仅 Edge 支持）。');
      else { log('打开 Chrome 后台…'); await page.goto(cfg.chromeEditUrl, { waitUntil: 'load' }); await fillChrome(page, descData, log, shouldStop); ran++; }
    }
    if (!cancelRequested && (store === 'edge' || store === 'all')) {
      if (!cfg.edgeListingsUrl) log('没填 Edge 链接，跳过。');
      else if (!hasDesc && !hasTerms) log('Edge 无描述也无搜索词，跳过。');
      else {
        log('打开 Edge 后台…');
        await page.goto(cfg.edgeListingsUrl, { waitUntil: 'load' });
        if (!cancelRequested && hasDesc) { await fillEdge(page, descData, log, shouldStop); ran++; }
        if (!cancelRequested && hasTerms) { await fillEdgeSearchTerms(page, termsData, log, shouldStop); ran++; }
      }
    }
    if (cancelRequested) log('⏹ 已停止（已填的部分保留）。');
    else if (ran === 0) log('⚠️ 没有可填充的目标：请确认所选后台的链接已填。');
    else log('✅ 完成。请在浏览器里人工检查后提交。');
  } catch (e) {
    log('❌ 出错：' + e.message + '（浏览器保留现场，修好后重跑）');
  } finally {
    busy = false; cancelRequested = false; setStatus('idle');
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => resolve(b));
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
      const cfg = (await readJsonSafe(CONFIG)) || {};
      sendJson(res, {
        chromeEditUrl: cfg.chromeEditUrl || '', edgeListingsUrl: cfg.edgeListingsUrl || '',
        copy: await readDescriptions(), terms: await readTextSafe(TERMS), busy,
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/save') {
      const body = JSON.parse(await readBody(req));
      await writeFile(CONFIG, JSON.stringify({
        chromeEditUrl: body.chromeEditUrl || '', edgeListingsUrl: body.edgeListingsUrl || '',
        descriptionsPath: 'descriptions.json', termsPath: 'search-terms.json',
      }, null, 2));
      await writeFile(DESCRIPTIONS, body.copy || '');
      await writeFile(TERMS, body.terms || '');
      log('已保存链接、描述与搜索词。');
      sendJson(res, { ok: true }); return;
    }
    if (req.method === 'POST' && url.pathname === '/login') { doLogin(); sendJson(res, { ok: true }); return; }
    if (req.method === 'POST' && url.pathname === '/stop') {
      if (busy) { cancelRequested = true; log('⏹ 收到停止请求，完成当前这一项后停下…'); }
      else log('当前没有正在跑的任务。');
      sendJson(res, { ok: true }); return;
    }
    if (req.method === 'POST' && url.pathname === '/run') {
      const body = JSON.parse(await readBody(req));
      doRun(body.store || 'all'); // 异步跑，日志走 SSE
      sendJson(res, { ok: true }); return;
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      // 重放历史日志 + 当前状态：拼成一段一次写出，避免逐条 write（最多 800 次）系统调用。字节与分帧不变。
      let replay = 'retry: 2000\n\n';
      for (const m of logBuffer) replay += `data: ${JSON.stringify({ type: 'log', msg: m })}\n\n`;
      replay += `data: ${JSON.stringify({ type: 'status', status: busy ? 'running' : 'idle' })}\n\n`;
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
