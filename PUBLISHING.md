# Publishing / 发布

[English](#english) · [简体中文](#中文)

## English

The stable Marketplace identity is `piperliu.piper-markdown-review`. The public repository is [PiperLiu/piper-vscode-markdown](https://github.com/PiperLiu/piper-vscode-markdown). Keep the extension ID to preserve upgrades and SecretStorage continuity.

1. Update `package.base.json` and `CHANGELOG.md`, synchronize the manifest, and refresh the npm lock without changing unrelated dependencies. Keep Marketplace repository and documentation links accurate.
2. Install locked dependencies, run the required behavior tests, and build. If the vendored frontend changes, also follow its pinned source/build instructions in [UPSTREAM.md](UPSTREAM.md).
3. Package with `npm run package`. Inspect the VSIX contents, component notices, bundled assets, and native target. The current release target is macOS Apple Silicon.
4. Complete the isolated installed-package and visual acceptance in [TESTING.md](TESTING.md). Record the exact VSIX SHA256 privately. Changes to package contents after testing require a fresh artifact and relevant checks.
5. Publish that exact VSIX through VSCE or the Marketplace publisher portal. Use an authenticated session or secret input; never place publishing credentials in source files, logs, or screenshots.
6. Distinguish upload acceptance, background validation, and public availability. An exact-version asset being downloadable does not prove that the public Latest index has changed. Confirm the official Gallery Latest version, the public listing, and the live English/Chinese README. Verify the downloaded release against the tested hash, accounting for HTTP content encoding.
7. Install the same tested artifact only where the user has authorized installation. Keep private release evidence outside the repository.

Do not repack an already published version; subsequent changes need a new version. Publication, public repository changes, and user-profile installation require authorization in the current task. Never publish a WeChat test article as release validation. This repository does not require a new CI/CD pipeline for these steps.

## 中文

稳定的 Marketplace 标识是 `piperliu.piper-markdown-review`，公开仓库是 [PiperLiu/piper-vscode-markdown](https://github.com/PiperLiu/piper-vscode-markdown)。保留扩展 ID，以维持升级和 SecretStorage 凭据兼容。

1. 更新 `package.base.json` 与 `CHANGELOG.md`，同步 manifest，并在不改动无关依赖的前提下更新 npm 锁文件。保持 Marketplace 中的仓库及文档链接有效。
2. 安装锁定依赖，运行所需行为测试并构建。若修改内置前端，还需遵循 [UPSTREAM.md](UPSTREAM.md) 中的源码版本和构建说明。
3. 运行 `npm run package` 打包，检查 VSIX 内容、组件许可、资源与原生目标。当前发布目标为 macOS Apple Silicon。
4. 完成 [TESTING.md](TESTING.md) 中的隔离安装包及视觉验收，私下记录该 VSIX 的 SHA256。测试后若改变包内容，应重新生成产物并完成相应检查。
5. 通过 VSCE 或 Marketplace 发布者后台上传同一份 VSIX。凭据只通过已认证会话或秘密输入提供，不得写入源码、日志或截图。
6. 区分上传受理、后台验证和公开可用三个阶段。能够下载指定版本资源，不代表公开 Latest 索引已经更新。应确认官方 Gallery 最新版本、公开详情页及在线英文/中文 README，并在处理 HTTP 内容编码后核对下载包与已测试包的哈希。
7. 仅在用户授权安装的位置安装同一份已测试产物。私人发布证据保存在仓库外。

不能重新打包已发布版本；后续变更需使用新版本。发布、公开仓库变更和用户配置目录安装需要当前任务授权。不能以发布验收为由发布微信测试文章。这些步骤不要求新增 CI/CD 流水线。
