import { Notebook, MarkdownEngine, type FileSystemApi } from 'crossnote';
import * as fs from 'fs/promises';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { randomBytes } from 'crypto';
import MarkdownIt = require('markdown-it');

const { load } = require('cheerio');
// Share the host's validated TOC grammar; the vendor build bundles this helper.
const { parseTOCMarker } = require('../../../src/wechat-preflight');
// The CJK build adapter is ESM; unbundled Node tests resolve CommonJS.
const SyntaxParser =
  (MarkdownIt as unknown as { default?: typeof MarkdownIt }).default ??
  MarkdownIt;
const syntax = new SyntaxParser({ html: false });
const remoteDiagram = new Set([
  'puml',
  'plantuml',
  'd2',
  'ditaa',
  'blockdiag',
  'actdiag',
  'nwdiag',
  'packetdiag',
  'rackdiag',
  'seqdiag',
  'nomnoml',
  'pikchr',
  'flow',
  'flowchart',
  'sequence',
  'tikz',
]);
type ImportReference = { target: string; line: number };
function inspect(text: string) {
  const references: ImportReference[] = [];
  const record = (
    raw: string,
    kind: 'import' | 'image' | 'wiki',
    line: number,
  ) => {
    const target = inspectTarget(raw, kind, line);
    if (target) references.push({ target, line });
  };
  for (const token of syntax.parse(text, {})) {
    if (token.type === 'fence') {
      const name = token.info
        .trim()
        .replace(/^[{.]*/, '')
        .split(/[\s}]/)[0]
        .toLowerCase();
      if (remoteDiagram.has(name))
        throw new Error(
          `Publishing cannot safely convert ${name} yet (line ${(token.map?.[0] ?? 0) + 1}).`,
        );
      if (
        /\b(?:cmd|kroki|run_on_save|run_on_start|engine)\s*[=:]/.test(
          token.info,
        )
      )
        throw new Error(
          'Executable or remote diagram options are not allowed in publishing.',
        );
    }
    if (token.type !== 'inline') continue;
    for (const row of token.content.split('\n')) {
      const colon = row.match(/^\s*:{3,}\s*([\w-]+)/);
      if (colon && remoteDiagram.has(colon[1].toLowerCase()))
        throw new Error(`Publishing cannot safely convert ${colon[1]} yet.`);
      if (
        colon &&
        /\b(?:cmd|kroki|run_on_save|run_on_start|engine)\s*[=:]/.test(row)
      )
        throw new Error(
          'Executable or remote diagram options are not allowed in publishing.',
        );
    }
    // Crossnote transforms standalone image and wiki embeds through the same
    // importer as @import, before MarkdownIt sees their eventual node types.
    for (const [offset, row] of token.content.split('\n').entries()) {
      const line = (token.map?.[0] ?? 0) + offset + 1;
      if (parseTOCMarker(row)) continue;
      const imported = row.match(/^\s*@import\s+(["'])([^"']+)\1/);
      const image = row.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)(?:\{[^}]*\})?\s*$/);
      const wiki = row.match(/^\s*!\[\[(.+?)\]\](?:\{[^}]*\})?\s*$/);
      if (imported) record(imported[2], 'import', line);
      else if (image)
        record(image[2].replace(/\s+"[^"]*"\s*$/, ''), 'image', line);
      else if (wiki) record(wiki[1].split('|')[0], 'wiki', line);
      // Imports hidden in HTML comments are also recognized upstream.
      for (const match of row.matchAll(/<!--\s*@import\s+(["'])([^"']+)\1/g))
        record(match[2], 'import', line);
    }
  }
  return references;
}
function inspectTarget(
  raw: string,
  kind: 'import' | 'image' | 'wiki',
  line: number,
) {
  let target: string;
  try {
    const value = raw.trim();
    target = decodeURIComponent(
      kind === 'image' && value.startsWith('<') && value.endsWith('>')
        ? value.slice(1, -1)
        : value,
    );
  } catch {
    throw new Error(`Invalid encoded publishing import (line ${line}).`);
  }
  if (target === '[TOC]') return;
  if (kind === 'image' && /^data:/i.test(target)) return;
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(target)) {
    if (kind === 'image' && /^https?:\/\//i.test(target)) {
      const pathname = new URL(target).pathname;
      if (
        !path.extname(pathname) ||
        /\.(?:png|jpe?g|gif|webp|svg)$/i.test(pathname)
      )
        return;
    }
    throw new Error(
      `Remote file imports are not allowed in publishing (line ${line}).`,
    );
  }
  const local = target.split(/[\#^]/)[0];
  const extension = path.extname(local);
  if (
    (!extension && kind !== 'import') ||
    /^(?:\.md|\.markdown|\.txt|\.csv|\.json|\.png|\.jpe?g|\.gif|\.webp|\.svg)$/i.test(
      extension,
    )
  )
    return /\.(?:md|markdown)$/i.test(local)
      ? local
      : !extension && kind === 'wiki'
        ? local + '.md'
        : undefined;
  throw new Error(
    `Publishing supports local Markdown, text, data and image imports only (line ${line}).`,
  );
}
export async function parseEnhanced(
  markdown: string,
  options: { filename: string; root: string; signal?: AbortSignal },
) {
  if (markdown.length > 1_000_000)
    throw new Error('Document exceeds the publishing size limit.');
  const violations: string[] = [];
  const root = await fs.realpath(options.root),
    source = await fs.realpath(options.filename);
  const guard = async (file: string) => {
    options.signal?.throwIfAborted();
    const real = await fs.realpath(file);
    const relative = path.relative(root, real);
    if (
      relative === '..' ||
      relative.startsWith('..' + path.sep) ||
      path.isAbsolute(relative)
    ) {
      violations.push('Publishing import is outside the workspace.');
      throw new Error(violations[0]);
    }
    return real;
  };
  await guard(source);
  let readBytes = 0;
  const readFailures: string[] = [];
  const tocMarkers = new Map<string, Record<string, unknown>>();
  const protectedCode = new Map<string, string>();
  const freshMarker = () => 'PIPERPUBLISHING' + randomBytes(16).toString('hex');
  const prepare = (text: string) => {
    inspect(text);
    const lines = text.split('\n'),
      fenced = new Set<number>(),
      indented = new Set<number>();
    for (const token of syntax.parse(text, {})) {
      if (!token.map || !['fence', 'code_block'].includes(token.type)) continue;
      for (let index = token.map[0]; index < token.map[1]; index++)
        (token.type === 'fence' ? fenced : indented).add(index);
    }
    for (let index = 0; index < lines.length; index++) {
      if (fenced.has(index)) continue;
      if (indented.has(index)) {
        // Crossnote's transform also sees indented code. Preserve these examples
        // as text without allowing their import-looking contents to reach it.
        lines[index] = lines[index].replace(/@import|!\[/g, (value) => {
          const marker = freshMarker();
          protectedCode.set(marker, value);
          return marker;
        });
        continue;
      }
      const options = parseTOCMarker(lines[index]);
      if (!options) continue;
      const marker = freshMarker();
      tocMarkers.set(marker, options);
      lines[index] = marker;
    }
    return lines.join('\n');
  };
  const configPath = (file: string) =>
    file.split(path.sep).includes('.crossnote');
  const snapshots = new Map<
    string,
    { real: string; text: string; expandedBytes: number; height: number }
  >();
  const active = new Set<string>();
  let importEdges = 0;
  // Crossnote caches files before recursively expanding them, so its importer
  // never calls our filesystem again on a cycle. Validate the realpath graph
  // first, then render these immutable snapshots rather than rereading disk.
  const visit = async (
    file: string,
    text: string | undefined,
    depth: number,
    line: number,
  ): Promise<number> => {
    options.signal?.throwIfAborted();
    if (depth > 16)
      throw new Error(
        `Publishing imports exceed the depth limit (line ${line}).`,
      );
    let real: string;
    try {
      real = await guard(file);
    } catch (error) {
      options.signal?.throwIfAborted();
      if (violations.length) throw new Error(violations[0]);
      throw new Error(
        `Publishing could not read a local import (line ${line}).`,
      );
    }
    if (configPath(real))
      throw new Error('Publishing does not import workspace configuration.');
    if (active.has(real))
      throw new Error(`Publishing imports contain a cycle (line ${line}).`);
    const key = path.resolve(file),
      existing = snapshots.get(key);
    if (existing) {
      if (depth + existing.height > 16)
        throw new Error(
          `Publishing imports exceed the depth limit (line ${line}).`,
        );
      return existing.expandedBytes;
    }
    if (snapshots.size + active.size >= 128)
      throw new Error('Publishing imports exceed the file count limit.');
    active.add(real);
    try {
      if (text === undefined) {
        const stat = await fs.stat(real);
        readBytes += stat.size;
        if (stat.size > 20 * 1024 * 1024 || readBytes > 40 * 1024 * 1024)
          throw new Error('Publishing imports exceed the size limit.');
        text = await fs.readFile(real, {
          encoding: 'utf8',
          signal: options.signal,
        });
      }
      let expandedBytes = Buffer.byteLength(text),
        height = 0;
      if (expandedBytes > 8 * 1024 * 1024)
        throw new Error('Publishing imports exceed the expanded size limit.');
      for (const reference of inspect(text)) {
        options.signal?.throwIfAborted();
        if (++importEdges > 512)
          throw new Error(
            'Publishing imports exceed the reference count limit.',
          );
        const target = reference.target.startsWith('/')
          ? path.resolve(root, '.' + reference.target)
          : path.resolve(path.dirname(file), reference.target);
        expandedBytes += await visit(
          target,
          undefined,
          depth + 1,
          reference.line,
        );
        height = Math.max(
          height,
          1 + snapshots.get(path.resolve(target))!.height,
        );
        if (expandedBytes > 8 * 1024 * 1024)
          throw new Error('Publishing imports exceed the expanded size limit.');
      }
      snapshots.set(key, { real, text: prepare(text), expandedBytes, height });
      return expandedBytes;
    } finally {
      active.delete(real);
    }
  };
  await visit(source, markdown, 0, 1);
  const snapshot = snapshots.get(source)!.text;
  const reject = async () => {
    throw new Error('Publishing never writes source files.');
  };
  const io: FileSystemApi = {
    readFile: async (file, encoding) => {
      try {
        const real = await guard(file);
        if (configPath(real)) return '';
        const saved = snapshots.get(path.resolve(file));
        if (saved) {
          if (saved.real !== real)
            throw new Error('Publishing import changed during conversion.');
          return saved.text;
        }
        if (/\.(?:md|markdown)$/i.test(file))
          throw new Error(
            'Publishing encountered an unvalidated Markdown import.',
          );
        const stat = await fs.stat(real);
        readBytes += stat.size;
        if (stat.size > 20 * 1024 * 1024 || readBytes > 40 * 1024 * 1024)
          throw new Error('Publishing imports exceed the size limit.');
        const data = await fs.readFile(real);
        return data.toString(encoding ?? 'utf8');
      } catch (error) {
        options.signal?.throwIfAborted();
        // Crossnote embeds importer errors in HTML. Fail the whole conversion
        // instead, without publishing host filesystem paths or partial content.
        const message =
          error instanceof Error &&
          /^(Publishing|Remote file imports|Executable|Invalid encoded)/.test(
            error.message,
          )
            ? error.message
            : 'Publishing could not read a local import.';
        readFailures.push(message);
        throw new Error(message);
      }
    },
    exists: async (file) => {
      if (configPath(file)) return false;
      try {
        await guard(file);
        return true;
      } catch {
        return false;
      }
    },
    stat: async (file) => fs.stat(await guard(file)),
    readdir: async (file) => fs.readdir(await guard(file)),
    writeFile: reject,
    mkdir: reject,
    unlink: reject,
  };
  const notebook = await Notebook.init({
    notebookPath: pathToFileURL(root).href,
    fs: io,
    config: {
      markdownParser: 'markdown-it',
      enableScriptExecution: false,
      mathRenderingOption: 'MathJax',
      enableHTML5Embed: false,
      wikiLinkResolution: 'relative',
      useGitHubStylePipedLink: false,
      wikiLinkTargetFileExtension: '.md',
      wikiLinkTargetFileNameChangeCase: 'none',
      protocolsWhiteList: 'file',
      parserConfig: {
        onWillParseMarkdown: async (value) => value,
        onDidParseMarkdown: async (value) => value,
      },
      globalCss: '',
      includeInHeader: '',
      plantumlServer: '',
      plantumlJarPath: '',
      krokiServer: '',
      webSequenceDiagramsServer: '',
      webSequenceDiagramsApiKey: '',
      d2Path: '',
    },
  });
  notebook.previewScriptsEnabled = false;
  notebook.md.set({ html: false });
  const fence = notebook.md.renderer.rules.fence!;
  notebook.md.renderer.rules.fence = (
    tokens,
    index,
    mdOptions,
    env,
    renderer,
  ) => {
    inspect('```' + tokens[index].info + '\n```');
    return fence(tokens, index, mdOptions, env, renderer);
  };
  const engine = new MarkdownEngine({ notebook, filePath: source });
  options.signal?.throwIfAborted();
  const result = await engine.parseMD(snapshot, {
    isForPreview: true,
    useRelativeFilePath: false,
    hideFrontMatter: true,
    runAllCodeChunks: false,
    triggeredBySave: false,
  });
  options.signal?.throwIfAborted();
  if (violations.length) throw new Error(violations[0]);
  if (readFailures.length) throw new Error(readFailures[0]);
  const $ = load(result.html);
  // html:false must remain in force for authored HTML. Remove only the exact
  // final source-sync placeholder generated by Crossnote after its transform.
  $('p')
    .filter((_index: number, element: unknown) =>
      /^<p data-source-line="\d+" class="empty-line final-line end-of-document" style="margin:0;"><\/p>$/.test(
        $(element).text().trim(),
      ),
    )
    .last()
    .remove();
  for (const [marker, options] of tocMarkers) {
    const nodes = $('p').filter(
      (_index: number, element: unknown) => $(element).text().trim() === marker,
    );
    if (!nodes.length)
      throw new Error('Publishing could not preserve an imported TOC.');
    nodes.each((_index: number, element: unknown) => {
      const node = $('<section class="article-toc"></section>');
      node.attr('data-piper-toc-options', JSON.stringify(options));
      $(element).replaceWith(node);
    });
  }
  if (protectedCode.size) {
    const restore = (element: any) => {
      if (element.type === 'text') {
        for (const [marker, literal] of protectedCode)
          element.data = element.data.split(marker).join(literal);
      }
      for (const child of element.children ?? []) restore(child);
    };
    restore($.root()[0]);
  }
  $('[data-source-line]').each((_index: number, element: unknown) => {
    const line = Number($(element).attr('data-source-line'));
    if (Number.isSafeInteger(line) && line > 0)
      $(element).attr('data-source-line', String(line - 1));
    else $(element).removeAttr('data-source-line');
  });
  const headings: { id: string; title: string; level: number; line: number }[] =
    [];
  $('h1,h2,h3,h4,h5,h6').each((_index: number, element: any) => {
    headings.push({
      id: $(element).attr('id') || '',
      title: $(element).text(),
      level: Number(element.tagName.slice(1)),
      line: Number($(element).attr('data-source-line') || 0),
    });
  });
  return { html: $('body').html() || '', headings };
}
