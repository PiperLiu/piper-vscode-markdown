## Additional source and asset notices

This supplement records components actually present in the enhanced preview's vendored web assets and runtime dependencies. The surrounding package-manager table is a broader dependency inventory, not proof that every installed optional package is distributed. Piper-specific MIT licensing does not replace any third-party licence.

Markdown Preview Enhanced and Crossnote are both licensed under the University of Illinois/NCSA Open Source License. Their full original copyright, conditions, non-endorsement language and disclaimers are retained. The Piper fork is a modified product, not an endorsement by upstream authors.

### Source availability under EPL 2.0

The source code of elkjs and Graphviz is available under EPL 2.0 from the versioned URLs in `third_party/supplement/supplement.json` and the table below. The complete EPL 2.0 text is supplied in `third_party/supplement/licenses/EPL-2.0.txt`. Their contributors provide these components without warranties or liability as set out in that licence; recipients retain the licence's rights in their source code.

elkjs 0.9.3 is based on ELK 0.9.1 plus the correction described in ELK PR 955. The supplied upstream ELK NOTICE is retained. Use the elkjs source tree and build recipe together with the underlying ELK source and the additional upstream change; generated `elk-worker.js` is not the preferred source for editing its Java/Xtend implementation. No Piper changes to those covered source files are intended.

@viz-js/viz 3.29.0 includes Graphviz 15.1.1 and Expat 2.8.1 inside its WebAssembly binary. The wrapper's MIT licence does not describe the whole binary. The exact upstream build recipe is retained as `third_party/supplement/viz-3.29.0-Dockerfile`, including source archive locations. The Graphviz source is available under EPL 2.0; the wrapper and Expat keep their respective MIT notices.

### Source availability under MPL 2.0

The unmodified preferred JavaScript source for markdown-it-html5-embed 1.0.0, along with its MPL 2.0 licence, README and package metadata, is included under `third_party/supplement/sources/markdown-it-html5-embed-1.0.0/`. The npm source's Git blob SHA `e642a6b7864f5974e4be333cae22ac046248d242` matches upstream tag v1.0.0. If a future release changes these covered files, the modified source must be made available under MPL 2.0 as well. Bundling/minification does not replace this source obligation.

The shipped `@resvg/resvg-js` / `@resvg/resvg-js-darwin-arm64` 2.6.2 addon is also MPL 2.0. Its original Rust wrapper source and build manifest are supplied in `third_party/supplement/sources/resvg-js-2.6.2/`. The full source at immutable commit `9ca058462ac529120c8cc84ddcd6fef644cc5406`, and the underlying MPL resvg source at revision `3495d870`, are available through the versioned URLs in the table. These sources remain under MPL 2.0; Piper has not changed the distributed native renderer. Rust dependencies keep their own licences. `NATIVE_NOTICES.md` and `native-crates-observed.json` document 47 exact crate versions identified in the shipped binary and their complete collected licence texts, plus the pinned resvg fork and allocator/font-decoder notices.

### Font and prebuilt web assets

Font Awesome Free 6.4.2 uses CC BY 4.0 for icons, OFL 1.1 for fonts and MIT for other code. KaTeX's code/CSS is MIT, while its actual TTF files contain OFL 1.1 font notices and Reserved Font Names. Those original font notices are copied into `licenses/KaTeX-fonts-OFL.txt` with the full OFL text and are also recorded in `katex-font-metadata.json`. Source Sans Pro and League Gothic keep their OFL notices. Fonts are not relicensed under Piper's MIT licence.

Reveal.js, Mermaid, WaveDrom, Remarkable, Vega, Vega-Lite and Vega-Embed are manually vendored by Crossnote in addition to the package-manager dependency tree. This supplement preserves their applicable complete licences. `crossnote-vendored-assets.md` records the upstream asset versions and compatibility edits, including Vega-Lite's adjusted require path and Reveal.css changes. Original bundled legal comment blocks must be retained when rebuilding assets.

### Optional external tooling

node-tikzjax, @prinsss/dvi2html, their TeX runtime/data and their BaKoMa font files are not included in this supplement or intended to be part of the main VSIX. A separately installed local TikZ tool keeps its own licences. An adapter alone does not prove exclusion: verify the final VSIX and bundled JavaScript before release. Do not copy the separate audit evidence tree into the release.

If a future release includes a libvips binary, its LGPL and component notices/source requirements must be handled separately. Do not mark an installed optional binary as shipped or excluded based only on package metadata.
