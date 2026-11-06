# Piper Markdown for VS Code

增强 Markdown 阅读、HTML/PDF 导出与公众号富文本复制。
Enhanced Markdown reading, HTML/PDF export, and rich-text copying for WeChat.

**当前安装包仅支持 macOS Apple Silicon · Current package: macOS Apple Silicon only**
需要 VS Code 1.95+。Windows、Linux、Intel Mac、浏览器版 VS Code 和 Remote 工作区暂不支持。
Requires VS Code 1.95+. Windows, Linux, Intel Mac, browser-hosted VS Code, and Remote workspaces are not supported by this package.

## 中文

### 阅读与导出

Piper 内置 [Markdown Preview Enhanced](https://github.com/shd101wyy/vscode-markdown-preview-enhanced) 的源码 fork，使用 [crossnote](https://github.com/shd101wyy/crossnote) 引擎，无需另外安装 MPE。公众号排版使用独立的 Piper 渲染流程。

- 实时预览、双向滚动同步、锁定预览、主题、目录侧栏与图片查看。
- 插入目录，支持 `[TOC]` 及 MPE 目录标记。
- 公式、Mermaid、Graphviz、WaveDrom、脚注、任务列表、双链、文件导入及上游增强语法。
- 中文相邻标点的强调语法，例如 `这是**合法的加粗。**后文`，可在增强阅读、标准导出和公众号排版中正确显示。
- HTML 导出嵌入本地图片；PDF 使用本机 Chrome/Chromium，长代码自动换行。导出包含尚未保存的编辑，不改写源文件。
- 保留上游演示、笔记本、关系图、自定义 CSS 和外部工具能力。Pandoc、PlantUML、D2 等可选后端仍需相应工具或服务。

在受信任的工作区打开 Markdown，运行 **Piper Markdown: Open Enhanced Preview**。编辑器工具栏提供预览和公众号复制按钮；命令面板提供 **Insert Table of Contents**、**Export HTML**、**Export PDF**。若找不到 PDF 浏览器，在用户设置中填写 `piperMarkdown.enhanced.chromePath`。

已有显式 `markdown-preview-enhanced.*` 偏好可作为回退，新 `piperMarkdown.enhanced.*` 设置优先。扩展不会自动改写默认编辑器关联。

### 复制到公众号

1. 运行 **Piper Markdown: Preview WeChat Layout** 检查公众号排版。
2. 按下方示例配置图床；需要认证时运行 **Piper Markdown: Set Image Upload Token**。
3. 运行 **Piper Markdown: Copy for WeChat**，然后在公众号正文编辑器中粘贴。
4. 保存并重新打开草稿，确认图片已被平台保留；使用临时图床时须在图片过期前完成。

编辑器命令有选区时复制选区，否则复制全文；公众号预览中的复制按钮复制其整篇文档。阅读和预览不会上传本地图片。执行复制时才上传本地图片及公式，全部资源成功后才写入剪贴板；失败或取消保留原剪贴板。

公众号标题通常填在独立标题栏。若正文不需要重复开头的一级标题，可在公众号预览的更多菜单中启用相应选项，或设置：

```json
{ "piperMarkdown.wechatSkipLeadingH1": true }
```

默认关闭。启用后，公众号预览、复制和公众号 HTML 导出均省略开头的第一个顶层 H1，兼容 `# 标题` 与下划线式 H1；开头空行不影响识别。H2、后续 H1、引用和代码块保持不变。选区复制按选中内容判断开头标题。只有标题、没有正文时会提示错误并保留剪贴板。源 Markdown、增强预览和标准 HTML/PDF 导出不受此选项影响。

公众号排版支持普通 Markdown、目录、代码高亮、PNG/JPEG/WebP/GIF、本地 SVG 和数学公式。SVG、公式会转换成图片，GIF 保留动画。复杂图表、可执行代码块、一般文件导入、双链和脚注会在复制前提示；需要时先把图表转为本地图片，将引用展开成普通 Markdown。标准增强阅读及 HTML/PDF 导出仍保留这些上游语法。

## English

### Read and export

Piper embeds a source fork of [Markdown Preview Enhanced](https://github.com/shd101wyy/vscode-markdown-preview-enhanced), powered by [crossnote](https://github.com/shd101wyy/crossnote). Another installed MPE extension is not required. WeChat layout uses a separate Piper renderer.

- Live preview, bidirectional scroll synchronization, locked previews, themes, an outline, and image lightbox.
- Insert tables of contents; render `[TOC]` and MPE TOC markers.
- Math, Mermaid, Graphviz, WaveDrom, footnotes, task lists, wiki links, imports, and upstream extended syntax.
- CJK-aware emphasis, including `这是**合法的加粗。**后文`, in enhanced reading, standard exports, and WeChat output.
- HTML with embedded local images and PDF through local Chrome/Chromium. Long code lines wrap when printing. Exports include unsaved edits and leave source files unchanged.
- Upstream presentations, notebooks, graphs, custom CSS, and external-tool integrations. Optional backends such as Pandoc, PlantUML, and D2 still require their tools or configured services.

Open Markdown in a trusted workspace and run **Piper Markdown: Open Enhanced Preview**. The editor toolbar provides preview and WeChat copy buttons. Use **Insert Table of Contents**, **Export HTML**, or **Export PDF** from the command palette. Set `piperMarkdown.enhanced.chromePath` in user settings if browser discovery fails.

Explicit `markdown-preview-enhanced.*` preferences remain a fallback; explicit `piperMarkdown.enhanced.*` values take precedence. Activation does not rewrite default editor associations.

### Copy for WeChat

1. Run **Piper Markdown: Preview WeChat Layout** to inspect the publication layout.
2. Configure an image host below. For authenticated uploads, run **Piper Markdown: Set Image Upload Token**.
3. Run **Piper Markdown: Copy for WeChat**, then paste into the WeChat article body.
4. Save and reopen the draft to verify image retention before any temporary URLs expire.

The editor command copies a selection when present, otherwise the whole document. The WeChat preview button copies its whole document. Reading and previewing do not upload local images. Copy uploads local images and rasterized math, then changes the clipboard only after every resource succeeds. Cancellation or failure preserves the previous clipboard.

To avoid repeating the article title in its body, enable the option in the WeChat preview's More menu, or set:

```json
{ "piperMarkdown.wechatSkipLeadingH1": true }
```

It is off by default. When enabled, WeChat preview, copy, and WeChat HTML export omit only the first top-level H1 at the start, after any leading blank lines. Both ATX (`# Title`) and Setext H1 headings are supported. H2, later H1 headings, blockquotes, and fenced code remain. For a selection, the selected content determines the leading heading. A title-only input reports an error without replacing the clipboard. Source Markdown, enhanced preview, and standard HTML/PDF export remain unchanged.

WeChat output supports ordinary Markdown, TOC, highlighted code, PNG/JPEG/WebP/GIF, local SVG, and math. SVG and formulas are rasterized; GIF animation is preserved. Unsupported diagrams, executable chunks, general imports, wiki links, and footnotes are reported before copy. Convert diagrams to local images and expand references into ordinary Markdown where needed. Enhanced reading and standard exports retain the upstream syntax.

## 图床配置 / Image hosting

在 **VS Code 用户设置**中配置图床连接；工作区不能替换上传目的地或认证配置。Token 通过 **Set Image Upload Token** 保存到 SecretStorage，使用 **Clear Image Upload Token** 清除。不要把 Token、密码或七牛 AK/SK 写进设置、Markdown 或附加请求头/字段。

Configure connections in **VS Code User Settings**; workspace settings cannot replace upload destinations or authentication. Use **Set Image Upload Token** to store credentials in SecretStorage and **Clear Image Upload Token** to remove them. Never put tokens, passwords, or Qiniu AK/SK in settings, Markdown, or extra headers/fields.

| `piperMarkdown.imageHostProvider` | 用途 / Purpose | 生命周期 / Retention |
| --- | --- | --- |
| `piper`（默认 / default） | 兼容 Piper 图床协议 / Piper-compatible endpoint | 发送 `ttl` / Sends `ttl` |
| `generic` | 可配置 multipart HTTP 接口 / Configurable multipart HTTP API | 由服务端控制 / Host-controlled |
| `qiniu` | 七牛 Kodo 表单直传 / Qiniu Kodo form upload | 由云空间规则控制 / Bucket lifecycle rules |

### Piper

```json
{
  "piperMarkdown.imageHostProvider": "piper",
  "piperMarkdown.uploadUrl": "https://images.example.com/api/public-images",
  "piperMarkdown.ttl": "24h",
  "piperMarkdown.fileField": "file",
  "piperMarkdown.urlField": "url"
}
```

保持原有 Bearer Token、`X-Requested-With: ThemeTodo` 和 `?ttl=...` 协议。服务应返回形如 `{"url":"https://images.example.com/public-images/opaque-id"}` 的 JSON。已有 Piper Token 和用户级 `piperWechat.*` 配置兼容。

Preserves the existing Bearer token, `X-Requested-With: ThemeTodo`, and `?ttl=...` protocol. The service returns JSON such as `{"url":"https://images.example.com/public-images/opaque-id"}`. Existing Piper tokens and user-level `piperWechat.*` settings remain compatible.

### Generic HTTP

```json
{
  "piperMarkdown.imageHostProvider": "generic",
  "piperMarkdown.uploadUrl": "https://uploads.example.com/images",
  "piperMarkdown.uploadAuthMode": "header",
  "piperMarkdown.uploadHeaderName": "Authorization",
  "piperMarkdown.uploadHeaderPrefix": "Bearer ",
  "piperMarkdown.fileField": "image",
  "piperMarkdown.urlField": "data.url",
  "piperMarkdown.uploadFields": { "album": "articles" }
}
```

适用于返回完整公共图片 URL 的 multipart 接口。认证可选 `header`、`form` 或 `none`；表单认证通过 `uploadTokenField` 指定 Token 字段。`uploadHeaders`、`uploadFields` 只填写非秘密静态值。不会自动发送 Piper 的 TTL 或专用请求头。

For multipart APIs that return a complete public image URL. Authentication can be `header`, `form`, or `none`; form authentication uses `uploadTokenField`. Put only non-secret static values in `uploadHeaders` and `uploadFields`. Piper-specific TTL and request headers are not added.

### 七牛 / Qiniu Kodo

```json
{
  "piperMarkdown.imageHostProvider": "qiniu",
  "piperMarkdown.uploadUrl": "https://up-z0.qiniup.com",
  "piperMarkdown.publicBaseUrl": "https://images.example.com",
  "piperMarkdown.qiniuKeyPrefix": "wechat/"
}
```

上例上传地址适用于华东-浙江 `z0`；其他空间请使用对应[区域上传地址](https://developer.qiniu.com/kodo/1671/region-endpoint-fq)。`publicBaseUrl` 填已配置 HTTPS、可匿名访问图片的资源域名。运行 Token 命令时填**临时上传凭证**，不是 AK/SK。扩展为每张图片生成新对象名；凭证应允许目标空间或匹配前缀，不能只限定一个固定文件名。见官方[上传策略](https://developer.qiniu.com/kodo/manual/put-policy)。上传凭证有效期和图片保存时间是两件事，图片清理由空间生命周期规则控制。

The example endpoint is for East China–Zhejiang (`z0`); use the matching [regional upload endpoint](https://developer.qiniu.com/kodo/1671/region-endpoint-fq) for your bucket. Set `publicBaseUrl` to your public HTTPS image domain. Store a **temporary upload token**, not AK/SK. Piper generates a new object name per image, so the token must allow the bucket or a matching key prefix, rather than one fixed filename; see Qiniu's [upload policy](https://developer.qiniu.com/kodo/manual/put-policy). Token expiry and stored-image retention are separate; configure retention in the bucket lifecycle rules.

完整配置说明、请求/响应示例和排错步骤见仓库内 `docs/image-hosts.md`。
Full settings, request/response examples, and troubleshooting are in `docs/image-hosts.md` in the source package.

## 隐私与兼容 / Privacy and compatibility

Piper 不采集遥测。预览和标准导出在本地运行；外链图片、你配置的图表服务、AI 翻译和显式上传可能访问相应服务。公共图片应支持匿名跨域 GET/HEAD；上传地址和图片地址可以不同。上传重定向会被拒绝。生产连接使用 HTTPS，回环 HTTP 仅供本地开发测试。复制成功不代表微信已完成图片转存。

Piper adds no telemetry. Preview and standard export run locally; external images, configured diagram services, AI translation, and explicit uploads may contact their providers. Public images should allow anonymous cross-origin GET/HEAD; upload and read origins may differ. Upload redirects are rejected. Production connections use HTTPS; loopback HTTP is only for local development. Successful copy does not prove WeChat image ingestion.

代码执行和自定义脚本默认关闭，需要受信任工作区及显式用户级授权。外部可执行工具路径只读用户设置。Less 支持普通样式与导入，禁用 JavaScript 和插件。公众号渲染另有 HTML、SVG、路径边界和上传 URL 限制。TikZ 使用单独安装的本地渲染工具，不自动下载；详见 `UPSTREAM.md`。

Code execution and custom scripts are disabled by default and require a trusted workspace plus explicit user-level permission. External executable paths come only from user settings. Ordinary Less styling/imports remain available; Less JavaScript and plugins are disabled. WeChat rendering separately restricts HTML, SVG, filesystem boundaries, and upload URLs. TikZ uses a separately installed local renderer, without automatic downloads; see `UPSTREAM.md`.

## 开发 / Development

```sh
npm ci --ignore-scripts
pnpm --dir vendor/mpe install --frozen-lockfile --ignore-scripts
npm run check
npm test
npm run test:upstream
npm run build
npm run package
```

建议使用 Node.js 22+ 打包；原生剪贴板助手需要 macOS 与 Xcode Command Line Tools。增强引擎保留 pnpm 锁文件，Piper 根目录使用 npm 锁文件。验收、发布与上游来源说明见 `TESTING.md`、`PUBLISHING.md` 和 `UPSTREAM.md`。

Node.js 22+ is recommended for packaging. Building the native clipboard helper requires macOS and Xcode Command Line Tools. The enhanced fork keeps its pnpm lockfile; Piper uses the root npm lockfile. See `TESTING.md`, `PUBLISHING.md`, and `UPSTREAM.md` for acceptance, release, and provenance details.

## 许可与致谢 / License and credits

Piper 自有代码使用 MIT 许可。MPE 与 crossnote 保留其 University of Illinois/NCSA 许可；其余组件各自许可见 `THIRD_PARTY_NOTICES.md`。这是独立项目，不代表上游作者背书。

Piper-specific code is MIT licensed. MPE and crossnote retain their University of Illinois/NCSA licenses. Other components retain their respective licenses; see `THIRD_PARTY_NOTICES.md`. This independent project is not endorsed by the upstream authors.
