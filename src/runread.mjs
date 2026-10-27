// 从日志原文里读出「每一项跑到哪了」和「这一轮的结果」。
//
// 为什么在前端解析、而不是让服务端上报结构化进度：填充脚本正在跑真自动化，让它们回传读数
// 要动一批用户看不见的代码；而日志行本来就是这份事实的完整记录（和 src/logmap.mjs 同一份出处）。
//
// 代价是「词面即接口」：这里的每条正则都对着 playwright/*.mjs 的真实日志串。
// test/runread.test.mjs 会把这些正则喂给日志闸从源码收集到的日志变体，改了词面没同步就红。

export const UNIT_KEYS = ['chrome-desc', 'edge-desc', 'edge-terms', 'firefox-desc'];

// 出错行里的目标名由 gui/server.mjs 的 runTarget('…') 传入，和界面上的单元标签不完全同名。
export const FAIL_NAME_TO_UNIT = {
  'Chrome 描述': 'chrome-desc',
  'Edge 描述': 'edge-desc',
  'Edge 搜索词': 'edge-terms',
  Firefox: 'firefox-desc',
};

// 状态档位，数字越大越"最终"：同一单元同时出现两种行时取靠后的那一档。
// skipped 要排在 running 之后：「打开 X 后台…」先记了 running，随后才判定「一种都填不了」，
// skipped 才是这一项的最终结论。排错了会让结果条停在「准备中」，像是一直在跑。
export const STATE_RANK = { pending: 0, running: 1, skipped: 2, stored: 3, review: 4, failed: 5 };

const E = (kind, re, get = () => ({})) => ({ kind, re, get });
const countList = (s) => s.split(',').map((x) => x.trim()).filter(Boolean).length;

export const UNIT_EVENTS = {
  'chrome-desc': [
    E('running', /^打开 Chrome 后台…$/),
    E('running', /^Chrome (\d+)\/(\d+)：/, (m) => ({ i: +m[1], n: +m[2] })),
    E('stored', /^Chrome 完成：已填 (\d+) 种并点击“保存草稿”。/, (m) => ({ filled: +m[1] })),
    E('stored', /^⚠️ Chrome 已中断：中断前已填的 (\d+) 种已点击“保存草稿”。$/, (m) => ({ filled: +m[1] })),
    E('stored', /^⏹ Chrome 已停止：已填的 (\d+) 种已点击“保存草稿”。$/, (m) => ({ filled: +m[1] })),
    // 填了但草稿没存上 / 填进去没稳住：数字还在，但要人去看
    E('review', /^⚠️ Chrome 已填 (\d+) 种但“保存草稿”没点上/, (m) => ({ filled: +m[1], human: +m[1] })),
    E('review', /^⚠️ Chrome 已填 (\d+) 种，但没找到“保存草稿”按钮/, (m) => ({ filled: +m[1], human: +m[1] })),
    E('review', /^⚠️ Chrome 这些语言填进去了但没稳住，请逐个检查：(.+)$/, (m) => ({ human: countList(m[1]) })),
    E('skipped', /^(没填 Chrome 链接，跳过。|Chrome 无描述可填，跳过。|Chrome：没有可填的语言。|Chrome：没有可填的语言——全都超过了 \d+ 字符上限。)$/),
  ],
  'edge-desc': [
    E('running', /^打开 Edge 后台…$|^重开 Edge 后台（清理上一步残留）…$/),
    E('running', /^Edge：先逐个保存全部 (\d+) 种/, (m) => ({ n: +m[1] })),
    E('running', /^Edge 保存 (\d+)\/(\d+)：/, (m) => ({ i: +m[1], n: +m[2] })),
    E('running', /^Edge 核对 (\d+) 种…$/),
    E('skipped', /^Edge 描述：无文案可填，(?:已)?跳过。$/),
    E('skipped', /^⚠️ Edge：没有符合条件的描述可填/),
  ],
  'edge-terms': [
    E('running', /^Edge 搜索词：逐个填\+存全部 (\d+) 种/, (m) => ({ n: +m[1] })),
    E('running', /^Edge 搜索词 (\d+)\/(\d+)：/, (m) => ({ i: +m[1], n: +m[2] })),
    E('running', /^Edge 搜索词核对 (\d+) 种…$/),
    E('skipped', /^Edge 搜索词：无数据可填，(?:已)?跳过。$/),
    E('skipped', /^⚠️ Edge 搜索词：没有可填的语言/),
  ],
  'firefox-desc': [
    E('running', /^打开 Firefox 后台…$/),
    E('running', /^Firefox：共 (\d+) 种语言/, (m) => ({ n: +m[1] })),
    E('running', /^ {2}已填入 (\d+) 种：/, (m) => ({ i: +m[1] })),
    E('skipped', /^(没填 Firefox 链接，跳过。|Firefox 无描述可填，跳过。|Firefox：没有可填的语言。)$/),
  ],
};

// 收尾行：整个后台的总结，同时是「这一轮结束了」的凭据。
// 六条对应 gui/server.mjs 里 if/else 链的每个出口（含最外层 catch），漏一条读数会永远停在「进行中」。
export const RUN_DONE = [
  /^✅ 完成。请在浏览器里人工检查后提交。$/,
  /^⚠️ 完成，但这些目标出错需重跑：(.+?)（浏览器保留现场）$/,
  /^❌ 全部目标都出错，本次没有填充任何内容：(.+?)（浏览器保留现场）$/,
  /^⏹ 已停止（已填的部分保留）。$/,
  /^⚠️ 没有可填充的目标：/,
  // 这两句是 doRun 提前返回时说的（连 if/else 收尾链都没走到），漏认就会永远停在「进行中」。
  /^⚠️ 没有选中任何执行目标。$/,
  /^⚠️ 没有可填的内容：/,
  /^❌ 出错：(.+?)（浏览器保留现场，修好后重跑）$/,
];
// 捕获组直接把「这一轮点了哪些项」取出来：原来靠 source.length 切片切，
// 会连正则里的 ^ 一起算进长度，把第一项的名字切掉一个字（只剩 edge-desc）。
const RUN_START = /^收到填充请求：(.*)$/;

// Edge / Firefox 的「完成但有几条要人看」写在同一行收尾语里，得单独认。
export const TAIL_REVIEW = {
  'edge-desc': /^Edge 完成。⚠️ 以下语言未通过核对，请在浏览器里人工确认：(.+)$/,
  'edge-terms': /^Edge 搜索词完成。⚠️ 这些没存上，需人工处理：(.+)$/,
  'firefox-desc': /^Firefox 完成。⚠️ 这些没存上，需人工处理：(.+)$/,
};
export const TAIL_STORED = {
  'edge-desc': /^Edge 完成：全部已保存并核对通过。$/,
  'edge-terms': /^Edge 搜索词完成：全部已保存并核对通过。$/,
  'firefox-desc': /^Firefox 完成：全部已保存并核对通过。$/,
};

const empty = (key) => ({ key, state: 'pending', i: 0, n: 0, filled: 0, human: 0 });
const settle = (r, state, patch) => {
  Object.assign(r, patch);
  if (STATE_RANK[state] >= STATE_RANK[r.state]) r.state = state;
};

// msgs = 日志原文数组（中文，未经界面语言翻译）
export function readRun(msgs) {
  // 只看最后一次「收到填充请求」之后：日志跨轮累积，不能拿上一轮的收尾当本轮结果。
  // 一次都没请求过 ⇒ 这一轮还没开始：此时日志里只有「已保存」「已切换项目」这类杂音，
  // 若把它们当运行中，界面会在用户点「开始填充」之前就显示「进行中」，并把「本次会填」那句
  // 预览挤掉——用户以为已经在跑，白等一场。
  let from = -1;
  let picked = []; // 这一轮实际点了哪些项：请求那行写明了名字，比事后从界面状态反推可靠
  for (let i = 0; i < msgs.length; i++) {
    const m = RUN_START.exec(msgs[i]);
    if (!m) continue;
    from = i + 1;
    picked = m[1].split(/\s*\+\s*/).map((k) => k.trim()).filter((k) => UNIT_KEYS.includes(k));
  }
  const lines = from < 0 ? [] : msgs.slice(from);

  const readings = {};
  for (const k of UNIT_KEYS) readings[k] = empty(k);
  for (const line of lines) {
    for (const key of UNIT_KEYS) {
      const r = readings[key];
      for (const ev of UNIT_EVENTS[key]) {
        const m = ev.re.exec(line);
        if (m) { settle(r, ev.kind, ev.get(m)); break; }
      }
      const review = TAIL_REVIEW[key] && TAIL_REVIEW[key].exec(line);
      if (review) settle(r, 'review', { human: countList(review[1]) });
      else if (TAIL_STORED[key] && TAIL_STORED[key].test(line)) settle(r, 'stored', {});
      const fail = /^❌ (.+?) 出错：/.exec(line);
      if (fail && FAIL_NAME_TO_UNIT[fail[1]] === key) settle(r, 'failed', {});
    }
  }

  const ended = RUN_DONE.some((re) => lines.some((l) => re.test(l)));
  const mode = !lines.length ? 'idle' : ended ? 'result' : 'running';
  return { mode, units: UNIT_KEYS.map((k) => readings[k]), picked };
}

// 结果条开头那句：只数真发生了的档位。
export function tally(units) {
  const c = { stored: 0, review: 0, skipped: 0, failed: 0, running: 0, pending: 0 };
  for (const u of units) c[u.state] = (c[u.state] || 0) + 1;
  return c;
}
