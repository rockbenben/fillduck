import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  Card, Input, Button, Flex, Tag, Space, Segmented, Tooltip, App as AntApp, Popconfirm,
  Select, Modal, Checkbox,
} from 'antd';
import {
  ChromeOutlined, GlobalOutlined, LoginOutlined, ThunderboltFilled,
  SaveOutlined, CodeOutlined, CheckCircleFilled, StopOutlined, DeleteOutlined, CopyOutlined, UploadOutlined,
  TagsOutlined, PlusOutlined, EditOutlined, FireOutlined, GithubOutlined, PartitionOutlined, QuestionCircleOutlined,
} from '@ant-design/icons';
import { parseInput, parseTerms } from '../../../src/core.mjs'; // 复用后端同一份校验，规则完全一致
import { translateLog, logLevelOf } from '../../../src/logmap.mjs'; // 运行日志的双语显示层（与日志源头同一份表）
import { readRun, tally } from '../../../src/runread.mjs'; // 从日志原文读「每项跑到哪 / 这轮结果」
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

// 界面文案（中/英）。运行日志由服务端产出（中文），显示层按界面语言翻译，见 src/logmap.mjs。
const STR = {
  zh: {
    docTitle: 'FillDuck 填鸭 · 多语言填充控制台',
    htmlLang: 'zh-CN',
    fanout: (n: number) => (n ? `一份文案 → 3 个商店 · ${n} 种语言` : '一份文案 → Chrome / Edge / Firefox 三个商店'),
    running: '运行中', idle: '空闲',
    targets: '目标后台', chromeLabel: 'CHROME 编辑页', edgeLabel: 'EDGE 列表页', firefoxLabel: 'FIREFOX 编辑页',
    projectLabel: '项目', projectNew: '新建', projectRename: '重命名', projectDelete: '删除',
    projectNamePh: '项目名（如扩展名称）', projectCreate: '创建', projectOk: '确定', cancel: '取消',
    needName: '名字不能为空', projectTaken: (n: string) => `已经有叫「${n}」的项目了，换一个名字`,
    skipToRun: '跳到操作区',
    stepLink: '填后台链接', stepCopy: '贴多语言文案', stepRun: '开始填充', stepNow: '现在做这一步',
    projectDeleteConfirm: (n: string) => `删除项目「${n}」？它的链接和文案会一起删掉，删了找不回来。`,
    chromeUrlWarn: '这看起来不是 Chrome 的编辑页。',
    edgeUrlWarn: '这看起来不是 Edge 的列表页。',
    firefoxUrlWarn: '这看起来不是 Firefox 的编辑页。',
    urlRuleChrome: 'Chrome：地址里要有 devconsole，并以 /edit 结尾。',
    urlRuleEdge: 'Edge：地址要是 …/microsoftedge/<编号>/listings。',
    urlRuleFirefox: 'Firefox：地址要是 …/developers/addon/<名称>/edit。',
    loadFailed: '没能读到项目内容，先别改 —— 确认服务在跑，再刷新页面。',
    // 服务端回的是内部错误码（如 stale project），不能原样端给用户；映射成人话。
    saveRejected: (e: string) => (/stale/i.test(e)
      ? '这个页面已经不是当前项目了（别处在别的页面切走了）。刷新就能同步回来。'
      : `没保存上（${e}），刷新页面后重试。`),
    serverRestarted: '服务重启过，上一次填充被打断了 —— 看日志确认填到哪儿了。',
    logGap: (n: number) => `…断线期间有 ${n} 行日志没接上，其中可能有报错。`,
    sourceTitle: '源文案',
    copyLabel: '多语言描述', langs: (n: number) => `${n} 种语言`, short: (n: number) => ` · ${n} 种不足 250 字`,
    jsonBad: '格式不对',
    jsonHint: '多半是最后多了一个逗号。想分段就空一行写，别直接回车。',
    jsonFormat: '每种语言一行："语言码": "描述"。',
    jsonFormatTip: '标准 JSON：{ "语言码": "完整描述", … } —— 键和值都用英文双引号 "，多项之间用逗号分隔，最后一项后不加逗号。描述里的换行要写成 \\n（不能直接回车换行）。',
    loadSample: '填入样例', sampleLoaded: '已填入样例，改完就能用', sampleBusy: '描述框已有内容；清空后再填样例。',
    needUrlLogin: '先填一个后台链接再登录',
    clear: '清空', clearConfirm: '清空这份多语言描述？清完可以从文件重新导入。',
    savedAt: (ts: string) => `已保存 · ${ts}`, neverSaved: '还没保存过', saveNow: '立即写盘',
    linkDigest: (host: string, tail: string) => `${host} · …/${tail}`,
    importFile: '导入文件', imported: '已从文件导入描述', importFail: '读不了这个文件',
    saved: '链接与文案已保存',
    login: '登录后台', loginNote: '登录态会记住，只需一次',
    loginToast: '后台已经打开，在弹出的浏览器里登录 Google / Microsoft / Mozilla（按你填的后台）。',
    run: '开始填充', runningBtn: '填充中…', stop: '停止', exec: '执行',
    unitChromeDesc: 'Chrome 描述', unitEdgeDesc: 'Edge 描述', unitEdgeTerms: 'Edge 搜索词', unitFirefoxDesc: 'Firefox 描述',
    needUnit: '还差一步：勾上要填的内容', needSetup: '还差一步：填后台链接',
    unitNoUrl: '还没填链接', unitNoContent: '还没有这一项的内容',
    needLocale: '还差一步：至少勾一种语言',
    execNote: '会打开真浏览器一项项填，填完不关窗口 —— 检查过再由你提交。',
    execNoteTip: 'Edge 描述每种需 ≥250 字；Firefox(AMO) 描述每种上限 15000 字、保存即生效；Chrome / Edge 只写草稿。',
    allUnits: (n: number) => `全部 ${n} 项`,
    willFill: (items: string, n: number) => `本次会填：${items}（${n} 种语言）`,
    willFillNone: '本次会填：还没有可填项（每项不能选的原因见上面）',
    // 运行读数（U4）与结果条（U5）：同一排格子，跑的时候是进度，跑完就是结果
    runNow: '进行中', runResult: '本轮结果',
    uPending: '未开始', uMissed: '没轮到', uPreparing: '准备中', uUnselected: '没选这项',
    uOf: (n: number) => `共 ${n} 种`, uStoredDraft: (n: number) => `草稿 ${n} 种`, uStored: '已存住',
    uHuman: (n: number) => `需人工 ${n} 种`, uSkipped: '已跳过', uFailed: '没跑成',
    rStored: (n: number) => `${n} 项已存`, rHuman: (n: number) => `${n} 项需人工`,
    rSkipped: (n: number) => `${n} 项跳过`, rFailed: (n: number) => `${n} 项没跑成`,
    rRunning: (n: number) => `${n} 项停在半路`, rPending: (n: number) => `${n} 项没轮到`,
    logsTitle: '运行日志', lines: (n: number) => `${n} 行`, logsEmpty: '还没跑过。跑起来后这里会一行行出。',
    copyLogs: '复制日志', logsCopied: '日志已复制', logsCopyFail: '复制没成，请手动选中再复制',
    runDone: '这一轮跑完了，结果在执行区那一行', runFailed: '这一轮有报错，执行区那行标出了哪几项没成',
    termsLabel: '搜索词（只填 Edge）', termsLangs: (n: number) => `${n} 种语言`,
    termsFormat: '每种语言最多 7 个词，每个词不超过 30 字。超出的会自动去掉。',
    termsFormatTip: '标准 JSON：{ "语言码": ["词1","词2"] }，值是搜索词数组。规则：每语言最多 7 个词、每词 ≤30 字符、所有词的独立词语 ≤21；超出的会自动去掉。',
    termsDropped: (n: number) => `已去掉 ${n} 个不合规则的词（太多 / 太长）。`,
    termsSample: '填入样例', termsSampleLoaded: '已填入搜索词样例', termsSampleBusy: '搜索词框已有内容；清空后再填样例。',
    termsImported: '已从文件导入搜索词', termsClearConfirm: '清空这份搜索词？清完可以从文件重新导入。',
    localesTitle: '语言 · 勾选生效', mShort: '<250',
    effOn: (n: number, m: number) => `${n} / ${m} 生效`, selAll: '全选', selNone: '全不选',
    localeEmpty: '填好上面的文案后，这里可勾选哪些语言本次生效（默认全选）。',
    legendReady: '会写入', legendSkip: '太短，跳过', legendNa: '该商店未选',
    locHidden: (n: number, m: number) => `这里显示 ${n} 种，共 ${m} 种，往下还能滚`,
    rulesLink: '看规则',
  },
  en: {
    docTitle: 'FillDuck Console · multilingual store copy filler',
    htmlLang: 'en',
    fanout: (n: number) => (n ? `One copy → 3 stores · ${n} locales` : 'One copy → Chrome / Edge / Firefox'),
    running: 'RUNNING', idle: 'IDLE',
    targets: 'Target dashboards', chromeLabel: 'CHROME EDIT PAGE', edgeLabel: 'EDGE LISTINGS PAGE', firefoxLabel: 'FIREFOX EDIT PAGE',
    projectLabel: 'Project', projectNew: 'New', projectRename: 'Rename', projectDelete: 'Delete',
    projectNamePh: 'Project name (e.g. extension name)', projectCreate: 'Create', projectOk: 'OK', cancel: 'Cancel',
    needName: 'A name is required', projectTaken: (n: string) => `There is already a project called "${n}" — pick another name`,
    skipToRun: 'Skip to actions',
    stepLink: 'Add dashboard links', stepCopy: 'Paste your copy', stepRun: 'Start filling', stepNow: 'do this now',
    projectDeleteConfirm: (n: string) => `Delete project "${n}"? Its links and copy go with it — there is no undo.`,
    chromeUrlWarn: 'This does not look like a Chrome edit page.',
    edgeUrlWarn: 'This does not look like an Edge listings page.',
    firefoxUrlWarn: 'This does not look like a Firefox edit page.',
    urlRuleChrome: 'Chrome: the address contains devconsole and ends with /edit.',
    urlRuleEdge: 'Edge: the address is …/microsoftedge/<id>/listings.',
    urlRuleFirefox: 'Firefox: the address is …/developers/addon/<slug>/edit.',
    loadFailed: 'Could not load the project — hold off editing, check the server is running, then refresh.',
    saveRejected: (e: string) => (/stale/i.test(e)
      ? 'This tab is no longer on the current project (another tab switched it). Refresh to sync.'
      : `Save failed (${e}) — refresh and try again.`),
    serverRestarted: 'The server restarted and the last run was interrupted — check the log for real progress.',
    logGap: (n: number) => `…${n} log line(s) were lost while disconnected — some may be errors.`,
    sourceTitle: 'Source copy',
    copyLabel: 'Multilingual descriptions', langs: (n: number) => `${n} locales`, short: (n: number) => ` · ${n} under 250 chars`,
    jsonBad: 'Bad format',
    jsonHint: 'Usually a trailing comma. To start a new paragraph, leave a blank line — do not press Enter.',
    jsonFormat: 'One line per language: "locale": "description".',
    jsonFormatTip: 'Standard JSON: { "locale": "full description", … } — quote every key and value with ", separate items with commas, no comma after the last one. Line breaks inside a value must be written as \\n (not a real newline).',
    loadSample: 'Load sample', sampleLoaded: 'Sample loaded — edit it and go', sampleBusy: 'The box already has content — clear it first.',
    needUrlLogin: 'Add a dashboard link first',
    clear: 'Clear', clearConfirm: 'Clear these descriptions? You can import them from a file again.',
    savedAt: (ts: string) => `Saved · ${ts}`, neverSaved: 'Not saved yet', saveNow: 'Write now',
    linkDigest: (host: string, tail: string) => `${host} · …/${tail}`,
    importFile: 'Import file', imported: 'Descriptions imported from file', importFail: 'Could not read that file',
    saved: 'Links & copy saved',
    login: 'Log in', loginNote: 'Login is remembered — only once',
    loginToast: 'Dashboards opened — log in to Google / Microsoft / Mozilla (whichever you configured) in the browser window.',
    run: 'Start', runningBtn: 'Filling…', stop: 'Stop', exec: 'Run',
    unitChromeDesc: 'Chrome descriptions', unitEdgeDesc: 'Edge descriptions', unitEdgeTerms: 'Edge search terms', unitFirefoxDesc: 'Firefox descriptions',
    needUnit: 'One step left: pick what to fill', needSetup: 'One step left: add a dashboard link',
    unitNoUrl: 'no link yet', unitNoContent: 'nothing to fill here yet',
    needLocale: 'One step left: pick at least one locale',
    execNote: 'A real browser opens and fills one item at a time; it stays open — review, then submit yourself.',
    execNoteTip: 'Edge needs ≥250 characters per description; Firefox (AMO) caps each at 15,000 characters and saves directly; Chrome and Edge only write drafts.',
    allUnits: (n: number) => `all ${n} items`,
    willFill: (items: string, n: number) => `This run will fill: ${items} (${n} locales)`,
    willFillNone: 'This run will fill: nothing yet — each box above says why',
    runNow: 'In progress', runResult: 'This run',
    uPending: 'waiting', uMissed: 'not reached', uPreparing: 'starting', uUnselected: 'not selected',
    uOf: (n: number) => `${n} to go`, uStoredDraft: (n: number) => `draft ×${n}`, uStored: 'saved',
    uHuman: (n: number) => `check ${n}`, uSkipped: 'skipped', uFailed: 'failed',
    rStored: (n: number) => `${n} saved`, rHuman: (n: number) => `${n} to check`,
    rSkipped: (n: number) => `${n} skipped`, rFailed: (n: number) => `${n} failed`,
    rRunning: (n: number) => `${n} stopped partway`, rPending: (n: number) => `${n} not reached`,
    logsTitle: 'Run log', lines: (n: number) => `${n} lines`, logsEmpty: 'Nothing has run yet. Lines appear here while it runs.',
    copyLogs: 'Copy log', logsCopied: 'Log copied', logsCopyFail: 'Copy failed — select the text manually',
    runDone: 'Run finished — the outcome is on the Run line', runFailed: 'The run hit errors — the Run line shows which ones',
    termsLabel: 'Search terms (Edge only)', termsLangs: (n: number) => `${n} locales`,
    termsFormat: 'Up to 7 terms per language, 30 characters each. Anything over is dropped.',
    termsFormatTip: 'Standard JSON: { "locale": ["term1","term2"] }, value is an array of terms. Rules: ≤7 terms per language, ≤30 chars each, ≤21 distinct words total; anything over is dropped automatically.',
    termsDropped: (n: number) => `Dropped ${n} term(s) that broke the rules (too many / too long).`,
    termsSample: 'Load sample', termsSampleLoaded: 'Search-term sample loaded', termsSampleBusy: 'The terms box already has content — clear it first.',
    termsImported: 'Search terms imported from file', termsClearConfirm: 'Clear these search terms? You can import them from a file again.',
    localesTitle: 'Locales · check to fill', mShort: '<250',
    effOn: (n: number, m: number) => `${n} / ${m} on`, selAll: 'All', selNone: 'None',
    localeEmpty: 'Add copy above, then pick which locales this run fills (all on by default).',
    legendReady: 'will fill', legendSkip: 'too short, skipped', legendNa: 'store not selected',
    locHidden: (n: number, m: number) => `showing ${n} of ${m} — scroll for more`,
    rulesLink: 'See the rules',
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

// 表外行的兜底分色：日志文案表（src/logmap.mjs）命中时用表里的级别，这里只兜未登记的行。
function classify(msg: string): string {  if (/出错|失败|❌|\[x\]/.test(msg)) return 'err';
  if (/完成|成功|✅/.test(msg)) return 'ok';
  if (/提示|注意|跳过|忽略|缺|不足|未找到/.test(msg)) return 'warn';
  return '';
}

// 规则细节收在这里：屏上只留一句「下一步做什么」，长句要读的人主动点开看。
function RulesTip({ text, label }: { text: string; label: string }) {
  return (
    <Tooltip title={text} styles={{ root: { maxWidth: 420 } }}>
      <Button className="fd-rules" size="small" variant="text" color="default" icon={<QuestionCircleOutlined />}>{label}</Button>
    </Tooltip>
  );
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
  // /state 落地前不要渲染「会随数据消失」的块（三步条、链接摘要）：
  // 否则首帧画出它们、数据一到又抽走，整页往下跳一次（DevTools CLS 实测 0.11 的主因之一）。
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState(''); // 最近一次写盘成功的时刻（空=本次会话还没存过）
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
  const tRef = useRef<Dict>(t);
  const runningRef = useRef(false);
  const runErrRef = useRef(false);
  const logIdRef = useRef(0);
  const staleWarnedRef = useRef(false);
  const sseEpochRef = useRef<string | null>(null);
  const maxSeqRef = useRef(0);
  const initializedRef = useRef(false);    // 是否已处理过首个（重放）状态帧
  const restartPendingRef = useRef(false); // 重连间隔里服务端进程是否换过（重启）

  // 让 SSE 回调与副作用始终读到最新的界面字典。必须写在 effect 里，不能在渲染期间直接赋值：
  // 渲染期间改 ref 在并发渲染下可能被丢弃、或读到另一条渲染分支的值。
  // 只被异步回调读取，晚一帧同步没有影响。
  useEffect(() => { tRef.current = t; });

  // 界面语言要走到文档层：标签页标题、<html lang> 和排印档（字距/大写只给拉丁）都跟着切换。
  // 以前切到 EN 后标题仍是中文、lang 仍是 zh-CN，读屏与浏览器都以为页面是中文。
  useEffect(() => {
    document.title = t.docTitle;
    document.documentElement.lang = t.htmlLang;
  }, [t]);

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
  }).then((r) => r.json()).then((j: SaveResult) => { if (j && j.ok) setSavedAt(clock()); return j; });

  // 写盘成功的那一刻要能在屏上报出来（「已保存 · 19:21:58」），而不是空喊一句「改动自动保存」。
  const clock = () => new Date().toTimeString().slice(0, 8);

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
      setLoaded(true);
    } catch {
      message.error(tRef.current.loadFailed);
    }
  };

  useEffect(() => {
    // loadState 是 async：它的 setState 全部在 await 之后（微任务里）执行，不是渲染后的同步 setState，
    // 不会触发这条规则要防的级联渲染。规则看不穿 async 边界，故在此定向关闭。
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        // 分色优先看文案表的级别；表外的行（异常原文、第三方输出）才落到中文关键词兜底
        const cls = logLevelOf(d.msg) ?? classify(d.msg);
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
    // 复制的是「看到的那份」：英文界面下贴出去的东西也该是英文
    const text = logs.map((l) => `${l.ts} ${lang === 'en' ? translateLog(l.msg) : l.msg}`).join('\n');
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
  const willFillText = effectiveUnits.length
    ? t.willFill(effectiveUnits.length === ALL_UNITS.length ? t.allUnits(effectiveUnits.length)
        : effectiveUnits.map((u) => unitMeta.find((m) => m.key === u)?.label || u).join(' · '), selectedLocales.length)
    : t.willFillNone;
  // U4/U5：跑起来之后，同一个位置从「本次会填」换成实时进度，跑完换成常驻结果条。
  // 读数从日志原文解析（src/runread.mjs），不依赖服务端上报，也不靠 3 秒自隐的 toast。
  const runRead = useMemo(() => readRun(logs.map((l) => l.msg)), [logs]);
  const pickedUnits = new Set(effectiveUnits);
  const runTallyText = (() => {
    if (runRead.mode !== 'result') return '';
    const c = tally(runRead.units.filter((u) => pickedUnits.has(u.key)));
    return [c.stored && t.rStored(c.stored), c.review && t.rHuman(c.review),
      c.skipped && t.rSkipped(c.skipped), c.failed && t.rFailed(c.failed),
      c.running && t.rRunning(c.running), c.pending && t.rPending(c.pending)].filter(Boolean).join(' · ');
  })();
  const pillText = (st: string, u: { i: number; n: number; filled: number; human: number }) => {
    if (st === 'unselected') return t.uUnselected;
    if (st === 'running') return u.i && u.n ? `${u.i}/${u.n}` : u.n ? t.uOf(u.n) : t.uPreparing;
    if (st === 'stored') return u.filled ? t.uStoredDraft(u.filled) : t.uStored;
    if (st === 'review') return u.human ? t.uHuman(u.human) : t.uStored;
    if (st === 'skipped') return t.uSkipped;
    if (st === 'failed') return t.uFailed;
    return runRead.mode === 'result' ? t.uMissed : t.uPending;
  };
  // 首屏引导：三件事没做完之前，把顺序摆在最上面（以前是六张平铺的卡 + 一句 17 字提示）
  const setupDone = hasAnyUrl && hasValidDesc && canRun;

  // 项目名弹窗：以前空名字时「确定」照样能点，按下去 if (!v) return —— 毫无反馈（实测）。
  const projName = (projModal && projModal.value || '').trim();
  const projDup = !!projName && projName !== active && projects.includes(projName);
  const projHint = !projName ? t.needName : projDup ? t.projectTaken(projName) : '';

  // 日志行只在【日志变了】的时候才重建。以前每次按键都重渲染整棵树，800 行日志时
  // 实测一次输入要同步花掉 ~31ms（DevTools trace：40 键累计 286ms 强制回流）。
  // 元素引用不变，React 就能整棵子树跳过 reconcile。
  const logRows = useMemo(() => logs.map((l) => (
    <div key={l.id} className={`ln ${l.cls}`}>
      <span className="ts">{l.ts}</span>{lang === 'en' ? translateLog(l.msg) : l.msg}
    </div>
  )), [logs, lang]);

  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: 6, color: 'var(--fd-muted)', fontSize: 12, letterSpacing: '0.04em' };



  // 链接框只有 337px 宽，长 URL 的尾部（扩展 ID / slug / 是不是 /edit）永远看不见。
  // 在框下把「域名 · 末两段」摊出来，用户能一眼核对有没有粘错地址。
  const digest = (u: string) => {
    try {
      const x = new URL(u);
      const tail = x.pathname.split('/').filter(Boolean).slice(-2).map((s) => decodeURIComponent(s)).join('/') || x.pathname;
      return t.linkDigest(x.host, tail);
    } catch { return ''; }
  };

  return (
    <main className="fd-shell" data-lang={lang}>
      {/* 键盘用户的捷径：主操作键以前排在第 47 站之后（24 行语言各占一站） */}
      <a className="fd-skip" href="#fd-exec">{t.skipToRun}</a>
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

      {/* 首屏三步条：没配好时告诉你先做哪一步，做完一步自动打勾（配齐就消失） */}
      {!loaded || setupDone ? null : (
        <div className="fd-steps" role="status">
          <span className={`fd-step ${hasAnyUrl ? 'done' : 'now'}`}><b>1</b>{t.stepLink}{!hasAnyUrl && <em>{t.stepNow}</em>}</span>
          <span className={`fd-step ${hasValidDesc ? 'done' : (hasAnyUrl ? 'now' : '')}`}><b>2</b>{t.stepCopy}{hasAnyUrl && !hasValidDesc && <em>{t.stepNow}</em>}</span>
          <span className={`fd-step ${canRun && hasAnyUrl && hasValidDesc ? 'now' : ''}`}><b>3</b>{t.stepRun}{canRun && hasAnyUrl && hasValidDesc && <em>{t.stepNow}</em>}</span>
        </div>
      )}

      {/* 目标后台：项目 + 三商店链接 */}
      <Card className="rise" style={{ marginBottom: 16, animationDelay: '0.05s' }} styles={{ body: { padding: 22 } }}>
        <div className="fd-eyebrow"><GlobalOutlined style={{ color: 'var(--fd-cyan)' }} />{t.targets}</div>
        <Flex align="center" gap={8} wrap style={{ marginBottom: 16 }}>
          <span className="fd-label" style={{ fontSize: 11 }}>{t.projectLabel}</span>
          <Select
            aria-label={t.projectLabel}
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
            <label style={labelStyle} htmlFor="fd-url-chrome">{t.chromeLabel}</label>
            <Input id="fd-url-chrome" className="fd-url" prefix={<ChromeOutlined style={{ color: '#6FB1EE' }} />} placeholder="https://chrome.google.com/webstore/devconsole/.../edit" value={chromeUrl} onChange={(e) => setChromeUrl(e.target.value)} />
            {chromeUrlWarn && (
              <div className="fd-hint-row">
                <span className="fd-hint warn">{t.chromeUrlWarn}</span>
                <RulesTip text={t.urlRuleChrome} label={t.rulesLink} />
              </div>
            )}
            {cUrl && !chromeUrlWarn && <span className="fd-digest" style={{ marginTop: 5 }}>{digest(cUrl)}</span>}
          </div>
          <div>
            <label style={labelStyle} htmlFor="fd-url-edge">{t.edgeLabel}</label>
            <Input id="fd-url-edge" className="fd-url" prefix={<GlobalOutlined style={{ color: '#58C0AE' }} />} placeholder="https://partner.microsoft.com/.../listings" value={edgeUrl} onChange={(e) => setEdgeUrl(e.target.value)} />
            {edgeUrlWarn && (
              <div className="fd-hint-row">
                <span className="fd-hint warn">{t.edgeUrlWarn}</span>
                <RulesTip text={t.urlRuleEdge} label={t.rulesLink} />
              </div>
            )}
            {eUrl && !edgeUrlWarn && <span className="fd-digest" style={{ marginTop: 5 }}>{digest(eUrl)}</span>}
          </div>
          <div>
            <label style={labelStyle} htmlFor="fd-url-firefox">{t.firefoxLabel}</label>
            <Input id="fd-url-firefox" className="fd-url" prefix={<FireOutlined style={{ color: '#F0925C' }} />} placeholder="https://addons.mozilla.org/.../developers/addon/<slug>/edit" value={firefoxUrl} onChange={(e) => setFirefoxUrl(e.target.value)} />
            {firefoxUrlWarn && (
              <div className="fd-hint-row">
                <span className="fd-hint warn">{t.firefoxUrlWarn}</span>
                <RulesTip text={t.urlRuleFirefox} label={t.rulesLink} />
              </div>
            )}
            {fUrl && !firefoxUrlWarn && <span className="fd-digest" style={{ marginTop: 5 }}>{digest(fUrl)}</span>}
          </div>
        </div>
      </Card>

      <Modal
        open={!!projModal} title={projModal && projModal.mode === 'create' ? t.projectNew : t.projectRename}
        okText={projModal && projModal.mode === 'create' ? t.projectCreate : t.projectOk}
        cancelText={t.cancel}
        onOk={onProjModalOk} onCancel={() => setProjModal(null)} destroyOnHidden width={360}
        okButtonProps={{ disabled: !projName || projDup }}
      >
        <Input autoFocus placeholder={t.projectNamePh} value={(projModal && projModal.value) || ''}
          onChange={(e) => setProjModal((m) => (m ? { ...m, value: e.target.value } : m))}
          onPressEnter={onProjModalOk} />
        {/* 名字不行就当场说，别等按下去没反应再让人猜（实测确定键可点、点了静默） */}
        {projModal && projHint && <span className="fd-hint warn" style={{ marginTop: 8 }}>{projHint}</span>}
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
          <label style={labelStyle} htmlFor="fd-copy">{t.copyLabel}</label>
          <Input.TextArea
            id="fd-copy"
            className="fd-code"
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
            rows={12}
            placeholder={'{\n  "en": "English description…",\n  "zh_CN": "中文描述…",\n  "pt_BR": "…"\n}'}
          />
          <div className="fd-hint-row">
            <span className={`fd-hint ${jsonInvalid ? 'err' : ''}`}>
              {jsonInvalid ? t.jsonHint : t.jsonFormat}
            </span>
            <RulesTip text={t.jsonFormatTip} label={t.rulesLink} />
          </div>

          <input ref={fileRef} name="import-copy" aria-label={t.copyLabel} type="file" accept=".json,.txt,application/json" style={{ display: 'none' }} onChange={onImportFile} />
          <Flex justify="space-between" align="center" wrap style={{ marginTop: 14, gap: 8 }}>
            <Space size={4}>
              <Button variant="text" color="default" size="small" icon={<CodeOutlined />} onClick={onLoadSample}>{t.loadSample}</Button>
              <Button variant="text" color="default" size="small" icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>{t.importFile}</Button>
              <Popconfirm title={t.clearConfirm} onConfirm={onClear} okText={t.clear} cancelText={t.cancel} disabled={!copy.trim()}>
                <Button variant="text" color="default" size="small" icon={<DeleteOutlined />} disabled={!copy.trim()}>{t.clear}</Button>
              </Popconfirm>
            </Space>
            <Space size={10} align="center">
              <span className="fd-saved">{savedAt ? t.savedAt(savedAt) : t.neverSaved}</span>
              <Button variant="filled" color="default" icon={<SaveOutlined />} onClick={onSave}>{t.saveNow}</Button>
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
            labels={{ on: t.effOn, all: t.selAll, none: t.selNone, short: t.mShort, ready: t.legendReady, skipped: t.legendSkip, notSelected: t.legendNa, hidden: t.locHidden }}
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
          id="fd-terms"
          aria-label={t.termsLabel}
          className="fd-code"
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          rows={5}
          placeholder={'{\n  "en": ["term one", "term two"],\n  "zh_CN": ["关键词一", "关键词二"]\n}'}
        />
        <div className="fd-hint-row">
          <span className="fd-hint">{t.termsFormat}</span>
          <RulesTip text={t.termsFormatTip} label={t.rulesLink} />
        </div>
        {termsInfo && termsInfo.ok && termsInfo.dropped > 0 && (
          <span className="fd-hint warn" style={{ marginTop: 4 }}>{t.termsDropped(termsInfo.dropped)}</span>
        )}
        <input ref={termsFileRef} name="import-terms" aria-label={t.termsLabel} type="file" accept=".json,.txt,application/json" style={{ display: 'none' }} onChange={onImportTerms} />
        <Space size={4} style={{ marginTop: 12 }}>
          <Button variant="text" color="default" size="small" icon={<CodeOutlined />} onClick={onLoadSampleTerms}>{t.termsSample}</Button>
          <Button variant="text" color="default" size="small" icon={<UploadOutlined />} onClick={() => termsFileRef.current?.click()}>{t.importFile}</Button>
          <Popconfirm title={t.termsClearConfirm} onConfirm={onClearTerms} okText={t.clear} cancelText={t.cancel} disabled={!terms.trim()}>
            <Button variant="text" color="default" size="small" icon={<DeleteOutlined />} disabled={!terms.trim()}>{t.clear}</Button>
          </Popconfirm>
        </Space>
      </Card>

      {/* 执行 */}
      <Card id="fd-exec" tabIndex={-1} className="rise" style={{ marginBottom: 16, animationDelay: '0.15s' }} styles={{ body: { padding: 22 } }}>
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
                      <span style={{ color: ready ? 'var(--fd-ink)' : 'var(--fd-note)' }}>{u.label}</span>
                      {/* 「为什么不能选」是给用户读的信息，不能停在装饰灰那一档（实测 3.32:1） */}
                      {why && <span className="fd-unit-why">({why})</span>}
                    </Checkbox>
                  </span>
                );
              })}
            </div>
          </Checkbox.Group>
          <span className="fd-actions">
            <Tooltip title={loginNeedsUrl ? t.needUrlLogin : t.loginNote}>
              <Button variant="outlined" icon={<LoginOutlined />} onClick={onLogin} disabled={running || !hasAnyUrl}>{t.login}</Button>
            </Tooltip>
            <Button className="fd-start" color="primary" variant="solid" icon={<ThunderboltFilled />} onClick={onRun} loading={running} disabled={running || !canRun}>
              {running ? t.runningBtn : t.run}
            </Button>
            <Button color="danger" variant="solid" icon={<StopOutlined />} onClick={onStop} disabled={!running}>{t.stop}</Button>
          </span>
        </div>
        {(!running && runReason) && <span className="fd-hint warn" style={{ marginTop: 14 }}>{runReason}</span>}
        {/* 主键能点不等于会填你以为的那些：把「本次到底会填什么」摊在键下面 */}
        {runRead.mode === 'idle' ? (
          <span className="fd-hint" style={{ marginTop: 12 }}>{willFillText}</span>
        ) : (
          <div className={`fd-runline ${runRead.mode}`} role="status">
            <span className="fd-runline-k">
              {runRead.mode === 'result' ? t.runResult : t.runNow}{runTallyText ? `：${runTallyText}` : ''}
            </span>
            <span className="fd-pills">
              {unitMeta.map((m) => {
                const u = runRead.units.find((x) => x.key === m.key) || { i: 0, n: 0, filled: 0, human: 0, state: 'pending' };
                const st = pickedUnits.has(m.key) ? u.state : 'unselected';
                return (
                  <span key={m.key} className={`fd-pill s-${st}`}>
                    <span className="pk">{m.label}</span>
                    <span className="pv">{pillText(st, u)}</span>
                  </span>
                );
              })}
            </span>
          </div>
        )}
        <div className="fd-hint-row">
          <span className="fd-hint">{t.execNote}</span>
          <RulesTip text={t.execNoteTip} label={t.rulesLink} />
        </div>
      </Card>

      {/* 日志 */}
      <Card className="rise" style={{ animationDelay: '0.2s' }} styles={{ body: { padding: 22 } }}>
        <Flex align="center" justify="space-between" style={{ marginBottom: 12 }}>
          <div className="fd-eyebrow" style={{ margin: 0 }}><CheckCircleFilled style={{ color: 'var(--fd-good)' }} />{t.logsTitle}</div>
          <Space size={10} align="center">
            <span className="mono fd-count">{t.lines(logs.length)}</span>
            <Button size="small" variant="text" color="default" icon={<CopyOutlined />} onClick={onCopyLogs} disabled={logs.length === 0}>{t.copyLogs}</Button>
          </Space>
        </Flex>
        {/* 可滚区域要能用键盘滚（WCAG 2.1.1）：以前 tabIndex=-1，Tab 根本落不上来 */}
        <div className="fd-log" ref={consoleRef} tabIndex={0}>
          {logs.length === 0 ? <div className="fd-log-empty">{t.logsEmpty}</div> : logRows}
        </div>
      </Card>
    </main>
  );
}
