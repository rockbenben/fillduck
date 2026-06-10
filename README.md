# FillDuck 填鸭

**中文** · [English](README.en.md)

> 365 开源计划 #13 · 本地多语言文案，批量填进 Chrome 与 Edge 扩展商店后台的描述与搜索词

> 一份本地多语言 JSON，自动填进 Chrome 与 Edge 扩展商店后台的**描述**与**搜索词**。**本地运行 · 双语 · 只写草稿，发布权始终在你手里。**

扩展上架 15~20+ 种语言，每次更新描述/搜索词都要在后台一种一种手动粘贴。FillDuck 驱动**你本机的真实浏览器**（用你自己的登录态，全程本地，不上传任何东西）逐语言打开、填字、存草稿；最后由你人工检查、自己提交。

## 界面预览

一屏搞定：贴两个后台链接 + 多语言 JSON → 选后台 → 开始填充 → 看实时日志。界面中英双语随手切。

![FillDuck 控制台](docs/images/console-zh.png)

| 双语界面（English） | 运行控制 + 实时日志 |
| --- | --- |
| ![English UI](docs/images/console-en.png) | ![运行日志](docs/images/console-run.png) |

## 能做什么

| 后台 | 怎么填 | 校验 |
| --- | --- | --- |
| **Chrome 应用商店** | 逐语言切下拉填描述 | 全部填完点一次「保存草稿」落库 |
| **Edge Add-ons**（Partner Center） | 逐语言填描述 + 搜索词，各存草稿 | 重开每种语言读回核对，没存住的自动重试（最多 3 轮） |

- **描述**：两个后台都支持。
- **搜索词**：仅 Edge 支持（Chrome 商店无此字段）；每语言一组，规则见下。

界面与后台均**双语（中 / English）**：控制台按浏览器语言自动选择、可手动切换；后台界面自动识别中/英，其它语言回退英文 —— 都不会改你账号的语言设置。

## 快速开始

1. 安装 [Node.js](https://nodejs.org/)（已装可跳过）。
2. 启动控制台：Windows 双击 `start.bat`，macOS/Linux 运行 `./start.sh`。首次自动装依赖并打开 http://localhost:4599。
3. 在控制台里：
   - 贴两个后台链接（Chrome 的 `…/edit`、Edge 的 `…/listings`）+ 描述 JSON（可选再填搜索词 JSON），点**保存**。
   - 点**登录** → 在弹出的浏览器登录 Google / Microsoft（只需一次，之后免登录）。
   - 点**开始填充**（Chrome / Edge / 全部）→ 看实时日志 → 去浏览器人工检查 → 自己提交。

> 右上角 **中 / EN** 切界面语言（会记住）。运行日志由服务端产出，目前仅中文。

## 描述格式（`descriptions.json`）

键是语言码（下划线 / 连字符都行，大小写不敏感），值是该语言完整描述：

```json
{
  "en": "Full description in English…",
  "zh_CN": "中文完整描述…",
  "pt-BR": "Descrição completa…"
}
```

- 不确定怎么写？控制台里点 **「填入样例」** 载入可编辑模板，或复制仓库里的 `descriptions.example.json` 改。
- 描述里要换行就写成 `\n`（JSON 字符串里不能直接回车换行）。
- 后台有、文案缺的语言 → 自动跳过并提示；文案里多出来的 → 自动忽略。
- **Edge 每种描述需 ≥250 字符**，不足会跳过并提示。
- UTF-8 保存即可，带不带 BOM 都能正常解析。

## 搜索词格式（`search-terms.json`，仅 Edge）

键是语言码，值是该语言的搜索词**数组**：

```json
{
  "en": ["batch download", "bulk downloader", "download manager"],
  "zh_CN": ["批量下载", "批量下载器", "下载管理"]
}
```

- Edge 规则（超出的会自动丢弃并提示）：每语言**最多 7 个词**、**每词 ≤30 字符**、所有词的**独立词语去重 ≤21 个**。
- 填某语言搜索词时会**先清空该语言后台已有的词**再填，结果精确等于你给的数组。
- 数组为空 `[]` 的语言会**跳过、不动**后台已有词。控制台里也有「填入样例 / 导入文件 / 清空」。
- 这份是**可选**的：只填描述、只填搜索词、或两者都填都行。

> `config.json`（链接）、`descriptions.json`、`search-terms.json` 均已 git-ignore，不会被提交。

## 常见问题

- **后台界面不是中文能用吗？** 能，自动识别中/英界面并适配，其它语言回退英文；不改账号语言。
- **Edge 某语言提示「尚未收录」？** 名称表在 `src/selectors.mjs`，日志会打印真实名称，加一行即可。
- **Google 提示「此浏览器可能不安全」？** 见 [SETUP-playwright.md](SETUP-playwright.md) 排错一节。
- **安全吗？** 全本地：登录态存 `.auth-profile/`，文案存本地文件，无任何上报；出错会停下并保留浏览器现场。

## 命令行（可选）

```bash
npm run login    # 首次登录（打开两个后台，登录完 Ctrl+C）
npm run chrome   # 只填 Chrome
npm run edge     # 只填 Edge
npm run all      # 两个都填
```

## 结构与扩展

- `playwright/` — 填充逻辑（`fill-chrome.mjs` 描述、`fill-edge.mjs` 描述、`fill-edge-terms.mjs` 搜索词）
- `gui/` — 本地控制台（`gui/server.mjs` 启动；前端 React + antd，源码 `gui/web/src`）
- `src/` — 共享纯逻辑：`core.mjs`（解析 / 队列 / URL 语言 / 搜索词清洗，含单测）、`selectors.mjs`（选择器与中英名表）
- 加新平台 = 新增 `playwright/fill-<平台>.mjs` + 在 `gui/server.mjs` 注册一个目标。

详细使用与排错见 **[SETUP-playwright.md](SETUP-playwright.md)**。

## 关于 365 开源计划

本项目是 [365 开源计划](https://github.com/rockbenben/365opensource) 的第 13 个项目。

一个人 + AI，一年 300+ 个开源项目。[提交你的需求 →](https://my.feishu.cn/share/base/form/shrcnI6y7rrmlSjbzkYXh6sjmzb)
