'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { assertSeparateDestination } = require('../src/export-path');
test('exports reject source, symlink, and hardlink destinations without changing content', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'piper-export-path-'));
  try {
    const source = path.join(dir, 'article.md');
    await fs.writeFile(source, '# Keep this source');
    const symlink = path.join(dir, 'symlink.html'), hardlink = path.join(dir, 'hardlink.html');
    await fs.symlink(source, symlink); await fs.link(source, hardlink);
    for (const destination of [source, symlink, hardlink]) await assert.rejects(assertSeparateDestination(source, destination), /source Markdown/);
    await assertSeparateDestination(source, path.join(dir, 'new.html'));
    assert.equal(await fs.readFile(source, 'utf8'), '# Keep this source');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
