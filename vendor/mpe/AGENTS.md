# Contributor instructions for the vendored MPE fork

This directory contains Piper's source fork of [Markdown Preview Enhanced](https://github.com/shd101wyy/vscode-markdown-preview-enhanced), based on upstream tag `0.8.40`, commit `25fcd8e05ddf5b93c7b1f68adea2bd1189ec6e69`, and crossnote `0.9.42`. Keep upstream copyrights, license files, contributor credits, and provenance. This is not the upstream release repository.

## Integration authority

Read the root `AGENTS.md`, `UPSTREAM.md`, `TESTING.md`, and `PUBLISHING.md` before editing. The root package, stable Marketplace ID `piperliu.piper-markdown-review`, supported platforms, engine floor, version, and release process are authoritative. Do not run the upstream release workflows, publish this nested package, or change its baseline version as a substitute for a Piper release.

Use pnpm with the retained lockfile here; the root uses npm. Do not replace the pinned engine with a local `file:` dependency or depend on a separately installed MPE extension. Preserve deliberate dependency overrides and test any update against the root package's supported VS Code host.

## Architecture

- `src/extension.ts` and `src/extension-common.ts` activate the desktop engine and shared commands; the root wrapper supplies a context rooted at this vendor directory.
- `src/preview-provider.ts` owns previews and source synchronization. `src/notebooks-manager.ts` applies notebook configuration.
- `src/piper-api.ts` exposes source resolution, preview, and awaitable HTML/PDF exports to the root wrapper. `src/piper-exports.ts` uses an independent engine and unsaved-document snapshot. Preserve requested encodings for other filesystem reads, source-alias protection, and direct destination writes.
- Public commands/settings use `piperMarkdown.enhanced.*`; preview URI/view types use `piper-markdown-enhanced`; private routes use `_piperEnhanced.*`. Explicit old MPE settings remain fallback values. Do not register conflicting upstream command IDs.
- `build.js` creates native/web bundles and the standalone server. `gulpfile.js` copies required crossnote styles, dependencies, webview, and server-app assets. The root build decides what enters the VSIX.

## Execution and settings boundaries

- Preserve upstream QuickJS isolation for `config.js`/`parser.js`; do not replace it with Node `eval`, `require`, or `vm` execution.
- Code execution and custom preview scripts require explicit user-level permission and a trusted workspace. Host executable paths, arguments, and the global config root are user-only. Repository config must not override them.
- `src/crossnote-build-safety.cjs` applies version/hash/exact-match-asserted patches to native, ESM, and CLI Crossnote entry bundles. All config.js files, including global files, must not set host executable paths/options; use VS Code user settings. Document Pandoc arguments and nested output execution options require explicit script permission. Preserve these patches when updating the pinned engine.
- `src/less-safe.cjs` disables inline JavaScript and direct/imported Less plugins through a separate Less instance. Ordinary styles, variables, and imports remain supported.
- Activation and routine configuration updates must not rewrite editor associations. Only the explicit default-editor command may apply that preference.
- Preserve the preview message allowlist, CSP, trusted script roots, and document/source validation.

## Optional TikZ and build assets

TikZ is intentionally external. `src/tikz-external.ts` runs the authored MIT `out/native/tikz-runner.cjs` with a user-selected separately installed renderer. Markdown supplies only bounded source and allowlisted render options. Preserve the subprocess timeout and input/output limits; never download the tool automatically or accept its executable/module path from a document.

Do not bundle `node-tikzjax`, `@prinsss/dvi2html`, DVI implementation code, or copy `out/tex` assets. Native/server esbuild checks reject those inputs and remove stale TeX output. The renderer's own licenses apply to its separate installation. `markdown_yo_wasm_api.wasm` and other required non-TikZ runtime assets remain part of the enhanced engine.

## Validation

Use strict TypeScript and the existing formatting conventions. Run focused behavioral tests after changes, then the full root and vendor suites before release. `pnpm build` is needed before tests that inspect native output; `tsc --noEmit --module node16 --moduleResolution node16` resolves crossnote's CLI export correctly. Coordinate builds with other agents rather than rebuilding the same output concurrently.

Test the installed Piper package without MPE present, including HTML/PDF export, advanced rendering, TOC, and the independent WeChat pipeline. Keep generated artifacts, private acceptance records, machine-specific paths, and credentials outside the public source tree.
