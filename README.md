# Piper Markdown for VS Code

Enhanced Markdown reading and WeChat publishing in one preview.

[English](#english) · [简体中文](#中文) · [Source](https://github.com/PiperLiu/piper-vscode-markdown)

## English

**Current package: macOS Apple Silicon, VS Code 1.95+.** Windows, Linux, Intel Mac, browser-hosted VS Code, and Remote workspaces are not supported by this package.

### Read, format, and publish in one preview

Piper embeds a source fork of [Markdown Preview Enhanced](https://github.com/shd101wyy/vscode-markdown-preview-enhanced), powered by [crossnote](https://github.com/shd101wyy/crossnote). A separate MPE installation is not required.

Open a local Markdown file in a trusted workspace and use the editor's preview button. Enhanced reading keeps MPE's layout, themes, source synchronization, and advanced rendering. Open the preview's **Publish** menu when preparing an article: switch to WeChat layout in the same panel, adjust its style, then copy. Returning to reading brings back the enhanced view; there is no separate publication editor group to manage.

1. Open **Publish → WeChat view** in the preview.
2. Choose a style preset and adjust body size, line height, accent color, or heading decoration as needed.
3. Configure image hosting from the menu if the article contains local images, formulas, or rendered diagrams. The setup flow asks for the selected provider's connection and upload credential.
4. Choose **Copy for WeChat**, then paste into the WeChat article body.
5. Save and reopen the draft to verify that the platform retained the images before any temporary URLs expire.

Commands remain available for shortcuts and automation; the publishing menu provides the everyday workflow. Interface labels follow the VS Code display language, with English and Simplified Chinese supported.

The same menu includes standard **Export HTML**, **Export PDF**, reading themes, and a scroll-sync control for the current view. **Advanced** groups entry points to the relationship graph, backlinks, translation, slides, code blocks, notebook server, and the existing preview/export tools. Features that use external tools, services, or code execution still need their own configuration and permissions.

### Publication settings

| Option | Behavior |
| --- | --- |
| Style preset | `classic`, `minimal`, or `editorial`; common controls let you tune body size, line height, accent color, and heading decoration. |
| Skip leading H1 | Off by default. Omit the article's opening top-level H1 from WeChat output while retaining it in the source, enhanced reading, and standard HTML/PDF export. |
| Add article TOC | Off by default. Automatically add a TOC to the publication body; existing source TOC markers are respected and are not duplicated. |
| Side outline | Preview navigation only. Showing or hiding it does not insert or remove an article TOC. |

The initial Classic style uses a 16 px body, 1.85 line height, green `#16856e` accent, and underlined headings. Selecting Minimal applies gray `#374151`, plain headings, and 1.75 line height; Editorial applies brown `#9b4f32`, underlined serif headings, and 1.9 line height. You can then adjust individual controls. Style changes apply to preview, clipboard HTML, and WeChat HTML export without rewriting Markdown.

Leading-title omission supports both `# Title` and Setext H1 headings after leading blank lines. It preserves H2, later H1 headings, blockquotes, and fenced code. An editor selection is treated as its own input. A title-only input reports an error without replacing the clipboard.

Automatic article-TOC insertion is controlled by `piperMarkdown.wechatIncludeTOC`; title omission uses `piperMarkdown.wechatSkipLeadingH1`. Turning automatic TOC insertion off does not remove an authored `[TOC]`, MPE TOC marker, or handwritten directory. The side outline remains independent.

### Images, formulas, and enhanced content

Local image insertion is an explicit source-editing action. Publication upload is separate: it converts local references for the copied article without replacing paths in your Markdown or changing original image files. The preview retains links and source navigation.

Previewing does not upload publication assets. The toolbar shows phase progress for parsing, conversion, upload, styling, and clipboard writing, with a **Cancel** action during preparation. Upload progress shows the image count, queue state, and a live retry countdown when the host is busy. Copy prepares every required asset before updating the clipboard; failure or cancellation preserves the prior clipboard. Any images already uploaded before cancellation follow the host's retention policy. The editor command copies a selection when present, otherwise the document; the preview's copy action uses the whole represented document.

PNG, JPEG, WebP, and GIF images are supported; GIF animation is preserved. Local SVG and formulas are rasterized for publication. Formula images carry an opaque background so their text remains legible when pasted into a dark reading environment.

| Enhanced content | WeChat conversion |
| --- | --- |
| Mermaid, WaveDrom, Vega, Vega-Lite | Rendered locally to PNG; local Chrome/Edge is required. WaveDrom/Vega specifications must be valid JSON with inline data. |
| DOT / Graphviz | Parsed by the enhanced engine, then converted from SVG to PNG. |
| Footnotes and task lists | Numbered endnotes and static checked/unchecked marks. |
| Local Markdown, text, data, and image imports | Expanded within the workspace boundary; source files remain unchanged. |
| Same-document anchors | Retained in the article. |
| Local links and wiki links | Visible text remains, with a warning; private local file addresses are not published. |

Executable code blocks, remote imports or chart data, and publishing diagrams that require external tools or services—such as PlantUML, D2, and TikZ—are rejected with an explanation. They remain separate from the enhanced-reading tool integrations. If Chrome/Edge is unavailable, ordinary SVG can use the local rasterizer fallback, but browser-rendered diagrams need a browser. Use `piperMarkdown.enhanced.chromePath` to choose one. Unsupported output is reported before the clipboard changes rather than silently omitted.

### Enhanced reading and standard exports

Enhanced reading retains math, Mermaid, Graphviz, WaveDrom, footnotes, task lists, wiki links, imports, themes, locked previews, source synchronization, and image viewing. CJK-aware emphasis renders examples such as `这是**合法的加粗。**后文` correctly in reading and publication output.

Standard HTML/PDF exports use the enhanced engine, include unsaved edits, and leave source files unchanged. HTML embeds local images. PDF uses local Chrome/Chromium and wraps long code when printing; set `piperMarkdown.enhanced.chromePath` in User Settings if browser discovery fails. Insert-TOC, notebook, presentation, graph, and optional external-tool features remain available. Pandoc, PlantUML, D2, and other optional backends still require their tools or configured services.

Explicit `markdown-preview-enhanced.*` preferences remain a fallback; explicit `piperMarkdown.enhanced.*` settings take precedence. Activation does not rewrite editor associations.

### Image hosting

The publishing menu provides image-host setup and credential actions. If an upload destination or credential is missing, use the action offered by the error message to configure it and retry. Connection settings are user-level; a workspace cannot redirect uploads or change how stored credentials are sent.

| Provider | Use | Retention |
| --- | --- | --- |
| Piper | Piper-compatible multipart endpoint with Bearer token | Sends `ttl`, such as `3h` or `24h`; the host enforces it. |
| Generic HTTP | Configurable multipart endpoint, header/form/anonymous authentication, and nested JSON URL field | Controlled by the host. |
| Qiniu Kodo | Regional form upload using a temporary upload token and a public HTTPS image domain | Controlled by bucket lifecycle rules. |

Credentials are stored in VS Code SecretStorage. Changing provider, endpoint, authentication profile, or Qiniu public domain may require a separate credential. Existing Piper tokens remain compatible. Never put passwords, tokens, or Qiniu AK/SK in Markdown or extra settings fields.

See the complete [image-host guide](docs/image-hosts.md) for settings, request/response examples, and Qiniu setup. Qiniu tokens must permit the bucket or generated-key prefix; a token limited to one fixed object key is unsuitable. Upload-token expiry does not determine image retention. Services needing SDK signing or multiple secrets require a compatible upload gateway.

### Privacy and compatibility

Piper adds no telemetry. Reading and standard exports run locally; external images, configured diagram services, AI translation, and explicit uploads may contact their providers. Production uploads use HTTPS; loopback HTTP is reserved for local testing. Upload redirects are rejected. Public image URLs should permit anonymous cross-origin GET/HEAD. Successful clipboard creation does not prove WeChat image ingestion.

Code execution and custom scripts are disabled by default and require a trusted workspace plus explicit user-level permission. External executable paths come only from User Settings. Ordinary Less styles and imports remain available; Less JavaScript and plugins are disabled. Publication conversion retains HTML, SVG, path-boundary, and upload-URL restrictions. TikZ uses an optional separately installed local renderer, without automatic downloads. See [UPSTREAM.md](UPSTREAM.md).

### Development and credits

```sh
npm ci --ignore-scripts
pnpm --dir vendor/mpe install --frozen-lockfile --ignore-scripts
npm run check
npm test
npm run test:upstream
npm run build
npm run package
```

Node.js 22+ is recommended for packaging. The native clipboard helper requires macOS and Xcode Command Line Tools. Follow [UPSTREAM.md](UPSTREAM.md) for the pinned frontend source and build requirements, [TESTING.md](TESTING.md) for acceptance, and [PUBLISHING.md](PUBLISHING.md) for release checks.

Piper-specific code is MIT licensed. MPE and crossnote retain their University of Illinois/NCSA licenses; other components retain their respective licenses in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). This independent project is not endorsed by the upstream authors.

## 中文

**当前安装包支持 macOS Apple Silicon，要求 VS Code 1.95+。** 暂不支持 Windows、Linux、Intel Mac、浏览器版 VS Code 和 Remote 工作区。

### 在同一预览中阅读、排版和发布

Piper 内置 [Markdown Preview Enhanced](https://github.com/shd101wyy/vscode-markdown-preview-enhanced) 的源码 fork，使用 [crossnote](https://github.com/shd101wyy/crossnote) 引擎，无需另行安装 MPE。

在受信任的工作区打开本地 Markdown，点击编辑器的预览按钮。增强阅读保留 MPE 的布局、主题、源文同步和高级渲染。准备发布文章时，打开预览里的发布菜单，在同一个面板切换到公众号排版、调整样式并复制。返回阅读时恢复增强视图，不再需要管理另一个公众号编辑组。

1. 在预览中选择**发布 → 公众号视图**。
2. 选择样式预设，按需调整字号、行高、主题色和标题装饰。
3. 文章包含本地图片、公式或渲染图表时，从菜单配置图床。向导会根据所选提供商收集连接参数与上传凭据。
4. 点击**复制到公众号**，在微信公众号正文编辑器中粘贴。
5. 保存并重新打开草稿，确认平台已保留图片；临时图片应在过期前完成此步骤。

命令仍可用于快捷键和自动化，日常操作可直接通过发布菜单完成。界面跟随 VS Code 显示语言，支持英文和简体中文。

同一菜单还提供标准的**导出 HTML**、**导出 PDF**、阅读主题，以及当前视图的同步滚动开关。**高级**收纳关系图、反向链接、翻译、幻灯片、代码块、笔记本服务和原有预览/导出工具的入口。依赖外部工具、服务或代码执行的功能，仍需单独配置及相应授权。

### 发布选项

| 选项 | 行为 |
| --- | --- |
| 样式预设 | `classic`、`minimal` 或 `editorial`；可进一步调整字号、行高、主题色和标题装饰。 |
| 忽略开头一级标题 | 默认关闭。仅在公众号输出中省略开头的顶层 H1，源文、增强阅读和标准 HTML/PDF 导出仍保留。 |
| 自动添加正文目录 | 默认关闭。自动给发布正文添加目录，尊重已有源文目录标记，不重复生成。 |
| 侧边目录 | 仅用于预览导航，显示或隐藏它不会增删文章正文目录。 |

初始“经典”样式为 16 px 正文字号、1.85 行高、绿色 `#16856e` 主题色和底线标题。选择“简洁”会应用灰色 `#374151`、无装饰标题及 1.75 行高；“专栏”使用棕色 `#9b4f32`、带底线的衬线标题及 1.9 行高。之后仍可单独调整各项。样式同步影响预览、剪贴板 HTML 和公众号 HTML 导出，不改写 Markdown。

首标题省略兼容 `# 标题` 和下划线式 H1，允许开头有空行；H2、后续 H1、引用和代码块保持不变。编辑器选区按独立内容判断首标题。输入仅包含标题时会提示错误，并保留原剪贴板。

自动添加正文目录对应 `piperMarkdown.wechatIncludeTOC`，省略首标题对应 `piperMarkdown.wechatSkipLeadingH1`。关闭自动添加不能移除作者写入的 `[TOC]`、MPE 目录标记或手写目录；侧边导航目录始终是独立功能。

### 图片、公式与增强内容

本地插图是明确的源文编辑动作；发布上传与之分开。发布时转换复制文章中的本地资源地址，不替换 Markdown 内的本地路径，也不修改原图片。预览保留链接和源文定位。

查看预览不会上传发布资源。工具栏显示解析、转换、上传、排版和写入剪贴板的阶段进度，准备过程中可点击**取消**。复制时先处理全部资源，成功后再更新剪贴板；失败或取消保留原剪贴板。取消前已上传的图片仍按图床保留策略处理。编辑器命令有选区时复制选区，否则复制全文；预览里的复制操作使用该面板对应的整篇文档。 上传进度会显示图片数量、排队状态，以及图床繁忙时的重试倒计时。

支持 PNG、JPEG、WebP 和 GIF，GIF 保留动画；本地 SVG 和公式会栅格化后用于发布。公式图片自带不透明背景，粘贴到深色阅读环境时也能保持文字清晰。

| 增强内容 | 公众号转换 |
| --- | --- |
| Mermaid、WaveDrom、Vega、Vega-Lite | 本地渲染为 PNG，需要本机 Chrome/Edge。WaveDrom/Vega 规格须为有效 JSON，数据需内联。 |
| DOT / Graphviz | 由增强引擎解析，再将 SVG 转为 PNG。 |
| 脚注和任务列表 | 转为带编号的尾注及静态已选/未选标记。 |
| 本地 Markdown、文本、数据和图片导入 | 在工作区边界内展开，不改写源文件。 |
| 同文锚点 | 保留在文章中。 |
| 本地链接和双链 | 保留可见文字并提示，私有本地文件地址不进入发布内容。 |

可执行代码块、远程导入或图表数据，以及依赖外部工具或服务的 PlantUML、D2、TikZ 等发布图表会被明确拒绝；它们与增强阅读中的工具集成是不同流程。没有 Chrome/Edge 时，普通 SVG 可回退至本地栅格化工具，但浏览器渲染图表仍需要浏览器，可用 `piperMarkdown.enhanced.chromePath` 指定。不支持的输出会在修改剪贴板前提示，不会被静默丢弃。

### 增强阅读与标准导出

增强阅读保留公式、Mermaid、Graphviz、WaveDrom、脚注、任务列表、双链、文件导入、主题、锁定预览、源文同步和图片查看。中文强调语法（例如 `这是**合法的加粗。**后文`）在阅读和发布输出中均可正确显示。

标准 HTML/PDF 导出使用增强引擎，包含未保存的编辑，且不改写源文件。HTML 内嵌本地图片；PDF 使用本机 Chrome/Chromium，打印时长代码自动换行。若无法自动找到浏览器，可在用户设置中填写 `piperMarkdown.enhanced.chromePath`。插入目录、笔记本、演示、关系图和可选外部工具功能仍然保留；Pandoc、PlantUML、D2 等后端依然需要相应工具或已配置的服务。

已有显式 `markdown-preview-enhanced.*` 偏好可作为回退，显式 `piperMarkdown.enhanced.*` 配置优先。扩展激活不会改写默认编辑器关联。

### 图床

发布菜单提供图床配置和凭据操作。缺少上传地址或凭据时，可直接使用错误提示中的操作配置，再重试。连接设置只读取用户级配置，工作区不能重定向上传目的地或改变凭据发送方式。

| 提供商 | 用途 | 图片保留时间 |
| --- | --- | --- |
| Piper | 使用 Bearer Token 的 Piper 兼容 multipart 接口 | 发送 `3h`、`24h` 等 `ttl`，由图床执行。 |
| Generic HTTP | 自定义 multipart 接口、请求头/表单/匿名认证、嵌套 JSON URL 字段 | 由服务端控制。 |
| 七牛 Kodo | 使用临时上传凭证、区域上传接口和公共 HTTPS 图片域名 | 由空间生命周期规则控制。 |

凭据保存在 VS Code SecretStorage。更换提供商、上传地址、认证配置或七牛公共域名后，可能需要为新连接单独设置凭据。已有 Piper Token 保持兼容。不要把密码、Token 或七牛 AK/SK 写入 Markdown 或附加设置字段。

完整设置、请求/响应示例和七牛配置见[图床说明](docs/image-hosts.md)。七牛凭证应允许整个目标空间或生成对象名所在的前缀，只允许单个固定文件名的凭证不适用于此流程。上传凭证过期与图片保留时间是两回事。需要 SDK 签名或多个秘密参数的服务，可以通过兼容上传网关接入。

### 隐私与兼容

Piper 不采集遥测。阅读和标准导出在本地运行；外链图片、已配置的图表服务、AI 翻译及明确触发的上传可能访问相应服务。生产上传使用 HTTPS，回环 HTTP 仅供本地测试，上传重定向会被拒绝。公共图片 URL 应允许匿名跨域 GET/HEAD。成功生成剪贴板不代表微信已完成图片转存。

代码执行和自定义脚本默认关闭，需要受信任工作区及显式用户级授权。外部工具路径只读取用户设置。Less 的普通样式与导入仍可使用，JavaScript 和插件被禁用。发布转换保留 HTML、SVG、路径边界及上传 URL 限制。TikZ 使用单独安装的可选本地渲染工具，不自动下载。详见 [UPSTREAM.md](UPSTREAM.md)。

### 开发与致谢

```sh
npm ci --ignore-scripts
pnpm --dir vendor/mpe install --frozen-lockfile --ignore-scripts
npm run check
npm test
npm run test:upstream
npm run build
npm run package
```

建议使用 Node.js 22+ 打包。原生剪贴板助手需要 macOS 和 Xcode Command Line Tools。前端源码版本及构建要求见 [UPSTREAM.md](UPSTREAM.md)，验收见 [TESTING.md](TESTING.md)，发布检查见 [PUBLISHING.md](PUBLISHING.md)。

Piper 自有代码采用 MIT 许可，MPE 和 crossnote 保留其 University of Illinois/NCSA 许可。其他组件遵循各自许可，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。这是独立项目，不代表上游作者背书。
