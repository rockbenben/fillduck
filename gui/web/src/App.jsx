import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Input, Button, Typography, Flex, Tag, Space, Segmented, Tooltip, App as AntApp, Divider, Popconfirm,
  Select, Modal, Checkbox,
} from 'antd';
import {
  ChromeOutlined, GlobalOutlined, LoginOutlined, ThunderboltFilled,
  SaveOutlined, CodeOutlined, CheckCircleFilled, StopOutlined, DeleteOutlined, CopyOutlined, UploadOutlined,
  TagsOutlined, PlusOutlined, EditOutlined, FireOutlined, GithubOutlined,
} from '@ant-design/icons';
import { parseInput, parseTerms } from '../../../src/core.mjs'; // 复用后端同一份校验，规则完全一致
import { ALL_UNITS } from '../../../src/units.mjs'; // 执行单元定义与后端共用一份，防漂移

const { Title, Text } = Typography;

// 界面文案（中/英）。后台运行日志由服务端产出，仍为中文。
const STR = {
  zh: {
    kicker: 'FillDuck · 多语言', title: '填鸭控制台',
    subtitle: '一键把多语言描述与搜索词批量填进 Chrome、Edge、Firefox 商店后台',
    running: '运行中', idle: '空闲',
    targets: '目标后台', chromeLabel: 'CHROME 编辑页', edgeLabel: 'EDGE 列表页', firefoxLabel: 'FIREFOX 编辑页',
    projectLabel: '当前项目', projectNew: '新建', projectRename: '重命名', projectDelete: '删除',
    projectNamePh: '项目名（如扩展名称）', projectCreate: '创建', projectOk: '确定', cancel: '取消',
    projectDeleteConfirm: (n) => `确定删除项目「${n}」？其链接与文案文件将被删除，不可撤销。`,
    firefoxUrlWarn: '看起来不像 AMO 编辑页（应含 /developers/addon/<名>/edit）',
    loadFailed: '加载项目状态失败，已暂停自动保存——请确认服务在运行后刷新页面',
    saveRejected: (e) => `保存被服务端拒绝（${e}），请刷新页面后重试`,
    copyLabel: '多语言文案 JSON', langs: (n) => `${n} 种语言`, short: (n) => ` · ${n} 种 <250 字`,
    jsonBad: 'JSON 格式有误', jsonHint: '检查：引号/逗号是否配对、结尾别多写逗号；描述里的换行要写成 \\n（不能直接回车换行）。',
    jsonFormat: '标准 JSON：{ "语言码": "完整描述", … } —— 键和值都用英文双引号 "，多项之间用逗号分隔，最后一项后不加逗号。',
    loadSample: '填入样例', sampleLoaded: '已填入样例，按需修改后保存', sampleBusy: '文案框已有内容；清空后再填样例。',
    needUrlLogin: '先填后台链接（至少一个）再登录',
    clear: '清空', clearConfirm: '确定清空文案框？不可撤销。', autosaved: '改动自动保存',
    importFile: '导入文件', imported: '已从文件导入文案', importFail: '读取文件失败',
    save: '保存', saved: '已保存链接与文案',
    exec: '执行', step1: '① 首次先登录', login: '登录后台', loginNote: '登录态会记住，只需一次',
    loginToast: '已打开后台，请在弹出的浏览器里登录 Google / Microsoft / Mozilla（按你填的后台）',
    step2: '② 勾选要填的项并开始', all: '全部', run: '开始填充', runningBtn: '填充中…', stop: '停止',
    unitChromeDesc: 'Chrome 描述', unitEdgeDesc: 'Edge 描述', unitEdgeTerms: 'Edge 搜索词', unitFirefoxDesc: 'Firefox 描述',
    needUnit: '勾选至少一项要填的内容', needSetup: '先填好后台链接和对应的描述/搜索词', unitNoUrl: '缺后台链接', unitNoContent: '缺内容',
    execNote: '会弹出真实浏览器逐步操作；跑完不自动关，请人工检查后自行提交。Edge 描述每种需 ≥250 字；Firefox(AMO) 描述每种上限 15000 字、保存即生效，Chrome/Edge 只写草稿。',
    logsTitle: '运行日志', lines: (n) => `${n} 行`, logsEmpty: '// 等待开始…日志会实时显示在这里',
    copyLogs: '复制日志', logsCopied: '日志已复制', logsCopyFail: '复制失败，请手动选择',
    chromeUrlWarn: '看起来不像 Chrome 编辑页（应含 devconsole 且以 /edit 结尾）',
    edgeUrlWarn: '看起来不像 Edge 列表页（应含 …/microsoftedge/<id>/listings）',
    runDone: '本次任务结束，请查看日志确认结果', runFailed: '任务中出现错误，请查看日志',
    shortList: (s) => `Edge 会跳过这些（不足 250 字）：${s}`,
    termsLabel: '搜索词 JSON（仅 Edge）', termsLangs: (n) => `${n} 种语言`,
    termsFormat: '标准 JSON：{ "语言码": ["词1","词2"] }，值是搜索词数组。规则：每语言最多 7 个词、每词 ≤30 字符、所有词的独立词语 ≤21；超出的会自动丢弃。',
    termsDropped: (n) => `已自动丢弃 ${n} 个不合规的词（超 7 个 / 超 30 字符 / 独立词超 21）`,
    termsSample: '填入样例', termsSampleLoaded: '已填入搜索词样例', termsSampleBusy: '搜索词框已有内容；清空后再填样例。',
    termsImported: '已从文件导入搜索词', termsClearConfirm: '确定清空搜索词框？不可撤销。',
  },
  en: {
    kicker: 'FillDuck · Multi-Language', title: 'FillDuck Console',
    subtitle: 'Batch-fill multilingual descriptions & search terms into Chrome, Edge & Firefox dashboards in one click',
    running: 'RUNNING', idle: 'IDLE',
    targets: 'Target dashboards', chromeLabel: 'CHROME EDIT PAGE', edgeLabel: 'EDGE LISTINGS PAGE', firefoxLabel: 'FIREFOX EDIT PAGE',
    projectLabel: 'PROJECT', projectNew: 'New', projectRename: 'Rename', projectDelete: 'Delete',
    projectNamePh: 'Project name (e.g. extension name)', projectCreate: 'Create', projectOk: 'OK', cancel: 'Cancel',
    projectDeleteConfirm: (n) => `Delete project "${n}"? Its links and copy files will be removed. This cannot be undone.`,
    firefoxUrlWarn: 'Doesn’t look like an AMO edit page (should contain /developers/addon/<slug>/edit)',
    loadFailed: 'Failed to load project state; autosave paused — make sure the server is running, then refresh',
    saveRejected: (e) => `Save rejected by the server (${e}) — refresh the page and try again`,
    copyLabel: 'Multilingual copy (JSON)', langs: (n) => `${n} languages`, short: (n) => ` · ${n} <250 chars`,
    jsonBad: 'Invalid JSON', jsonHint: 'Check: matching quotes/commas, no trailing comma; line breaks inside a value must be written as \\n (not a real newline).',
    jsonFormat: 'Standard JSON: { "locale": "full description", … } — quote every key and value with ", separate items with commas, no comma after the last one.',
    loadSample: 'Load sample', sampleLoaded: 'Sample loaded — edit it, then Save', sampleBusy: 'The box already has content — clear it first.',
    needUrlLogin: 'Add a dashboard URL first (at least one)',
    clear: 'Clear', clearConfirm: 'Clear the copy box? This cannot be undone.', autosaved: 'Changes auto-saved',
    importFile: 'Import file', imported: 'Copy imported from file', importFail: 'Failed to read file',
    save: 'Save', saved: 'Links & copy saved',
    exec: 'Run', step1: '① Log in first (one time)', login: 'Log in', loginNote: 'Login is remembered — only once',
    loginToast: 'Dashboards opened — log in to Google / Microsoft / Mozilla (whichever you configured) in the browser window',
    step2: '② Check what to fill and start', all: 'All', run: 'Start', runningBtn: 'Filling…', stop: 'Stop',
    unitChromeDesc: 'Chrome desc', unitEdgeDesc: 'Edge desc', unitEdgeTerms: 'Edge terms', unitFirefoxDesc: 'Firefox desc',
    needUnit: 'Check at least one thing to fill', needSetup: 'Add a dashboard URL and its description / search terms first', unitNoUrl: 'no URL', unitNoContent: 'no content',
    execNote: 'A real browser opens and acts step by step; it stays open when done — review, then submit yourself. Edge needs ≥250 chars per description; Firefox (AMO) caps each at 15,000 chars and saves directly, while Chrome/Edge write drafts only.',
    logsTitle: 'Run log', lines: (n) => `${n} lines`, logsEmpty: '// Waiting to start… logs appear here live',
    copyLogs: 'Copy log', logsCopied: 'Log copied', logsCopyFail: 'Copy failed — select manually',
    chromeUrlWarn: 'Doesn’t look like a Chrome edit page (should contain devconsole and end with /edit)',
    edgeUrlWarn: 'Doesn’t look like an Edge listings page (should contain …/microsoftedge/<id>/listings)',
    runDone: 'Run finished — check the log for results', runFailed: 'The run hit an error — check the log',
    shortList: (s) => `Edge will skip these (under 250 chars): ${s}`,
    termsLabel: 'Search terms (JSON, Edge only)', termsLangs: (n) => `${n} languages`,
    termsFormat: 'Standard JSON: { "locale": ["term1","term2"] }, value is an array of terms. Rules: ≤7 terms per language, ≤30 chars each, ≤21 distinct words total; anything over is dropped automatically.',
    termsDropped: (n) => `${n} non-compliant term(s) dropped automatically (>7 / >30 chars / >21 distinct words)`,
    termsSample: 'Load sample', termsSampleLoaded: 'Search-term sample loaded', termsSampleBusy: 'The terms box already has content — clear it first.',
    termsImported: 'Search terms imported from file', termsClearConfirm: 'Clear the search-terms box? This cannot be undone.',
  },
};

// 可直接编辑的样例文案：演示标准 JSON 形状 + 描述内换行用 \n。用户填入后改成自己的内容即可。
const SAMPLE = `{
  "en": "FillDuck fills your store descriptions automatically.\\n\\nReplace this with your real English description. For Edge each language needs at least 250 characters.",
  "zh_CN": "用 FillDuck 自动填写商店描述。\\n\\n把这段换成你真正的中文描述。Edge 每种语言至少需要 250 个字符。",
  "ja": "ストアの説明を自動で入力します。\\n\\nここを実際の日本語の説明に置き換えてください。"
}`;

// 搜索词样例：每语言一个数组，演示形状。用户改成自己的关键词即可。
const SAMPLE_TERMS = `{
  "en": ["batch download", "bulk downloader", "download manager", "save files"],
  "zh_CN": ["批量下载", "批量下载器", "下载管理", "保存文件"],
  "ja": ["一括ダウンロード", "ダウンロードマネージャー"]
}`;

function detectLang() {
  try {
    const saved = localStorage.getItem('fillduck_ui_lang');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function classify(msg) {
  if (/出错|失败|❌|\[x\]/.test(msg)) return 'err';
  if (/完成|成功|✅/.test(msg)) return 'ok';
  if (/提示|注意|跳过|忽略|缺|不足|未找到/.test(msg)) return 'warn';
  return '';
}

export default function App() {
  const { message } = AntApp.useApp();
  const [lang, setLang] = useState(detectLang);
  const t = STR[lang];
  const [chromeUrl, setChromeUrl] = useState('');
  const [edgeUrl, setEdgeUrl] = useState('');
  const [firefoxUrl, setFirefoxUrl] = useState('');
  const [copy, setCopy] = useState('');
  const [terms, setTerms] = useState('');
  const [projects, setProjects] = useState([]);
  const [active, setActive] = useState('');
  const [projModal, setProjModal] = useState(null); // null | { mode: 'create'|'rename', value: string }
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  // 执行单元多选：后台 × 内容 的最小粒度，可独立勾选（Edge 的描述与搜索词分开）。
  const [units, setUnits] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('fillduck_units') || 'null');
      if (Array.isArray(s)) return s.filter((u) => ALL_UNITS.includes(u));
    } catch { /* ignore */ }
    return [...ALL_UNITS]; // 默认全选
  });
  const consoleRef = useRef(null);
  const fileRef = useRef(null);    // 隐藏的描述文件选择框
  const termsFileRef = useRef(null); // 隐藏的搜索词文件选择框
  const loadedRef = useRef(false); // 初次从磁盘载入完成前，不触发自动保存
  const tRef = useRef(t); tRef.current = t;           // 给 SSE 闭包取当前语言文案
  const runningRef = useRef(false);                    // SSE 闭包里判断运行态
  const runErrRef = useRef(false);                     // 本次运行是否出现过错误日志
  const logIdRef = useRef(0);                           // 日志单调 id：列表头部丢弃时仍保持 key 稳定
  const staleWarnedRef = useRef(false);                 // 自动保存被拒只提醒一次（成功后复位）

  const onLangChange = (v) => {
    setLang(v);
    try { localStorage.setItem('fillduck_ui_lang', v); } catch { /* ignore */ }
  };
  const onUnitsChange = (v) => {
    setUnits(v);
    try { localStorage.setItem('fillduck_units', JSON.stringify(v)); } catch { /* ignore */ }
  };

  // 把当前链接、描述、搜索词写盘到【当前项目】。带上项目名：切换项目瞬间残留的
  // 防抖保存会被服务端按名拒掉，避免 A 项目的文案串写进 B（见 server /save）。
  // 手动保存与自动保存共用。返回服务端结果，调用方必须检查 ok（被拒的保存不能装成功）。
  const persist = () => fetch('/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project: active,
      chromeEditUrl: chromeUrl.trim(), edgeListingsUrl: edgeUrl.trim(), firefoxEditUrl: firefoxUrl.trim(),
      copy, terms,
    }),
  }).then((r) => r.json());

  // 整体载入当前项目（初次与切换项目后共用）。载入期间冻结自动保存；
  // 失败时【保持冻结】并提示——否则空表单会被自动保存进真实项目，清掉链接与文案。
  const loadState = async () => {
    loadedRef.current = false;
    try {
      const s = await fetch('/state').then((r) => r.json());
      setProjects(s.projects || []);
      setActive(s.active || '');
      setChromeUrl(s.chromeEditUrl || '');
      setEdgeUrl(s.edgeListingsUrl || '');
      setFirefoxUrl(s.firefoxEditUrl || '');
      setCopy(s.copy || '');
      setTerms(s.terms || '');
      loadedRef.current = true;
    } catch {
      message.error(tRef.current.loadFailed);
    }
  };

  useEffect(() => {
    loadState();

    const es = new EventSource('/events');
    // 每次（重）连建立时清空日志面板：服务端会重放整个缓冲（最多 800 行），
    // 若只追加，断线重连（重启服务、睡眠唤醒）后整段历史会重复出现，误导运行状态。
    es.onopen = () => { setLogs([]); };
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === 'log') {
        const ts = new Date().toTimeString().slice(0, 8);
        const cls = classify(d.msg);
        if (cls === 'err' && runningRef.current) runErrRef.current = true;
        const id = logIdRef.current++; // 在更新函数外自增，避免 StrictMode 下重复执行
        setLogs((prev) => [...prev.slice(-799), { id, ts, msg: d.msg, cls }]);
      } else if (d.type === 'status') {
        const isRunning = d.status === 'running';
        if (isRunning && !runningRef.current) runErrRef.current = false; // 新一轮开始，重置错误标记
        if (!isRunning && runningRef.current) {                          // 运行刚结束 → 弹一次结果提示
          const msg = runErrRef.current ? tRef.current.runFailed : tRef.current.runDone;
          if (runErrRef.current) message.error(msg); else message.success(msg);
          // 用户切到别的程序时，发系统通知叫回（在页面上看着就不重复打扰）。
          try {
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
              new Notification('FillDuck', { body: msg });
            }
          } catch { /* ignore */ }
        }
        runningRef.current = isRunning;
        setRunning(isRunning);
      }
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs]);

  // 自动保存：链接/文案改动后防抖落盘，避免没点保存就关页导致白打。
  // 复用 persist()，请求体只在一处定义；网络失败不打扰（下次改动会再写）。
  // 但服务端的「stale project」拒绝必须提示：旧标签页（重启服务后自动开新页，旧页仍可用）
  // 在别处切走项目后，这里的每次自动保存都会被拒——静默吞掉等于挂着「自动保存」的牌子丢数据。
  // 同一轮被拒只提醒一次，成功后复位，避免连续输入时每 800ms 弹一条。
  useEffect(() => {
    if (!loadedRef.current) return undefined;
    const id = setTimeout(() => {
      // 触发时再查一次冻结标志：定时器可能赶在「切项目」的 persist→select→loadState 间隙触发
      //（编辑后 0.8s 内点切换即可命中），此时 mutateProject 已先行落盘、这次保存注定被按设计拒绝，
      // 既不该发请求、更不该把它当异常警告出来。
      if (!loadedRef.current) return;
      persist().then((r) => {
        if (r.ok) { staleWarnedRef.current = false; return; }
        if (!staleWarnedRef.current) {
          staleWarnedRef.current = true;
          message.warning(tRef.current.saveRejected(r.error || 'stale'));
        }
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [chromeUrl, edgeUrl, firefoxUrl, copy, terms]);

  // —— 项目操作 ——
  const callProjects = async (action, body) => {
    const r = await fetch('/projects/' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: 'network' }));
    if (!r.ok) { message.error(r.error || 'failed'); return false; }
    return true;
  };
  // 项目变更的统一编排：冻结自动保存 → 当前编辑落盘（带项目名，服务端校验）→ 执行操作 → 重载。
  // select / create / rename / delete 都走这一条路，避免某个入口漏掉冻结或落盘
  //（rename 曾漏掉先落盘：防抖窗口内的编辑会被 stale 守卫拒掉后被磁盘旧值覆盖）。
  const mutateProject = async (action, body) => {
    loadedRef.current = false;
    await persist().catch(() => {}); // 服务未起等网络失败不阻塞操作；stale 拒绝在此场景不会发生（还没切）
    if (await callProjects(action, body)) await loadState();
    else loadedRef.current = true;
  };
  const onSelectProject = async (name) => {
    if (name === active) return;
    await mutateProject('select', { name });
  };
  const onProjModalOk = async () => {
    const v = (projModal && projModal.value || '').trim();
    if (!v) return;
    if (projModal.mode === 'create') await mutateProject('create', { name: v });
    else if (v !== active) await mutateProject('rename', { from: active, to: v });
    setProjModal(null);
  };
  // 删除也走统一编排（含先落盘）：删除可能失败（文件被编辑器/杀毒占用等），
  // 失败后编辑必须还在磁盘上——而冻结窗口内被跳过的防抖保存不会重试，
  // 不先落盘的话那笔编辑就静默丢了。成功路径上多写一次马上要删的文件，无害。
  const onDeleteProject = () => mutateProject('delete', { name: active });

  // 解析文案，显示语言数 / 校验。必须用与后端同一份 parseInput：之前 GUI 手写的宽松版
  // 只查“顶层是对象”，值是数组/空串（如把搜索词 JSON 误贴进描述框）也亮“N 种语言”通过标签，
  // 跑起来才被服务端整体拒绝、什么都没填，前端还弹成功提示。
  const langInfo = useMemo(() => {
    const tx = copy.trim();
    if (!tx) return null;
    const r = parseInput(tx);
    if (!r.ok) return { ok: false };
    const entries = Object.entries(r.data);
    const shortLangs = entries.filter(([, v]) => v.length < 250).map(([k]) => k);
    return { ok: true, n: entries.length, short: shortLangs.length, shortLangs };
  }, [copy]);

  // 搜索词校验：用与后端同一份 parseTerms，显示语言数与被丢弃词数。
  const termsInfo = useMemo(() => {
    const tx = terms.trim();
    if (!tx) return null;
    const r = parseTerms(tx);
    if (!r.ok) return { ok: false };
    const n = Object.keys(r.data).length;
    const dropped = Object.values(r.report || {}).reduce((a, list) => a + list.length, 0);
    return { ok: true, n, dropped };
  }, [terms]);

  const onLoadSample = () => {
    if (copy.trim()) { message.info(t.sampleBusy); return; }
    setCopy(SAMPLE);
    message.success(t.sampleLoaded);
  };
  const onClear = () => setCopy(''); // 自动保存会随之把磁盘清空，故清空按钮带二次确认
  const onImportFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // 允许再次选同一文件
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || '');
      setCopy(txt.charCodeAt(0) === 0xFEFF ? txt.slice(1) : txt); // 去掉可能的 UTF-8 BOM，让前端 JSON 校验也通过
      message.success(t.imported);
    };
    reader.onerror = () => message.error(t.importFail);
    reader.readAsText(file);
  };
  const onLoadSampleTerms = () => {
    if (terms.trim()) { message.info(t.termsSampleBusy); return; }
    setTerms(SAMPLE_TERMS);
    message.success(t.termsSampleLoaded);
  };
  const onClearTerms = () => setTerms('');
  const onImportTerms = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || '');
      setTerms(txt.charCodeAt(0) === 0xFEFF ? txt.slice(1) : txt);
      message.success(t.termsImported);
    };
    reader.onerror = () => message.error(t.importFail);
    reader.readAsText(file);
  };
  const onCopyLogs = async () => {
    const text = logs.map((l) => `${l.ts} ${l.msg}`).join('\n');
    try { await navigator.clipboard.writeText(text); message.success(t.logsCopied); }
    catch { message.error(t.logsCopyFail); }
  };
  // 保存结果必须检查：服务端会拒掉过期/缺名的保存（如另一个标签页切走了项目），
  // 不检查就弹成功提示等于在数据被丢弃时报“已保存”。
  const persistChecked = async () => {
    try {
      const r = await persist();
      if (!r.ok) { message.error(t.saveRejected(r.error || 'unknown')); return false; }
      return true;
    } catch { message.error(t.saveRejected('network')); return false; }
  };
  const onSave = async () => { if (await persistChecked()) message.success(t.saved); };
  const onLogin = async () => {
    if (!(await persistChecked())) return;
    await fetch('/login', { method: 'POST' });
    message.info(t.loginToast);
  };
  const onRun = async () => {
    // 借这次用户点击申请通知权限：跑完若用户切走，发系统通知叫回（见 SSE status 分支）。
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch { /* ignore */ }
    if (!(await persistChecked())) return; // 保存被拒还继续跑，会拿磁盘旧文案填商店
    await fetch('/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ units: effectiveUnits }) });
  };
  const onStop = () => fetch('/stop', { method: 'POST' });

  // 链接与文案的派生态：trim 各算一次，下面复用。
  const cUrl = chromeUrl.trim();
  const eUrl = edgeUrl.trim();
  const fUrl = firefoxUrl.trim();
  // 链接体检（仅提示，不拦截运行——真正的关卡是运行时的页面检测）。
  const chromeUrlWarn = cUrl && !/devconsole\/.*\/edit\/?($|\?|#)/i.test(cUrl);
  const edgeUrlWarn = eUrl && !/microsoftedge\/[^/]+\/listings\/?($|\?|#)/i.test(eUrl);
  const firefoxUrlWarn = fUrl && !/\/developers\/addon\/[^/]+\/edit/i.test(fUrl);

  // 运行前置校验：每个执行单元各有链接 + 内容的前置条件。
  const hasAnyUrl = !!cUrl || !!eUrl || !!fUrl;
  const hasValidDesc = !!(langInfo && langInfo.ok);
  const hasValidTerms = !!(termsInfo && termsInfo.ok);
  // 每个单元：是否具备链接与内容（决定能否勾选/执行）。
  const unitReady = {
    'chrome-desc': { url: !!cUrl, content: hasValidDesc },
    'edge-desc': { url: !!eUrl, content: hasValidDesc },
    'edge-terms': { url: !!eUrl, content: hasValidTerms },
    'firefox-desc': { url: !!fUrl, content: hasValidDesc },
  };
  const unitRunnable = (u) => unitReady[u].url && unitReady[u].content;
  // 真正会执行的单元 = 勾选且条件齐备的；至少一个才能跑。
  const effectiveUnits = units.filter(unitRunnable);
  // 提示分两种：有可勾的项但用户没勾 → 让他勾；一个可执行项都没有 → 让他先填链接/内容。
  const anyRunnable = ALL_UNITS.some(unitRunnable);
  const runReason = effectiveUnits.length ? '' : (anyRunnable ? t.needUnit : t.needSetup);
  const canRun = !runReason;
  const jsonInvalid = !!(copy.trim() && langInfo && !langInfo.ok); // 有内容但解析失败
  const loginNeedsUrl = !running && !hasAnyUrl;                    // 没填链接、又没在跑
  const unitMeta = [
    { key: 'chrome-desc', label: t.unitChromeDesc },
    { key: 'edge-desc', label: t.unitEdgeDesc },
    { key: 'edge-terms', label: t.unitEdgeTerms },
    { key: 'firefox-desc', label: t.unitFirefoxDesc },
  ];

  const labelStyle = { display: 'block', marginBottom: 6, color: '#8b93a3', fontSize: 12, letterSpacing: '0.04em' };
  const hintStyle = { display: 'block', marginTop: 10, color: '#f2b138', fontSize: 12 };

  return (
    <div style={{ position: 'relative', zIndex: 1, maxWidth: 920, margin: '0 auto', padding: '44px 24px 72px' }}>
      {/* 头部 */}
      <Flex justify="space-between" align="flex-end" className="rise" style={{ marginBottom: 30 }}>
        <div>
          <div className="kicker" style={{ marginBottom: 10 }}>{t.kicker}</div>
          <Title level={1} className="display" style={{ margin: 0, fontSize: 40, lineHeight: 1.05, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {t.title}
          </Title>
          <Text style={{ color: '#8b93a3', fontSize: 15 }}>
            {t.subtitle}
          </Text>
        </div>
        <Flex align="center" gap={12}>
          <a
            href="https://github.com/rockbenben/fillduck"
            target="_blank"
            rel="noreferrer"
            className="mono gh-link"
            style={{ color: '#8b93a3', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <GithubOutlined style={{ fontSize: 15 }} /> rockbenben/fillduck
          </a>
          <Segmented
            size="small"
            value={lang}
            onChange={onLangChange}
            options={[{ label: '中', value: 'zh' }, { label: 'EN', value: 'en' }]}
          />
          <Tag
            bordered={false}
            className="mono"
            style={{ padding: '6px 12px', fontSize: 12, background: running ? 'rgba(70,209,126,0.12)' : 'rgba(255,255,255,0.05)', color: running ? '#58dd92' : '#8b93a3' }}
          >
            <span className={`dot ${running ? 'run' : 'idle'}`} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            {running ? t.running : t.idle}
          </Tag>
        </Flex>
      </Flex>

      {/* 目标与文案 */}
      <Card className="rise glow-card" style={{ marginBottom: 18, animationDelay: '0.07s' }} styles={{ body: { padding: 24 } }}>
        <Flex align="center" gap={8} style={{ marginBottom: 18 }}>
          <GlobalOutlined style={{ color: '#f2b138' }} />
          <Text strong style={{ fontSize: 15 }}>{t.targets}</Text>
        </Flex>
        <Flex align="center" gap={8} wrap style={{ marginBottom: 18 }}>
          <label style={{ ...labelStyle, margin: 0 }}>{t.projectLabel}</label>
          <Select
            style={{ minWidth: 200 }} value={active || undefined} disabled={running}
            onChange={onSelectProject}
            options={projects.map((p) => ({ label: p, value: p }))}
          />
          <Button variant="text" color="default" icon={<PlusOutlined />} disabled={running}
            onClick={() => setProjModal({ mode: 'create', value: '' })}>{t.projectNew}</Button>
          <Button variant="text" color="default" icon={<EditOutlined />} disabled={running}
            onClick={() => setProjModal({ mode: 'rename', value: active })}>{t.projectRename}</Button>
          <Popconfirm title={t.projectDeleteConfirm(active)} onConfirm={onDeleteProject} okText={t.projectDelete} cancelText={t.cancel} disabled={running}>
            <Button variant="text" color="danger" icon={<DeleteOutlined />} disabled={running}>{t.projectDelete}</Button>
          </Popconfirm>
        </Flex>
        <Modal
          open={!!projModal} title={projModal && projModal.mode === 'create' ? t.projectNew : t.projectRename}
          okText={projModal && projModal.mode === 'create' ? t.projectCreate : t.projectOk}
          cancelText={t.cancel}
          onOk={onProjModalOk} onCancel={() => setProjModal(null)} destroyOnHidden width={360}
        >
          <Input autoFocus placeholder={t.projectNamePh} value={(projModal && projModal.value) || ''}
            onChange={(e) => setProjModal((m) => ({ ...m, value: e.target.value }))}
            onPressEnter={onProjModalOk} />
        </Modal>
        <div className="field-grid" style={{ marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>{t.chromeLabel}</label>
            <Input className="mono" prefix={<ChromeOutlined style={{ color: '#6b7280' }} />} placeholder="https://chrome.google.com/webstore/devconsole/.../edit" value={chromeUrl} onChange={(e) => setChromeUrl(e.target.value)} />
            {chromeUrlWarn && <Text style={{ display: 'block', marginTop: 5, color: '#f2b138', fontSize: 11.5 }}>{t.chromeUrlWarn}</Text>}
          </div>
          <div>
            <label style={labelStyle}>{t.edgeLabel}</label>
            <Input className="mono" prefix={<GlobalOutlined style={{ color: '#6b7280' }} />} placeholder="https://partner.microsoft.com/.../listings" value={edgeUrl} onChange={(e) => setEdgeUrl(e.target.value)} />
            {edgeUrlWarn && <Text style={{ display: 'block', marginTop: 5, color: '#f2b138', fontSize: 11.5 }}>{t.edgeUrlWarn}</Text>}
          </div>
          <div>
            <label style={labelStyle}>{t.firefoxLabel}</label>
            <Input className="mono" prefix={<FireOutlined style={{ color: '#6b7280' }} />} placeholder="https://addons.mozilla.org/.../developers/addon/<slug>/edit" value={firefoxUrl} onChange={(e) => setFirefoxUrl(e.target.value)} />
            {firefoxUrlWarn && <Text style={{ display: 'block', marginTop: 5, color: '#f2b138', fontSize: 11.5 }}>{t.firefoxUrlWarn}</Text>}
          </div>
        </div>

        <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
          <Flex align="center" gap={8}>
            <CodeOutlined style={{ color: '#8b93a3' }} />
            <label style={{ ...labelStyle, margin: 0 }}>{t.copyLabel}</label>
          </Flex>
          {langInfo && (langInfo.ok
            ? <Tag bordered={false} color="gold">{t.langs(langInfo.n)}{langInfo.short ? t.short(langInfo.short) : ''}</Tag>
            : <Tag bordered={false} color="error">{t.jsonBad}</Tag>)}
        </Flex>
        <Input.TextArea
          className="mono"
          value={copy}
          onChange={(e) => setCopy(e.target.value)}
          autoSize={{ minRows: 7, maxRows: 16 }}
          placeholder={'{\n  "en": "English description…",\n  "zh_CN": "中文描述…",\n  "pt_BR": "…"\n}'}
          style={{ fontSize: 12.5, lineHeight: 1.7 }}
        />
        <Text style={{ display: 'block', marginTop: 8, fontSize: 12, lineHeight: 1.6, color: jsonInvalid ? '#ff7a7a' : '#566071' }}>
          {jsonInvalid ? t.jsonHint : t.jsonFormat}
        </Text>
        {langInfo && langInfo.ok && langInfo.shortLangs && langInfo.shortLangs.length > 0 && (
          <Text style={{ display: 'block', marginTop: 4, fontSize: 12, lineHeight: 1.6, color: '#f2b138' }}>{t.shortList(langInfo.shortLangs.join(', '))}</Text>
        )}
        <input ref={fileRef} type="file" accept=".json,.txt,application/json" style={{ display: 'none' }} onChange={onImportFile} />
        <Flex justify="space-between" align="center" style={{ marginTop: 14 }}>
          <Space size={4}>
            <Button variant="text" color="default" icon={<CodeOutlined />} onClick={onLoadSample}>{t.loadSample}</Button>
            <Button variant="text" color="default" icon={<UploadOutlined />} onClick={() => fileRef.current && fileRef.current.click()}>{t.importFile}</Button>
            <Popconfirm title={t.clearConfirm} onConfirm={onClear} okText={t.clear} cancelText={t.cancel} disabled={!copy.trim()}>
              <Button variant="text" color="default" icon={<DeleteOutlined />} disabled={!copy.trim()}>{t.clear}</Button>
            </Popconfirm>
          </Space>
          <Space size={10} align="center">
            <Text style={{ color: '#566071', fontSize: 12 }}>{t.autosaved}</Text>
            <Button variant="filled" color="default" icon={<SaveOutlined />} onClick={onSave}>{t.save}</Button>
          </Space>
        </Flex>

        <Divider style={{ margin: '20px 0 16px', borderColor: '#1c2027' }} />

        {/* 搜索词（仅 Edge） */}
        <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
          <Flex align="center" gap={8}>
            <TagsOutlined style={{ color: '#8b93a3' }} />
            <label style={{ ...labelStyle, margin: 0 }}>{t.termsLabel}</label>
          </Flex>
          {termsInfo && (termsInfo.ok
            ? <Tag bordered={false} color="gold">{t.termsLangs(termsInfo.n)}</Tag>
            : <Tag bordered={false} color="error">{t.jsonBad}</Tag>)}
        </Flex>
        <Input.TextArea
          className="mono"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          autoSize={{ minRows: 4, maxRows: 12 }}
          placeholder={'{\n  "en": ["term one", "term two"],\n  "zh_CN": ["关键词一", "关键词二"]\n}'}
          style={{ fontSize: 12.5, lineHeight: 1.7 }}
        />
        <Text style={{ display: 'block', marginTop: 8, fontSize: 12, lineHeight: 1.6, color: '#566071' }}>
          {t.termsFormat}
        </Text>
        {termsInfo && termsInfo.ok && termsInfo.dropped > 0 && (
          <Text style={{ display: 'block', marginTop: 4, fontSize: 12, lineHeight: 1.6, color: '#f2b138' }}>{t.termsDropped(termsInfo.dropped)}</Text>
        )}
        <input ref={termsFileRef} type="file" accept=".json,.txt,application/json" style={{ display: 'none' }} onChange={onImportTerms} />
        <Flex justify="flex-start" style={{ marginTop: 14 }}>
          <Space size={4}>
            <Button variant="text" color="default" icon={<CodeOutlined />} onClick={onLoadSampleTerms}>{t.termsSample}</Button>
            <Button variant="text" color="default" icon={<UploadOutlined />} onClick={() => termsFileRef.current && termsFileRef.current.click()}>{t.importFile}</Button>
            <Popconfirm title={t.termsClearConfirm} onConfirm={onClearTerms} okText={t.clear} cancelText={t.cancel} disabled={!terms.trim()}>
              <Button variant="text" color="default" icon={<DeleteOutlined />} disabled={!terms.trim()}>{t.clear}</Button>
            </Popconfirm>
          </Space>
        </Flex>
      </Card>

      {/* 执行 */}
      <Card className="rise glow-card" style={{ marginBottom: 18, animationDelay: '0.14s' }} styles={{ body: { padding: 24 } }}>
        <Flex align="center" gap={8} style={{ marginBottom: 18 }}>
          <ThunderboltFilled style={{ color: '#f2b138' }} />
          <Text strong style={{ fontSize: 15 }}>{t.exec}</Text>
        </Flex>

        <Flex align="center" gap={14} wrap style={{ marginBottom: 16 }}>
          <Text className="mono" style={{ color: '#6b7280', fontSize: 12 }}>{t.step1}</Text>
          <Button variant="outlined" icon={<LoginOutlined />} onClick={onLogin} disabled={running || !hasAnyUrl}>{t.login}</Button>
          <Text style={{ color: loginNeedsUrl ? '#f2b138' : '#566071', fontSize: 12 }}>
            {loginNeedsUrl ? t.needUrlLogin : t.loginNote}
          </Text>
        </Flex>

        <Divider style={{ margin: '8px 0 18px', borderColor: '#1c2027' }} />

        <Text className="mono" style={{ display: 'block', color: '#6b7280', fontSize: 12, marginBottom: 10 }}>{t.step2}</Text>
        <Flex align="center" gap={18} wrap style={{ marginBottom: 16 }}>
          <Checkbox.Group value={units} onChange={onUnitsChange} disabled={running}>
            <Space size={16} wrap>
              {unitMeta.map((u) => {
                const ready = unitRunnable(u.key);
                // 缺链接或缺内容就置灰不可勾（所见即所得，不让用户勾一个跑不了的项），
                // 并常驻标注原因；填好后该项自动恢复、保留原有勾选态可立即跑。
                const why = !unitReady[u.key].url ? t.unitNoUrl : !unitReady[u.key].content ? t.unitNoContent : '';
                return (
                  <Checkbox key={u.key} value={u.key} disabled={!ready}>
                    <span style={{ color: ready ? '#e9ebf0' : '#6b7280' }}>{u.label}</span>
                    {why && <Text style={{ marginLeft: 5, fontSize: 11, color: '#566071' }}>({why})</Text>}
                  </Checkbox>
                );
              })}
            </Space>
          </Checkbox.Group>
        </Flex>
        <Flex align="center" gap={14} wrap>
          <Button color="primary" variant="solid" icon={<ThunderboltFilled />} onClick={onRun} loading={running} disabled={running || !canRun}>
            {running ? t.runningBtn : t.run}
          </Button>
          <Button color="danger" variant="solid" icon={<StopOutlined />} onClick={onStop} disabled={!running}>
            {t.stop}
          </Button>
        </Flex>
        {(!running && runReason) && <Text style={hintStyle}>{runReason}</Text>}
        <Text style={{ display: 'block', marginTop: 16, color: '#566071', fontSize: 12 }}>
          {t.execNote}
        </Text>
      </Card>

      {/* 日志 */}
      <Card className="rise glow-card" style={{ animationDelay: '0.21s' }} styles={{ body: { padding: 24 } }}>
        <Flex align="center" justify="space-between" style={{ marginBottom: 14 }}>
          <Flex align="center" gap={8}>
            <CheckCircleFilled style={{ color: '#46d17e' }} />
            <Text strong style={{ fontSize: 15 }}>{t.logsTitle}</Text>
          </Flex>
          <Space size={10} align="center">
            <Text className="mono" style={{ color: '#566071', fontSize: 11 }}>{t.lines(logs.length)}</Text>
            <Button size="small" variant="text" color="default" icon={<CopyOutlined />} onClick={onCopyLogs} disabled={logs.length === 0}>{t.copyLogs}</Button>
          </Space>
        </Flex>
        <div className="console" ref={consoleRef}>
          {logs.length === 0
            ? <div className="console-empty">{t.logsEmpty}</div>
            : logs.map((l) => (
              <div key={l.id} className={`ln ${l.cls}`}>
                <span className="ts">{l.ts}</span>{l.msg}
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
