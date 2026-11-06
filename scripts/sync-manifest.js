'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(root, 'package.base.json'), 'utf8'));
const upstream = JSON.parse(fs.readFileSync(path.join(root, 'vendor/mpe/package.json'), 'utf8'));
const remap = value => typeof value === 'string'
  ? value.replace(/^\.\/media\//, './vendor/mpe/media/')
  : Array.isArray(value) ? value.map(remap)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v)])) : value;
const enhanced = remap(upstream.contributes);
if (!enhanced.commands.every(command => command.command.startsWith('piperMarkdown.enhanced.'))) {
  throw new Error('The vendored contribution namespace must be adapted before packaging.');
}
const menus = { ...enhanced.menus };
delete menus['editor/title'];
for (const [key, values] of Object.entries(base.contributes.menus)) menus[key] = [...(menus[key] || []), ...values];
base.contributes = { ...enhanced, commands: [...base.contributes.commands, ...enhanced.commands],
  configuration: [base.contributes.configuration, enhanced.configuration].flat(), menus };
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(base, null, 2) + '\n');
for (const name of fs.readdirSync(path.join(root, 'vendor/mpe'))) {
  if (/^package\.nls(?:\.[\w-]+)?\.json$/.test(name)) fs.copyFileSync(path.join(root, 'vendor/mpe', name), path.join(root, name));
}
