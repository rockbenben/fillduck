# FillDuck（填鸭）详细使用与排错

新用户先看 [README](README.md) 的「三步开始」，本文是细节手册：配置项含义、命令行用法、工作原理、排错。

## 它是怎么工作的

FillDuck 用 [Playwright](https://playwright.dev/) 驱动你本机已装的真实浏览器（优先 Chrome，其次 Edge，都没有才用自带 Chromium）：

- 输入用的是**可信输入事件**（等价手动打字/粘贴），后台的前端框架才会认账并持久化——这也是它比油猴脚本可靠的原因，且不受 Chrome 商店域名的脚本注入限制。
- 后台界面语言**中文/英文都支持**：工具运行时自动识别后台是哪种界面并切换对应的元素定位（按钮文字、语言名都备了中英两套）。中文账号看中文、英文账号看英文。若是其它语言界面（法/德…），会自动把链接改成英文（Edge 路径段 `en-us`、Chrome 加 `hl=en`）重载兜底。这不会改你账号的语言设置。
- 填的都是**草稿**：Chrome 全部语言填完后点一次「保存草稿」落库（Chrome 后台不自动保存）；Edge 每种语言点「保存草稿」。提交/发布（Chrome「提请审核」、Edge「发布」）永远由你人工完成。
- **描述**两个后台都填；**搜索词**仅 Edge（Chrome 商店无此字段）。填搜索词会先清空该语言后台已有词再填；空数组的语言跳过、不动已有词。
- Edge 每种语言保存后会**重新打开读回核对**，确认内容真的存上了；没存住的自动重试（最多 3 轮），最后列出仍失败的语言。搜索词同样走「填→存→读回核对」。

## 启动方式

**图形界面（推荐）**：双击 `start.bat`（Windows）或 `./start.sh`（macOS/Linux，首次先 `chmod +x start.sh`）。等价于：

```bash
npm install   # 一次性；跳过浏览器下载，用本机浏览器
npm start     # 启动，自动打开 http://localhost:4599
```

**纯命令行**：

```bash
npm run login    # 首次登录（见下）
npm run chrome   # 只填 Chrome
npm run edge     # 只填 Edge
npm run all      # 两个都填
```

## 配置

GUI 里保存链接和文案就够了（自动写入 `config.json` / `descriptions.json` / `search-terms.json`）。手动配置的话：

1. 复制 `config.example.json` 为 `config.json`：
   - `chromeEditUrl`：Chrome 后台**商店列表编辑页**（有语言下拉的那页，URL 以 `/edit` 结尾）
   - `edgeListingsUrl`：Edge Partner Center 的 `…/microsoftedge/<扩展id>/listings`
   - `descriptionsPath` / `termsPath`：描述与搜索词文件名（默认 `descriptions.json` / `search-terms.json`）
   - 链接里的界面语言无所谓（`/en-us/`、`?hl=en` 都行，运行时会自动规整）
2. 描述放 `descriptions.json`、搜索词（仅 Edge）放 `search-terms.json`，格式见 README。存成 UTF-8 即可；部分编辑器另存会加 BOM 头，也能正常解析。两份都可选，只填一个也行。
   - 兼容旧版：若你还留着旧的 `copy.json`，没有 `descriptions.json` 时会自动读它，不丢现有文案。

`config.json`、`descriptions.json`、`search-terms.json` 都在 `.gitignore` 里，不会进仓库。

## 两个后台链接去哪复制

控制台里 GUI 会自动保存你填的链接，但链接得你自己从后台复制：

- **Chrome**：打开 [Chrome 开发者后台](https://chrome.google.com/webstore/devconsole) → 选中你的扩展 → 进「商品详情 / Store listing」编辑页 → 直接复制浏览器地址栏的 URL（以 `/edit` 结尾）。
- **Edge**：打开 [合作伙伴中心](https://partner.microsoft.com/dashboard/microsoftedge/overview) → 选中你的扩展 → 进「Listings / 列表」页 → 复制地址栏 URL（形如 `…/microsoftedge/<扩展id>/listings`）。
- 复制时后台界面是中文还是英文都行，运行时会自动识别并规整。

## 首次登录（只需一次）

```bash
npm run login
```

会打开浏览器并加载两个后台，手动登录 Google 和 Microsoft。登录态存进本机 `.auth-profile/`（含 cookie，已 gitignore，别外传），之后免登录。登录完按 `Ctrl+C` 结束。GUI 里对应「登录」按钮。

## 运行行为

- 日志逐条说明当前在填哪种语言；Edge 是「先全部保存 → 统一核对 → 失败重试」三段式。
- 跑完浏览器**保持打开**，请逐语言抽查无误后自己在后台提交；然后关浏览器/`Ctrl+C`。
- 中途可点 GUI 的「停止」：完成当前语言后停下，已填的部分保留。
- 出错会停下并保留浏览器现场，方便排查；修好后直接重跑（已是最新的语言会自动跳过，不会重复保存）。

## 排错

| 现象 | 处理 |
| --- | --- |
| 「没等到 Chrome 的语言下拉」 | 确认链接是 `/edit` 结尾的编辑页、已登录 Google、网络正常 |
| 「没等到 Edge 的语言列表」 | 确认链接是 `/listings` 结尾、已登录 Microsoft |
| Google 登录提示「此浏览器可能不安全」 | 启动器已带应对参数；若仍出现，先用 `npm run login` 在弹出的浏览器里走一遍人机验证，或临时换 Edge 浏览器跑（自动回退） |
| Edge 某语言提示「尚未收录、已跳过」 | 该语言中文名不在映射表里；日志会列出 Edge 显示的真实名称，在 `src/selectors.mjs` 的 `localeToRowName` 加一行即可 |
| Edge 某语言「不足 250 字」被跳过 | Edge 的硬性要求，补够字数再跑 |
| 日志「没找到"保存草稿"按钮」（Chrome） | Chrome 后台改版/界面语言异常；请手动点「保存草稿」，否则描述不落库；并把日志发维护者 |
| 搜索词被「自动丢弃」 | 超出 Edge 规则：每语言 ≤7 词、每词 ≤30 字符、独立词语去重 ≤21；日志会列出丢了哪些、为什么 |
| 端口 4599 被占用 | 多半已经在运行了，直接开 http://localhost:4599；或关掉旧窗口重启 |
| 个别语言 3 轮后仍「读回不符」 | 把日志发给维护者；通常是该语言内容被后台改写（如特殊字符），人工处理该语言即可 |

## 开发者：改界面

前端是 React + antd（Vite），源码在 `gui/web/src`。改完重新构建（产物 `gui/web/dist` 已随仓库提交，服务端直接托管，普通用户无需构建）：

```bash
npm --prefix gui/web install   # 一次性
npm --prefix gui/web run build
```

## 开发者：加平台 / 加语言

- 新平台：写 `playwright/fill-<平台>.mjs`（参考现有适配器：读取后台语言列表 → 构建队列 → 逐语言填入 → 核对），在 `gui/server.mjs` 的 `doRun` 注册，GUI 的目标选择加一项。搜索词逻辑参考 `playwright/fill-edge-terms.mjs`。
- 新语言：`src/selectors.mjs` 的 `localeToRowName` 加一行（Edge 用），Chrome 不需要——它直接读下拉的 `data-value` 语言码。
- 后台选择器都集中在 `src/selectors.mjs`（Chrome 保存键、Edge 搜索词区等）；商店改版通常只改这一处。
