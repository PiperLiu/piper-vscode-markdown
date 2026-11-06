# Contributor guide

Read README.md, TESTING.md, UPSTREAM.md, and the working-tree status before editing. Preserve unrelated changes.

- Piper Markdown is a VS Code extension. Keep the stable Marketplace ID `piperliu.piper-markdown-review` so upgrades and SecretStorage continue to work.
- Enhanced preview, HTML/PDF export, and TOC use the pinned MPE source fork in `vendor/mpe`. It must work without another installed extension. Retain upstream provenance, source, licenses, and the pnpm lockfile.
- WeChat output uses its own restricted renderer. Never use Webview DOM as trusted publishing input. Preview must not upload images. Copy must finish every resource before changing the clipboard.
- Do not modify source Markdown or images during export. Snapshot unsaved text and reject export destinations that alias the source, including symlinks and hard links.
- Keep code execution disabled by default and require explicit user-level permission in a trusted workspace. Do not allow document or workspace settings to choose executable paths or enable host execution.
- Credentials belong only in VS Code SecretStorage. Do not commit private hosts, tokens, local paths, personal documents, or acceptance records. Use synthetic fixtures and placeholder domains.
- Preserve WeChat renderer HTML restrictions, CSP, realpath boundaries, upload URL/redirect checks, SVG external-resource rejection, GIF animation, and math sizing.
- Distinguish successful clipboard creation from successful WeChat image ingestion. Temporary image expiration must be visible to the user.
- Public-service uploads, extension installation, deployment, and publication require authorization from the current user request. Never publish a WeChat test article as part of acceptance.
- Root dependencies use npm's lockfile. The enhanced fork uses pnpm. Keep native binaries consistent with the VSIX target; currently macOS Apple Silicon only.
- Run relevant behavioral tests, installed-package acceptance, and license checks before a release. Keep generated artifacts and private reports outside Git. Include the native clipboard helper and required runtime assets in the VSIX.
- Preserve explicit legacy settings as fallback; newer explicit Piper settings win. Do not silently overwrite global editor associations or user preferences.
