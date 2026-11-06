export { EXPLICIT_MERMAID_STYLE } from './piper-export-appearance';
import { automaticMermaidExportAppearance } from './piper-export-appearance';
import { MarkdownEngine, type Notebook } from 'crossnote';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface PiperExportOptions {
  targetPath?: string;
  openFile?: boolean;
  offline?: boolean;
}

/** A separate engine keeps exports and live preview from mutating each other. */
export function createSnapshotEngine(
  notebook: Notebook,
  sourcePath: string,
  markdown: string,
) {
  const source = path.resolve(sourcePath);
  const snapshotNotebook: Notebook = Object.create(notebook);
  // Print long code lines in full. This is private export configuration, so
  // neither the reading preview nor the shared notebook styles are changed.
  snapshotNotebook.config = {
    ...notebook.config,
    globalCss: `${notebook.config?.globalCss ?? ''}
@media print {
  .markdown-preview pre, .markdown-preview pre code {
    white-space: pre-wrap !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
  }
  .markdown-preview pre { overflow: visible !important; }
}`,
  };
  snapshotNotebook.fs = {
    ...notebook.fs,
    readFile: async (filePath: string, encoding?: BufferEncoding) =>
      path.resolve(filePath) === source
        ? Buffer.from(markdown, 'utf8').toString(encoding ?? 'utf8')
        : notebook.fs.readFile(filePath, encoding),
  };
  const engine = new MarkdownEngine({
    notebook: snapshotNotebook,
    filePath: source,
  });
  const template = engine.generateHTMLTemplateForExport.bind(engine);
  engine.generateHTMLTemplateForExport = async (html, yaml = {}, options) => {
    const before = snapshotNotebook.config;
    const appearance = automaticMermaidExportAppearance(
      before,
      yaml,
      options,
      markdown,
    );
    if (!appearance) return template(html, yaml, options);
    snapshotNotebook.config = {
      ...before,
      mermaidTheme: appearance.theme,
      globalCss:
        before.globalCss +
        (appearance.backdrop
          ? '\n.markdown-preview div.mermaid { background: #fff; padding: 12px; border-radius: 4px; }'
          : ''),
    };
    try {
      return await template(html, yaml, options);
    } finally {
      snapshotNotebook.config = before;
    }
  };
  return engine;
}

export function resolveExportTarget(
  sourcePath: string,
  extension: 'html' | 'pdf',
  targetPath?: string,
) {
  const source = path.resolve(sourcePath);
  const target = path.resolve(
    targetPath ??
      path.join(
        path.dirname(source),
        path.parse(source).name + '.' + extension,
      ),
  );
  if (target === source)
    throw new Error(
      'The export destination cannot overwrite the Markdown source.',
    );
  if (path.extname(target).toLowerCase() !== '.' + extension) {
    throw new Error(`Choose a .${extension} destination.`);
  }
  // Both writers follow existing filesystem links. A different-looking output
  // path can therefore still be the Markdown source (symlink or hard link).
  const targetStat = fs.statSync(target, { throwIfNoEntry: false });
  if (targetStat) {
    const sourceStat = fs.statSync(source);
    if (
      fs.realpathSync(target) === fs.realpathSync(source) ||
      (targetStat.dev === sourceStat.dev && targetStat.ino === sourceStat.ino)
    ) {
      throw new Error(
        'The export destination cannot overwrite the Markdown source through a filesystem link.',
      );
    }
  }
  return target;
}

/** No intermediate destination beside the source is written. */
export async function exportSnapshot(
  notebook: Notebook,
  sourcePath: string,
  markdown: string,
  format: 'html' | 'pdf',
  options: PiperExportOptions = {},
): Promise<string> {
  const target = resolveExportTarget(sourcePath, format, options.targetPath);
  const engine = createSnapshotEngine(notebook, sourcePath, markdown);
  if (format === 'html') {
    // Absolute resource URLs preserve correctness when a user chooses another
    // directory; local images are embedded by default for a portable document.
    const parse = engine.parseMD.bind(engine);
    engine.parseMD = (text, renderOptions) =>
      parse(text, { ...renderOptions, useRelativeFilePath: false });
    const html = await engine.htmlExportDocument({
      offline: options.offline ?? true,
      embedLocalImages: true,
      embedSVG: true,
      runAllCodeChunks: false,
    });
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(target),
      Buffer.from(html, 'utf8'),
    );
  } else {
    // crossnote 0.9.42 uses chrome/puppeteer.path as the real output path, but
    // returns the source-adjacent default path. Override only that field on this
    // private engine; preserve all upstream page-size/margin/timeout options.
    const parse = engine.parseMD.bind(engine);
    engine.parseMD = async (text, renderOptions) => {
      const result = await parse(text, renderOptions);
      const configured =
        result.yamlConfig.chrome ?? result.yamlConfig.puppeteer;
      const chrome =
        configured &&
        typeof configured === 'object' &&
        !Array.isArray(configured)
          ? configured
          : {};
      result.yamlConfig.chrome = { ...chrome, path: target };
      return result;
    };
    await engine.chromeExport({
      fileType: 'pdf',
      runAllCodeChunks: false,
      openFileAfterGeneration: false,
    });
  }
  if (options.openFile) await vscode.env.openExternal(vscode.Uri.file(target));
  return target;
}
