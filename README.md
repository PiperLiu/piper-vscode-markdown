# Piper Markdown for VS Code

An enhanced Markdown workspace with HTML/PDF export and optional WeChat rich-text publishing.

Piper embeds a source fork of [Markdown Preview Enhanced](https://github.com/shd101wyy/vscode-markdown-preview-enhanced), powered by [crossnote](https://github.com/shd101wyy/crossnote). The enhanced preview runs inside Piper; the original MPE extension is not required. The WeChat publishing pipeline is a separate Piper component.

## Features

- Live preview, source synchronization, locked previews, themes, a sidebar outline, and image lightbox.
- Insert and render tables of contents, including existing `[TOC]` and MPE TOC markers.
- KaTeX/MathJax, Mermaid, Graphviz, WaveDrom, footnotes, task lists, wiki links, imports, and the upstream extended Markdown syntax.
- HTML export with local images embedded. PDF export through a locally installed Chrome/Chromium browser. Exports include unsaved edits and write directly to the selected destination.
- Upstream presentation, notebook, graph, custom CSS, and external-tool integrations. Pandoc, PlantUML, D2, and other optional backends require their corresponding tools or explicitly configured services.
- WeChat layout preview and native macOS HTML clipboard output, with configurable image hosting, rasterized math/SVG, and preserved GIF bytes.

The packaged release currently supports **macOS Apple Silicon**. VS Code 1.95 or newer is required. Windows, Linux, Intel Mac, browser-hosted VS Code, and Remote workspaces are not supported by this package.

## Start reading

Open a trusted workspace containing your Markdown file and assets, then run **Piper Markdown: Open Enhanced Preview**. The editor toolbar provides preview and WeChat copy buttons. Enhanced commands are also available in the command palette and preview context menu.

Use **Insert Table of Contents**, **Export HTML**, or **Export PDF** from the command palette. PDF export uses a local browser; configure `piperMarkdown.enhanced.chromePath` if automatic discovery cannot find it. Long code lines wrap when printing.

Existing explicit `markdown-preview-enhanced.*` settings are read as a fallback. New `piperMarkdown.enhanced.*` values take precedence. Activation does not rewrite your default editor associations. The old extension can be removed after you verify your documents with Piper.

## Copy for WeChat

1. Open **Piper Markdown: Preview WeChat Layout** to inspect the separate publication layout.
2. Configure an image upload endpoint and run **Piper Markdown: Set Image Upload Token**.
3. Run **Piper Markdown: Copy for WeChat**, then paste into the WeChat article editor.
4. Save and reopen the draft before temporary image URLs expire to confirm that the platform retained the images.

```json
{
  "piperMarkdown.uploadUrl": "https://images.example/api/public-images",
  "piperMarkdown.ttl": "24h",
  "piperMarkdown.fileField": "file",
  "piperMarkdown.urlField": "url"
}
```

Tokens are stored in VS Code SecretStorage, scoped to the upload endpoint. They are never stored in Markdown or settings files. Existing Piper tokens and explicit `piperWechat.*` settings remain compatible.

The editor command copies the selection when present; the WeChat preview button copies its whole document. Reading and previewing do not upload local images. Copying uploads local images and rasterized formulas, then writes the clipboard only after all resources succeed. Cancellation or failure leaves the clipboard unchanged.

WeChat publishing supports ordinary Markdown, tables of contents, code highlighting, PNG/JPEG/WebP/GIF, local SVG, and math. It uses a conservative renderer rather than the enhanced preview DOM. Unsupported diagrams, executable chunks, general file imports, wiki links, and footnotes are reported before publishing; export diagrams as local images and use ordinary Markdown for those sections. Enhanced reading and standard HTML/PDF export retain the upstream syntax.

Existing HTTPS image links are kept as written. Temporary links are not permanent storage; successful copy or insertion alone does not prove platform retention.

### Image host protocol

Send multipart POST to the configured endpoint with `?ttl=3h` or `?ttl=24h`, `Authorization: Bearer <token>`, and `X-Requested-With: ThemeTodo`. The default file field is `file`. The response must contain an HTTPS image URL:

```json
{"url":"https://images.example/public-images/opaque-id","expires_at":"2030-01-02T00:00:00Z"}
```

Nested response fields such as `data.url` are supported. Public images should support anonymous cross-origin GET/HEAD (`Access-Control-Allow-Origin: *`) for browser editors. Upload and read origins may differ. Upload redirects are rejected; only loopback development endpoints may use HTTP.

## Optional TikZ renderer

TikZ is delegated to a separately installed local renderer rather than bundling its mixed-license TeX/DVI components into the extension. No tool is downloaded automatically. See `UPSTREAM.md` for setup and licensing details.

## Trust and privacy

No Piper telemetry. Local preview and standard export run locally. External images, configured diagram services, AI translation, and explicit uploads may contact their respective providers. API credentials and provider choices are yours to configure.

Untrusted workspaces are not activated. Host code execution and custom preview scripts are off by default and require explicit user-level opt-in. Upstream HTML sanitization and configuration sandboxing are retained. Configure executable paths and launch arguments in VS Code user settings; repository configuration cannot choose them. Less variables and ordinary imports are supported, while Less JavaScript and plugins are disabled. WeChat publishing additionally restricts HTML, SVG resources, real filesystem paths, and upload URLs. Source files are not modified by publishing or exporting; inserting a TOC is an ordinary undoable editor action.

## Development

```sh
npm ci --ignore-scripts
pnpm --dir vendor/mpe install --frozen-lockfile --ignore-scripts
npm run check
npm test
npm run test:upstream
npm run build
npm run package
```

Node.js 22+ is recommended for packaging. Building the native clipboard helper requires macOS and Xcode Command Line Tools. The upstream fork retains its pnpm lock; Piper uses the root npm lock. Build output and VSIX packages are ignored by Git.

See `TESTING.md`, `PUBLISHING.md`, and `UPSTREAM.md`.

## License and credits

Piper-specific code is MIT licensed. MPE and crossnote retain their University of Illinois/NCSA licenses. Other components retain their respective licenses; see `THIRD_PARTY_NOTICES.md`. This independent project is not endorsed by the upstream authors.
