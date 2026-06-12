# 用 AI 生成商店文案（descriptions.json + search-terms.json）

把下面的提示词整段复制给你的 AI 编程助手（Claude Code / Cursor 等），**在你的扩展项目目录里运行**。AI 会先调研你的项目，然后生成 FillDuck 可直接使用的两份文件。

生成后把两份文件内容贴进 FillDuck 控制台（或存为 `descriptions.json` / `search-terms.json`）即可开始填充。

---

## 提示词（中文）

````text
为我的浏览器扩展撰写 Chrome 应用商店与 Edge Add-ons 的多语言商店文案，输出两个 JSON 文件：descriptions.json（描述，两个商店通用）和 search-terms.json（搜索词，仅 Edge 使用）。

## 第一步：调研（不要跳过）
先阅读项目的 README、manifest.json、设置页/界面文案与截图，回答：
- 这个扩展是什么、给谁用、核心场景是什么？
- 有哪些「可证实」的卖点？（功能、数量、支持语言数、快捷键、打开方式等——只写真实存在的，数字必须有出处）
- 支持哪些界面语言？（看 _locales 目录或 i18n 配置；商店文案语言应与之对齐）

## 第二步：写 descriptions.json
格式：JSON 对象，键为语言码（如 en、zh_CN、pt-BR，下划线/连字符均可），值为该语言完整描述字符串。

硬性要求：
- 每种语言 ≥250 字符（Edge 后台的最低要求，不足会被跳过）；建议 300–900 字符
- 纯文本：换行写 \n，项目符号用 •，不要 Markdown/HTML（商店不渲染）
- 内容必须与扩展实际功能一致——夸大或与功能不符违反两家商店的政策，可致下架
- 不要关键词堆砌（Chrome 有明确的 Keyword Spam 政策）

推荐结构（每种语言保持一致）：
1. 一句话定位：是什么 + 给谁 + 核心价值（含最有力的真实数字）
2. 「主要特性：」+ 3~5 条 • 开头的功能点（含使用方式、快捷键、语言/主题支持）
3. 收尾一句：内容来源 / 更新承诺 / 差异化卖点

本地化要求：不是逐句翻译，而是按当地用户的表达习惯重写；专有名词（产品名、ChatGPT 等平台名）保留原文；阿拉伯语等 RTL 语言注意行文方向自然。

## 第三步：写 search-terms.json（仅 Edge）
格式：JSON 对象，键为语言码，值为搜索词数组。

硬性要求（超出会被丢弃）：
- 每语言最多 7 个词条
- 每个词条 ≤30 字符
- 该语言所有词条去重后的独立单词总数 ≤21

选词策略（每语言约 7 条，按当地搜索习惯本地化而非直译）：
- 品类词：用户会搜的大类（如 "ai prompts"、"批量下载"）
- 平台/品牌词：扩展服务的对象（如 "chatgpt"、具体网站名）
- 功能词：核心动作（如 "prompt manager"、"下载管理"）
- 场景/长尾词：典型用法（如 "提示词大全"、"示例"）
- 不要放自己扩展的名字（名称本身已参与搜索），不要放与功能无关的热词

## 第四步：自检后再输出
逐项检查，不通过就修正：
- [ ] 两个文件都是合法 JSON（UTF-8）
- [ ] 描述每种语言 ≥250 字符
- [ ] 搜索词每语言 ≤7 条、每条 ≤30 字符、去重单词 ≤21
- [ ] 语言键与扩展支持的语言一一对应
- [ ] 所有数字与功能描述能在项目里找到出处
如果你能运行代码，写一小段脚本验证以上各项并贴出结果。

最后把两个 JSON 完整输出（或写入 descriptions.json / search-terms.json 文件）。
````

---

## Prompt (English)

````text
Write multilingual store copy for my browser extension for both the Chrome Web Store and Microsoft Edge Add-ons. Output two JSON files: descriptions.json (descriptions, shared by both stores) and search-terms.json (search terms, Edge only).

## Step 1: Research (do not skip)
Read the project's README, manifest.json, options/UI strings and screenshots, then answer:
- What is this extension, who is it for, what is the core use case?
- Which selling points are VERIFIABLE? (features, counts, supported languages, shortcuts, display modes — only claim what actually exists; every number needs a source in the project)
- Which UI languages are supported? (check _locales or the i18n config; store languages should match)

## Step 2: descriptions.json
Format: a JSON object — keys are language codes (en, zh_CN, pt-BR; underscore or hyphen both fine), values are the full description strings.

Hard requirements:
- ≥250 characters per language (Edge's minimum — shorter entries get skipped); aim for 300–900
- Plain text only: use \n for line breaks and • for bullets; no Markdown/HTML (stores don't render it)
- Claims must match real functionality — exaggeration violates both stores' policies
- No keyword stuffing (Chrome has an explicit Keyword Spam policy)

Recommended structure (consistent across languages):
1. One-line positioning: what + for whom + core value (with your strongest real number)
2. "Key features:" + 3–5 bullets (how to open it, shortcuts, language/theme support)
3. One closing line: content source / update cadence / differentiator

Localization: rewrite for local search and reading habits rather than translating literally; keep product/platform names (ChatGPT etc.) as-is; mind natural RTL flow for Arabic.

## Step 3: search-terms.json (Edge only)
Format: a JSON object — keys are language codes, values are arrays of terms.

Hard limits (anything beyond is dropped):
- max 7 terms per language
- each term ≤30 characters
- ≤21 distinct words per language after deduplication

Term mix (~7 per language, localized to how people actually search):
- category terms, platform/brand terms, feature terms, scenario/long-tail terms
- don't include your own extension name; don't include unrelated trending words

## Step 4: Self-check before output
- [ ] Both files are valid UTF-8 JSON
- [ ] Every description ≥250 chars
- [ ] Terms: ≤7 per language, ≤30 chars each, ≤21 distinct words
- [ ] Language keys match the extension's supported languages
- [ ] Every number/claim is traceable in the project
If you can run code, write a small validation script and show its output.

Finally, output both JSONs in full (or write them to descriptions.json / search-terms.json).
````

---

## 两家商店的要求速查

| | Chrome 应用商店 | Edge Add-ons |
| --- | --- | --- |
| 描述 | 每语言一份，纯文本，上限约 16,000 字符，无官方下限 | 每语言一份，**≥250 字符**（实测低于会无法保存），上限约 10,000 |
| 搜索词 | **无此字段**（排名靠名称 / Summary / 描述） | 每语言 ≤7 条 · 每条 ≤30 字符 · 去重单词 ≤21 |
| 另需注意 | 还有一个 132 字符的 **Summary**（简短描述）字段，不在本文件范围内，需单独撰写 | 搜索词不对用户展示，只影响搜索 |
| 共同红线 | 描述必须与实际功能一致；禁止关键词堆砌；提及 ChatGPT 等第三方名称用于说明兼容性是允许的，但扩展**名称**中使用他人商标有风险 | 同左 |

> 以上 Edge 的 250/7/30/21 四个数字与 FillDuck 的内置校验一致（超出会自动丢弃并提示）。
