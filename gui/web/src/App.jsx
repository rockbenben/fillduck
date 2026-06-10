import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Input, Button, Typography, Flex, Tag, Space, Segmented, Tooltip, App as AntApp, Divider, Popconfirm,
} from 'antd';
import {
  ChromeOutlined, GlobalOutlined, LoginOutlined, ThunderboltFilled,
  SaveOutlined, CodeOutlined, CheckCircleFilled, StopOutlined, DeleteOutlined, CopyOutlined, UploadOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { parseTerms } from '../../../src/core.mjs'; // 复用同一份搜索词校验，与后端规则完全一致

const { Title, Text } = Typography;

// 界面文案（中/英）。后台运行日志由服务端产出，仍为中文。
const STR = {
  zh: {
    kicker: 'FillDuck · 多语言', title: '填鸭控制台',
    subtitle: '一键把多语言描述填进 Chrome 与 Edge 商店后台',
    running: '运行中', idle: '空闲',
    targets: '目标后台', chromeLabel: 'CHROME 编辑页', edgeLabel: 'EDGE 列表页',
    copyLabel: '多语言文案 JSON', langs: (n) => `${n} 种语言`, short: (n) => ` · ${n} 种 <250 字`,
    jsonBad: 'JSON 格式有误', jsonHint: '检查：引号/逗号是否配对、结尾别多写逗号；描述里的换行要写成 \\n（不能直接回车换行）。',
    jsonFormat: '标准 JSON：{ "语言码": "完整描述", … } —— 键和值都用英文双引号 "，多项之间用逗号分隔，最后一项后不加逗号。',
    loadSample: '填入样例', sampleLoaded: '已填入样例，按需修改后保存', sampleBusy: '文案框已有内容；清空后再填样例。',
    needCopy: '先填有效的描述或搜索词 JSON', needUrlRun: '先填所选目标的后台链接', needUrlLogin: '先填后台链接（至少一个）再登录',
    clear: '清空', clearConfirm: '确定清空文案框？不可撤销。', autosaved: '改动自动保存',
    importFile: '导入文件', imported: '已从文件导入文案', importFail: '读取文件失败',
    save: '保存', saved: '已保存链接与文案',
    exec: '执行', step1: '① 首次先登录', login: '登录两个后台', loginNote: '登录态会记住，只需一次',
    loginToast: '已打开后台，请在弹出的浏览器里登录 Google 和 Microsoft',
    step2: '② 选目标并开始', all: '全部', run: '开始填充', runningBtn: '填充中…', stop: '停止',
    execNote: '会弹出真实浏览器逐步操作；跑完不自动关，人工检查无误后在后台提交。Edge 每种描述需 ≥250 字。',
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
    subtitle: 'Fill multilingual descriptions into Chrome & Edge dashboards in one click',
    running: 'RUNNING', idle: 'IDLE',
    targets: 'Target dashboards', chromeLabel: 'CHROME EDIT PAGE', edgeLabel: 'EDGE LISTINGS PAGE',
    copyLabel: 'Multilingual copy (JSON)', langs: (n) => `${n} languages`, short: (n) => ` · ${n} <250 chars`,
    jsonBad: 'Invalid JSON', jsonHint: 'Check: matching quotes/commas, no trailing comma; line breaks inside a value must be written as \\n (not a real newline).',
    jsonFormat: 'Standard JSON: { "locale": "full description", … } — quote every key and value with ", separate items with commas, no comma after the last one.',
    loadSample: 'Load sample', sampleLoaded: 'Sample loaded — edit it, then Save', sampleBusy: 'The box already has content — clear it first.',
    needCopy: 'Add valid descriptions or search-terms JSON first', needUrlRun: 'Add the dashboard URL for the selected target', needUrlLogin: 'Add a dashboard URL first (at least one)',
    clear: 'Clear', clearConfirm: 'Clear the copy box? This cannot be undone.', autosaved: 'Changes auto-saved',
    importFile: 'Import file', imported: 'Copy imported from file', importFail: 'Failed to read file',
    save: 'Save', saved: 'Links & copy saved',
    exec: 'Run', step1: '① Log in first (one time)', login: 'Log in to both dashboards', loginNote: 'Login is remembered — only once',
    loginToast: 'Dashboards opened — please log in to Google and Microsoft in the browser window',
    step2: '② Pick a target and start', all: 'All', run: 'Start', runningBtn: 'Filling…', stop: 'Stop',
    execNote: 'A real browser opens and acts step by step; it stays open when done — review, then submit in the dashboard. Edge requires ≥250 chars per description.',
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
  const [copy, setCopy] = useState('');
  const [terms, setTerms] = useState('');
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [target, setTarget] = useState(() => {
    try { const s = localStorage.getItem('fillduck_target'); if (s === 'chrome' || s === 'edge' || s === 'all') return s; } catch { /* ignore */ }
    return 'all';
  });
  const consoleRef = useRef(null);
  const fileRef = useRef(null);    // 隐藏的描述文件选择框
  const termsFileRef = useRef(null); // 隐藏的搜索词文件选择框
  const loadedRef = useRef(false); // 初次从磁盘载入完成前，不触发自动保存
  const tRef = useRef(t); tRef.current = t;           // 给 SSE 闭包取当前语言文案
  const runningRef = useRef(false);                    // SSE 闭包里判断运行态
  const runErrRef = useRef(false);                     // 本次运行是否出现过错误日志
  const logIdRef = useRef(0);                           // 日志单调 id：列表头部丢弃时仍保持 key 稳定

  const onLangChange = (v) => {
    setLang(v);
    try { localStorage.setItem('fillduck_ui_lang', v); } catch { /* ignore */ }
  };
  const onTargetChange = (v) => {
    setTarget(v);
    try { localStorage.setItem('fillduck_target', v); } catch { /* ignore */ }
  };

  // 把当前链接、描述、搜索词写盘（/save 同时落 config.json / descriptions.json / search-terms.json）。
  // 手动保存与自动保存共用。
  const persist = () => fetch('/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chromeEditUrl: chromeUrl.trim(), edgeListingsUrl: edgeUrl.trim(), copy, terms }),
  });

  useEffect(() => {
    fetch('/state').then((r) => r.json()).then((s) => {
      setChromeUrl(s.chromeEditUrl || '');
      setEdgeUrl(s.edgeListingsUrl || '');
      setCopy(s.copy || '');
      setTerms(s.terms || '');
    }).catch(() => {}).finally(() => { loadedRef.current = true; });

    const es = new EventSource('/events');
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
  // 复用 persist()，请求体只在一处定义；失败不打扰，下次改动会再写。
  useEffect(() => {
    if (!loadedRef.current) return undefined;
    const id = setTimeout(() => { persist().catch(() => {}); }, 800);
    return () => clearTimeout(id);
  }, [chromeUrl, edgeUrl, copy, terms]);

  // 解析文案，显示语言数 / 校验
  const langInfo = useMemo(() => {
    const tx = copy.trim();
    if (!tx) return null;
    try {
      const o = JSON.parse(tx);
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        const n = Object.keys(o).length;
        const shortLangs = Object.entries(o).filter(([, v]) => typeof v === 'string' && v.trim().length < 250).map(([k]) => k);
        return { ok: true, n, short: shortLangs.length, shortLangs };
      }
      return { ok: false };
    } catch { return { ok: false }; }
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
  const onSave = async () => { await persist(); message.success(t.saved); };
  const onLogin = async () => { await persist(); await fetch('/login', { method: 'POST' }); message.info(t.loginToast); };
  const onRun = async () => {
    // 借这次用户点击申请通知权限：跑完若用户切走，发系统通知叫回（见 SSE status 分支）。
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch { /* ignore */ }
    await persist();
    await fetch('/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store: target }) });
  };
  const onStop = () => fetch('/stop', { method: 'POST' });

  // 链接与文案的派生态：trim 各算一次，下面复用。
  const cUrl = chromeUrl.trim();
  const eUrl = edgeUrl.trim();
  // 链接体检（仅提示，不拦截运行——真正的关卡是运行时的页面检测）。
  const chromeUrlWarn = cUrl && !/devconsole\/.*\/edit\/?($|\?|#)/i.test(cUrl);
  const edgeUrlWarn = eUrl && !/microsoftedge\/[^/]+\/listings\/?($|\?|#)/i.test(eUrl);

  // 运行前置校验：要有可填内容（描述或搜索词）；所选目标必须有对应后台链接（all = 至少一个）。
  const hasAnyUrl = !!cUrl || !!eUrl;
  const targetUrlOk = target === 'chrome' ? !!cUrl
    : target === 'edge' ? !!eUrl
    : hasAnyUrl;
  const hasValidDesc = !!(langInfo && langInfo.ok);
  const hasValidTerms = !!(termsInfo && termsInfo.ok);
  // 搜索词只对 Edge 生效：选 chrome 时只认描述，否则描述或搜索词任一即可。
  const hasContentForTarget = target === 'chrome' ? hasValidDesc : (hasValidDesc || hasValidTerms);
  const runReason = !hasContentForTarget ? t.needCopy : !targetUrlOk ? t.needUrlRun : '';
  const canRun = !runReason;
  const jsonInvalid = !!(copy.trim() && langInfo && !langInfo.ok); // 有内容但解析失败
  const loginNeedsUrl = !running && !hasAnyUrl;                    // 没填链接、又没在跑

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
            <Popconfirm title={t.clearConfirm} onConfirm={onClear} okText={t.clear} disabled={!copy.trim()}>
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
            <Popconfirm title={t.termsClearConfirm} onConfirm={onClearTerms} okText={t.clear} disabled={!terms.trim()}>
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

        <Flex align="center" gap={14} wrap>
          <Text className="mono" style={{ color: '#6b7280', fontSize: 12 }}>{t.step2}</Text>
          <Segmented
            value={target}
            onChange={onTargetChange}
            options={[
              { label: 'Chrome', value: 'chrome', icon: <ChromeOutlined /> },
              { label: 'Edge', value: 'edge', icon: <GlobalOutlined /> },
              { label: t.all, value: 'all' },
            ]}
          />
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
