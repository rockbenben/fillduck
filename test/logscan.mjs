// 日志实参扫描器：把 gui/server.mjs 与 playwright/*.mjs 里每一条 log(…) 的第一个实参
// 还原成「这条日志真跑起来可能长什么样」的候选串集合。
//
// 两个闸共用这一份语料：
//   test/logmap.test.mjs  —— 要求每条带中文的日志都被 src/logmap.mjs 覆盖；
//   test/runread.test.mjs —— 要求 src/runread.mjs 认读数的正则都还真能命中日志。
// 谁改了日志词面，两边都会红，而不是只红一边。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCES = [
  'gui/server.mjs',
  'playwright/browser.mjs',
  'playwright/fill-chrome.mjs',
  'playwright/fill-edge.mjs',
  'playwright/fill-edge-terms.mjs',
  'playwright/fill-firefox.mjs',
];
// 中文判据含全角标点：进度行的文案可能全是英文，标点仍是「：」「（）」
export const CJKISH = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

// —— 取出所有 log( 调用的第一个实参源码 ——
function firstArgs(src) {
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (src.startsWith('log(', i) && !/[\w$.]/.test(src[i - 1] || '')) {
      const arg = readFirstArg(src, i + 4);
      if (arg) out.push(arg);
      i += 3;
    }
  }
  return out;
}

function readFirstArg(src, openIdx) {
  let depth = 1, j = openIdx, buf = '', q = null;
  while (j < src.length) {
    const c = src[j];
    if (q) {
      buf += c;
      if (c === '\\') { buf += src[++j] ?? ''; j++; continue; }
      if (c === q) q = null;
      j++; continue;
    }
    if (c === '\'' || c === '"' || c === '`') { q = c; buf += c; j++; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) { depth--; if (!depth) break; }
    if (c === ',' && depth === 1) break;
    buf += c; j++;
  }
  return buf.trim();
}

// —— 实参源码 → 片段数组 ——
// 按「顶层 +」切段：每段要么是字符串字面量（取文本）、要么是模板（拆 ${}）、要么当占位。
// 先前手写的一版字符状态机在拼接链上会吞掉尾段字面量，改成这种一眼看得懂的切分。
function splitTop(arg, sep) {
  const out = [];
  let depth = 0, cur = '', q = null;
  for (let i = 0; i < arg.length; i++) {
    const c = arg[i];
    if (q) {
      cur += c;
      if (c === '\\') { cur += arg[++i] ?? ''; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function unescapeStr(s) {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\(['"`\\])/g, '$1');
}

// 返回 sep 在【顶层】第一次出现的位置（${} 与括号内的都算嵌套，跳过）；没有则 -1。
function topIndexOf(src, sep, from = 0) {
  let depth = 0, q = null;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '\\') { i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === sep && depth === 0) return i;
  }
  return -1;
}

function templatePieces(tpl) {
  const body = tpl.slice(1, -1);
  const pieces = [];
  let i = 0, lit = '';
  while (i < body.length) {
    const c = body[i];
    if (c === '\\') { const n = body[i + 1]; lit += n === 'n' ? '\n' : n === 't' ? '\t' : n; i += 2; continue; }
    if (body.startsWith('${', i)) {
      let d = 1, k = i + 2, inner = '';
      while (k < body.length) {
        if (body[k] === '{') d++;
        else if (body[k] === '}') { d--; if (!d) break; }
        inner += body[k]; k++;
      }
      if (lit) { pieces.push(lit); lit = ''; }
      // 条件插值 ${c ? `，已排除…` : ''} 有两种形态：那段文案、或者什么都没有
      const cond = /^\s*[^?]+\?\s*(`[^`]*`|'[^']*'|"[^"]*")\s*:\s*(?:''|""|``)\s*$/.exec(inner);
      if (cond) pieces.push({ ph: [unescapeStr(cond[1].slice(1, -1).replace(/\$\{[^}]*\}/g, '1')), ''] });
      else pieces.push({ ph: ['1'] });
      i = k + 1; continue;
    }
    lit += c; i++;
  }
  if (lit) pieces.push(lit);
  return pieces;
}

function piecesOf(arg) {
  const pieces = [];
  for (const seg of splitTop(arg, '+')) {
    if (/^['"]/.test(seg)) pieces.push(unescapeStr(seg.slice(1, -1)));
    else if (/^`/.test(seg)) pieces.push(...templatePieces(seg));
    else pieces.push({ ph: ['1'] });
  }
  return pieces;
}

// 组合出这条日志可能长什么样
function variantsOf(arg) {
  // 三元实参（log(cond ? '重开…' : '打开…')）：两个分支各自是一种真实形态。
  // 嵌套三元（cond ? A : cond2 ? B : C）递归拆开——以前只认一层，Chrome 的三条完成语就这样躲过了闸。
  const q = topIndexOf(arg, '?');
  if (q >= 0) {
    const c = topIndexOf(arg, ':', q);
    if (c > q) return [...new Set([...variantsOf(arg.slice(q + 1, c)), ...variantsOf(arg.slice(c + 1))])];
  }
  const pieces = piecesOf(arg);
  if (!pieces.some((p) => typeof p === 'string' && CJKISH.test(p))) return [];
  let combos = [''];
  for (const p of pieces) {
    const opts = typeof p === 'string' ? [p] : p.ph;
    combos = combos.flatMap((x) => opts.map((o) => x + o));
    if (combos.length > 400) break;
  }
  return combos;
}

export const sourceText = SOURCES.map((rel) => readFileSync(path.join(ROOT, rel), 'utf8')).join('\n');

export const samples = [];
// 含中文却一条形态都没解析出来的实参 = 解析器被绕过了（嵌套三元曾被这样吞掉三条）
export const unparsed = [];
for (const rel of SOURCES) {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  for (const arg of firstArgs(src)) {
    const vs = variantsOf(arg);
    for (const v of vs) samples.push({ rel, sample: v, arg });
    if (!vs.length && CJKISH.test(arg)) unparsed.push(`${rel} ← ${arg}`);
  }
}
