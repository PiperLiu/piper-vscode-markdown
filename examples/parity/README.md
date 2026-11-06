# 合成验收夹具

`review.md` 覆盖中文、公式、目录、Mermaid、脚注、任务列表、导入、Wiki 链接、PNG/SVG/GIF、表格及分页。`toc-command.md` 用于在光标位置执行插入目录命令。

所有图片和内容均为程序生成的测试素材。验收必须复制到独立临时工作区后运行；不要把导出的 HTML/PDF 或个人配置保存到本目录。

## 隔离宿主验收

在独立临时目录准备 `workspace`（复制本夹具）、`user/User/settings.json`、`extensions` 与空的开发测试扩展 `probe`。使用 VS Code CLI 的 `--user-data-dir` 和 `--extensions-dir` 把待测 VSIX 安装到该目录；不要在日常扩展目录执行此测试。Piper 模式明确拒绝加载已安装的 MPE，确保增强能力来自自己的发布包。

运行 VS Code 的实际可执行文件，传入：

```text
--user-data-dir=<isolated-user-dir>
--extensions-dir=<isolated-extensions-dir>
--extensionDevelopmentPath=<probe-dir>
--extensionTestsPath=<repo>/scripts/parity-host.js
--disable-workspace-trust
<copied-workspace>
```

测试环境变量：

- `PIPER_PARITY_MODE=piper`，或 `mpe` 对照原版。
- `PIPER_PARITY_WORKSPACE`、`PIPER_PARITY_REPORT` 使用绝对临时路径。
- `PIPER_PARITY_EXPECT_ROOT` 指向隔离扩展目录，防止意外加载开发工作区版本。
- 要验证真实预览 DOM，另加 `PIPER_PARITY_PREVIEW_EVIDENCE=<fresh-evidence-dir>`；启动 Code 时添加独立的 `--remote-debugging-port=<port>`，同时运行 `node scripts/inspect-vscode-preview.js http://127.0.0.1:<port> <evidence-dir>`。该脚本通过 DOM 和截图检查本地图片、公式、Mermaid、实时编辑及双向滚动。
- 仅复测预览时可加 `PIPER_PARITY_PREVIEW_ONLY=1`；正常完整验收不设置它。

隔离设置至少要把 `piperMarkdown.enhanced.configPath`（原版使用 `markdown-preview-enhanced.configPath`）指向临时目录，避免读写日常 Crossnote 配置；指定可用 Chrome 的 `chromePath`。旧 MPE 显式主题偏好的回退可在隔离配置内单独验证。

HTML 结构检查与图片可移植性是独立检查。把导出的 HTML 单独复制到没有 `assets` 的新目录，然后运行 `node scripts/inspect-export-html.js <standalone-html> <evidence-dir>`。它启动自己的无头 Chrome 并阻断远程 HTTP 请求，确认图表、数学、实际图片元素及目录锚点。PDF 必须另行渲染全部页面，逐页检查长代码、图片、公式和分页；文件非空并不代表视觉验收通过。

## 公众号复制验收

`wechat.md` 使用公众号转换支持的语法，包含 PNG、SVG、GIF、行内与块级数学、表格、代码与目录。它与高级阅读夹具分开，避免将 Mermaid 或文件导入当成已经支持的公众号输出。

实际上传和系统剪贴板测试需要明确授权。`scripts/wechat-host.js` 在隔离宿主读取 `PIPER_WECHAT_WORKSPACE`、`PIPER_WECHAT_EVIDENCE`、`PIPER_WECHAT_PRIVATE_CONFIG`（权限 `0600`，字段 `uploadUrl`、`token`、`ttl`）及 `PIPER_PARITY_EXPECT_ROOT`。配合 `scripts/fill-isolated-token.js <loopback-debugger-url> <private-config> <evidence-dir>`，只向隔离 Extension Development Host 中匹配图床域名的密码框填入 Token。完成后调用扩展的清除 Token 命令；凭据不进入仓库、截图或验收报告。

宿主报告通过后才运行 `swift scripts/read-general-clipboard.swift > <evidence-dir>/clipboard.json`，随后执行 `node scripts/verify-wechat-clipboard.js <evidence-dir>`。该检查读取刚写入的合成文章，核对系统 HTML/纯文本格式、图片公共访问、CORS、上传前后字节与 GIF 帧数。它不会自动操作微信草稿；微信粘贴、保存、重新打开后的转存结果仍需另外验证。
