// 纯逻辑：无 DOM、无 GM 依赖，可单元测试。

// 解析并校验用户粘贴的 JSON 文案。
// 返回 { ok:true, data } 或 { ok:false, error }。
export function parseInput(raw) {
  let obj;
  try {
    // 去掉 UTF-8 BOM：手动用部分编辑器另存 copy.json 会带 BOM 头，JSON.parse 见到就抛
    // “Unexpected token”，用户无从排查。容忍它，不改变其余语义。
    obj = JSON.parse(typeof raw === 'string' ? raw.replace(/^\uFEFF/, '') : raw);
  } catch (e) {
    return { ok: false, error: 'JSON 解析失败: ' + e.message };
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: '顶层必须是一个对象 { locale: 文案 }' };
  }
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return { ok: false, error: '对象为空，至少要有一个语言' };
  }
  for (const [k, v] of entries) {
    if (typeof v !== 'string') {
      return { ok: false, error: `语言 ${k} 的文案必须是字符串` };
    }
    if (v.trim() === '') {
      return { ok: false, error: `语言 ${k} 的文案为空` };
    }
  }
  const trimmed = Object.fromEntries(entries.map(([k, v]) => [k, v.trim()]));
  return { ok: true, data: trimmed };
}

// 解析并按 Edge 规则清洗搜索词。输入 { locale: [词…] }。
// 规则：每词去空白；丢空串；丢 >30 字符；同语言内去重；最多 7 个；
// 所有保留词按空格分出的“独立词语”去重并集 >21 时，从尾部丢词直到 ≤21。
// 返回 { ok:true, data:{locale:[词]}, report:{locale:[{term,reason}]} } 或 { ok:false, error }。
// report 记录被丢弃的词与原因，供 GUI/日志展示。全部清洗后为空不算错（按“无内容”处理）。
export function parseTerms(raw) {
  let obj;
  try {
    obj = JSON.parse(typeof raw === 'string' ? raw.replace(/^\uFEFF/, '') : raw);
  } catch (e) {
    return { ok: false, error: 'JSON 解析失败: ' + e.message };
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: '顶层必须是一个对象 { locale: [搜索词…] }' };
  }
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return { ok: false, error: '对象为空，至少要有一个语言' };
  }
  // 独立词语（空格分词、忽略大小写）去重并集的数量。
  const distinctWordCount = (list) => {
    const s = new Set();
    for (const t of list) for (const w of t.split(/\s+/)) if (w) s.add(w.toLowerCase());
    return s.size;
  };
  const data = {};
  const report = {};
  for (const [loc, arr] of entries) {
    if (!Array.isArray(arr)) {
      return { ok: false, error: `语言 ${loc} 的搜索词必须是数组` };
    }
    const dropped = [];
    const seen = new Set();
    let cleaned = [];
    for (const item of arr) {
      if (typeof item !== 'string') { dropped.push({ term: String(item), reason: '非字符串' }); continue; }
      const term = item.trim();
      if (!term) continue;
      if (term.length > 30) { dropped.push({ term, reason: '超过30字符' }); continue; }
      const key = term.toLowerCase();
      if (seen.has(key)) { dropped.push({ term, reason: '重复' }); continue; }
      seen.add(key);
      cleaned.push(term);
    }
    if (cleaned.length > 7) {
      for (const t of cleaned.slice(7)) dropped.push({ term: t, reason: '超过7个' });
      cleaned = cleaned.slice(0, 7);
    }
    while (cleaned.length && distinctWordCount(cleaned) > 21) {
      dropped.push({ term: cleaned.pop(), reason: '独立词语超过21' });
    }
    data[loc] = cleaned;
    if (dropped.length) report[loc] = dropped;
  }
  return { ok: true, data, report };
}

// 把后台链接强制成指定界面语言（'zh' 或 'en'）再打开。后台界面语言由链接决定
//（Edge 是路径里的 locale 段，Chrome 是 hl 参数）。工具默认不强制、用账号原本的语言并自动检测；
// 只有检测到既不是中文也不是英文（如法/德…）时，才强制成英文重载兜底。
// 只影响本次打开的页面，不改用户账号的语言设置。
export function forceDashboardLang(url, lang) {
  if (!url || typeof url !== 'string') return url;
  const edgeLoc = lang === 'en' ? 'en-us' : 'zh-cn';
  const chromeHl = lang === 'en' ? 'en' : 'zh-CN';
  // Edge Partner Center：/xx-xx/dashboard/ 这类 locale 段 → 目标语言；没有 locale 段则插入。
  let u = url.replace(
    /(partner\.microsoft\.com\/)(?:[a-z]{2,3}(?:-[a-z0-9]{2,4})?\/)?(dashboard\/)/i,
    `$1${edgeLoc}/$2`,
  );
  // Chrome 开发者后台：hl 参数决定界面语言。
  if (/chrome\.google\.com\/webstore\/devconsole|chromewebstore\.google\.com/i.test(u)) {
    try {
      const parsed = new URL(u);
      parsed.searchParams.set('hl', chromeHl);
      u = parsed.toString();
    } catch (e) { /* 不是合法 URL，原样返回让导航自己报错 */ }
  }
  return u;
}

// 把 locale 码归一化：下划线/连字符等价，忽略大小写。
// 这样用户的 _locales 风格键（zh_CN、pt_BR）能对上后台的连字符码（zh-CN、pt-BR）。
export function canonLocale(s) {
  return String(s).replace(/_/g, '-').toLowerCase();
}

// 用文案数据 + 后台实际提供的 locale 列表（后台顺序），产出有序填充队列与差异报告。
// 匹配按归一化形式进行，但 queue 里的 locale 用“后台”的写法（适配器据此定位元素）。
export function buildFillQueue(data, dashboardLocales) {
  // canon(用户键) -> 文案（同一归一化键多次出现时，先到先得）
  const byCanon = new Map();
  for (const [k, v] of Object.entries(data)) {
    const c = canonLocale(k);
    if (!byCanon.has(c)) byCanon.set(c, v);
  }
  const queue = [];
  const missing = []; // 后台有该语言，但文案里没有
  for (const loc of dashboardLocales) {
    const c = canonLocale(loc);
    if (byCanon.has(c)) {
      queue.push({ locale: loc, text: byCanon.get(c) });
    } else {
      missing.push(loc);
    }
  }
  // 文案里有但后台没有的语言（按归一化比较）
  const dashCanon = new Set(dashboardLocales.map(canonLocale));
  const extra = Object.keys(data).filter((k) => !dashCanon.has(canonLocale(k)));
  return { queue, missing, extra };
}

// 把“locale 码 -> 后台显示名”映射，对到后台真实按钮（每个 { ariaLabel, name }，name=显示名），
// 产出 code -> ariaLabel。两条关键约束，少一条就会跨语言串号或丢内容：
//  ① 先精确（归一化相等）再子串兜底——否则短名靠子串抢走长名的按钮：
//     "Malay" 抢 "Malayalam"、"English" 抢 "English (United Kingdom)"，两种语言互相串号且无任何告警。
//  ② 有用户文案的 locale 优先占位——否则没文案的同义码会先占走唯一行：
//     nb/no 都显示为 "Norwegian"，用户只给了 no 时，nb 先占走该行，no 落空、Norwegian 被静默丢弃。
// dataCanon = 用户实际提供文案的 canon 化 locale 集合（不传则不区分优先级）。
export function matchLocaleButtons(map, buttons, dataCanon = new Set()) {
  const norm = (s) => (s || '').replace(/\s+/g, '');
  const has = (code) => dataCanon.has(canonLocale(code));
  // 有文案的排前面；同组内保持原顺序（Array.sort 在现代 Node 上是稳定排序）。
  const entries = Object.entries(map).sort((a, b) => (has(b[0]) ? 1 : 0) - (has(a[0]) ? 1 : 0));
  const codeToAria = {};
  const used = new Set();
  // 第一轮：精确匹配（归一化后完全相等）。
  for (const [code, name] of entries) {
    const x = norm(name);
    const btn = buttons.find((b) => !used.has(b.ariaLabel) && norm(b.name) === x);
    if (btn) { codeToAria[code] = btn.ariaLabel; used.add(btn.ariaLabel); }
  }
  // 第二轮：仅对仍未匹配的做子串兜底（容忍后台措辞与收录名的细微差异）。
  for (const [code, name] of entries) {
    if (codeToAria[code]) continue;
    const x = norm(name);
    if (!x) continue;
    const btn = buttons.find((b) => {
      if (used.has(b.ariaLabel)) return false;
      const y = norm(b.name);
      return !!y && (x.includes(y) || y.includes(x));
    });
    if (btn) { codeToAria[code] = btn.ariaLabel; used.add(btn.ariaLabel); }
  }
  return codeToAria;
}
