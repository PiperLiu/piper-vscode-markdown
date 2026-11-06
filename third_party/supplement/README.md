# Distribution supplement

Copy this directory intact to the extension project's `third_party/supplement/`. Include it in the VSIX and public repository. It contains only the selected distribution's covered-source copies, notices, asset metadata and source-availability materials; it does not contain the excluded TikZ/DVI/TeX implementation.

`supplement.json` is the machine-readable input for the notice generator. `SOURCE_AVAILABILITY.md` is intended to be appended to `THIRD_PARTY_NOTICES.md`. All paths in `supplement.json` are relative to this directory. `provenance.json` records source blobs for downloaded asset licence texts. `SHA256SUMS` records the final local material hashes.

The broader sibling `licenses/`, `npm-evidence/` and `sources/dvi2html-*` directories in the audit workspace are investigation evidence and are deliberately NOT part of this distribution supplement.

Remaining release verification: inspect the built VSIX for excluded TikZ/DVI/TeX/libvips files, verify all copied licence files survive packaging, and retain generated bundle legal comments. The package-manager table may include build-only/transitive packages; it must not claim that all such modules are actually distributed. Review missing upstream licence-file notices separately from declared SPDX identifiers.
