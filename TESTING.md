# Testing / 测试

[English](#english) · [简体中文](#中文)

## English

### Automated behavior checks

```sh
npm run check
npm test
npm run test:upstream
```

Run the checks relevant to changed behavior, then the required release suite. Cover parsing, upload protocols, cancellation, path boundaries, TOC anchors, legacy configuration, clipboard round trips, and enhanced configuration/export boundaries. Native unit tests use a named pasteboard, leaving the general clipboard alone.

### Installed extension and one-preview workflow

Install the built VSIX into fresh temporary VS Code user and extension directories. Use a copied `examples/parity` workspace and keep reports, screenshots, and exports outside the repository. Assert that the loaded extension comes from that installed package and that `shd101wyy.markdown-preview-enhanced` is absent.

Use `scripts/features-040-host.js` as the isolated host's `--extensionTestsPath`. It requires absolute paths in `PIPER040_EVIDENCE`, `PIPER_PARITY_WORKSPACE` (a fresh copy of `examples/parity`), `PIPER_PARITY_REPORT`, and `PIPER_PARITY_EXPECT_ROOT` (the isolated extension installation directory). Set `PIPER_PARITY_MODE=piper`; leave `PIPER_PARITY_PREVIEW_EVIDENCE` and `PIPER_PARITY_PREVIEW_ONLY` unset. Never point these paths at the repository or a daily profile.

The script first runs `scripts/parity-host.js` for real enhanced preview, undoable TOC, HTML, and PDF commands. It then calls the installed extension's publishing service with synthetic content: CJK emphasis, title omission, explicit/automatic TOCs, footnotes, tasks, Mermaid, math, PNG, SVG, and GIF. A loopback anonymous Generic host checks upload fields, exact preview/upload image bytes, and deduplication. The suite also checks zero preview uploads, preserved source files, reuse of Webview tab objects, clipboard HTML/plain text, and clipboard preservation after failed or cancelled uploads. It holds the original general pasteboard entirely in memory and restores it, along with isolated settings, in cleanup. Results go to `features-040-report.json` under the evidence directory; this API suite does not establish visual or WeChat-platform acceptance.

The version-specific `features-031-host.js` records the older separate-panel workflow and must not be used as a 0.4 acceptance result.

Operate the visible publishing menu in the real Webview. Start in enhanced reading, switch to WeChat layout, then return. Verify that the same preview tab and editor group are reused, the intended document remains bound, and source navigation, scroll position, live updates, and preview locking still behave correctly. Repeat with a second document and a locked preview; a background refresh must not replace the active document or resurrect an old mode. Commands remain useful for automation, but command execution alone does not verify the menu workflow.

Check common HTML/PDF export, reading themes, and mode-specific scroll sync, then open the Advanced submenu and verify its entry points without assuming optional backends are configured. Start a conversion from both reading and publication mode: phase progress and Cancel must remain visible, and completion/error feedback must be readable. Cancel during rendering and upload, then retry; check that the interface returns to a usable state.

Inspect dark and light VS Code themes, including an open menu over the white WeChat page. Check text, selected and disabled items, inputs, focus outlines, narrow panel wrapping, keyboard traversal, Escape, and focus return. Distinguish VS Code interface colors from article colors. Capture and actually inspect screenshots; DOM assertions alone do not establish readable contrast.

### Publishing options and source preservation

Exercise style presets and individual formatting controls, then reopen the menu and preview to verify persistence and read-back. Confirm that the selected layout appears consistently in the preview, clipboard HTML, and WeChat HTML export.

Check the side outline independently from the generated article TOC: showing or hiding navigation must not add content to the copied article. Verify the automatic article-TOC option (off by default), existing TOC markers, heading anchors, duplicate headings, and title omission. Turning automatic insertion off must preserve source-authored `[TOC]`/MPE TOC markers and handwritten directories; turning it on must not generate a duplicate TOC.

Test leading-H1 omission enabled and disabled, selections, BOM/CRLF/blank lines, Setext headings, later H1 headings, blockquotes/code, title-only input, source-line mapping, and TOC consistency. Standard enhanced HTML/PDF exports must retain the title. Compare CJK emphasis in actual enhanced and WeChat output, including adjoining punctuation, escaped markers, code, math, and mixed Latin/CJK text.

Read and compare source Markdown and image bytes before and after publishing. Publication conversion and upload must not rewrite local image references or the source file. Local image insertion is a separate, explicit editing action and must remain usable, including links and source navigation.

For each supported enhanced-content conversion, check the actual rendered result and complete assets. Test unsupported syntax too: report a useful explanation before uploading or changing the clipboard. Do not equate enhanced-reading support with publishable output. Inspect rasterized formulas on both light and dark backgrounds; legibility must be carried by the image pixels rather than a CSS filter available only in the preview.

### Image hosts, credentials, and clipboard

Use disposable fixtures and local mock services for protocol tests. Exercise the image-host wizard, existing settings, cancellation, missing endpoint, missing credentials, expired credentials, and error recovery through visible actions. Changing a connection must not reuse credentials from another provider or authentication profile. A workspace cannot override a user-level upload destination or credentials.

`test/upload.test.js` covers Piper, Generic header/form/anonymous authentication, Qiniu multipart fields and public URLs, exact image bytes, cancellation, redirect rejection, and malformed responses. These local protocol checks do not demonstrate a live cloud-account upload. The optional `scripts/integration.js` uses `TODO_TEST_BINARY` for a locally built compatible image-host server with isolated data.

Verify HTML and plain-text clipboard representations, GIF animation, and all-or-nothing clipboard updates. If an authorized acceptance test uses the general pasteboard, hold every existing item/type/data representation in memory and restore it in a `finally` path. Never log or save the user's prior clipboard. `scripts/clipboard-guard.swift` provides that test guard.

Actual WeChat paste, draft save/reopen, and image retention after the host TTL are distinct checks. Record their results privately, and never infer platform retention from a clipboard test. Do not publish a test article.

### Standard HTML and PDF export

The synthetic fixtures cover Chinese and repeated headings, TOC insertion and undo, math, Mermaid, tables, local PNG/SVG/GIF, imports, wiki links, footnotes, and multipage text. Verify enhanced preview reuse, live updates, and bidirectional source synchronization in the actual Webview.

Export through real extension commands and wait for complete files. Inspect standalone HTML with remote requests blocked, including images, diagrams, math, and working anchors. `scripts/inspect-export-html.js` supports the baseline fixture. Render every PDF page and check fonts, clipping, code wrapping, and page breaks. Compare unchanged pages against a previously accepted rendering when appropriate. Test unsaved edits, explicit destinations, cancellation, and same-file/symlink/hard-link protection.

### Release evidence and repository hygiene

Run `git diff --check` and inspect the staged files. Keep personal articles, acceptance reports, screenshots, credentials, service addresses, databases, exports, local settings, and machine paths outside Git. Use synthetic fixtures and placeholder domains. Preserve upstream source provenance and complete licenses. Record the exact tested VSIX hash privately so publication and installation can use the same artifact.

## 中文

### 自动化行为检查

```sh
npm run check
npm test
npm run test:upstream
```

先运行与变更相关的检查，再完成发布所需的测试集。覆盖解析、上传协议、取消、路径边界、目录锚点、旧配置兼容、剪贴板往返，以及增强引擎配置和导出边界。原生单元测试使用独立命名的剪贴板，不覆盖系统通用剪贴板。

### 安装包与单一预览流程

把构建出的 VSIX 安装到全新的临时 VS Code 用户目录和扩展目录。复制 `examples/parity` 作为测试工作区，将报告、截图和导出文件保留在仓库外。确认实际加载的是这个安装包，并且没有安装 `shd101wyy.markdown-preview-enhanced`。

将 `scripts/features-040-host.js` 设为隔离宿主的 `--extensionTestsPath`。必须提供绝对路径：`PIPER040_EVIDENCE`、`PIPER_PARITY_WORKSPACE`（全新复制的 `examples/parity`）、`PIPER_PARITY_REPORT`、`PIPER_PARITY_EXPECT_ROOT`（隔离扩展安装目录）。设置 `PIPER_PARITY_MODE=piper`，不设置 `PIPER_PARITY_PREVIEW_EVIDENCE` 和 `PIPER_PARITY_PREVIEW_ONLY`。这些路径不能指向仓库或日常使用的配置目录。

脚本先执行 `scripts/parity-host.js`，检查真实增强预览、可撤销的目录插入及 HTML/PDF 导出，再通过已安装扩展的发布服务处理合成内容：中文强调、首标题省略、显式/自动目录、脚注、任务列表、Mermaid、公式、PNG、SVG 和 GIF。本机回环匿名 Generic 图床验证上传字段、预览与上传图片的精确字节及资源去重；同时检查预览零上传、源文件不变、Webview 标签对象复用、剪贴板 HTML/纯文本，以及上传失败或取消后剪贴板不变。原有系统剪贴板仅保留在内存中，清理时恢复剪贴板与隔离设置。结果写入证据目录下的 `features-040-report.json`；该 API 测试不能替代视觉和微信平台验收。

版本专用的 `features-031-host.js` 记录旧版独立窗口流程，不能用作 0.4 的验收结果。

在真实 Webview 中操作可见的发布菜单：从增强阅读切换到公众号排版，再返回。确认复用同一个预览标签和编辑组，保持正确源文档，源文定位、滚动位置、实时更新和锁定预览正常。再用第二篇文档及锁定预览检查后台更新，避免旧文档或旧模式覆盖当前内容。命令仍可用于自动化，但只执行命令不能证明菜单流程可用。

检查常用 HTML/PDF 导出、阅读主题及当前模式的同步滚动，再展开高级菜单验证各入口，不能假设可选后端已经配置。从阅读和公众号模式分别开始转换，确认阶段进度和取消操作始终可见，完成与错误提示清晰。在渲染和上传过程中分别取消，再次操作时界面应已恢复可用。

分别检查深色和浅色 VS Code 主题，尤其是白色公众号页面上展开的菜单。检查文字、选中及禁用项、输入框、焦点框、窄面板换行、键盘导航、Escape 和焦点返回。区分编辑器界面颜色与文章颜色。截图必须实际查看，DOM 断言不能替代可读性检查。

### 发布选项与源文件保护

操作预设和独立样式选项，重新打开菜单及预览，确认设置被保存并正确读取。预览、剪贴板 HTML 和公众号 HTML 导出应使用一致的排版。

分别检查侧边导航目录和文章正文目录：显示或隐藏导航不能给复制内容添加目录。验证默认关闭的自动添加正文目录选项、已有目录标记、标题锚点、重复标题及省略首标题时的行为。关闭自动添加不能移除源文中的 `[TOC]`/MPE 目录标记或手写目录；开启时不能重复生成目录。

测试首 H1 省略开关、选区、BOM/CRLF/空行、下划线式标题、后续 H1、引用和代码、仅含标题的输入、源文行号及目录一致性。标准增强 HTML/PDF 导出必须保留标题。对比真实增强引擎与公众号输出中的中文强调，覆盖相邻标点、转义、代码、公式以及中英文混排。

发布前后读取并比较 Markdown 与图片内容。发布转换和上传不能改写源文件或本地图片引用。本地插图是独立、明确的编辑动作，仍应正常可用，链接和源文导航也需保留。

逐项检查已支持的增强内容转换是否真实渲染、资源是否完整，也要检查不支持语法：应在上传或修改剪贴板前给出可操作的解释。增强阅读支持某种语法，不等于公众号输出支持它。分别在深浅背景查看栅格化公式，确保可读性来自图片本身，而不只依赖预览中的 CSS 滤镜。

### 图床、凭据与剪贴板

协议测试使用临时夹具和本地模拟服务。覆盖图床配置向导、已有配置、取消、缺少地址、缺少凭据、凭据过期以及通过可见操作恢复错误。切换连接后不能错误复用其他提供商或认证配置的凭据。工作区不能覆盖用户级上传目的地或凭据。

`test/upload.test.js` 覆盖 Piper、Generic 的请求头/表单/匿名认证、七牛 multipart 字段和公共 URL、图片原始字节、取消、重定向拒绝及异常响应。通过本地协议测试不能声称真实云账户已上传成功。可选的 `scripts/integration.js` 通过 `TODO_TEST_BINARY` 使用本地兼容图床程序和隔离数据。

验证剪贴板 HTML 与纯文本格式、GIF 动画，以及资源全部成功后才更新剪贴板的行为。获得授权的验收若使用系统通用剪贴板，应在内存中保留全部 item/type/data，并在 `finally` 中恢复；不能记录或保存用户原有剪贴板内容。`scripts/clipboard-guard.swift` 提供了该测试保护。

微信实际粘贴、草稿保存后重新打开、图床 TTL 结束后的图片保留是独立检查。结果应私下记录，不能从剪贴板测试推断平台已保留图片，也不能发布测试文章。

### 标准 HTML 与 PDF 导出

合成夹具覆盖中文和重复标题、目录插入及撤销、公式、Mermaid、表格、本地 PNG/SVG/GIF、文件导入、双链、脚注与多页正文。在真实 Webview 中检查增强预览复用、实时更新及双向源文同步。

通过真实扩展命令导出，等待文件完整生成。屏蔽远程请求检查独立 HTML，包括图片、图表、公式和有效锚点。`scripts/inspect-export-html.js` 支持基础夹具。渲染 PDF 的每一页，检查字体、裁切、代码换行和分页；适当时将未变化页面与已验收图像比较。同时测试未保存编辑、指定路径、取消，以及同文件、符号链接、硬链接覆盖保护。

### 发布证据与仓库清理

运行 `git diff --check` 并检查暂存文件。个人文章、验收报告、截图、凭据、服务地址、数据库、导出文件、本机配置和机器路径应留在 Git 外。使用合成夹具与示例域名，保留完整上游来源及许可。私下记录实际测试 VSIX 的哈希，确保发布和安装使用同一产物。
