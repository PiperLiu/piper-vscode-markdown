# Native renderer component notices

The packaged `resvgjs.darwin-arm64.node` belongs to @resvg/resvg-js-darwin-arm64 2.6.2. Its own MPL licence and preferred wrapper sources are provided in `sources/resvg-js-2.6.2/`. Its Cargo manifest pins the underlying resvg source to the zimond fork at revision `3495d870`; that fork includes resvg 0.34.1, usvg 0.34.1 and the related parser/tree/text-layout crates. Their original MPL licence is included as `licenses/resvg-fork-MPL-2.0.txt`. The crate manifests identify Yevhenii Reizner as author.

The compiled binary contains source paths identifying 47 registry crate versions. `native-crates-observed.json` records those exact observed versions, source archive URLs, archive SHA-256 values and included licence paths. Registry archives were downloaded without executing their contents. Complete packaged LICENSE, COPYING, NOTICE and COPYRIGHT documents were preserved, including nested Unicode notices and Rustybuzz's Microsoft shaping-data notice. Test-only font licences are excluded because the test font data is not distributed.

The npm package-manager inventory does not discover these statically linked Rust libraries. Their notices appear separately in the main third-party table. The list is based on actual binary evidence and is not presented as a complete linker map: optimised libraries need not retain source paths.

Two crates omit their own licence files from their registry archive. Napi 2.16.1's MIT text was fetched from the exact Git commit recorded in its `.cargo_vcs_info.json` (`6d4ff7ca51e39cf8a507c871efa6d2c9ec1eed2b`). Pathfinder content 0.5.0 declares MIT/Apache-2.0; its recorded historical commit is no longer served by its repository, so the project-level MIT and Apache licence texts were obtained from its official repository and are labelled accordingly. Package author metadata is retained in Cargo.toml.

The resvg-js source also selects mimalloc on macOS and includes a WOFF2 decoder fork. Their applicable MIT and Apache licence texts and official source links are retained. These supplementary entries do not claim an exact resolved crate version absent from binary evidence. No change to the original native library or its code is made by Piper.

For a future native rebuild, retain the complete Cargo.lock used for the shipped build, the target triple and a generated dependency licence inventory alongside the release. That provides a full dependency graph instead of relying on strings in an upstream prebuilt binary. The upstream resvg-js v2.6.2 source does not contain such a lockfile.
