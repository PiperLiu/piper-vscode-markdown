import React, { useEffect, useRef, useState } from 'react';
import { contextMenu } from 'react-contexify';
import PreviewContainer from '../containers/preview';
import './piper-publishing.css';

const frameScript = `const channel=CHANNEL; const send=(data)=>parent.postMessage({piperFrame:channel,...data},'*');
let ignore=false;addEventListener('message',e=>{if(e.source!==parent||e.data?.piperFrame!==channel)return;const m=e.data;if(m.type==='anchor'){document.getElementById(m.id)?.scrollIntoView();}if(m.type==='line'){const blocks=[...document.querySelectorAll('[data-source-line]')];const b=blocks.filter(x=>Number(x.dataset.sourceLine)<=m.line).pop();if(b){ignore=true;b.scrollIntoView();setTimeout(()=>ignore=false,400);}}});
let timer;addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(()=>{const blocks=[...document.querySelectorAll('[data-source-line]')];let b=blocks.find(x=>x.getBoundingClientRect().top>=0)||blocks[blocks.length-1];send({type:'scroll',y:scrollY,line:Number(b?.dataset.sourceLine)||0,sync:!ignore});},120);});
document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;e.preventDefault();const href=a.getAttribute('href');if(href?.startsWith('#')){document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();}else send({type:'link',href});});
document.addEventListener('pointerdown',()=>send({type:'dismiss'}));document.addEventListener('dblclick',e=>{const b=e.target.closest('[data-source-line]');if(b)send({type:'reveal',line:Number(b.dataset.sourceLine)});});send({type:'ready'});`;
function canvas(html: string, channel: string, requestedWidth?: number) {
  const width = Number.isFinite(requestedWidth)
    ? Math.min(1200, Math.max(480, Number(requestedWidth)))
    : 760;
  const nonce = channel.replace(/-/g, '');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http://localhost:* http://127.0.0.1:*; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none';"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{background:#eef0ef;color:#242424}body{margin:0;padding:24px 16px}main{max-width:${width}px;margin:auto;background:#fff;padding:28px;box-sizing:border-box}img{max-width:100%}pre,table{max-width:100%;overflow:auto}@media(max-width:500px){body{padding:12px 6px}main{padding:18px}}</style></head><body><main>${html}</main><script nonce="${nonce}">${frameScript.replace('CHANNEL', JSON.stringify(channel))}</script></body></html>`;
}
export default function PiperPublishing() {
  const {
    postMessage,
    config,
    sourceUri,
    showSidebarToc,
    clickSidebarTocButton,
    setShowBacklinks,
    showBacklinks,
    contextMenuId,
  } = PreviewContainer.useContainer();
  const enabled = !!config.isVSCode && !config.isWiki;
  const zh = String(config.locale || 'en').startsWith('zh'),
    t = (en: string, cn: string) => (zh ? cn : en);
  const [mode, setMode] = useState(false),
    [result, setResult] = useState<any>(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [renderFailed, setRenderFailed] = useState(false),
    [toc, setToc] = useState(true),
    [loading, setLoading] = useState(false),
    [progress, setProgress] = useState({ value: 0, phase: 'parse' }),
    [toolbarHeight, setToolbarHeight] = useState(36);
  const toolbar = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement>(null),
    menu = useRef<HTMLDetailsElement>(null),
    readingScroll = useRef(0),
    positions = useRef<Record<string, { line: number; y: number }>>({}),
    channel = useRef(crypto.randomUUID()),
    activeSource = useRef(''),
    modeRef = useRef(false),
    wasMode = useRef(false),
    settingsRef = useRef<Record<string, unknown>>({});
  settingsRef.current = result?.settings || {};
  modeRef.current = mode;
  const action = (name: string, extra: Record<string, unknown> = {}) =>
    postMessage('piperPublishing', [{ action: name, ...extra }]);
  const close = (focus = false) => {
    if (menu.current) {
      menu.current.open = false;
      if (focus)
        (menu.current.querySelector('summary') as HTMLElement)?.focus();
    }
  };
  const invoke = (name: string, extra: Record<string, unknown> = {}) => {
    close();
    action(name, extra);
  };
  const changeMode = (value: boolean) => invoke('mode', { value });
  const readingAction = (command: string) => {
    close();
    if (mode) action('mode', { value: false });
    postMessage(command, [sourceUri.current]);
  };
  const advanced = (tool: string) => {
    close();
    if (mode) action('mode', { value: false });
    action('advanced', { tool });
  };
  const moreTools = (event: React.MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    close();
    if (mode) action('mode', { value: false });
    contextMenu.hideAll();
    contextMenu.show({
      id: contextMenuId,
      event: event.nativeEvent,
      position: { x: box.left, y: Math.min(box.top, innerHeight - 250) },
    });
  };
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: MessageEvent) => {
      if (
        event.source === frame.current?.contentWindow &&
        event.data?.piperFrame === channel.current
      ) {
        const m = event.data;
        if (m.type === 'dismiss') close();
        if (m.type === 'scroll') {
          positions.current[activeSource.current] = { line: m.line, y: m.y };
          if (
            m.sync &&
            modeRef.current &&
            settingsRef.current.scrollSync !== false &&
            Number.isSafeInteger(m.line)
          )
            action('sync', { line: m.line });
        }
        if (m.type === 'ready') {
          const p = positions.current[activeSource.current];
          if (p)
            frame.current?.contentWindow?.postMessage(
              { piperFrame: channel.current, type: 'line', line: p.line },
              '*',
            );
        }
        if (m.type === 'reveal' && Number.isSafeInteger(m.line))
          action('reveal', { line: m.line });
        if (m.type === 'link' && typeof m.href === 'string')
          action('link', { href: m.href });
        return;
      }
      const m = event.data;
      if (
        m?.command === 'changeTextEditorSelection' &&
        modeRef.current &&
        settingsRef.current.scrollSync !== false
      ) {
        const line = Number(m.line);
        if (Number.isSafeInteger(line) && line >= 0) {
          positions.current[activeSource.current] = { line, y: 0 };
          frame.current?.contentWindow?.postMessage(
            { piperFrame: channel.current, type: 'line', line },
            '*',
          );
        }
        return;
      }
      if (m?.command !== 'piperPublishing') return;
      if (m.type === 'mode') {
        setMode(m.mode === true);
      }
      if (m.type === 'state') {
        activeSource.current = m.source;
        setResult((previous: any) => ({
          ...(previous?.source === m.source ? previous : {}),
          ...m,
        }));
      }
      if (m.type === 'loading') {
        setProgress({ value: 0, phase: 'parse' });
        setLoading(true);
        setRenderFailed(false);
        setError('');
        setNotice('');
      }
      if (m.type === 'content') {
        activeSource.current = m.source;
        setResult(m);
        setLoading(false);
        setError('');
        if (m.mode) setMode(true);
      }
      if (m.type === 'error') {
        if (m.stage === 'render') setRenderFailed(true);
        setError(m.message || t('Publishing failed', '发布失败'));
        setLoading(false);
      }
      if (m.type === 'cancelled') {
        setError('');
        setRenderFailed(false);
        setLoading(false);
        setNotice(t('Cancelled', '已取消'));
      }
      if (m.type === 'busy') {
        setBusy(!!m.value);
        if (m.value) {
          setProgress({ value: 0, phase: 'parse' });
          setNotice('');
          setError('');
        }
      }
      if (m.type === 'progress') {
        const p = m.value;
        const stages: Record<string, [number, number]> = {
          parse: [0, 0.08],
          convert: [0.08, 0.62],
          upload: [0.62, 0.92],
          style: [0.92, 0.97],
          clipboard: [0.97, 1],
        };
        const stage = stages[p?.phase];
        if (stage) {
          const fraction =
            p.total > 0 ? Math.max(0, Math.min(1, p.completed / p.total)) : 1;
          const value = stage[0] + (stage[1] - stage[0]) * fraction;
          setProgress((previous) =>
            value >= previous.value ? { value, phase: p.phase } : previous,
          );
        }
        if (typeof p === 'string') setNotice(p);
        else if (p?.message) setNotice(p.message);
      }
      if (m.type === 'copied')
        setNotice(
          typeof m.result?.message === 'string'
            ? m.result.message
            : t(
                'Copied. Paste into WeChat, save and reopen the draft to verify images.',
                '已复制。请粘贴到微信，保存并重新打开草稿检查图片。',
              ),
        );
    };
    const outside = (event: MouseEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) close();
    };
    addEventListener('message', handler);
    addEventListener('click', outside);
    action('ready');
    return () => {
      removeEventListener('message', handler);
      removeEventListener('click', outside);
    };
  }, [enabled]);
  useEffect(() => {
    if (mode) {
      readingScroll.current = scrollY;
      const key = activeSource.current || sourceUri.current;
      if (!positions.current[key]) {
        const blocks = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.markdown-preview [data-source-line]',
          ),
        ).filter((e) => e.getBoundingClientRect().bottom > 0);
        const block =
          blocks.find(
            (e) => !blocks.some((child) => child !== e && e.contains(child)),
          ) || blocks[0];
        positions.current[key] = {
          line: Math.max(0, Number(block?.dataset.sourceLine || 1) - 1),
          y: 0,
        };
      }
      document.body.classList.add('piper-publishing');
    } else {
      document.body.classList.remove('piper-publishing');
      if (wasMode.current)
        requestAnimationFrame(() => scrollTo(0, readingScroll.current));
    }
    wasMode.current = mode;
    return () => document.body.classList.remove('piper-publishing');
  }, [mode]);
  useEffect(() => {
    if (!enabled || !toolbar.current) return;
    const element = toolbar.current;
    const observer = new ResizeObserver(() =>
      setToolbarHeight(Math.ceil(element.getBoundingClientRect().height)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);
  if (!enabled) return null;
  const phaseLabels: Record<string, string> = {
    parse: t('Parsing Markdown', '解析 Markdown'),
    convert: t('Converting images and diagrams', '转换图片与图表'),
    upload: t('Uploading images', '上传图片'),
    style: t('Applying styles', '应用排版样式'),
    clipboard: t('Writing clipboard', '写入剪贴板'),
  };
  const copy = () =>
    invoke('copy', { source: result?.source, version: result?.version });
  return (
    <>
      <div
        className="piper-publish-bar"
        ref={toolbar}
        role="toolbar"
        aria-label={t('Publishing tools', '发布工具')}
        onKeyDown={(e) => {
          if (e.key === 'Escape') close(true);
        }}
      >
        {mode && (
          <button onClick={() => changeMode(false)}>
            {t('← Reading', '← 返回阅读')}
          </button>
        )}
        <details ref={menu} className="piper-publish-menu">
          <summary>{t('Publish', '发布')} ▾</summary>
          <div className="piper-menu-items" style={{ top: toolbarHeight + 16 }}>
            <button onClick={() => changeMode(!mode)}>
              {mode
                ? t('Reading view', '阅读视图')
                : t('WeChat view', '公众号视图')}
            </button>
            <button
              onClick={copy}
              disabled={busy || (mode && (loading || renderFailed)) || !result}
            >
              {t('Copy for WeChat', '复制到公众号')}
            </button>
            <button onClick={() => invoke('configureStyle')}>
              {t('Publishing styles…', '公众号样式…')}
            </button>
            <button onClick={() => invoke('configureHost')}>
              {t('Image host…', '图床设置…')}
            </button>
            <hr />
            <button
              onClick={() => {
                close();
                mode ? setToc(!toc) : clickSidebarTocButton();
              }}
            >
              {(mode ? toc : showSidebarToc) ? '✓ ' : ''}
              {t('Sidebar outline', '显示侧边目录')}
            </button>
            <label>
              <input
                name="includeTOC"
                aria-label={t('Add article TOC', '自动添加正文目录')}
                type="checkbox"
                checked={!!result?.settings?.includeTOC}
                onChange={(e) =>
                  action('setting', {
                    key: 'includeTOC',
                    value: e.target.checked,
                  })
                }
              />
              {t('Add article TOC', '自动添加正文目录')}
            </label>
            <label>
              <input
                name="skipLeadingH1"
                aria-label={t('Skip leading H1', '忽略开头一级标题')}
                type="checkbox"
                checked={!!result?.settings?.skipLeadingH1}
                onChange={(e) =>
                  action('setting', {
                    key: 'skipLeadingH1',
                    value: e.target.checked,
                  })
                }
              />
              {t('Skip leading H1', '忽略开头一级标题')}
            </label>
            <hr />
            <button onClick={() => invoke('insertImage', { kind: 'file' })}>
              {t('Insert local image…', '插入本地图片…')}
            </button>
            <button onClick={() => invoke('insertImage', { kind: 'link' })}>
              {t('Insert image link…', '插入图片链接…')}
            </button>
            <button onClick={() => invoke('exportHTML')}>
              {t('Export WeChat HTML…', '导出公众号 HTML…')}
            </button>
            <hr />
            <button
              onClick={() => invoke('exportStandard', { format: 'html' })}
            >
              {t('Export HTML…', '导出 HTML…')}
            </button>
            <button onClick={() => invoke('exportStandard', { format: 'pdf' })}>
              {t('Export PDF…', '导出 PDF…')}
            </button>
            <button onClick={() => invoke('readingTheme')}>
              {t('Reading theme…', '阅读主题…')}
            </button>
            <label>
              <input
                name="scrollSync"
                type="checkbox"
                checked={
                  mode
                    ? result?.settings?.scrollSync !== false
                    : !!config.scrollSync
                }
                onChange={(e) =>
                  action('setting', {
                    key: 'scrollSync',
                    value: e.target.checked,
                  })
                }
              />
              {mode
                ? t('WeChat scroll sync', '公众号同步滚动')
                : t('Reading scroll sync', '阅读同步滚动')}
            </label>
            <hr />
            <details className="piper-advanced-menu">
              <summary>{t('Advanced', '高级')}</summary>
              <button onClick={() => readingAction('openGraphView')}>
                {t('Relationship graph', '关系图')}
              </button>
              <button
                onClick={() => {
                  close();
                  if (mode) action('mode', { value: false });
                  setShowBacklinks(!showBacklinks);
                }}
              >
                {t('Backlinks', '反向链接')}
              </button>
              <button onClick={() => readingAction('translateDocument')}>
                {t('Translate document…', '翻译文档…')}
              </button>
              <button onClick={() => advanced('slide')}>
                {t('Insert presentation slide', '插入演示幻灯片')}
              </button>
              <button onClick={() => advanced('code')}>
                {t('Run code blocks', '运行代码块')}
              </button>
              <button onClick={() => advanced('notebook')}>
                {t('Notebook server…', '笔记本服务…')}
              </button>
              <button onClick={moreTools}>
                {t('More preview and export tools…', '更多预览与导出工具…')}
              </button>
            </details>
          </div>
        </details>
        {mode && (
          <button
            className="piper-primary"
            disabled={busy || loading || renderFailed || !result}
            onClick={copy}
          >
            {busy
              ? t('Preparing…', '正在准备…')
              : t('Copy for WeChat', '复制到公众号')}
          </button>
        )}
        {(busy || loading) && (
          <button onClick={() => action('cancel')}>
            {t('Cancel', '取消')}
          </button>
        )}
        {(busy || loading) && (
          <div
            className="piper-publish-progress"
            role="status"
            aria-live="polite"
          >
            <span>
              {phaseLabels[progress.phase] ||
                t('Preparing publication', '准备发布')}{' '}
              · {Math.round(progress.value * 100)}%
            </span>
            <progress
              max={1}
              value={progress.value}
              aria-label={t('Publishing progress', '发布进度')}
            />
          </div>
        )}
        {!mode && !busy && !loading && (notice || error) && (
          <div className="piper-publish-feedback" role="status">
            <span>{error || notice}</span>
            <button
              aria-label={t('Dismiss', '关闭提示')}
              onClick={() => {
                setNotice('');
                setError('');
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>
      {mode && (
        <div
          className="piper-publication-workspace"
          style={{
            paddingTop: toolbarHeight + 16 + (busy || loading ? 58 : 0),
          }}
          data-source={result?.source}
          data-version={result?.version}
        >
          <div className="piper-publication-notice" role="status">
            {error ||
              notice ||
              (loading
                ? t('Rendering publication…', '正在转换公众号内容…')
                : t(
                    'Local preview · Images upload only when copying',
                    '本地预览 · 复制时才上传图片',
                  ))}
          </div>
          {!!result?.diagnostics?.length && (
            <details className="piper-publication-diagnostics">
              <summary>
                {t('Conversion notes', '转换提示')} ·{' '}
                {result.diagnostics.length}
              </summary>
              <ul>
                {result.diagnostics.map((d: any, i: number) => (
                  <li key={i}>
                    {Number.isSafeInteger(d.line) && d.line > 0 && (
                      <button
                        onClick={() => action('reveal', { line: d.line - 1 })}
                      >
                        {t('Line', '行')} {d.line}
                      </button>
                    )}
                    {d.kind === 'local-link'
                      ? t(
                          'Local link retained as text; local file addresses are not included in WeChat output.',
                          '本地链接已保留为文字；公众号正文不包含本地文件地址。',
                        )
                      : String(d.message || d)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="piper-publication-layout">
            {toc && (
              <nav
                className="piper-publication-outline"
                aria-label={t('Article outline', '文章目录')}
              >
                {(result?.headings || []).map((h: any) => (
                  <button
                    key={h.id}
                    style={{ paddingInlineStart: 8 + (h.level - 1) * 10 }}
                    onClick={() =>
                      frame.current?.contentWindow?.postMessage(
                        {
                          piperFrame: channel.current,
                          type: 'anchor',
                          id: h.id,
                        },
                        '*',
                      )
                    }
                  >
                    {h.title}
                  </button>
                ))}
              </nav>
            )}
            <iframe
              title={t('WeChat publication preview', '公众号排版预览')}
              ref={frame}
              sandbox="allow-scripts"
              srcDoc={canvas(
                result?.html || '',
                channel.current,
                result?.settings?.previewWidth,
              )}
            />
          </div>
        </div>
      )}
    </>
  );
}
