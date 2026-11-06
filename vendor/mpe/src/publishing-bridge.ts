import * as vscode from 'vscode';
import { getMPEConfig, updateMPEConfig } from './config';

export interface PublishingContext {
  signal: AbortSignal;
  onProgress: (value: unknown) => void;
}
export interface PublishingResult {
  html: string;
  headings?: { id: string; title: string; level: number; line: number }[];
  settings?: Record<string, unknown>;
  diagnostics?: unknown[];
  characters?: number;
}
export interface PublishingService {
  getState?(
    document: vscode.TextDocument,
  ): Promise<Record<string, unknown>> | Record<string, unknown>;
  render(
    document: vscode.TextDocument,
    context: PublishingContext,
  ): Promise<PublishingResult>;
  copy(
    document: vscode.TextDocument,
    context: PublishingContext,
  ): Promise<unknown>;
  exportHTML?(document: vscode.TextDocument): Promise<unknown>;
  exportStandard?(
    document: vscode.TextDocument,
    format: 'html' | 'pdf',
  ): Promise<unknown>;
  configureHost?(document: vscode.TextDocument): Promise<unknown>;
  configureStyle?(document: vscode.TextDocument): Promise<unknown>;
  updateSetting?(
    document: vscode.TextDocument,
    key: string,
    value: unknown,
  ): Promise<unknown>;
  insertImage?(
    document: vscode.TextDocument,
    kind: 'file' | 'link',
  ): Promise<unknown>;
}
let service: PublishingService | undefined;
interface Session {
  panel: vscode.WebviewPanel;
  source: () => vscode.Uri | undefined;
  mode: boolean;
  ready: boolean;
  generation: number;
  controller?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  busy: boolean;
  pendingRefresh: boolean;
  stateGeneration: number;
}
const sessions = new Map<vscode.WebviewPanel, Session>();
function send(session: Session, data: Record<string, unknown>) {
  if (!sessions.has(session.panel)) return Promise.resolve(false);
  return session.panel.webview.postMessage({
    command: 'piperPublishing',
    ...data,
  });
}
export function setPublishingService(value: PublishingService) {
  service = value;
}
async function documentFor(session: Session) {
  if (!vscode.workspace.isTrusted)
    throw new Error(vscode.l10n.t('Trust this workspace before publishing.'));
  const uri = session.source();
  if (!uri || uri.scheme !== 'file')
    throw new Error(vscode.l10n.t('Open a local Markdown document first.'));
  return vscode.workspace.openTextDocument(uri);
}
async function sendState(session: Session) {
  if (!service || !session.ready) return;
  const generation = session.generation,
    stateGeneration = ++session.stateGeneration;
  const document = await documentFor(session),
    version = document.version,
    uri = document.uri.toString();
  const state = (await service.getState?.(document)) || {};
  if (
    generation !== session.generation ||
    stateGeneration !== session.stateGeneration ||
    session.source()?.toString() !== uri ||
    document.version !== version
  )
    return;
  await send(session, {
    type: 'state',
    ...state,
    source: document.uri.toString(),
    version: document.version,
    mode: session.mode,
  });
}
async function updateView(session: Session) {
  clearTimeout(session.timer);
  if (session.busy) {
    session.pendingRefresh = true;
    return;
  }
  session.pendingRefresh = false;
  try {
    return session.mode ? await refresh(session) : await sendState(session);
  } catch (error) {
    await send(session, {
      type: 'error',
      message: String((error as Error).message || error),
    });
  }
}
async function refresh(session: Session) {
  clearTimeout(session.timer);
  if (session.busy) {
    session.pendingRefresh = true;
    return;
  }
  if (!service || !session.ready || !session.mode) return;
  session.pendingRefresh = false;
  const requestedSource = session.source()?.toString();
  const generation = ++session.generation;
  session.controller?.abort();
  const controller = (session.controller = new AbortController());
  try {
    const document = await documentFor(session),
      version = document.version,
      uri = document.uri.toString();
    if (
      controller.signal.aborted ||
      generation !== session.generation ||
      uri !== requestedSource ||
      session.source()?.toString() !== uri
    )
      return;
    await send(session, { type: 'loading', source: uri, mode: session.mode });
    const result = await service.render(document, {
      signal: controller.signal,
      onProgress: (value) => {
        if (
          !controller.signal.aborted &&
          generation === session.generation &&
          session.source()?.toString() === uri
        )
          void send(session, { type: 'progress', value });
      },
    });
    if (
      controller.signal.aborted ||
      generation !== session.generation ||
      session.source()?.toString() !== uri ||
      document.version !== version
    )
      return;
    await send(session, {
      type: 'content',
      ...result,
      source: uri,
      version,
      mode: session.mode,
    });
  } catch (error) {
    if (
      !controller.signal.aborted &&
      generation === session.generation &&
      session.source()?.toString() === requestedSource
    )
      await send(session, {
        type: 'error',
        stage: 'render',
        message: String((error as Error).message || error),
      });
  }
}
export function invalidatePublishing(uri?: vscode.Uri) {
  for (const session of sessions.values()) {
    if (uri && session.source()?.toString() !== uri.toString()) continue;
    session.pendingRefresh = true;
    session.generation++;
    session.controller?.abort();
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      void updateView(session);
    }, 220);
  }
}
export function showPublishing(panel: vscode.WebviewPanel) {
  const session = sessions.get(panel);
  if (!session) return;
  session.mode = true;
  void send(session, { type: 'mode', mode: true });
  void refresh(session);
}
export function attachPublishing(
  panel: vscode.WebviewPanel,
  source: () => vscode.Uri | undefined,
) {
  if (sessions.has(panel)) return;
  const session: Session = {
    panel,
    source,
    mode: false,
    ready: false,
    generation: 0,
    busy: false,
    pendingRefresh: false,
    stateGeneration: 0,
  };
  sessions.set(panel, session);
  const subscription = panel.webview.onDidReceiveMessage(async (message) => {
    if (message?.command !== 'piperPublishing' || !Array.isArray(message.args))
      return;
    const input = message.args[0];
    if (!input || typeof input.action !== 'string' || !service) return;
    const actionSource = session.source()?.toString();
    try {
      if (input.action === 'ready') {
        session.ready = true;
        await send(session, { type: 'mode', mode: session.mode });
        return updateView(session);
      }
      if (input.action === 'mode') {
        session.mode = input.value === true;
        if (!session.mode && !session.busy) {
          session.controller?.abort();
          session.generation++;
        }
        await send(session, { type: 'mode', mode: session.mode });
        if (session.mode) return refresh(session);
        return sendState(session);
      }
      if (input.action === 'cancel') {
        session.controller?.abort();
        await send(session, { type: 'cancelled' });
        return;
      }
      const document = await documentFor(session);
      if (
        session.source()?.toString() !== actionSource ||
        document.uri.toString() !== actionSource
      )
        return;
      if (input.action === 'sync') {
        if (
          !Number.isSafeInteger(input.line) ||
          input.line < 0 ||
          input.line >= document.lineCount
        )
          return;
        await vscode.commands.executeCommand(
          '_piperEnhanced.revealLine',
          document.uri.toString(),
          input.line,
        );
        return;
      }
      if (input.action === 'reveal') {
        if (
          !Number.isSafeInteger(input.line) ||
          input.line < 0 ||
          input.line >= document.lineCount
        )
          return;
        const editor = await vscode.window.showTextDocument(document, {
          preserveFocus: true,
          preview: false,
        });
        const p = new vscode.Position(input.line, 0);
        editor.revealRange(
          new vscode.Range(p, p),
          vscode.TextEditorRevealType.AtTop,
        );
        return;
      }
      if (input.action === 'link') {
        if (typeof input.href !== 'string') return;
        const uri = vscode.Uri.parse(input.href);
        if (['https', 'http'].includes(uri.scheme))
          await vscode.env.openExternal(uri);
        return;
      }
      if (input.action === 'setting') {
        if (
          !['skipLeadingH1', 'includeTOC', 'scrollSync'].includes(input.key) ||
          typeof input.value !== 'boolean'
        )
          return;
        if (input.key === 'scrollSync' && !session.mode)
          await updateMPEConfig('scrollSync', input.value, true);
        else await service.updateSetting?.(document, input.key, input.value);
        return updateView(session);
      }
      if (input.action === 'configureHost') {
        await service.configureHost?.(document);
        return updateView(session);
      }
      if (input.action === 'readingTheme') {
        const themes = [
          'atom-dark.css',
          'atom-light.css',
          'atom-material.css',
          'github-dark.css',
          'github-light.css',
          'gothic.css',
          'medium.css',
          'monokai.css',
          'newsprint.css',
          'night.css',
          'none.css',
          'one-dark.css',
          'one-light.css',
          'solarized-dark.css',
          'solarized-light.css',
          'vscode.css',
          'vue.css',
        ];
        const zh = vscode.env.language?.startsWith('zh');
        const selected = await vscode.window.showQuickPick(
          themes.map((theme) => ({
            label: theme,
            description:
              theme === getMPEConfig('previewTheme')
                ? zh
                  ? '当前主题'
                  : 'Current theme'
                : undefined,
          })),
          { title: zh ? '阅读主题' : 'Reading theme' },
        );
        if (selected)
          await updateMPEConfig('previewTheme', selected.label, true);
        return;
      }
      if (input.action === 'advanced') {
        const zh = vscode.env.language?.startsWith('zh');
        if (input.tool === 'notebook') {
          await vscode.commands.executeCommand(
            'piperMarkdown.enhanced.startCrossnoteServer',
          );
          return;
        }
        if (input.tool === 'code') {
          if (!getMPEConfig<boolean>('enableScriptExecution'))
            throw new Error(
              zh
                ? '请先在用户设置中明确允许代码执行；工作区必须受信任。'
                : 'Explicitly allow code execution in user settings first; the workspace must be trusted.',
            );
          await vscode.window.showTextDocument(document, {
            preview: false,
            preserveFocus: false,
          });
          await vscode.commands.executeCommand(
            'piperMarkdown.enhanced.runAllCodeChunks',
          );
          return;
        }
        if (input.tool === 'slide') {
          await vscode.window.showTextDocument(document, {
            preview: false,
            preserveFocus: false,
          });
          await vscode.commands.executeCommand(
            'piperMarkdown.enhanced.insertNewSlide',
          );
          return;
        }
        return;
      }
      if (input.action === 'configureStyle') {
        await service.configureStyle?.(document);
        return updateView(session);
      }
      if (
        input.action === 'insertImage' &&
        ['file', 'link'].includes(input.kind)
      ) {
        await service.insertImage?.(document, input.kind);
        return;
      }
      if (
        input.action === 'exportStandard' &&
        ['html', 'pdf'].includes(input.format)
      ) {
        await service.exportStandard?.(document, input.format);
        return;
      }
      if (input.action === 'exportHTML') {
        await service.exportHTML?.(document);
        return;
      }
      if (input.action === 'copy') {
        if (session.busy) return;
        // Only publish the source version the user currently sees.
        if (
          session.mode &&
          (input.source !== document.uri.toString() ||
            input.version !== document.version)
        ) {
          await refresh(session);
          throw new Error(
            vscode.l10n.t(
              'The document changed. Review the updated preview and copy again.',
            ),
          );
        }
        session.busy = true;
        clearTimeout(session.timer);
        session.controller?.abort();
        const generation = ++session.generation;
        const uri = document.uri.toString();
        const controller = (session.controller = new AbortController());
        await send(session, { type: 'busy', value: true });
        try {
          const result = await service.copy(document, {
            signal: controller.signal,
            onProgress: (value) => {
              if (
                !controller.signal.aborted &&
                generation === session.generation &&
                session.source()?.toString() === uri
              )
                void send(session, { type: 'progress', value });
            },
          });
          if (
            !controller.signal.aborted &&
            generation === session.generation &&
            session.source()?.toString() === uri
          )
            await send(session, { type: 'copied', result });
        } catch (error) {
          if (
            !controller.signal.aborted &&
            generation === session.generation &&
            session.source()?.toString() === uri
          ) {
            await send(session, {
              type: 'error',
              stage: 'action',
              message: String((error as Error).message || error),
            });
          }
        } finally {
          session.busy = false;
          await send(session, { type: 'busy', value: false });
          if (session.pendingRefresh) await updateView(session);
        }
      }
    } catch (error) {
      if (session.source()?.toString() !== actionSource) return;
      await send(session, {
        type: 'error',
        stage: 'action',
        message: String((error as Error).message || error),
      });
    }
  });
  panel.onDidDispose(() => {
    session.controller?.abort();
    clearTimeout(session.timer);
    subscription.dispose();
    sessions.delete(panel);
  });
}
