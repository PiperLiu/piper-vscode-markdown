# Upstream provenance and integration / 上游来源与集成

[English](#english) · [简体中文](#中文)

## English

### Enhanced preview

- Project: [Markdown Preview Enhanced for VS Code](https://github.com/shd101wyy/vscode-markdown-preview-enhanced).
- Source baseline: tag `0.8.40`, commit `25fcd8e05ddf5b93c7b1f68adea2bd1189ec6e69`.
- Engine: [crossnote 0.9.42](https://github.com/shd101wyy/crossnote/tree/0.9.42).
- Original copyright and NCSA license: [vendor/mpe/LICENSE.md](vendor/mpe/LICENSE.md).

The source fork is retained under `vendor/mpe`. Piper changes command/configuration/view namespaces, provides explicit-setting compatibility, exposes awaitable snapshot exports, adds print wrapping and source-file protection, and prevents passive activation from changing editor associations. Host code execution additionally requires a trusted workspace and explicit user-level permission. Executable paths and launch arguments are configured through VS Code user settings. Workspace configuration cannot choose host tools; Less JavaScript and plugins are disabled while ordinary Less styling remains available. Selected dependency patches are pinned in the fork lockfile; these do not constitute a claim that all upstream advisories are eliminated.

The build embeds the enhanced engine and its frontend assets. It does not call another installed extension. Piper's WeChat renderer, upload adapter, and clipboard helper remain independent; enhanced preview HTML is not used as trusted clipboard input.

### Pinned preview frontend and publishing bridge

The editable Crossnote Webview source is retained in `vendor/mpe/frontend`, pinned to tag `0.9.42`, commit `e4eca048bf081e7c8cfbcc806530fb15fc5aa025`. Its machine-readable source record and original NCSA license are `vendor/mpe/frontend/UPSTREAM.json` and `vendor/mpe/frontend/LICENSE.md`. The engine itself remains the locked `crossnote` npm package.

`vendor/mpe/build-frontend.cjs` rebuilds the preview from this source with esbuild and dependencies resolved from the locked engine tree. It retains upstream compiled styling and appends the local component styles. The normal extension build invokes this step; no separate frontend package installation or new CI/CD system is required.

Piper adds a publishing menu and a host bridge to the existing MPE preview. Enhanced reading remains mounted while publication output uses an isolated article frame in the same panel. The host binds actions to the represented document and checks the source version before copying a displayed publication. Reading and publishing share a panel, while publication conversion still works from source snapshots rather than trusting Webview DOM. Preserve the upstream reading, context-menu, image-helper, and advanced export behavior when updating this fork.

### Optional external tools

Chrome/Chromium is used for PDF. Pandoc, PlantUML, D2 and similar integrations preserve their upstream tool requirements.

TikZ uses an optional local `node-tikzjax` installation. Its TeX/DVI dependency tree includes multiple licenses, including GPL source files, and is deliberately excluded from the distributed Piper runtime bundle. Install it separately if needed:

```sh
npm install --prefix "$HOME/.local/share/piper-markdown-tools" --ignore-scripts node-tikzjax@1.0.5
```

Piper communicates with this renderer as a separate process using a bounded TeX-to-SVG request. It never downloads the renderer automatically and does not depend on files from an installed MPE extension. The tool and its dependencies remain subject to their own licenses. Consult [node-tikzjax](https://github.com/prinsss/node-tikzjax) and [dvi2html](https://github.com/prinsss/dvi2html) before redistributing them.

### License inventory

`scripts/third-party-notices.js` records package license texts and source references without local filesystem paths. The inventory may include build-resolved optional components that are not included in the VSIX. Original component license files remain authoritative. Notices for fonts and web assets are retained with those assets. No upstream author is presented as endorsing this fork.

### CJK emphasis

Both the enhanced Markdown-it engine and Piper's WeChat renderer use [markdown-it-cjk-friendly 2.0.3](https://github.com/tats-u/markdown-cjk-friendly) under its MIT license. The plugin handles emphasis next to CJK text and punctuation without adding spaces to source content. It is applied per parser instance, preserving upstream engines outside Piper and ordinary escaped/code content.

## 中文

### 增强预览

- 上游项目：[Markdown Preview Enhanced for VS Code](https://github.com/shd101wyy/vscode-markdown-preview-enhanced)。
- 源码基线：标签 `0.8.40`，提交 `25fcd8e05ddf5b93c7b1f68adea2bd1189ec6e69`。
- 引擎：[crossnote 0.9.42](https://github.com/shd101wyy/crossnote/tree/0.9.42)。
- 原始版权及 NCSA 许可：[vendor/mpe/LICENSE.md](vendor/mpe/LICENSE.md)。

源码 fork 保留在 `vendor/mpe`。Piper 调整命令、配置和视图命名空间，兼容已有显式设置，提供可等待完成的源文快照导出、打印换行和源文件保护，并避免扩展被动激活时改写编辑器关联。宿主代码执行还要求受信任工作区与显式用户级授权。可执行路径和启动参数通过 VS Code 用户设置提供，工作区不能指定宿主工具。Less 禁用 JavaScript 和插件，普通样式仍可使用。选定的依赖修补版本锁定在 fork 的锁文件中，这不代表所有上游安全公告都已消除。

构建包含增强引擎和前端资源，不调用另一个已安装扩展。Piper 的公众号渲染、上传适配器和剪贴板助手仍保持独立；增强预览的 Webview DOM 不是可信的剪贴板输入。

### 锁定的预览前端与发布桥接

可编辑的 Crossnote Webview 源码保留在 `vendor/mpe/frontend`，锁定至标签 `0.9.42`、提交 `e4eca048bf081e7c8cfbcc806530fb15fc5aa025`。机器可读的来源记录和原 NCSA 许可分别位于 `vendor/mpe/frontend/UPSTREAM.json` 与 `vendor/mpe/frontend/LICENSE.md`；引擎本身仍使用锁文件中的 `crossnote` npm 包。

`vendor/mpe/build-frontend.cjs` 使用 esbuild 及锁定引擎依赖树中的模块构建预览，保留上游已编译样式，并追加本地组件样式。正常扩展构建会执行此步骤，不需要单独安装前端包或新增 CI/CD 系统。

Piper 在现有 MPE 预览中加入发布菜单和宿主桥接。公众号输出使用同面板内隔离的文章 frame，增强阅读保持挂载。宿主将操作绑定到该预览代表的文档，并在复制已展示的公众号内容前检查源文版本。阅读和发布共用面板，但发布转换仍依据源文快照，不把 Webview DOM 视为可信输入。后续更新 fork 时应保留上游阅读、右键菜单、图片工具和高级导出行为。

### 可选外部工具

PDF 使用 Chrome/Chromium。Pandoc、PlantUML、D2 等集成保留上游对相应工具的要求。

TikZ 使用可选的本地 `node-tikzjax` 安装。其 TeX/DVI 依赖包含多种许可及 GPL 源码，因此不包含在 Piper 分发的运行时包中。需要时可单独安装：

```sh
npm install --prefix "$HOME/.local/share/piper-markdown-tools" --ignore-scripts node-tikzjax@1.0.5
```

Piper 以独立进程和受限的 TeX-to-SVG 请求调用该工具，不自动下载，也不依赖已安装 MPE 的文件。工具与依赖仍适用各自许可，重新分发前请查看 [node-tikzjax](https://github.com/prinsss/node-tikzjax) 和 [dvi2html](https://github.com/prinsss/dvi2html)。

### 许可清单

`scripts/third-party-notices.js` 记录包的许可文本和源码来源，不包含本机文件路径。清单可能包含构建解析到、但未分发至 VSIX 的可选组件。原组件许可文件始终有效，字体和前端资源的许可随资源保留。此 fork 不声称获得上游作者背书。

### 中文强调

增强 Markdown-it 引擎和 Piper 公众号渲染器均使用 MIT 许可的 [markdown-it-cjk-friendly 2.0.3](https://github.com/tats-u/markdown-cjk-friendly)。插件处理与中文及标点相邻的强调语法，不在源文中插入空格。适配按解析器实例应用，不影响 Piper 外的上游引擎，也保留普通转义和代码内容。
