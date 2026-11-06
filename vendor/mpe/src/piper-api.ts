import * as vscode from 'vscode';
import { PreviewProvider, getActivePreviewSourceUri } from './preview-provider';
import { isMarkdownFile, isVSCodeWebExtension } from './utils';
import { exportSnapshot, type PiperExportOptions } from './piper-exports';

export interface PiperEnhancedAPI {
  getActiveSourceUri(): vscode.Uri | undefined;
  openPreview(
    uri?: vscode.Uri,
    options?: { beside?: boolean; preserveFocus?: boolean },
  ): Promise<void>;
  exportHTML(uri?: vscode.Uri, options?: PiperExportOptions): Promise<string>;
  exportPDF(uri?: vscode.Uri, options?: PiperExportOptions): Promise<string>;
}

export function getActiveSourceUri(): vscode.Uri | undefined {
  // A current Markdown editor wins over stale preview activation events.
  const document = vscode.window.activeTextEditor?.document;
  if (document && isMarkdownFile(document)) return document.uri;
  return getActivePreviewSourceUri();
}

export function createPiperAPI(
  context: vscode.ExtensionContext,
): PiperEnhancedAPI {
  async function sourceDocument(uri?: vscode.Uri) {
    const source = uri ?? getActiveSourceUri();
    if (!source)
      throw new Error('Open a Markdown document or Piper preview first.');
    const document = await vscode.workspace.openTextDocument(source);
    if (!isMarkdownFile(document))
      throw new Error('The selected source is not Markdown.');
    return document;
  }
  async function exportDocument(
    format: 'html' | 'pdf',
    uri?: vscode.Uri,
    options?: PiperExportOptions,
  ) {
    if (isVSCodeWebExtension())
      throw new Error(
        'HTML/PDF file export requires the desktop extension host.',
      );
    const document = await sourceDocument(uri);
    if (document.isUntitled || document.uri.scheme !== 'file') {
      throw new Error(
        'Save the Markdown document to a local file before exporting.',
      );
    }
    await PreviewProvider.getPreviewContentProvider(document.uri, context);
    const manager = PreviewProvider.notebooksManager;
    if (!manager) throw new Error('The Markdown engine is not initialized.');
    const notebook = await manager.getNotebook(document.uri);
    return exportSnapshot(
      notebook,
      document.uri.fsPath,
      document.getText(),
      format,
      options,
    );
  }
  return {
    getActiveSourceUri,
    async openPreview(uri, options = {}) {
      const document = await sourceDocument(uri);
      const provider = await PreviewProvider.getPreviewContentProvider(
        document.uri,
        context,
      );
      const editor = vscode.window.visibleTextEditors.find(
        (editor) => editor.document.uri.toString() === document.uri.toString(),
      );
      await provider.initPreview({
        sourceUri: document.uri,
        document,
        cursorLine: editor?.selection.active.line,
        viewOptions: {
          viewColumn:
            options.beside === false
              ? vscode.ViewColumn.Active
              : vscode.ViewColumn.Beside,
          preserveFocus: options.preserveFocus ?? true,
        },
      });
    },
    exportHTML: (uri, options) => exportDocument('html', uri, options),
    exportPDF: (uri, options) => exportDocument('pdf', uri, options),
  };
}

export { getActivePreviewSourceUri } from './preview-provider';
