// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { utility } from 'crossnote';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  disposeCrossnoteServer,
  startCrossnoteServer,
  stopCrossnoteServer,
} from './crossnote-server';
import { buildAndSaveWiki } from './crossnote-wiki';
import { initExtensionCommon } from './extension-common';
import { PreviewProvider } from './preview-provider';
import { globalConfigPath } from './utils';
import { createPiperAPI } from './piper-api';
import { getUserMPEConfig } from './config';
import { configureTikzRenderer } from './tikz-external';
export { getActiveSourceUri, getActivePreviewSourceUri } from './piper-api';

// this method is called when your extension openTextDocuments activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const updateTikzRenderer = () =>
    configureTikzRenderer(getUserMPEConfig<string>('tikzRendererPath'));
  updateTikzRenderer();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('piperMarkdown.enhanced.tikzRendererPath'))
        updateTikzRenderer();
    }),
  );
  try {
    if (!fs.existsSync(globalConfigPath)) {
      fs.mkdirSync(globalConfigPath, { recursive: true });
    }
    // Watch the file changes in global config directory.
    fs.watch(globalConfigPath, async (eventType, fileName) => {
      if (
        eventType === 'change' &&
        ['style.less', 'config.js', 'parser.js', 'head.html'].includes(
          fileName ?? '',
        )
      ) {
        PreviewProvider.notebooksManager?.updateAllNotebooksConfig();
      }
    });
  } catch (error) {
    console.error(error);
  }

  // Init the extension-common module
  await initExtensionCommon(context);

  function customizeCSS() {
    const globalStyleLessFile = utility.addFileProtocol(
      path.resolve(globalConfigPath, './style.less'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(globalStyleLessFile),
    );
  }

  function openConfigScript() {
    const configScriptPath = utility.addFileProtocol(
      path.resolve(globalConfigPath, './config.js'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(configScriptPath),
    );
  }

  function extendParser() {
    const parserConfigPath = utility.addFileProtocol(
      path.resolve(globalConfigPath, './parser.js'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(parserConfigPath),
    );
  }

  function customizePreviewHtmlHead() {
    const headHtmlPath = utility.addFileProtocol(
      path.resolve(globalConfigPath, './head.html'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(headHtmlPath),
    );
  }

  function showUploadedImages() {
    const imageHistoryFilePath = utility.addFileProtocol(
      path.resolve(globalConfigPath, './image_history.md'),
    );
    vscode.commands.executeCommand(
      'vscode.open',
      vscode.Uri.parse(imageHistoryFilePath),
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'piperMarkdown.enhanced.customizeCss',
      customizeCSS,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'piperMarkdown.enhanced.openConfigScript',
      openConfigScript,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'piperMarkdown.enhanced.extendParser',
      extendParser,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'piperMarkdown.enhanced.customizePreviewHtmlHead',
      customizePreviewHtmlHead,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'piperMarkdown.enhanced.showUploadedImages',
      showUploadedImages,
    ),
  );

  // context.subscriptions.push(vscode.commands.registerCommand('_piperEnhanced.cacheSVG', cacheSVG))
  context.subscriptions.push(
    vscode.commands.registerCommand(
      '_piperEnhanced.showUploadedImageHistory',
      showUploadedImages,
    ),
  );

  // The crossnote serve child process (spawns out/native/crossnote-serve.js
  // for the current workspace's folders). Registered here, not in
  // extension-common, because the web extension cannot spawn processes — the
  // commands are hidden there via their `enablement` in package.json.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'piperMarkdown.enhanced.startCrossnoteServer',
      () => startCrossnoteServer(context),
    ),
    vscode.commands.registerCommand(
      'piperMarkdown.enhanced.stopCrossnoteServer',
      () => stopCrossnoteServer(),
    ),
    vscode.commands.registerCommand(
      'piperMarkdown.enhanced.buildStandaloneWiki',
      () => buildAndSaveWiki(context),
    ),
    { dispose: disposeCrossnoteServer },
  );
  return createPiperAPI(context);
}
