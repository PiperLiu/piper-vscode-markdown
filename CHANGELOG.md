# Changelog

## 0.3.1

- Add an optional leading-H1 omission setting and a checkbox in the WeChat preview. WeChat preview, copy, and HTML export agree; enhanced preview/export and source files remain unchanged.
- Add configurable generic multipart image hosts and Qiniu direct uploads, with per-provider credentials in SecretStorage and user-only connection settings. Keep the original Piper protocol and saved tokens compatible.
- Apply CJK-friendly emphasis rules to both enhanced and WeChat rendering, including Chinese punctuation adjacent to bold/italic markers without inserted spaces.
- Provide English and Simplified Chinese Marketplace documentation, protocol examples, and clear third-party hosting limits.
- Pin compatible HTML-processing dependencies for extension-host runtime compatibility.

## 0.3.0

- Embed a source fork of Markdown Preview Enhanced 0.8.40 and crossnote 0.9.42, with independent namespaces and compatibility for existing explicit MPE settings.
- Add enhanced HTML/PDF export, TOC insertion, upstream diagrams and extended Markdown features without depending on an installed MPE extension.
- Export unsaved content to the selected destination, embed local HTML images, wrap printed code, and protect source files from direct/link-based overwrites.
- Keep WeChat publishing independent; support TOC markers and report unsupported enhanced syntax before upload or clipboard changes.
- Preserve the extension ID, endpoint-scoped tokens, legacy Piper commands and settings.
- Prepare English documentation, source provenance, component notices, and synthetic acceptance fixtures for a public repository.

## 0.2.0

- Add live reading and WeChat previews, a heading outline, source synchronization, HTML export, and configurable image uploads.
- Publish the initial macOS Apple Silicon package.
