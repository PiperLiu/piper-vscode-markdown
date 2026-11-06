'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'third_party/licenses');
const supplementRoot = path.join(root, 'third_party/supplement');
const supplement = JSON.parse(fs.readFileSync(path.join(supplementRoot, 'supplement.json'), 'utf8'));
const omittedPackages = new Set(supplement.excludePackageNames || []);
fs.mkdirSync(destination, { recursive: true });
// Remove only stale generated notices for implementations now external-only.
for (const name of fs.readdirSync(destination)) {
  if ([...omittedPackages].some(pkg => name.startsWith(pkg.replace(/[^a-zA-Z0-9._-]/g, '_') + '_')) && name.endsWith('.txt')) fs.unlinkSync(path.join(destination, name));
}
const modules = new Map();
const add = directory => {
  try {
    const real = fs.realpathSync(directory), pkg = JSON.parse(fs.readFileSync(path.join(real, 'package.json'), 'utf8'));
    if (!omittedPackages.has(pkg.name)) modules.set(`${pkg.name}@${pkg.version}`, { directory: real, pkg });
  } catch { /* A platform-specific optional package may be absent. */ }
};
// npm's production dependency tree excludes publishing-only tooling.
const tree = JSON.parse(execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], { cwd: root, encoding: 'utf8' }).trim().split('\n').map(JSON.stringify).join(',').replace(/^/, '[').replace(/$/, ']'));
for (const directory of tree) if (directory !== root) add(directory);
const licenses = JSON.parse(execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { cwd: path.join(root, 'vendor/mpe'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
for (const group of Object.values(licenses)) for (const item of group) for (const directory of item.paths) add(directory);
add(path.join(root, 'vendor/mpe'));
const lines = ['# Third-party notices', '', 'Piper-specific code is licensed under MIT. Bundled third-party code remains under its original licenses. This runtime/build dependency inventory retains license texts and source references; package-manager inclusion alone does not mean a package is shipped, and does not imply endorsement by the original authors. Explicitly external-only TikZ packages are omitted.', '',
  'The enhanced preview is a modified source fork of [Markdown Preview Enhanced 0.8.40](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/tree/0.8.40), commit `25fcd8e05ddf5b93c7b1f68adea2bd1189ec6e69`, using [crossnote 0.9.42](https://github.com/shd101wyy/crossnote/tree/0.9.42). Their NCSA notices are retained in the source and the license inventory.', '', '| Component | Declared license | License files / upstream source |', '| --- | --- | --- |'];
for (const [id, { directory, pkg }] of [...modules].sort(([a], [b]) => a.localeCompare(b))) {
  const texts = [];
  const candidates = fs.readdirSync(directory).filter(name => /^(licen[sc]e|copying|notice|copyright)([.-]|$)/i.test(name));
  for (const name of candidates) {
    const file = path.join(directory, name);
    if (fs.statSync(file).isFile()) texts.push(`----- ${name} -----\n${fs.readFileSync(file, 'utf8')}`);
  }
  const key = id.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (texts.length) fs.writeFileSync(path.join(destination, `${key}.txt`), `${id}\n\n${texts.join('\n\n')}\n`);
  const declared = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type || (pkg.licenses || []).map(l => l.type).join(' OR ') || 'See component';
  const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const source = (repository || pkg.homepage || `https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}`).replace(/^git\+/, '').replace(/^git:\/\//, 'https://').replace(/\.git$/, '');
  lines.push(`| ${id} | ${declared.replace(/\|/g, '\\|')} | ${texts.length ? `[License text](third_party/licenses/${key}.txt) · ` : ''}[Source](${source}) |`);
}
lines.push('', 'The package-manager declarations and included license texts are preserved independently. Where a package carries multiple notices, all included notices apply to their respective components. Fonts, WebAssembly, and prebuilt web assets retain their upstream notices. The separately installed TikZ implementation and its TeX data are not included in this distribution.', '');
lines.push('', fs.readFileSync(path.join(supplementRoot, 'SOURCE_AVAILABILITY.md'), 'utf8'), '', '| Additional component | Licence | Included texts / source |', '| --- | --- | --- |');
for (const item of supplement.modules) {
  const localFiles = [...(item.licenseFiles || []), ...(item.sourceFiles || [])];
  for (const file of localFiles) {
    if (!fs.existsSync(path.join(supplementRoot, file))) throw new Error(`Missing third-party supplement file: ${file}`);
  }
  const links = localFiles.map(file => `[${path.basename(file)}](third_party/supplement/${file})`);
  links.push(...(item.sourceUrls || []).map((url, i) => `[Source ${i + 1}](${url})`));
  lines.push(`| ${item.name} ${item.version} | ${item.license} | ${links.join(' · ')} |`);
}
lines.push('');
fs.writeFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), lines.join('\n'));
console.log(`Retained notices for ${modules.size} dependency versions.`);
