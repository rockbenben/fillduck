import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Card, Input, Button, Flex, Tag, Space, Segmented, Tooltip, App as AntApp, Popconfirm,
  Select, Modal, Checkbox,
} from 'antd';
import {
  ChromeOutlined, GlobalOutlined, LoginOutlined, ThunderboltFilled,
  SaveOutlined, CodeOutlined, CheckCircleFilled, StopOutlined, DeleteOutlined, CopyOutlined, UploadOutlined,
  TagsOutlined, PlusOutlined, EditOutlined, FireOutlined, GithubOutlined, PartitionOutlined,
} from '@ant-design/icons';
import { parseInput, parseTerms } from '../../../src/core.mjs'; // 复用后端同一份校验，规则完全一致
import { ALL_UNITS, STORE_TO_UNITS } from '../../../src/units.mjs'; // 执行单元定义与后端共用一份，防漂移
import LocaleSelect from './LocaleSelect.tsx';
import type { LocaleItem, LocaleStore } from './LocaleSelect.tsx';

type Lang = 'zh' | 'en';
type LogLine = { id: number; ts: string; msg: string; cls: string };
type ProjModal = { mode: 'create' | 'rename'; value: string } | null;
type SseMsg =
  | { type: 'log'; msg: string; epoch?: string; seq?: number }
  | { type: 'status'; status: string; epoch?: string };
type SaveResult = { ok: boolean; error?: string };

// 界面文案（中/英）。后台运行日志由服务端产出，仍为中文。
const STR = {
  zh: {
    title: '填鸭控制台',
    fanout: (n: number) => (n ? `一份源文案 · 分发到 3 商店 × ${n} 语言` : '一份源文案 · 分发到 Chrome / Edge / Firefox'),
    running: '运行中', idle: '空闲',
    targets: '目标后台', chromeLabel: 'CHROME 编辑页', edgeLabel: 'EDGE 列表页', firefoxLabel: 'FIREFOX 编辑页',
    projectLabel: '当前项目', projectNew: '新建', projectRename: '重命名', projectDelete: '删除',
    projectNamePh: '项目名（如扩展名称）', projectCreate: '创建', projectOk: '确定', cancel: '取消',
    projectDeleteConfirm: (n: string) => `确定删除项目「${n}」？其链接与文案文件将被删除，不可撤销。`,
    firefoxUrlWarn: '看起来不像 AMO 编辑页（应含 /developers/addon/<名>/edit）',
    loadFailed: '加载项目状态失败，已暂停自动保存——请确认服务在运行后刷新页面',
    saveRejected: (e: string) => `保存被服务端拒绝（${e}），请刷新页面后重试`,
    serverRestarted: '服务已重启，之前的运行已中断（运行状态已重置，请查看日志确认实际进度）',
    logGap: (n: number) => `…（断线期间约 ${n} 行日志已滚出服务端缓冲，未能显示，其中可能含错误行）`,
    sourceTitle: '源文案',
    copyLabel: '多语言描述 JSON', langs: (n: number) => `${n} 种语言`, short: (n: number) => ` · ${n} 种 <250 字`,
    jsonBad: 'JSON 格式有误', jsonHint: '检查：引号/逗号是否配对、结尾别多写逗号；描述里的换行要写成 \\n（不能直接回车换行）。',
    jsonFormat: '标准 JSON：{ "语言码": "完整描述", … } —— 键和值都用英文双引号 "，多项之间用逗号分隔，最后一项后不加逗号。',
    loadSample: '填入样例', sampleLoaded: '已填入样例，按需修改后保存', sampleBusy: '文案框已有内容；清空后再填样例。',
    needUrlLogin: '先填后台链接（至少一个）再登录',
    clear: '清空', clearConfirm: '确定清空文案框？不可撤销。', autosaved: '改动自动保存',
    importFile: '导入文件', imported: '已从文件导入文案', importFail: '读取文件失败',
    save: '保存', saved: '已保存链接与文案',
    login: '登录后台', loginNote: '登录态会记住，只需一次',
    loginToast: '已打开后台，请在弹出的浏览器里登录 Google / Microsoft / Mozilla（按你填的后台）',
    run: '开始填充', runningBtn: '填充中…', stop: '停止', exec: '执行',
    unitChromeDesc: 'Chrome 描述', unitEdgeDesc: 'Edge 描述', unitEdgeTerms: 'Edge 搜索词', unitFirefoxDesc: 'Firefox 描述',
    needUnit: '勾选至少一项要填的内容', needSetup: '先填好后台链接和对应的描述/搜索词', unitNoUrl: '缺后台链接', unitNoContent: '缺内容',
    execNote: '会弹出真实浏览器逐步操作；跑完不自动关，请人工检查后自行提交。Edge 描述每种需 ≥250 字；Firefox(AMO) 描述每种上限 15000 字、保存即生效，Chrome/Edge 只写草稿。',
    logsTitle: '运行日志', lines: (n: number) => `${n} 行`, logsEmpty: '// 等待开始…日志会实时显示在这里',
    copyLogs: '复制日志', logsCopied: '日志已复制', logsCopyFail: '复制失败，请手动选择',
    chromeUrlWarn: '看起来不像 Chrome 编辑页（应含 devconsole 且以 /edit 结尾）',
    edgeUrlWarn: '看起来不像 Edge 列表页（应含 …/microsoftedge/<id>/listings）',
    runDone: '本次任务结束，请查看日志确认结果', runFailed: '任务中出现错误，请查看日志',
    termsLabel: '搜索词 JSON（仅 Edge）', termsLangs: (n: number) => `${n} 种语言`,
    termsFormat: '标准 JSON：{ "语言码": ["词1","词2"] }，值是搜索词数组。规则：每语言最多 7 个词、每词 ≤30 字符、所有词的独立词语 ≤21；超出的会自动丢弃。',
    termsDropped: (n: number) => `已自动丢弃 ${n} 个不合规的词（超 7 个 / 超 30 字符 / 独立词超 21）`,
    termsSample: '填入样例', termsSampleLoaded: '已填入搜索词样例', termsSampleBusy: '搜索词框已有内容；清空后再填样例。',
    termsImported: '已从文件导入搜索词', termsClearConfirm: '确定清空搜索词框？不可撤销。',
    localesTitle: '语言 · 勾选生效', mShort: '<250',
    effOn: (n: number, m: number) => `${n} / ${m} 生效`, selAll: '全选', selNone: '全不选',
    localeEmpty: '填好上面的文案后，这里可勾选哪些语言本次生效（默认全选）。',
    localeNote: '只有勾选的语言会被填充；右侧三点示意写入哪些商店（空心=Edge 不足 250 字将跳过，横杠=该商店未选）。',
    needLocale: '至少勾选一种要填充的语言',
  },
  en: {
    title: 'FillDuck Console',
    fanout: (n: number) => (n ? `One source · fanned out to 3 stores × ${n} locales` : 'One source · fans out to Chrome / Edge / Firefox'),
    running: 'RUNNING', idle: 'IDLE',
    targets: 'Target dashboards', chromeLabel: 'CHROME EDIT PAGE', edgeLabel: 'EDGE LISTINGS PAGE', firefoxLabel: 'FIREFOX EDIT PAGE',
    projectLabel: 'PROJECT', projectNew: 'New', projectRename: 'Rename', projectDelete: 'Delete',
    projectNamePh: 'Project name (e.g. extension name)', projectCreate: 'Create', projectOk: 'OK', cancel: 'Cancel',
    projectDeleteConfirm: (n: string) => `Delete project "${n}"? Its links and copy files will be removed. This cannot be undone.`,
    firefoxUrlWarn: 'Doesn’t look like an AMO edit page (should contain /developers/addon/<slug>/edit)',
    loadFailed: 'Failed to load project state; autosave paused — make sure the server is running, then refresh',
    saveRejected: (e: string) => `Save rejected by the server (${e}) — refresh the page and try again`,
    serverRestarted: 'Server restarted — the previous run was interrupted (running state reset; check the log for actual progress)',
    logGap: (n: number) => `…(about ${n} log line(s) rolled out of the server buffer while disconnected — some may be errors)`,
    sourceTitle: 'Source copy',
    copyLabel: 'Multilingual copy (JSON)', langs: (n: number) => `${n} locales`, short: (n: number) => ` · ${n} <250 chars`,
    jsonBad: 'Invalid JSON', jsonHint: 'Check: matching quotes/commas, no trailing comma; line breaks inside a value must be written as \\n (not a real newline).',
    jsonFormat: 'Standard JSON: { "locale": "full description", … } — quote every key and value with ", separate items with commas, no comma after the last one.',
    loadSample: 'Load sample', sampleLoaded: 'Sample loaded — edit it, then Save', sampleBusy: 'The box already has content — clear it first.',
    needUrlLogin: 'Add a dashboard URL first (at least one)',
    clear: 'Clear', clearConfirm: 'Clear the copy box? This cannot be undone.', autosaved: 'Changes auto-saved',
    importFile: 'Import file', imported: 'Copy imported from file', importFail: 'Failed to read file',
    save: 'Save', saved: 'Links & copy saved',
    login: 'Log in', loginNote: 'Login is remembered — only once',
    loginToast: 'Dashboards opened — log in to Google / Microsoft / Mozilla (whichever you configured) in the browser window',
    run: 'Start', runningBtn: 'Filling…', stop: 'Stop', exec: 'Run',
    unitChromeDesc: 'Chrome desc', unitEdgeDesc: 'Edge desc', unitEdgeTerms: 'Edge terms', unitFirefoxDesc: 'Firefox desc',
    needUnit: 'Check at least one thing to fill', needSetup: 'Add a dashboard URL and its description / search terms first', unitNoUrl: 'no URL', unitNoContent: 'no content',
    execNote: 'A real browser opens and acts step by step; it stays open when done — review, then submit yourself. Edge needs ≥250 chars per description; Firefox (AMO) caps each at 15,000 chars and saves directly, while Chrome/Edge write drafts only.',
    logsTitle: 'Run log', lines: (n: number) => `${n} lines`, logsEmpty: '// Waiting to start… logs appear here live',
    copyLogs: 'Copy log', logsCopied: 'Log copied', logsCopyFail: 'Copy failed — select manually',
    chromeUrlWarn: 'Doesn’t look like a Chrome edit page (should contain devconsole and end with /edit)',
    edgeUrlWarn: 'Doesn’t look like an Edge listings page (should contain …/microsoftedge/<id>/listings)',
    runDone: 'Run finished — check the log for results', runFailed: 'The run hit an error — check the log',
    termsLabel: 'Search terms (JSON, Edge only)', termsLangs: (n: number) => `${n} locales`,
    termsFormat: 'Standard JSON: { "locale": ["term1","term2"] }, value is an array of terms. Rules: ≤7 terms per language, ≤30 chars each, ≤21 distinct words total; anything over is dropped automatically.',
    termsDropped: (n: number) => `${n} non-compliant term(s) dropped automatically (>7 / >30 chars / >21 distinct words)`,
    termsSample: 'Load sample', termsSampleLoaded: 'Search-term sample loaded', termsSampleBusy: 'The terms box already has content — clear it first.',
    termsImported: 'Search terms imported from file', termsClearConfirm: 'Clear the search-terms box? This cannot be undone.',
    localesTitle: 'Locales · check to fill', mShort: '<250',
    effOn: (n: number, m: number) => `${n} / ${m} on`, selAll: 'All', selNone: 'None',
    localeEmpty: 'Add copy above, then pick which locales this run fills (all on by default).',
    localeNote: 'Only checked locales get filled; the three dots show which stores each goes to (hollow = Edge skips it under 250 chars, dash = store not selected).',
    needLocale: 'Check at least one locale to fill',
  },
};

type Dict = (typeof STR)['zh'];

// 可直接编辑的样例文案：演示标准 JSON 形状 + 描述内换行用 \n。
const SAMPLE = `{
  "en": "FillDuck fills your store descriptions automatically.\\n\\nReplace this with your real English description. For Edge each language needs at least 250 characters.",
  "zh_CN": "用 FillDuck 自动填写商店描述。\\n\\n把这段换成你真正的中文描述。Edge 每种语言至少需要 250 个字符。",
  "ja": "ストアの説明を自動で入力します。\\n\\nここを実際の日本語の説明に置き換えてください。"
}`;

const SAMPLE_TERMS = `{
  "en": ["batch download", "bulk downloader", "download manager", "save files"],
  "zh_CN": ["批量下载", "批量下载器", "下载管理", "保存文件"],
  "ja": ["一括ダウンロード", "ダウンロードマネージャー"]
}`;

// 语言码 → 母语文字标签（payload 母题）。命中不到就回落到原码。
const NATIVE: Record<string, string> = {
  en: 'English', zh: '中文', 'zh-cn': '简体中文', 'zh-tw': '繁體中文', 'zh-hk': '繁體中文',
  ja: '日本語', ko: '한국어', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano',
  ru: 'Русский', tr: 'Türkçe', th: 'ไทย', ar: 'العربية', pt: 'Português', 'pt-br': 'Português',
  vi: 'Tiếng Việt', hi: 'हिन्दी', bn: 'বাংলা', id: 'Bahasa Indonesia', nl: 'Nederlands',
  pl: 'Polski', uk: 'Українська', fa: 'فارسی', he: 'עברית', el: 'Ελληνικά', cs: 'Čeština',
  sv: 'Svenska', da: 'Dansk', fi: 'Suomi', nb: 'Norsk', ro: 'Română', hu: 'Magyar',
};
function nativeName(locale: string): string {
  const key = locale.toLowerCase().replace(/_/g, '-');
  return NATIVE[key] || NATIVE[key.split('-')[0]] || locale;
}

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('fillduck_ui_lang');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function classify(msg: string): string {
  if (/出错|失败|❌|\[x\]/.test(msg)) return 'err';
  if (/完成|成功|✅/.test(msg)) return 'ok';
  if (/提示|注意|跳过|忽略|缺|不足|未找到/.test(msg)) return 'warn';
  return '';
}

export default function App() {
  const { message } = AntApp.useApp();
  const [lang, setLang] = useState<Lang>(detectLang);
  const t: Dict = STR[lang];
  const [chromeUrl, setChromeUrl] = useState('');
  const [edgeUrl, setEdgeUrl] = useState('');
  const [firefoxUrl, setFirefoxUrl] = useState('');
  const [copy, setCopy] = useState('');
  const [terms, setTerms] = useState('');
  const [projects, setProjects] = useState<string[]>([]);
  const [active, setActive] = useState('');
  const [projModal, setProjModal] = useState<ProjModal>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  // 执行单元多选：后台 × 内容 的最小粒度，可独立勾选（Edge 的描述与搜索词分开）。
  const [units, setUnits] = useState<string[]>(() => {
    try {
      const s = JSON.parse(localStorage.getItem('fillduck_units') || 'null');
      if (Array.isArray(s)) return s.filter((u) => ALL_UNITS.includes(u));
      // 迁移旧版单后台偏好 fillduck_target：老用户曾把目标收窄到某一个商店。
      const old = localStorage.getItem('fillduck_target');
      const mapped = old && (STORE_TO_UNITS as Record<string, string[]>)[old];
      if (Array.isArray(mapped) && mapped.length) return mapped.filter((u: string) => ALL_UNITS.includes(u));
    } catch { /* ignore */ }
    return [...ALL_UNITS]; // 默认全选
  });
  // 语言子集：记录每个项目【被取消勾选】的语言（存“关掉的”而非“开着的”，这样文案新增语言时默认生效）。
  const [localesOff, setLocalesOff] = useState<Record<string, string[]>>(() => {
    try { const s = JSON.parse(localStorage.getItem('fillduck_locales_off') || '{}'); return (s && typeof s === 'object') ? s : {}; } catch { return {}; }
  });

  const consoleRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const termsFileRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);
  const tRef = useRef<Dict>(t); tRef.current = t;
  const runningRef = useRef(false);
  const runErrRef = useRef(false);
  const logIdRef = useRef(0);
  const staleWarnedRef = useRef(false);
  const sseEpochRef = useRef<string | null>(null);
  const maxSeqRef = useRef(0);
  const initializedRef = useRef(false);    // 是否已处理过首个（重放）状态帧
  const restartPendingRef = useRef(false); // 重连间隔里服务端进程是否换过（重启）

  const onLangChange = (v: Lang) => {
    setLang(v);
    try { localStorage.setItem('fillduck_ui_lang', v); } catch { /* ignore */ }
  };
  const onUnitsChange = (v: string[]) => {
    setUnits(v);
    try { localStorage.setItem('fillduck_units', JSON.stringify(v)); } catch { /* ignore */ }
  };

  // 把当前链接、描述、搜索词写盘到【当前项目】。带上项目名：切换项目瞬间残留的防抖保存会被
  // 服务端按名拒掉，避免 A 项目的文案串写进 B（见 server /save）。返回服务端结果，调用方检查 ok。
  const persist = (): Promise<SaveResult> => fetch('/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project: active,
      chromeEditUrl: chromeUrl.trim(), edgeListingsUrl: edgeUrl.trim(), firefoxEditUrl: firefoxUrl.trim(),
      copy, terms,
    }),
  }).then((r) => r.json());

  // 整体载入当前项目。载入期间冻结自动保存；失败时保持冻结并提示，否则空表单会被自动保存进真实项目。
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
    es.onmessage = (e: MessageEvent) => {
      const d: SseMsg = JSON.parse(e.data);
      // epoch/seq 随每一帧从 JSON 带来，不依赖 Last-Event-ID：epoch 变=服务重启→清屏、重置去重游标
      //（哪怕重启后首帧只是空缓冲的状态帧也能及时清）；同 epoch 内靠 seq 单调去重，避免整段重放重复。
      const prevEpoch = sseEpochRef.current;
      const epochChanged = !!(d.epoch && d.epoch !== prevEpoch);
      if (epochChanged) {
        // prevEpoch 非空 = 进程换过（重启）：清屏，并标记“重启待处理”，供随后的状态帧识别——
        // 哪怕新进程先补发了日志帧再发状态帧，这个标记也不会被冲掉（旧写法靠 epochChanged 在状态帧时判断，
        // 而首个日志帧已把 epoch 推进，到状态帧时就判不出重启，会把中断谎报成“完成”）。
        if (prevEpoch !== null) { setLogs([]); restartPendingRef.current = true; }
        sseEpochRef.current = d.epoch!;
        maxSeqRef.current = 0;
      }
      if (d.type === 'log') {
        if (typeof d.seq === 'number') {
          if (d.seq <= maxSeqRef.current) return; // 已见过（重连整段重放时）→ 跳过
          // seq 跳变说明断线期间有日志滚出了服务端缓冲，补一条占位说明，避免看着连续实则缺行（可能含错误行）。
          if (maxSeqRef.current > 0 && d.seq > maxSeqRef.current + 1) {
            const gap = d.seq - maxSeqRef.current - 1;
            const gid = logIdRef.current++;
            const gts = new Date().toTimeString().slice(0, 8);
            setLogs((prev) => [...prev.slice(-799), { id: gid, ts: gts, msg: tRef.current.logGap(gap), cls: 'warn' }]);
          }
          maxSeqRef.current = d.seq;
        }
        const ts = new Date().toTimeString().slice(0, 8);
        const cls = classify(d.msg);
        if (cls === 'err') runErrRef.current = true; // 不依赖 runningRef：新开页面时重放的错误行先于状态帧到达，也要计入
        const id = logIdRef.current++;
        setLogs((prev) => [...prev.slice(-799), { id, ts, msg: d.msg, cls }]);
      } else if (d.type === 'status') {
        const isRunning = d.status === 'running';
        if (!initializedRef.current) {
          // 首个（重放）状态帧只是“当前快照”，不是我们观察到的跳变：建立运行态即可，
          // 不重置错误标记（保留重放里已计入的错误）、也不弹完成/失败提示。
          initializedRef.current = true;
          runningRef.current = isRunning;
          setRunning(isRunning);
          return;
        }
        if (isRunning && !runningRef.current) { runErrRef.current = false; restartPendingRef.current = false; } // 真正新一轮开始
        if (!isRunning && runningRef.current) {
          if (restartPendingRef.current) {
            message.warning(tRef.current.serverRestarted); // 期间服务重启过 → 运行已中断，不谎报成功
          } else {
            const msg = runErrRef.current ? tRef.current.runFailed : tRef.current.runDone;
            if (runErrRef.current) message.error(msg); else message.success(msg);
            try {
              if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                new Notification('FillDuck', { body: msg });
              }
            } catch { /* ignore */ }
          }
        }
        restartPendingRef.current = false;
        runningRef.current = isRunning;
        setRunning(isRunning);
      }
    };
    return () => es.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [logs]);

  // 自动保存：链接/文案改动后防抖落盘。stale 拒绝必须提示（旧标签页在别处切走项目后每次都被拒），
  // 同一轮只提醒一次，成功后复位。
  useEffect(() => {
    if (!loadedRef.current) return undefined;
    const id = setTimeout(() => {
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
  }, [chromeUrl, edgeUrl, firefoxUrl, copy, terms]); // eslint-disable-line react-hooks/exhaustive-deps

  // —— 项目操作 ——
  const callProjects = async (action: string, body: unknown): Promise<boolean> => {
    const r = await fetch('/projects/' + action, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then((x) => x.json()).catch(() => ({ ok: false, error: 'network' }));
    if (!r.ok) { message.error(r.error || 'failed'); return false; }
    return true;
  };
  // 先把当前编辑落盘（带项目名）。若被判 stale（另一标签页已切走 active），当前编辑无法存回本项目——
  // 过去是【静默】丢弃，现在【明确提示】后仍继续操作：操作本身会 loadState 让本页重新同步，硬拦住反而卡死用户。
  const mutateProject = async (action: string, body: unknown): Promise<boolean> => {
    loadedRef.current = false;
    try {
      const r = await persist();
      if (r && r.ok === false) message.warning(tRef.current.saveRejected(r.error || 'stale'));
    } catch { /* 网络失败：忽略，继续操作 */ }
    if (await callProjects(action, body)) { await loadState(); return true; }
    loadedRef.current = true;
    return false;
  };
  const onSelectProject = async (name: string) => {
    if (name === active) return;
    await mutateProject('select', { name });
  };
  const onProjModalOk = async () => {
    const v = (projModal && projModal.value || '').trim();
    if (!v) return;
    let ok = true;
    if (projModal!.mode === 'create') ok = await mutateProject('create', { name: v });
    else if (v !== active) ok = await mutateProject('rename', { from: active, to: v });
    if (ok) setProjModal(null);
  };
  const onDeleteProject = () => mutateProject('delete', { name: active });

  // 解析文案：显示语言数 / 校验 / 逐语言长度（供分发矩阵）。用与后端同一份 parseInput。
  const langInfo = useMemo(() => {
    const tx = copy.trim();
    if (!tx) return null;
    const r = parseInput(tx);
    if (!r.ok) return { ok: false as const };
    const entries: { locale: string; len: number }[] = Object.entries((r.data ?? {}) as Record<string, unknown>).map(([k, v]) => ({ locale: k, len: String(v).length }));
    const shortLangs = entries.filter((e) => e.len < 250).map((e) => e.locale);
    return { ok: true as const, n: entries.length, entries, short: shortLangs.length, shortLangs };
  }, [copy]);

  const termsInfo = useMemo(() => {
    const tx = terms.trim();
    if (!tx) return null;
    const r = parseTerms(tx);
    if (!r.ok) return { ok: false as const };
    const locales = Object.keys((r.data ?? {}) as Record<string, unknown>);
    const dropped = Object.values((r.report ?? {}) as Record<string, unknown[]>).reduce((a: number, list) => a + list.length, 0);
    return { ok: true as const, n: locales.length, dropped, locales };
  }, [terms]);

  const onLoadSample = () => {
    if (copy.trim()) { message.info(t.sampleBusy); return; }
    setCopy(SAMPLE);
    message.success(t.sampleLoaded);
  };
  const onClear = () => setCopy('');
  const onImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || '');
      setCopy(txt.charCodeAt(0) === 0xFEFF ? txt.slice(1) : txt);
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
  const onImportTerms = (e: ChangeEvent<HTMLInputElement>) => {
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
  const persistChecked = async (): Promise<boolean> => {
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
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch { /* ignore */ }
    if (!(await persistChecked())) return;
    await fetch('/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ units: effectiveUnits, locales: localeFilter }) });
  };
  const onStop = () => fetch('/stop', { method: 'POST' });

  // 派生态
  const cUrl = chromeUrl.trim();
  const eUrl = edgeUrl.trim();
  const fUrl = firefoxUrl.trim();
  const chromeUrlWarn = cUrl && !/devconsole\/.*\/edit\/?($|\?|#)/i.test(cUrl);
  const edgeUrlWarn = eUrl && !/microsoftedge\/[^/]+\/listings\/?($|\?|#)/i.test(eUrl);
  const firefoxUrlWarn = fUrl && !/\/developers\/addon\/[^/]+\/edit/i.test(fUrl);

  const hasAnyUrl = !!cUrl || !!eUrl || !!fUrl;
  const hasValidDesc = !!(langInfo && langInfo.ok);
  const hasValidTerms = !!(termsInfo && termsInfo.ok);
  const unitReady: Record<string, { url: boolean; content: boolean }> = {
    'chrome-desc': { url: !!cUrl, content: hasValidDesc },
    'edge-desc': { url: !!eUrl, content: hasValidDesc },
    'edge-terms': { url: !!eUrl, content: hasValidTerms },
    'firefox-desc': { url: !!fUrl, content: hasValidDesc },
  };
  const unitRunnable = (u: string) => unitReady[u].url && unitReady[u].content;
  const effectiveUnits = units.filter(unitRunnable);
  const anyRunnable = ALL_UNITS.some(unitRunnable);
  const jsonInvalid = !!(copy.trim() && langInfo && !langInfo.ok);
  const loginNeedsUrl = !running && !hasAnyUrl;
  const unitMeta = [
    { key: 'chrome-desc', label: t.unitChromeDesc },
    { key: 'edge-desc', label: t.unitEdgeDesc },
    { key: 'edge-terms', label: t.unitEdgeTerms },
    { key: 'firefox-desc', label: t.unitFirefoxDesc },
  ];

  // 语言选择：可勾选哪些语言本次生效（默认全选），只有勾选的会被填充。每行再示意写进哪些商店。
  // 语言全集 = 描述 ∪ 搜索词 的语言：仅有搜索词的语言也要能在这里选，否则它会在 UI 里隐身、
  // 又被服务端按“描述语言”白名单过滤掉（搜索词被静默丢弃）。
  const descEntries = (langInfo && langInfo.ok ? langInfo.entries : []);
  const descLen = new Map(descEntries.map((e) => [e.locale, e.len] as const));
  const termLocales = (termsInfo && termsInfo.ok ? termsInfo.locales : []);
  const copyLocales = [...new Set([...descEntries.map((e) => e.locale), ...termLocales])];
  const localeItems: LocaleItem[] = copyLocales.map((locale) => ({
    locale, native: nativeName(locale), len: descLen.get(locale) ?? 0, hasDesc: descLen.has(locale),
  }));
  const localeStores: LocaleStore[] = [
    { key: 'chrome', label: 'Chrome', badge: 'C', inScope: effectiveUnits.includes('chrome-desc') },
    { key: 'edge', label: 'Edge', badge: 'E', inScope: effectiveUnits.includes('edge-desc'), minChars: 250 },
    { key: 'firefox', label: 'Firefox', badge: 'F', inScope: effectiveUnits.includes('firefox-desc') },
  ];
  const offSet = new Set(localesOff[active] || []);
  const selectedLocales = copyLocales.filter((l) => !offSet.has(l));
  const selectedSet = new Set(selectedLocales);
  // 有 copy 语言时才发白名单；没有则传 null（不过滤），保留“仅搜索词”的用法。
  const localeFilter: string[] | null = copyLocales.length ? selectedLocales : null;
  const noLocale = copyLocales.length > 0 && selectedLocales.length === 0;

  const saveLocalesOff = (next: Record<string, string[]>) => {
    setLocalesOff(next);
    try { localStorage.setItem('fillduck_locales_off', JSON.stringify(next)); } catch { /* ignore */ }
  };
  const toggleLocale = (loc: string) => {
    const cur = new Set(localesOff[active] || []);
    if (cur.has(loc)) cur.delete(loc); else cur.add(loc);
    saveLocalesOff({ ...localesOff, [active]: [...cur] });
  };
  const selectAllLocales = () => { const n = { ...localesOff }; delete n[active]; saveLocalesOff(n); };
  const selectNoneLocales = () => saveLocalesOff({ ...localesOff, [active]: [...copyLocales] });

  // 能否开跑：先要有可执行单元；再要求至少选中一种语言（有 copy 语言时）。
  const runReason = effectiveUnits.length ? (noLocale ? t.needLocale : '') : (anyRunnable ? t.needUnit : t.needSetup);
  const canRun = !runReason;

  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, color: 'var(--fd-muted)', fontSize: 12, letterSpacing: '0.04em' };

  return (
    <div className="fd-shell">
      {/* 头部 */}
      <Flex justify="space-between" align="flex-end" wrap className="rise" style={{ marginBottom: 26, gap: 16 }}>
        <div className="fd-brand">
          <div className="fd-duck">🦆</div>
          <div>
            <div className="fd-word">Fill<b>Duck</b></div>
            <div className="fd-sub">{t.fanout(copyLocales.length)}</div>
          </div>
        </div>
        <div className="fd-headright">
          <a href="https://github.com/rockbenben/fillduck" target="_blank" rel="noreferrer" className="gh-link mono">
            <GithubOutlined /> rockbenben/fillduck
          </a>
          <Segmented
            size="small"
            value={lang}
            onChange={(v) => onLangChange(v as Lang)}
            options={[{ label: '中', value: 'zh' }, { label: 'EN', value: 'en' }]}
          />
          <span className={`fd-status ${running ? 'run' : 'idle'}`}>
            <span className="fd-tele" />{running ? t.running : t.idle}
          </span>
        </div>
      </Flex>

      {/* 目标后台：项目 + 三商店链接 */}
      <Card className="rise" style={{ marginBottom: 16, animationDelay: '0.05s' }} styles={{ body: { padding: 22 } }}>
        <div className="fd-eyebrow"><GlobalOutlined style={{ color: 'var(--fd-cyan)' }} />{t.targets}</div>
        <Flex align="center" gap={8} wrap style={{ marginBottom: 16 }}>
          <span className="fd-label" style={{ fontSize: 11 }}>{t.projectLabel}</span>
          <Select
            style={{ minWidth: 210 }} value={active || undefined} disabled={running}
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
        <div className="fd-field-grid">
          <div>
            <label style={labelStyle}>{t.chromeLabel}</label>
            <Input className="fd-url" prefix={<ChromeOutlined style={{ color: '#6FB1EE' }} />} placeholder="https://chrome.google.com/webstore/devconsole/.../edit" value={chromeUrl} onChange={(e) => setChromeUrl(e.target.value)} />
            {chromeUrlWarn && <span className="fd-hint warn" style={{ marginTop: 5 }}>{t.chromeUrlWarn}</span>}
          </div>
          <div>
            <label style={labelStyle}>{t.edgeLabel}</label>
            <Input className="fd-url" prefix={<GlobalOutlined style={{ color: '#58C0AE' }} />} placeholder="https://partner.microsoft.com/.../listings" value={edgeUrl} onChange={(e) => setEdgeUrl(e.target.value)} />
            {edgeUrlWarn && <span className="fd-hint warn" style={{ marginTop: 5 }}>{t.edgeUrlWarn}</span>}
          </div>
          <div>
            <label style={labelStyle}>{t.firefoxLabel}</label>
            <Input className="fd-url" prefix={<FireOutlined style={{ color: '#F0925C' }} />} placeholder="https://addons.mozilla.org/.../developers/addon/<slug>/edit" value={firefoxUrl} onChange={(e) => setFirefoxUrl(e.target.value)} />
            {firefoxUrlWarn && <span className="fd-hint warn" style={{ marginTop: 5 }}>{t.firefoxUrlWarn}</span>}
          </div>
        </div>
      </Card>

      <Modal
        open={!!projModal} title={projModal && projModal.mode === 'create' ? t.projectNew : t.projectRename}
        okText={projModal && projModal.mode === 'create' ? t.projectCreate : t.projectOk}
        cancelText={t.cancel}
        onOk={onProjModalOk} onCancel={() => setProjModal(null)} destroyOnHidden width={360}
      >
        <Input autoFocus placeholder={t.projectNamePh} value={(projModal && projModal.value) || ''}
          onChange={(e) => setProjModal((m) => (m ? { ...m, value: e.target.value } : m))}
          onPressEnter={onProjModalOk} />
      </Modal>

      {/* 源文案 | 分发矩阵 */}
      <div className="fd-cols rise" style={{ marginBottom: 16, animationDelay: '0.1s' }}>
        <Card styles={{ body: { padding: 22 } }}>
          <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
            <div className="fd-eyebrow" style={{ margin: 0 }}><CodeOutlined style={{ color: 'var(--fd-cyan)' }} />{t.sourceTitle}</div>
            {langInfo && (langInfo.ok
              ? <Tag bordered={false} color="cyan">{t.langs(langInfo.n)}{langInfo.short ? t.short(langInfo.short) : ''}</Tag>
              : <Tag bordered={false} color="error">{t.jsonBad}</Tag>)}
          </Flex>
          <label style={labelStyle}>{t.copyLabel}</label>
          <Input.TextArea
            className="fd-code"
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
            autoSize={{ minRows: 7, maxRows: 15 }}
            placeholder={'{\n  "en": "English description…",\n  "zh_CN": "中文描述…",\n  "pt_BR": "…"\n}'}
          />
          <span className={`fd-hint ${jsonInvalid ? 'err' : ''}`} style={{ marginTop: 8 }}>
            {jsonInvalid ? t.jsonHint : t.jsonFormat}
          </span>

          <input ref={fileRef} type="file" accept=".json,.txt,application/json" style={{ display: 'none' }} onChange={onImportFile} />
          <Flex justify="space-between" align="center" wrap style={{ marginTop: 14, gap: 8 }}>
            <Space size={4}>
              <Button variant="text" color="default" size="small" icon={<CodeOutlined />} onClick={onLoadSample}>{t.loadSample}</Button>
              <Button variant="text" color="default" size="small" icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>{t.importFile}</Button>
              <Popconfirm title={t.clearConfirm} onConfirm={onClear} okText={t.clear} cancelText={t.cancel} disabled={!copy.trim()}>
                <Button variant="text" color="default" size="small" icon={<DeleteOutlined />} disabled={!copy.trim()}>{t.clear}</Button>
              </Popconfirm>
            </Space>
            <Space size={10} align="center">
              <span style={{ color: 'var(--fd-dim)', fontSize: 12 }}>{t.autosaved}</span>
              <Button variant="filled" color="default" icon={<SaveOutlined />} onClick={onSave}>{t.save}</Button>
            </Space>
          </Flex>
        </Card>

        <Card styles={{ body: { padding: 22 } }}>
          <div className="fd-eyebrow">
            <PartitionOutlined style={{ color: 'var(--fd-cyan)' }} />{t.localesTitle}
          </div>
          <LocaleSelect
            items={localeItems}
            stores={localeStores}
            selected={selectedSet}
            disabled={running}
            onToggle={toggleLocale}
            onAll={selectAllLocales}
            onNone={selectNoneLocales}
            emptyText={t.localeEmpty}
            labels={{ on: t.effOn, all: t.selAll, none: t.selNone, short: t.mShort, note: t.localeNote }}
          />
        </Card>
      </div>

      {/* 搜索词（仅 Edge）：整幅一行 */}
      <Card className="rise" style={{ marginBottom: 16, animationDelay: '0.12s' }} styles={{ body: { padding: 22 } }}>
        <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
          <div className="fd-eyebrow" style={{ margin: 0 }}><TagsOutlined style={{ color: 'var(--fd-cyan)' }} />{t.termsLabel}</div>
          {termsInfo && (termsInfo.ok
            ? <Tag bordered={false} color="cyan">{t.termsLangs(termsInfo.n)}</Tag>
            : <Tag bordered={false} color="error">{t.jsonBad}</Tag>)}
        </Flex>
        <Input.TextArea
          className="fd-code"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          autoSize={{ minRows: 3, maxRows: 8 }}
          placeholder={'{\n  "en": ["term one", "term two"],\n  "zh_CN": ["关键词一", "关键词二"]\n}'}
        />
        <span className="fd-hint" style={{ marginTop: 8 }}>{t.termsFormat}</span>
        {termsInfo && termsInfo.ok && termsInfo.dropped > 0 && (
          <span className="fd-hint warn" style={{ marginTop: 4 }}>{t.termsDropped(termsInfo.dropped)}</span>
        )}
        <input ref={termsFileRef} type="file" accept=".json,.txt,application/json" style={{ display: 'none' }} onChange={onImportTerms} />
        <Space size={4} style={{ marginTop: 12 }}>
          <Button variant="text" color="default" size="small" icon={<CodeOutlined />} onClick={onLoadSampleTerms}>{t.termsSample}</Button>
          <Button variant="text" color="default" size="small" icon={<UploadOutlined />} onClick={() => termsFileRef.current?.click()}>{t.importFile}</Button>
          <Popconfirm title={t.termsClearConfirm} onConfirm={onClearTerms} okText={t.clear} cancelText={t.cancel} disabled={!terms.trim()}>
            <Button variant="text" color="default" size="small" icon={<DeleteOutlined />} disabled={!terms.trim()}>{t.clear}</Button>
          </Popconfirm>
        </Space>
      </Card>

      {/* 执行 */}
      <Card className="rise" style={{ marginBottom: 16, animationDelay: '0.15s' }} styles={{ body: { padding: 22 } }}>
        <div className="fd-eyebrow"><ThunderboltFilled style={{ color: 'var(--fd-cyan)' }} />{t.exec}</div>
        <div className="fd-run">
          <Checkbox.Group value={units} onChange={onUnitsChange} disabled={running}>
            <div className="fd-units">
              {unitMeta.map((u) => {
                const ready = unitRunnable(u.key);
                const why = !unitReady[u.key].url ? t.unitNoUrl : !unitReady[u.key].content ? t.unitNoContent : '';
                return (
                  <span className="fd-unit" key={u.key}>
                    <Checkbox value={u.key} disabled={!ready}>
                      <span style={{ color: ready ? 'var(--fd-ink)' : 'var(--fd-dim)' }}>{u.label}</span>
                      {why && <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--fd-dim)' }}>({why})</span>}
                    </Checkbox>
                  </span>
                );
              })}
            </div>
          </Checkbox.Group>
          <Tooltip title={loginNeedsUrl ? t.needUrlLogin : t.loginNote}>
            <Button variant="outlined" icon={<LoginOutlined />} onClick={onLogin} disabled={running || !hasAnyUrl} style={{ marginLeft: 'auto' }}>{t.login}</Button>
          </Tooltip>
          <Button className="fd-start" color="primary" variant="solid" icon={<ThunderboltFilled />} onClick={onRun} loading={running} disabled={running || !canRun}>
            {running ? t.runningBtn : t.run}
          </Button>
          <Button color="danger" variant="solid" icon={<StopOutlined />} onClick={onStop} disabled={!running}>{t.stop}</Button>
        </div>
        {(!running && runReason) && <span className="fd-hint warn" style={{ marginTop: 14 }}>{runReason}</span>}
        <span className="fd-hint" style={{ marginTop: 12 }}>{t.execNote}</span>
      </Card>

      {/* 日志 */}
      <Card className="rise" style={{ animationDelay: '0.2s' }} styles={{ body: { padding: 22 } }}>
        <Flex align="center" justify="space-between" style={{ marginBottom: 12 }}>
          <div className="fd-eyebrow" style={{ margin: 0 }}><CheckCircleFilled style={{ color: 'var(--fd-good)' }} />{t.logsTitle}</div>
          <Space size={10} align="center">
            <span className="mono" style={{ color: 'var(--fd-dim)', fontSize: 11 }}>{t.lines(logs.length)}</span>
            <Button size="small" variant="text" color="default" icon={<CopyOutlined />} onClick={onCopyLogs} disabled={logs.length === 0}>{t.copyLogs}</Button>
          </Space>
        </Flex>
        <div className="fd-log" ref={consoleRef}>
          {logs.length === 0
            ? <div className="fd-log-empty">{t.logsEmpty}</div>
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
