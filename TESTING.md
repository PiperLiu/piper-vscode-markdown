# Testing

## Automated behavior tests

```sh
npm run check
npm test
npm run test:upstream
```

Tests cover rendering, upload protocol, cancellation, path boundaries, TOC anchors, legacy configuration, private clipboard round trips, and enhanced configuration/export boundaries. The native clipboard test uses a named pasteboard and does not overwrite the general clipboard.

## Installed-package acceptance

Build and install the VSIX into isolated VS Code user and extension directories. Run `scripts/parity-host.js` through a separate test probe extension, using a copied `examples/parity` workspace. Set `PIPER_PARITY_MODE`, `PIPER_PARITY_WORKSPACE`, and `PIPER_PARITY_REPORT`; keep reports outside the repository. For Piper, assert that `shd101wyy.markdown-preview-enhanced` is absent and the loaded extension path belongs to the installed package.

The fixture covers Chinese/repeated headings, TOC insertion and undo, math, Mermaid, tables, local PNG/SVG/GIF, imports, wiki links, footnotes, and multipage text. Verify preview reuse/live updates and source synchronization in the real Webview.

Export through actual commands and wait for complete files. Move the HTML away from source assets and inspect it offline with `scripts/inspect-export-html.js`. Check rendered images, diagrams, math, and anchors rather than counting strings in bundled scripts. Render every PDF page and inspect clipping, fonts, code wrapping, and page breaks. Test unsaved edits, explicit destinations, cancellation, and same-file/symlink/hard-link protection.

## WeChat acceptance

Use a disposable Markdown article and temporary test images. Verify HTML and plain-text clipboard representations, exact upload bytes, GIF preservation, token isolation, and failed/cancelled exports leaving the clipboard intact. The optional `scripts/integration.js` accepts a locally built compatible image-host binary via `TODO_TEST_BINARY` and uses an isolated database.

Actual WeChat paste, draft save/reopen, and image retention after the host TTL are distinct checks. Record the results privately; never infer platform retention from a local clipboard test. Do not publish a test article.

## Public-repository hygiene

Run `git diff --check` and inspect the staged file list. No personal acceptance records, real credentials, private service addresses, databases, generated exports, user Markdown, local settings, or machine-specific paths belong in the repository. Use synthetic fixtures and placeholder domains. Keep full upstream licenses and provenance.

## Title, CJK, and image-host adapters

Test leading-H1 omission enabled and disabled, selections, BOM/CRLF/blank lines, Setext titles, later H1 headings, blockquotes/code, title-only input, source-line mapping, and TOC consistency. Exercise the preview checkbox as well as the actual copy command; the standard HTML/PDF export must retain the title.

Compare CJK emphasis in actual enhanced-engine and WeChat output, including adjoining punctuation, escaped markers, code, math, and mixed Latin/CJK text. `test/cjk.test.js` includes the pinned upstream baseline and the adapted engine.

`test/upload.test.js` uses disposable local HTTP servers to verify Piper, generic header/form/anonymous authentication, Qiniu multipart fields and public URLs, byte preservation, credential isolation, cancellation, redirect rejection, and malformed-response limits. These protocol checks do not imply a live third-party cloud account was exercised. Keep real credentials and cloud acceptance records outside the repository.
