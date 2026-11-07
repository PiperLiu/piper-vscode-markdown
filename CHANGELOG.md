# Changelog / 更新记录

[English](#english) · [简体中文](#中文)

## English

### 0.4.2

- Fix WeChat domain validation failures: retain only exact HTTPS `mp.weixin.qq.com` hyperlinks; preserve other public URLs as text and remove exported TOC/footnote jumps. Keep image sources, preview navigation, and standard exports unchanged.

### 0.4.1

- Queue and pace Piper uploads to work with resource-limited image hosts. Retry explicit HTTP 429 responses within a bounded budget while respecting Retry-After; keep every wait cancellable.
- Show image counts, queue status, retry attempts, and a live wait countdown in both reading and WeChat previews. Preserve the clipboard when uploading fails or is cancelled.
- Distinguish rate limits, credentials, and capacity errors with actionable messages.

### 0.4.0

- Integrate publishing into the existing MPE preview: a lightweight Publish menu switches between enhanced reading and WeChat layout in the same panel, retaining the upstream reader and advanced features.
- Add Classic, Minimal, and Editorial publication presets with font size, line height, accent color, and heading decoration controls. Keep the side outline separate from optional automatic article-TOC insertion, and preserve authored TOCs.
- Add localized image-host setup, direct credential recovery actions, and local image/link insertion. Publishing uploads do not rewrite source Markdown or original images.
- Show phase progress and cancellation in the preview toolbar. Keep common exports, reading themes, and scroll sync directly accessible; group existing advanced-tool entry points in an Advanced submenu.
- Convert supported local diagrams, SVG, formulas, footnotes, task lists, and bounded local imports for WeChat. Preserve local/wiki-link text with a warning; reject unsupported executable or remote content explicitly.
- Give formula images opaque backgrounds and padding for dark-client legibility. Pair menu foreground/background colors with the VS Code theme.
- Retain editable, pinned Crossnote frontend source and document the build and license provenance. Reorganize public documentation into English first, followed by complete Chinese sections.

### 0.3.1

- Add an optional leading-H1 omission setting and a checkbox in the WeChat preview. WeChat preview, copy, and HTML export agree; enhanced preview/export and source files remain unchanged.
- Add configurable generic multipart image hosts and Qiniu direct uploads, with per-provider credentials in SecretStorage and user-only connection settings. Keep the original Piper protocol and saved tokens compatible.
- Apply CJK-friendly emphasis rules to both enhanced and WeChat rendering, including Chinese punctuation adjacent to bold/italic markers without inserted spaces.
- Provide English and Simplified Chinese Marketplace documentation, protocol examples, and clear third-party hosting limits.
- Pin compatible HTML-processing dependencies for extension-host runtime compatibility.

### 0.3.0

- Embed a source fork of Markdown Preview Enhanced 0.8.40 and crossnote 0.9.42, with independent namespaces and compatibility for existing explicit MPE settings.
- Add enhanced HTML/PDF export, TOC insertion, upstream diagrams and extended Markdown features without depending on an installed MPE extension.
- Export unsaved content to the selected destination, embed local HTML images, wrap printed code, and protect source files from direct/link-based overwrites.
- Keep WeChat publishing independent; support TOC markers and report unsupported enhanced syntax before upload or clipboard changes.
- Preserve the extension ID, endpoint-scoped tokens, legacy Piper commands and settings.
- Prepare English documentation, source provenance, component notices, and synthetic acceptance fixtures for a public repository.

### 0.2.0

- Add live reading and WeChat previews, a heading outline, source synchronization, HTML export, and configurable image uploads.
- Publish the initial macOS Apple Silicon package.

## 中文

### 0.4.2

- 修复微信公众号域名校验失败：仅保留准确匹配 `mp.weixin.qq.com` 的 HTTPS 超链接，其他公开网址保留为文字，导出目录和脚注移除跳转。图片地址、预览导航及普通导出不变。

### 0.4.1

- Piper 图床上传改为排队并控制发送节奏，兼容资源受限的服务。仅对明确的 HTTP 429 进行有界重试，遵守 Retry-After，等待期间始终可取消。
- 阅读与公众号预览均显示图片数量、排队状态、重试次数和实时等待倒计时；上传失败或取消时保留原剪贴板。
- 区分限流、凭据和容量错误，给出对应操作提示。

### 0.4.0

- 将发布功能整合到现有 MPE 预览，使用轻量发布菜单在同一面板切换增强阅读和公众号排版，保留上游阅读及高级功能。
- 增加经典、简洁、专栏预设，以及字号、行高、主题色和标题装饰设置。区分侧边导航与可选的自动正文目录，保留作者已有目录。
- 增加本地化图床向导、可直接操作的凭据错误恢复，以及本地插图和图片链接插入。发布上传不改写源 Markdown 或原图片。
- 在预览工具栏显示阶段进度和取消操作；常用导出、阅读主题及同步滚动可直接访问，已有高级工具入口集中在“高级”子菜单。
- 为公众号转换已支持的本地图表、SVG、公式、脚注、任务列表和边界内本地导入；本地链接和双链保留文字并提示，不支持的可执行或远程内容被明确拒绝。
- 公式图片带不透明背景和留白，改善深色阅读环境中的可读性；菜单文字与背景成对使用 VS Code 主题颜色。
- 保留可编辑、锁定版本的 Crossnote 前端源码，记录构建与许可来源。公开文档改为英文在前、后接完整中文。

### 0.3.1

- 增加可选的首个 H1 省略设置及公众号预览复选框，预览、复制和公众号 HTML 导出保持一致，增强预览、标准导出和源文不变。
- 增加通用 multipart 图床和七牛直传，按提供商隔离 SecretStorage 凭据，连接参数仅使用用户设置，兼容原 Piper 协议及已保存 Token。
- 两个渲染流程均支持中文及标点相邻的加粗、斜体语法，无需给源文插入空格。
- 提供英文与简体中文 Marketplace 文档、协议示例及第三方图床限制说明。
- 锁定兼容的 HTML 处理依赖，支持扩展宿主运行环境。

### 0.3.0

- 内置 Markdown Preview Enhanced 0.8.40 与 crossnote 0.9.42 源码 fork，使用独立命名空间，并兼容已有显式 MPE 设置。
- 增加增强 HTML/PDF 导出、目录插入、上游图表与扩展 Markdown 语法，无需另行安装 MPE。
- 可导出未保存内容至指定位置，在 HTML 内嵌本地图片，打印时代码换行，并防止直接或经链接覆盖源文件。
- 公众号发布保持独立，支持目录标记；在上传或修改剪贴板前提示不支持的增强语法。
- 保留扩展 ID、按上传地址隔离的 Token、旧 Piper 命令与设置。
- 为公开仓库准备英文说明、上游来源、组件许可与合成验收夹具。

### 0.2.0

- 增加实时阅读及公众号预览、标题导航、源文同步、HTML 导出和可配置图片上传。
- 发布首个 macOS Apple Silicon 安装包。
