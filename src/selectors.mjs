// DOM 选择器与 locale 映射配置。中文(zh)与英文(en)两套界面均经 2026-06-10 真机采集确认。
// 运行时自动检测后台是中文还是英文界面（见 fill-*.mjs 的语言检测）；
// 若是其它语言界面，会强制成英文重载（见 core.mjs 的 forceDashboardLang）。商店改版通常只改这一处。
export const SELECTORS = {
  chrome: {
    // 命中 Chrome 后台商店列表编辑页
    urlPattern: '/webstore/devconsole/',
    // 语言选项容器 ul[role=listbox] 的 aria-label：中文界面是“语言”，英文界面是“Language”。
    languageListboxAriaLabel: { zh: '语言', en: 'Language' },
    // 描述框：页面唯一 textarea（maxlength=16000，light DOM）。界面语言无关。
    descriptionField: 'textarea[maxlength="16000"]',
    // 顶部“保存草稿”按钮（2026-06-11 中文真机确认）。Chrome 后台不自动保存，填完必须点它，否则描述不落库。
    // 旁边还有“提请审核”按钮——本工具只存草稿，绝不点它。
    saveButtonText: { zh: '保存草稿', en: 'Save draft' },
  },
  edge: {
    // 命中 Edge 后台（语言列表与编辑弹层都在 /listings，同一 URL，不跳转）
    urlPattern: '/dashboard/microsoftedge/',
    // 语言行“编辑详细信息”按钮 aria-label 的固定尾段（getByRole 名称匹配用）：
    // 中文 “…语言详细信息页”，英文 “…language details page”。
    editButtonRoleName: { zh: '语言详细信息页', en: 'language details page' },
    // 从该 aria-label 里抠出语言名的正则（捕获组 1 = 语言名）。
    editButtonRegex: {
      zh: /^编辑\s+([\s\S]+?)\s+语言详细信息页$/,
      en: /^Edit\s+([\s\S]+?)\s+language details page$/,
    },
    // 编辑弹层里的描述框（formly 生成的 id 形如 formly_2_textarea_description_1，_description_ 段稳定）。界面语言无关。
    descriptionField: 'textarea[id*="_description_"]',
    // 弹层按钮按可见文字匹配（比类名稳）。
    saveButtonText: { zh: '保存草稿', en: 'Save draft' },
    closeButtonText: { zh: '关闭', en: 'Close' },
    // 编辑弹层里的“搜索词”区。选择器全部用结构化 class，与界面语言无关（2026-06-11 中文真机采集确认）。
    // 规则（后台自带说明）：最多 7 个词、每词 ≤30 字符、所有词的独立词语去重 ≤21。
    searchTerm: {
      section: 'app-search-terms',                       // 搜索词组件容器（每个弹层唯一）
      input: 'app-search-terms input#last-search-item',  // 末尾那个空输入框（填新词用，加完会再生成一个）
      addButton: 'app-search-terms button.action-link',  // “添加术语”按钮（输入空时 disabled）
      chip: 'app-search-terms li.search-term-bubble-display', // 已添加的每个词条
      chipText: 'a.keyword-value',                       // chip 内的词文本
      chipRemove: 'a.win-icon-ChromeClose',              // chip 内的删除图标（aria-label “删除搜索词 - {词}”）
    },
    // 本工具 locale 码 -> 该语言在 Edge 后台的显示名。中文名出现在“编辑 {名} 语言详细信息页”，
    // 英文名出现在“Edit {Name} language details page”。带 ✓ 的中英文均真机采集确认；
    // 其余为常见名，万一与 Edge 实际措辞不符，运行时会“未识别”告警并列出真实名，加一行即可修正。
    localeToRowName: {
      // —— 真机确认 ✓（中英文都核对过）——
      ar: { zh: '阿拉伯语', en: 'Arabic' },
      pl: { zh: '波兰语', en: 'Polish' },
      ko: { zh: '朝鲜语', en: 'Korean' },
      de: { zh: '德语', en: 'German' },
      ru: { zh: '俄语', en: 'Russian' },
      fr: { zh: '法语', en: 'French' },
      nl: { zh: '荷兰语', en: 'Dutch' },
      'pt-BR': { zh: '葡萄牙语(巴西)', en: 'Portuguese (Brazil)' },
      ja: { zh: '日语', en: 'Japanese' },
      th: { zh: '泰语', en: 'Thai' },
      tr: { zh: '土耳其语', en: 'Turkish' },
      uk: { zh: '乌克兰语', en: 'Ukrainian' },
      es: { zh: '西班牙语', en: 'Spanish' },
      it: { zh: '意大利语', en: 'Italian' },
      en: { zh: '英语', en: 'English' },
      vi: { zh: '越南语', en: 'Vietnamese' },
      'zh-TW': { zh: '中文(台湾)', en: 'Chinese (Taiwan)' },
      'zh-CN': { zh: '中文(中国)', en: 'Chinese (China)' },
      // —— 扩充（常见名，未逐一真机核对；英文取微软标准命名）——
      'en-GB': { zh: '英语(英国)', en: 'English (United Kingdom)' },
      'en-US': { zh: '英语(美国)', en: 'English (United States)' },
      bg: { zh: '保加利亚语', en: 'Bulgarian' },
      bn: { zh: '孟加拉语', en: 'Bangla' },
      ca: { zh: '加泰罗尼亚语', en: 'Catalan' },
      cs: { zh: '捷克语', en: 'Czech' },
      da: { zh: '丹麦语', en: 'Danish' },
      el: { zh: '希腊语', en: 'Greek' },
      'es-419': { zh: '西班牙语(拉丁美洲)', en: 'Spanish (Latin America)' },
      et: { zh: '爱沙尼亚语', en: 'Estonian' },
      fa: { zh: '波斯语', en: 'Persian' },
      fi: { zh: '芬兰语', en: 'Finnish' },
      fil: { zh: '菲律宾语', en: 'Filipino' },
      gu: { zh: '古吉拉特语', en: 'Gujarati' },
      he: { zh: '希伯来语', en: 'Hebrew' },
      hi: { zh: '印地语', en: 'Hindi' },
      hr: { zh: '克罗地亚语', en: 'Croatian' },
      hu: { zh: '匈牙利语', en: 'Hungarian' },
      id: { zh: '印度尼西亚语', en: 'Indonesian' },
      kn: { zh: '卡纳达语', en: 'Kannada' },
      lt: { zh: '立陶宛语', en: 'Lithuanian' },
      lv: { zh: '拉脱维亚语', en: 'Latvian' },
      ml: { zh: '马拉雅拉姆语', en: 'Malayalam' },
      mr: { zh: '马拉地语', en: 'Marathi' },
      ms: { zh: '马来语', en: 'Malay' },
      nb: { zh: '挪威语', en: 'Norwegian' },
      no: { zh: '挪威语', en: 'Norwegian' },
      'pt-PT': { zh: '葡萄牙语(葡萄牙)', en: 'Portuguese (Portugal)' },
      ro: { zh: '罗马尼亚语', en: 'Romanian' },
      sk: { zh: '斯洛伐克语', en: 'Slovak' },
      sl: { zh: '斯洛文尼亚语', en: 'Slovenian' },
      sr: { zh: '塞尔维亚语', en: 'Serbian' },
      sv: { zh: '瑞典语', en: 'Swedish' },
      sw: { zh: '斯瓦希里语', en: 'Swahili' },
      ta: { zh: '泰米尔语', en: 'Tamil' },
      te: { zh: '泰卢固语', en: 'Telugu' },
    },
  },
  firefox: {
    // 命中 AMO 开发者后台编辑页 …/developers/addon/<slug>/edit（2026-06-12 真机采集确认）
    urlPattern: '/developers/addon/',
    // 「描述附加组件」区块及其「编辑」按钮（点击后 AJAX 换入表单，无跳转）
    describeSection: '#addon-edit-describe',
    describeEditButton: '#addon-edit-describe h3 a.button',
    // 编辑表单（action 含 edit_describe，与界面语言无关）。
    // 所有语言的 description_<locale> textarea 同时在表单里（非当前语言 display:none），一次提交保存全部。
    describeForm: 'form[action*="edit_describe"]',
    descriptionByLocale: (loc) => `textarea[name="description_${loc}"]`,
    // l10n 菜单：点 changeLocale 开弹窗，点 a[href="#<locale>"] 会动态创建该语言的字段。
    // locale 码在弹窗 href 里是小写连字符（#zh-tw / #pt-br / #nb-no），与字段名一致。
    changeLocale: '#change-locale',
    localePopup: '#locale-popup',
    localeLink: (loc) => `#locale-popup a[href="#${loc}"]`,
    // 弹窗里全部语言链接（默认/现有/新语言三组并集）= AMO 支持的语言集
    allLocaleLinks: '#locale-popup a[href^="#"]',
    // 表单校验错误（保存失败时停留编辑态并内联展示）
    errorList: 'form[action*="edit_describe"] .errorlist li',
    // 描述上限（AMO textarea maxlength；程序化赋值不受其约束，须自行检查）
    descriptionMax: 15000,
  },
};
