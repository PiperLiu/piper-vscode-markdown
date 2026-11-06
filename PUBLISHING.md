# Publishing

The stable Marketplace identity is `piperliu.piper-markdown-review`. The repository name is `piper-vscode-markdown`; retaining the extension ID preserves upgrades and SecretStorage continuity.

1. Update `package.base.json` and `CHANGELOG.md`; run `npm run sync:manifest` and refresh the npm lock without changing unrelated dependencies.
2. Install both locked dependency trees, run automated tests, and build.
3. Package with `npm run package`. Inspect VSIX contents, third-party notices, and native target compatibility.
4. Perform the installed-package and manual acceptance in [TESTING.md](TESTING.md). Only replace a user's existing preview extension after those checks pass.
5. Publish the exact tested VSIX with VSCE or the Marketplace publisher portal. Credentials belong in an authenticated tool/session, never in this repository.
6. Confirm that the public Marketplace version is downloadable and installable. Keep private release evidence outside the repository.

Do not repack an already published version. A follow-up change requires a new version. Do not push a public repository or publish an article without explicit authorization.
