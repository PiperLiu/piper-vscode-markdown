# Upstream provenance and integration

## Enhanced preview

- Project: [Markdown Preview Enhanced for VS Code](https://github.com/shd101wyy/vscode-markdown-preview-enhanced).
- Source baseline: tag `0.8.40`, commit `25fcd8e05ddf5b93c7b1f68adea2bd1189ec6e69`.
- Engine: [crossnote 0.9.42](https://github.com/shd101wyy/crossnote/tree/0.9.42).
- Original copyright and NCSA license: [vendor/mpe/LICENSE.md](vendor/mpe/LICENSE.md).

The source fork is retained under `vendor/mpe`. Piper changes command/configuration/view namespaces, provides explicit-setting compatibility, exposes awaitable snapshot exports, adds print wrapping and source-file protection, and prevents passive activation from changing editor associations. Host code execution additionally requires a trusted workspace and explicit user-level permission. Executable paths and launch arguments are configured through VS Code user settings. Workspace configuration cannot choose host tools; Less JavaScript and plugins are disabled while ordinary Less styling remains available. Selected dependency patches are pinned in the fork lockfile; these do not constitute a claim that all upstream advisories are eliminated.

The build embeds the enhanced engine and its frontend assets. It does not call another installed extension. Piper's WeChat renderer, upload adapter, and clipboard helper remain independent; enhanced preview HTML is not used as trusted clipboard input.

## Optional external tools

Chrome/Chromium is used for PDF. Pandoc, PlantUML, D2 and similar integrations preserve their upstream tool requirements.

TikZ uses an optional local `node-tikzjax` installation. Its TeX/DVI dependency tree includes multiple licenses, including GPL source files, and is deliberately excluded from the distributed Piper runtime bundle. Install it separately if needed:

```sh
npm install --prefix "$HOME/.local/share/piper-markdown-tools" --ignore-scripts node-tikzjax@1.0.5
```

Piper communicates with this renderer as a separate process using a bounded TeX-to-SVG request. It never downloads the renderer automatically and does not depend on files from an installed MPE extension. The tool and its dependencies remain subject to their own licenses. Consult [node-tikzjax](https://github.com/prinsss/node-tikzjax) and [dvi2html](https://github.com/prinsss/dvi2html) before redistributing them.

## License inventory

`scripts/third-party-notices.js` records package license texts and source references without local filesystem paths. The inventory may include build-resolved optional components that are not included in the VSIX. Original component license files remain authoritative. Notices for fonts and web assets are retained with those assets. No upstream author is presented as endorsing this fork.

## CJK emphasis

Both the enhanced Markdown-it engine and Piper's WeChat renderer use [markdown-it-cjk-friendly 2.0.3](https://github.com/tats-u/markdown-cjk-friendly) under its MIT license. The plugin handles emphasis next to CJK text and punctuation without adding spaces to source content. It is applied per parser instance, preserving upstream engines outside Piper and ordinary escaped/code content.
