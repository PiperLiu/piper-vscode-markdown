/* global suite, test, suiteSetup, suiteTeardown */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const esbuild = require('esbuild');
let folder, parseEnhanced;
suite('publishing importer security and generated markup', function () {
  this.timeout(30000);
  suiteSetup(async () => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'piper-parser-security-'));
    fs.writeFileSync(path.join(folder, 'article.md'), '# Disk source');
    fs.writeFileSync(
      path.join(folder, 'styles.less'),
      '.sample { color: red; }',
    );
    fs.writeFileSync(path.join(folder, 'sample.pdf'), '%PDF-1.1\n');
    const built = await esbuild.build({
      entryPoints: [path.resolve(__dirname, '../src/publishing-parser.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
      packages: 'external',
    });
    const filename = path.join(__dirname, '.publishing-parser-security.cjs');
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(__dirname);
    loaded._compile(built.outputFiles[0].text, filename);
    parseEnhanced = loaded.exports.parseEnhanced;
  });
  suiteTeardown(() => fs.rmSync(folder, { recursive: true, force: true }));
  const parse = (source) =>
    parseEnhanced(source, {
      filename: path.join(folder, 'article.md'),
      root: folder,
    });
  test('image and wiki importer forms reject external tools before preprocessing', async () => {
    const childProcess = require('node:child_process'),
      original = childProcess.spawn;
    let spawns = 0;
    childProcess.spawn = () => {
      spawns++;
      throw new Error('test must not spawn');
    };
    try {
      for (const source of [
        '![pdf](sample.pdf)',
        '![[sample.pdf]]',
        '![style](styles.less)',
        '![[styles.less]]',
        '![pdf](sample%2Epdf)',
        '> ![pdf](sample.pdf)',
        '@import "sample.pdf"',
        '<!-- @import "sample.pdf" -->',
      ])
        await assert.rejects(() => parse(source), /Publishing supports local/);
      assert.equal(spawns, 0);
    } finally {
      childProcess.spawn = original;
    }
  });
  test('remote non-image imports cannot enter through image or wiki syntax', async () => {
    const original = global.fetch;
    let requests = 0;
    global.fetch = () => {
      requests++;
      throw new Error('test must not fetch');
    };
    try {
      for (const source of [
        '![text](https://example.com/article.md)',
        '![[https://example.com/article.md]]',
        '@import "https://example.com/article.md"',
      ])
        await assert.rejects(() => parse(source), /Remote file imports/);
      assert.equal(requests, 0);
    } finally {
      global.fetch = original;
    }
  });
  test('failed and oversized imports stop conversion without publishing private paths', async () => {
    for (const source of [
      '@import "missing.md"',
      '![text](missing.md)',
      '![[missing.md]]',
    ])
      await assert.rejects(
        () => parse(source),
        (error) =>
          /could not read a local import/.test(error.message) &&
          !error.message.includes(folder),
      );
    fs.writeFileSync(
      path.join(folder, 'large.md'),
      Buffer.alloc(21 * 1024 * 1024, 32),
    );
    await assert.rejects(
      () => parse('@import "large.md"'),
      /exceed the size limit/,
    );
  });
  test('indented and fenced code examples remain literal without triggering imports', async () => {
    for (const source of [
      '    @import "sample.pdf"',
      '    ![pdf](sample.pdf)',
      '```md\n![pdf](sample.pdf)\n```',
    ]) {
      const result = await parse(source);
      assert.match(result.html, /sample\.pdf/);
      assert.doesNotMatch(result.html, /PIPERPUBLISHING|ENOENT|pdf2svg/);
    }
  });
  test('imported TOCs retain validated options and generated tail markup stays private', async () => {
    fs.writeFileSync(
      path.join(folder, 'part.md'),
      '## Part\n\n<!-- @import "[TOC]" {depthFrom=2 depthTo=3 orderedList=true} -->\n\n### Child',
    );
    const result = await parse('# Article\n\n@import "part.md"');
    assert.match(result.html, /class="article-toc"/);
    assert.match(result.html, /depthFrom&quot;:2/);
    assert.match(result.html, /orderedList&quot;:true/);
    assert.doesNotMatch(
      result.html,
      /CROSSNOTETOC|PIPERPUBLISHING|final-line end-of-document/,
    );
    const raw = await parse(
      '<img src="https://example.com/image.png" onerror="alert(1)">',
    );
    assert.match(raw.html, /&lt;img/);
    assert.doesNotMatch(raw.html, /<img /);
  });
  test('angle-bracket image destinations preserve spaces and Chinese filenames', async () => {
    const result = await parse('![图](<./assets/空格 image.png>)');
    assert.match(result.html, /<img/);
    assert.match(result.html, /image.png/);
  });
  test('realpath import graph rejects direct, indirect, and symlink cycles before expansion', async () => {
    fs.writeFileSync(path.join(folder, 'a.md'), '@import "b.md"');
    fs.writeFileSync(path.join(folder, 'b.md'), '@import "a.md"');
    for (const source of ['@import "article.md"', '@import "a.md"'])
      await assert.rejects(() => parse(source), /contain a cycle/);
    fs.symlinkSync(path.join(folder, 'a.md'), path.join(folder, 'alias.md'));
    fs.writeFileSync(path.join(folder, 'a.md'), '@import "alias.md"');
    await assert.rejects(() => parse('@import "a.md"'), /contain a cycle/);
  });
  test('deep and repeated imports have bounded expansion and cancellation interrupts graph reads', async () => {
    for (let i = 0; i < 20; i++)
      fs.writeFileSync(
        path.join(folder, `depth${i}.md`),
        i < 19 ? `@import "depth${i + 1}.md"` : 'End',
      );
    await assert.rejects(() => parse('@import "depth0.md"'), /depth limit/);
    await assert.rejects(
      () => parse('@import "depth10.md"\n@import "depth0.md"'),
      /depth limit/,
    );
    fs.writeFileSync(path.join(folder, 'repeated.md'), 'Text. '.repeat(100000));
    await assert.rejects(
      () => parse(Array(16).fill('@import "repeated.md"').join('\n')),
      /expanded size limit/,
    );
    const controller = new AbortController();
    const request = parseEnhanced('@import "depth0.md"', {
      filename: path.join(folder, 'article.md'),
      root: folder,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 0);
    await assert.rejects(
      () => request,
      (error) => error.name === 'AbortError',
    );
  });
});
